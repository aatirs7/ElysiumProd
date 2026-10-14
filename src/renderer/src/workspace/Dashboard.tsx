// A project's dashboard: what waits on you, open tasks, this week's numbers and
// this month's cost, its links (admin page, team board, App Store Connect) that
// open as signed in panes, and a box to ask ElysiumProd for something new here.
import { useEffect, useMemo, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowUpRight, Globe, Plus, SendHorizontal, UserRound, X } from 'lucide-react';
import type { CostReport, TaskInfo, UsageStats } from '@shared/ipc';
import { ProjectLogo } from '../ProjectLogo';
import { hours } from '../Home';
import { ago, useLive } from './live';
import { useWorkspace, type DashLink } from './store';

const uid = () => Math.random().toString(36).slice(2, 10);
const usd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`);

/** What some projects start with beyond the usual links (from the owner's profile), filled in as projects load. */
export const PROJECT_EXTRAS: Record<string, { links: DashLink[]; people?: string[]; open?: string; checkWhat?: string }> = {};
export function setProjectExtras(list: { id: string; extras: { links?: DashLink[]; people?: string[]; open?: string; checkWhat?: string } | null }[]): void {
  for (const k of Object.keys(PROJECT_EXTRAS)) delete PROJECT_EXTRAS[k];
  for (const p of list) if (p.extras) PROJECT_EXTRAS[p.id] = { links: p.extras.links ?? [], people: p.extras.people, open: p.extras.open, checkWhat: p.extras.checkWhat };
}

/** Links a project starts with; you add the rest (admin page, team board). */
function defaultLinks(projectId: string, repo: string | null, vercel: { team: string | null; names: string[] }): DashLink[] {
  const out: DashLink[] = [...(PROJECT_EXTRAS[projectId]?.links ?? [])];
  if (repo) {
    out.push({ id: 'gh', label: 'GitHub', url: `https://github.com/${repo}` });
    out.push({ id: 'issues', label: 'Issues', url: `https://github.com/${repo}/issues` });
  }
  if (vercel.team) for (const n of vercel.names) out.push({ id: `vc-${n}`, label: vercel.names.length > 1 ? `Vercel: ${n}` : 'Vercel', url: `https://vercel.com/${vercel.team}/${n}` });
  return out;
}

