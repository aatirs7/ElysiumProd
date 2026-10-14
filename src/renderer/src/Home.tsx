import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import type { ReaderEntry, UsageStats } from '@shared/ipc';
import { Logo } from './Logo';
import { ProjectLogo } from './ProjectLogo';
import { plainLine } from './TopBarExtras';
import { CommandBox } from './CommandBox';
import { ago, useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';

function partOfDay(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const hours = (min: number) => (min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1)} h` : `${min} min`);

const STATE_WORDS: Record<string, string> = { busy: 'Working', waiting: 'Needs you', idle: 'Idle', starting: 'Starting', ended: 'Ended' };

interface Props {
  name: string;
  onOpen(projectId: string, projectName: string): void;
  onFocus(sessionId: string, templateId: string): void;
  onNewProject(): void;
}

export function Home({ name, onOpen, onFocus, onNewProject }: Props) {
  const { projects, stats, sessions, telemetry, templates, compacting } = useLive();
  const { doc, togglePin } = useWorkspace();
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [lastSaid, setLastSaid] = useState<Record<string, ReaderEntry>>({});
  const [picking, setPicking] = useState(false);
  useEffect(() => { void window.elysium.usage().then(setUsage); }, []);

  const live = useMemo(() => sessions.filter((s) => s.status === 'running' && templates.find((t) => t.id === s.templateId)?.kind === 'claude'), [sessions, templates]);
  const liveKey = live.map((s) => s.id).join(',');

  // The latest thing each running agent said, kept current as replies arrive.
  useEffect(() => {
    let on = true;
    void Promise.all(live.map(async (s) => [s.id, (await window.elysium.reader(s.id)).filter((e) => e.role === 'claude').pop()] as const))
      .then((rows) => { if (on) setLastSaid(Object.fromEntries(rows.filter((r) => r[1]) as [string, ReaderEntry][])); });
    const off = window.elysium.onReader((id, e) => { if (e.role === 'claude') setLastSaid((m) => ({ ...m, [id]: e })); });
    return () => { on = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  const statFor = (id: string) => stats.find((s) => s.id === id);
  const usageFor = (id: string) => usage?.projects.find((p) => p.id === id);
  const lastTouched = (id: string) => {
    const s = statFor(id);
    const t = [s?.lastSessionAt, s?.lastCommitAt, usageFor(id)?.lastAt].filter(Boolean).map((x) => Date.parse(x!));
    return t.length ? Math.max(...t) : 0;
  };
  const pinned = doc.pinned.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as typeof projects;
  const ordered = [...pinned].sort((a, b) => lastTouched(b.id) - lastTouched(a.id));
  const unpinned = projects.filter((p) => !doc.pinned.includes(p.id));
  const commits = stats.reduce((n, s) => n + s.commitsThisWeek, 0);
  const waiting = live.filter((s) => telemetry[s.id]?.state === 'waiting').length;
  const working = live.filter((s) => telemetry[s.id]?.state === 'busy').length;

  const subline = (id: string) => {
    const s = statFor(id);
    const u = usageFor(id);
    const n = sessions.filter((x) => x.status === 'running' && x.templateId.startsWith(`${id}.`)).length;
    if (n) return `${n} session${n > 1 ? 's' : ''} running`;
    const parts = [u?.minutesWeek ? `${hours(u.minutesWeek)} this week` : null, s?.commitsThisWeek ? `${s.commitsThisWeek} commits` : null].filter(Boolean);
    const t = lastTouched(id);
    return parts.length ? parts.join(' · ') : t ? `Last worked ${ago(new Date(t).toISOString())}` : 'No recent work';
  };
  const projectState = (id: string) => {
    const st = live.filter((s) => s.templateId.startsWith(`${id}.`)).map((s) => telemetry[s.id]?.state);
    return st.includes('waiting') ? 'waiting' : st.includes('busy') ? 'busy' : st.length ? 'idle' : null;
  };

  const headline = waiting
    ? `${waiting} agent${waiting > 1 ? 's need' : ' needs'} you.`
    : working
      ? `${working} agent${working > 1 ? 's are' : ' is'} working right now.`
      : live.length ? `${live.length} agent${live.length > 1 ? 's' : ''} open and idle.` : 'All quiet. Pick up where you left off.';

  // The last two weeks of agent time, one column a day.
  const days = (usage?.perDay ?? []).slice(-14);
  const peak = Math.max(60, ...days.map((d) => d.minutes));

  return (
    <div className="home page-enter">
      <div className="home-aura" aria-hidden="true" />
      <div className="home-inner">
        <header className="hero">
          <div className="hero-mark"><Logo className="hero-logo" /></div>
          <h1 className="greeting">{partOfDay()}, {name}</h1>
          <p className={`greeting-sub ${waiting ? 'attn' : ''}`}>{headline}</p>
        </header>

        <CommandBox onOpenProject={(id) => onOpen(id, projects.find((p) => p.id === id)?.name ?? id)} />

        {live.length > 0 && (
          <section className="home-block">
            <div className="section-title">Right now</div>
            <div className="live-grid">
              {live.map((s, i) => {
                const t = templates.find((x) => x.id === s.templateId);
                const tel = telemetry[s.id];
                const st = tel?.state ?? 'starting';
                const said = lastSaid[s.id];
                const ctx = tel?.contextPercent;
                const c = compacting[s.id];
                return (
                  <button key={s.id} className={`live-card ${st}`} style={{ animationDelay: `${i * 50}ms` }} onClick={() => onFocus(s.id, s.templateId)}>
                    <div className="live-head">
                      {t?.project ? <ProjectLogo projectId={t.project} /> : null}
                      <span className="live-name">{t?.title ?? s.title}</span>
                      <span className={`live-state ${st}`}><span className={`dot ${st}`} />{c ? 'Compacting' : STATE_WORDS[st] ?? st}</span>
                    </div>
                    <p className="live-said">
                      {st === 'waiting' && tel?.waitingMessage ? tel.waitingMessage : said ? plainLine(said.text, 220) : 'Nothing said since it opened here.'}
                    </p>
                    <div className="live-foot">
                      <span>{said ? ago(said.at) : `opened ${ago(s.startedAt)}`}</span>
                      {ctx != null && (
                        <span className={`ctx ${ctx >= 85 ? 'bad' : ctx >= 70 ? 'warn' : ''}`} title="Context used">
                          <svg viewBox="0 0 20 20" className="ctx-ring" aria-hidden="true">
                            <circle cx="10" cy="10" r="8" className="ctx-track" />
                            <circle cx="10" cy="10" r="8" className="ctx-fill" strokeDasharray={`${(Math.min(100, ctx) / 100) * 50.27} 50.27`} />
                          </svg>
                          {Math.round(ctx)}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="home-block">
          <div className="week-card">
            <div className="week-main">
              <div className="week-num">{usage ? hours(usage.minutesWeek) : '…'}</div>
              <div className="week-label">with agents this week</div>
              <div className="week-minor">
                <span><strong>{commits}</strong> commits</span>
                <span><strong>{usage ? usage.streakDays : '…'}</strong> day streak</span>
              </div>
            </div>
            <div className="week-chart" role="img" aria-label="Agent time per day, last two weeks">
              {days.map((d, i) => {
                const today = i === days.length - 1;
                const label = new Date(`${d.day}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <div key={d.day} className="week-col" title={`${label}: ${d.minutes ? hours(d.minutes) : 'no agent time'}`}>
                    <div className={`week-bar ${today ? 'today' : ''} ${d.minutes ? '' : 'zero'}`} style={{ height: `${Math.max(4, (d.minutes / peak) * 100)}%`, animationDelay: `${i * 25}ms` }} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="home-block">
          <div className="section-title">Your projects</div>
          <div className="projects-grid">
            {ordered.map((p, i) => {
              const st = projectState(p.id);
              return (
                <button key={p.id} className={`project-card ${st ?? ''}`} style={{ animationDelay: `${60 + i * 40}ms` }} onClick={() => onOpen(p.id, p.name)}>
                  <span className="project-logo-wrap"><ProjectLogo projectId={p.id} size="lg" /></span>
                  <span className="project-text">
                    <span className="title">{p.name}</span>
                    <span className="sub">{st && <span className={`dot ${st}`} />}{subline(p.id)}</span>
                  </span>
                  <ArrowRight size={17} className="go" />
                </button>
              );
            })}
            <div className="pin-card-wrap">
              <button className="project-card add" onClick={() => setPicking((x) => !x)} aria-expanded={picking}>
                <span className="project-logo-wrap add"><Plus size={18} /></span>
                <span className="project-text"><span className="title">Add a project</span><span className="sub">Clone, start new, or pin one you have</span></span>
              </button>
                {picking && (
                  <div className="pin-list" role="menu">
                    <button className="nav new-project" role="menuitem" onClick={() => { setPicking(false); onNewProject(); }}>
                      <span className="plogo new"><Plus size={13} /></span><span className="grow">New project</span>
                    </button>
                    {unpinned.length > 0 && <div className="pin-picker-label">Pin one you have</div>}
                    {unpinned.map((p) => (
                      <button key={p.id} className="nav" role="menuitem" onClick={() => { togglePin(p.id); if (unpinned.length === 1) setPicking(false); }}>
                        <ProjectLogo projectId={p.id} /><span className="grow">{p.name}</span><Plus size={14} className="muted" />
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