export function Dashboard(props: IDockviewPanelProps<{ projectId: string }>) {
  const projectId = props.params.projectId;
  const { projects, stats, sessions, telemetry } = useLive();
  const { doc, patchDoc, open } = useWorkspace();
  const project = projects.find((p) => p.id === projectId);
  const [tasks, setTasks] = useState<TaskInfo[] | null>(null);
  const [glance, setGlance] = useState<{ awsTotal: number | null; waiting: number | null } | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [costs, setCosts] = useState<CostReport | null>(null);
  const [ask, setAsk] = useState('');
  const [adding, setAdding] = useState<{ label: string; url: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void window.elysium.tasks(projectId).then((r) => { if (live) setTasks(r.ok ? r.tasks : []); });
    void window.elysium.glance(projectId).then((g) => { if (live) setGlance(g); });
    void window.elysium.usage().then((u) => { if (live) setUsage(u); });
    void window.elysium.costs().then((c) => { if (live) setCosts(c); });
    return () => { live = false; };
  }, [projectId]);

  // This project's share of the month, with the same hand set links the Costs page uses.
  const cost = useMemo(() => {
    if (!costs) return null;
    const mine = costs.items.filter((i) => { const l = doc.costLinks[i.key]; return (l === 'none' ? null : l ?? i.projectId) === projectId; });
    const fixed = doc.fixedCosts.filter((f) => f.projectId === projectId).reduce((n, f) => n + f.monthly, 0);
    return { total: mine.reduce((n, i) => n + i.cost, 0) + fixed, estimate: mine.some((i) => i.estimate && i.cost > 0), vercel: mine.filter((i) => i.provider === 'vercel').map((i) => i.name) };
  }, [costs, doc.costLinks, doc.fixedCosts, projectId]);

  const saved = doc.dashboards[projectId]?.links;
  const links = saved ?? defaultLinks(projectId, project?.repo ?? null, { team: costs?.vercelTeam ?? null, names: cost?.vercel ?? [] });
  const setLinks = (l: DashLink[]) => patchDoc({ dashboards: { ...doc.dashboards, [projectId]: { ...doc.dashboards[projectId], links: l } } });
  const extras = PROJECT_EXTRAS[projectId];
  const people = doc.dashboards[projectId]?.people ?? extras?.people ?? [];
  const setPeople = (p: string[]) => patchDoc({ dashboards: { ...doc.dashboards, [projectId]: { ...doc.dashboards[projectId], people: p } } });
  const [who, setWho] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const checkOn = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    const what = extras?.checkWhat ?? 'what they are waiting on, anything open for them, and anything that looks wrong';
    const r = await window.elysium.quickRun(projectId, `Check on ${n}: ${what}. Tell me in a few short lines where things stand and what, if anything, needs me. Do not change anything; just look and report.`);
    setNote(r.ok ? `Asked ${project?.name ?? 'the project'} to check on ${n}. You get a notification with the answer.` : r.reason ?? 'Could not send it.');
    if (r.ok) setWho('');
  };
  const openLink = (l: DashLink) => open({ kind: 'web', title: l.label, params: { url: l.url, projectId, title: l.label } });

  const stat = stats.find((s) => s.id === projectId);
  const mins = usage?.projects.find((p) => p.id === projectId)?.minutesWeek ?? null;
  const live = sessions.filter((s) => s.status === 'running' && s.templateId.startsWith(`${projectId}.`));
  const requests = doc.featureRequests.filter((r) => r.projectId === projectId).slice(0, 6);

  const sendAsk = async () => {
    const text = ask.trim();
    if (!text) return;
    const prompt = [
      `Feature request from the ${project?.name ?? projectId} dashboard in ElysiumProd (src/renderer/src/workspace/Dashboard.tsx, project id "${projectId}"):`,
      '',
      text,
      '',
      'Build it in the ElysiumProd repository. Keep to the app\'s UI rules (clean, glanceable, no em dashes, no dense tables). Run the typecheck, the build and the isolated smoke test, then commit and push to the current branch.',
      'Do not restart ElysiumProd yourself; the owner restarts it to load the change. Reply with one short line saying what you built.',
    ].join('\n');
    const r = await window.elysium.chatSend('tool:elysiumprod', prompt);
    const entry = { id: uid(), projectId, text, at: new Date().toISOString(), sent: r.ok, note: r.ok ? null : r.reason };
    patchDoc({ featureRequests: [entry, ...doc.featureRequests].slice(0, 60) });
    if (r.ok) { setAsk(''); setNote('Sent to the Elysium Builder. You get a notification when it is done.'); } else setNote(r.reason ?? 'Could not send it.');
  };
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 6000); return () => clearTimeout(t); }, [note]);

  const tiles = [
    { label: 'waiting on you', value: glance?.waiting ?? (glance ? 0 : null), warn: Boolean(glance?.waiting) },
    { label: 'open tasks', value: tasks ? tasks.length : null, warn: false },
    { label: 'commits this week', value: stat ? stat.commitsThisWeek : null, warn: false },
    { label: 'with agents this week', value: mins == null ? null : hours(mins), warn: false },
    { label: `this month${cost?.estimate ? ', partly estimated' : ''}`, value: cost ? usd(cost.total) : null, warn: false },
  ];

  return (
    <div className="dash">
      <div className="dash-inner">
        <header className="dash-head">
          <ProjectLogo projectId={projectId} size="lg" />
          <div>
            <h2>{project?.name ?? projectId}</h2>
            <p>{live.length ? live.map((s) => `${s.title} ${telemetry[s.id]?.state === 'busy' ? 'working' : telemetry[s.id]?.state === 'waiting' ? 'needs you' : 'idle'}`).join(' · ') : 'No sessions running'}</p>
          </div>
        </header>

        <div className="dash-tiles">
          {tiles.map((t, i) => (
            <div key={t.label} className={`dash-tile ${t.warn ? 'warn' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="dash-num">{t.value ?? '…'}</div>
              <div className="dash-label">{t.label}</div>
            </div>
          ))}
        </div>

        {(people.length > 0 || extras?.people) && (
          <section className="dash-block">
            <div className="section-title">Check on someone</div>
            <div className="dash-people">
              {people.map((p) => (
                <div key={p} className="dash-person">
                  <button className="dash-person-main" onClick={() => void checkOn(p)} title={`Ask ${project?.name ?? 'the project'} how things stand with ${p}`}><UserRound size={15} />{p}</button>
                  <button className="ghost-icon tiny hover-only" onClick={() => setPeople(people.filter((x) => x !== p))} aria-label={`Remove ${p}`}><X size={12} /></button>
                </div>
              ))}
              {addingPerson ? (
                <form className="dash-person adding" onSubmit={(e) => { e.preventDefault(); const n = who.trim(); if (n && !people.includes(n)) setPeople([...people, n]); setWho(''); setAddingPerson(false); }}>
                  <input className="text-input" autoFocus placeholder="Name" value={who} onChange={(e) => setWho(e.target.value)} onBlur={() => { if (!who.trim()) setAddingPerson(false); }} />
                </form>
              ) : <button className="dash-person add" onClick={() => setAddingPerson(true)} aria-label="Add a person"><Plus size={14} /></button>}
            </div>
            <form className="dash-check" onSubmit={(e) => { e.preventDefault(); void checkOn(who); }}>
              <input className="text-input" placeholder="Or type anyone: check on…" value={addingPerson ? '' : who} onChange={(e) => setWho(e.target.value)} />
              <button className="btn" type="submit" disabled={!who.trim() || addingPerson}>Check</button>
            </form>
            <p className="dash-hint">It only looks and reports back; nothing is changed.</p>
          </section>
        )}

        <section className="dash-block">
          <div className="section-title">Open here</div>
          <div className="dash-links">
            {links.map((l) => (
              <div key={l.id} className="dash-link">
                <button className="dash-link-main" onClick={() => openLink(l)} title={l.url}>
                  <Globe size={16} />
                  <span><span className="dash-link-label">{l.label}</span><span className="dash-link-host">{(() => { try { return new URL(l.url).hostname.replace(/^www\./, ''); } catch { return l.url; } })()}</span></span>
                </button>
                <button className="ghost-icon tiny hover-only" onClick={() => window.elysium.openExternal(l.url)} title="Open in your browser" aria-label={`Open ${l.label} in your browser`}><ArrowUpRight size={13} /></button>
                <button className="ghost-icon tiny hover-only" onClick={() => setLinks(links.filter((x) => x.id !== l.id))} title="Remove" aria-label={`Remove ${l.label}`}><X size={13} /></button>
              </div>
            ))}
            {adding ? (
              <form className="dash-link adding" onSubmit={(e) => { e.preventDefault(); if (/^https:\/\/\S+$/.test(adding.url.trim())) { setLinks([...links, { id: uid(), label: adding.label.trim() || adding.url.trim(), url: adding.url.trim() }]); setAdding(null); } }}>
                <input className="text-input" autoFocus placeholder="Name, such as Admin" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
                <input className="text-input" placeholder="https://" value={adding.url} onChange={(e) => setAdding({ ...adding, url: e.target.value })} />
                <button className="btn primary" type="submit" disabled={!/^https:\/\/\S+$/.test(adding.url.trim())}>Add</button>
                <button className="btn" type="button" onClick={() => setAdding(null)}>Cancel</button>
              </form>
            ) : (
              <button className="dash-link add" onClick={() => setAdding({ label: '', url: '' })}><Plus size={16} />Add a link</button>
            )}
          </div>
          <p className="dash-hint">Links open beside your terminals and stay signed in. Every link in this project shares one sign in.</p>
        </section>

        <section className="dash-block">
          <div className="section-title">Open tasks{tasks?.length ? <span className="count">{tasks.length}</span> : null}</div>
          {tasks === null ? <p className="dash-hint">Loading…</p> : !tasks.length ? <p className="dash-hint">Nothing open.</p> : (
            <div className="dash-tasks">
              {tasks.slice(0, 8).map((t) => (
                <button key={t.number} className={`dash-task ${t.needsOwner ? 'owner' : ''}`} onClick={() => open({ kind: 'web', title: `#${t.number}`, params: { url: t.url, projectId } })}>
                  <span className="dash-task-num">#{t.number}</span>
                  <span className="dash-task-title">{t.title}</span>
                  <span className="dash-task-when">{ago(t.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="dash-block">
          <div className="section-title">Ask for something here</div>
          <div className="dash-ask">
            <textarea className="text-input" rows={3} placeholder="For example: show this week's signups and failed logins as two numbers at the top." value={ask}
              onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void sendAsk(); }} />
            <button className="btn primary" onClick={() => void sendAsk()} disabled={!ask.trim()}><SendHorizontal size={14} />Send to ElysiumProd</button>
          </div>
          {note && <p className="dash-hint">{note}</p>}
          {requests.length > 0 && (
            <div className="dash-requests">
              {requests.map((r) => <div key={r.id} className="dash-request"><span className={`dot ${r.sent ? 'idle' : 'error'}`} /><span className="grow">{r.text}</span><span className="muted small">{r.sent ? ago(r.at) : r.note}</span></div>)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
