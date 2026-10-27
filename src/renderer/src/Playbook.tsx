// The playbook: the best work across every project, written by the sessions that
// did it. How things were built, the strategy behind them, things worth copying and
// lessons, laid out as an archive to browse for direction. Each entry is a calm page.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, FolderOpen, PenLine, Search, X } from 'lucide-react';
import type { PlaybookEntry, PlaybookKind } from '@shared/ipc';
import { ago, useLive } from './workspace/live';
import { md, onLinkClick } from './workspace/project-widgets';
import { ProjectLogo } from './ProjectLogo';
import './playbook.css';

const KINDS: { id: PlaybookKind; label: string; one: string; blurb: string }[] = [
  { id: 'howto', label: 'How it was built', one: 'How-to', blurb: 'The steps, files and pitfalls, so the next project does it in an hour.' },
  { id: 'strategy', label: 'Strategy', one: 'Strategy', blurb: 'A plan and the thinking behind it: the options, the choice, and why.' },
  { id: 'showcase', label: 'Showcase', one: 'Showcase', blurb: 'Something that turned out well, and what makes it worth copying.' },
  { id: 'lesson', label: 'Lessons', one: 'Lesson', blurb: 'A decision or a mistake, and what to do next time.' },
];
const kindInfo = (k: PlaybookKind) => KINDS.find((x) => x.id === k) ?? KINDS[0];

// What the empty archive shows: one example of each kind, so it is clear what belongs here.
const EXAMPLES: { kind: PlaybookKind; title: string; peek: string[] }[] = [
  { kind: 'howto', title: 'Stripe checkout with webhooks', peek: ['Create the session on the server', 'Trust the webhook, not the redirect', 'Verify the signature'] },
  { kind: 'strategy', title: 'Pricing the first paid plan', peek: ['One plan, one price, a free trial. Learn what people pay for before adding tiers.'] },
  { kind: 'showcase', title: 'The night sky on Welcome', peek: ['Stars drawn once, twinkling as layers. Calm, and under 3 ms a frame.'] },
  { kind: 'lesson', title: 'Never restart from outside the app', peek: ['Next time: use the in-app Restart, so sessions come back.'] },
];

const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = (s: string) => s.replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_#>]/g, '').trim();

/** A peek at the entry for its card: the first steps of a how-to, else a quote or the opening line. */
function peek(e: PlaybookEntry): { steps: string[]; line: string | null } {
  const steps = [...e.body.matchAll(/^\s*\d+\.\s+(.+)$/gm)].slice(0, 3).map((m) => plain(m[1]));
  const quote = e.body.match(/^>\s*(.+)$/m)?.[1];
  const next = e.body.match(/next time[:,]?\s*(.+)$/im)?.[1];
  const para = e.body.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !/^[#>\-*\d|`]/.test(p));
  const line = plain((e.kind === 'lesson' && next) || quote || para || '') || null;
  return { steps: e.kind === 'howto' ? steps : [], line };
}

/** The page body, with an id on each heading so the contents list can jump to it. */
function render(body: string): { html: string; toc: { id: string; text: string; level: number }[] } {
  const toc: { id: string; text: string; level: number }[] = [];
  const html = md(body).replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, l: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '');
    const id = `h-${slug(text)}-${toc.length}`;
    toc.push({ id, text, level: Number(l) });
    return `<h${l} id="${id}">${inner}</h${l}>`;
  });
  return { html, toc };
}

const minutes = (e: PlaybookEntry) => Math.max(1, Math.round(e.body.split(/\s+/).length / 220));

export function Playbook() {
  const { sessions, templates, projects } = useLive();
  const [list, setList] = useState<PlaybookEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<PlaybookKind | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [open, setOpen] = useState<PlaybookEntry | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => { window.elysium.playbook().then(setList, () => setList([])); }, []);

  const all = list ?? [];
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((e) => (!kind || e.kind === kind) && (!project || (e.project || 'Anywhere') === project)
      && words.every((w) => `${e.title} ${e.summary} ${e.project} ${e.tags.join(' ')} ${e.body}`.toLowerCase().includes(w)));
  }, [all, q, kind, project]);
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, all.filter((e) => e.kind === k.id).length])) as Record<PlaybookKind, number>, [all]);
  const projectNames = useMemo(() => [...new Set(all.map((e) => e.project || 'Anywhere'))], [all]);
  const projectIdOf = (name: string) => projects.find((p) => p.name === name)?.id;

  if (open) return <PlaybookPage e={open} projectId={projectIdOf(open.project)} onBack={() => setOpen(null)} />;

  const [featured, ...rest] = shown;
  const filtering = Boolean(q || kind || project);
  return (
    <div className="page page-enter">
      <div className="page-inner pbx">
        <header className="pbx-hero">
          <span className="pbx-eyebrow">Across every project</span>
          <h1>Playbook</h1>
          <p className="pbx-sub">The best of what your sessions built and figured out: how it was done, the strategy behind it, the things worth copying. Any project can search it for direction before it starts.</p>
          {all.length > 0 && (
            <p className="pbx-stats">
              <span><b>{all.length}</b> {all.length === 1 ? 'entry' : 'entries'}</span>
              <span><b>{projectNames.length}</b> {projectNames.length === 1 ? 'project' : 'projects'}</span>
              <span>updated {ago(all[0].updatedAt)}</span>
            </p>
          )}
          <div className="pbx-bar">
            <label className="pbx-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the playbook" aria-label="Search the playbook" />{q && <button className="pbx-clear" onClick={() => setQ('')} aria-label="Clear"><X size={14} /></button>}</label>
            <button className={`pbx-write ${asking ? 'on' : ''}`} onClick={() => setAsking((a) => !a)} aria-expanded={asking}><PenLine size={15} />Write one up</button>
          </div>
          {asking && <AskRow sessions={sessions} templates={templates} onDone={() => setAsking(false)} />}
        </header>

        {all.length > 0 && (
          <nav className="pbx-filters" aria-label="Filter">
            <div className="pbx-chips">
              <button className={!kind ? 'on' : ''} onClick={() => setKind(null)}>All<em>{all.length}</em></button>
              {KINDS.map((k) => (
                <button key={k.id} className={kind === k.id ? 'on' : ''} disabled={!counts[k.id]} onClick={() => setKind(kind === k.id ? null : k.id)}>
                  <i className={`pbx-mark ${k.id}`} />{k.label}<em>{counts[k.id]}</em>
                </button>
              ))}
            </div>
            {projectNames.length > 1 && (
              <div className="pbx-chips quiet">
                {projectNames.map((p) => (
                  <button key={p} className={project === p ? 'on' : ''} onClick={() => setProject(project === p ? null : p)}>
                    {projectIdOf(p) && <ProjectLogo projectId={projectIdOf(p)!} />}{p}
                  </button>
                ))}
              </div>
            )}
          </nav>
        )}

        {list !== null && !all.length && <EmptyArchive onWrite={() => setAsking(true)} />}

        {featured && (
          <>
            <Card e={featured} big onOpen={setOpen} projectId={projectIdOf(featured.project)} />
            {rest.length > 0 && (
              <>
                {!filtering && <div className="pbx-rule"><span>Everything else</span></div>}
                <div className="pbx-grid">
                  {rest.map((e, i) => <Card key={e.slug} e={e} i={i} onOpen={setOpen} projectId={projectIdOf(e.project)} />)}
                </div>
              </>
            )}
          </>
        )}
        {all.length > 0 && !shown.length && <p className="pbx-none">Nothing matches that. <button className="link-btn" onClick={() => { setQ(''); setKind(null); setProject(null); }}>Show everything</button></p>}

        <div className="pbx-foot"><button className="link-btn" onClick={() => void window.elysium.openPlaybookFolder()}><FolderOpen size={14} />Open the playbook folder</button><span>Plain Markdown files, yours to edit or keep in git.</span></div>
      </div>
    </div>
  );
}

function Card({ e, big, i = 0, projectId, onOpen }: { e: PlaybookEntry; big?: boolean; i?: number; projectId?: string; onOpen(e: PlaybookEntry): void }) {
  const p = useMemo(() => peek(e), [e]);
  const k = kindInfo(e.kind);
  return (
    <button className={`pb-card pbx-card ${e.kind} ${big ? 'big' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }} onClick={() => onOpen(e)}>
      <span className="pbx-kind"><i className={`pbx-mark ${e.kind}`} />{k.one}</span>
      <strong className="pbx-title">{e.title}</strong>
      {e.summary && <span className="pbx-sum">{e.summary}</span>}
      {p.steps.length > 0 ? (
        <ol className="pbx-peek-steps">{p.steps.map((s, n) => <li key={n}><span>{n + 1}</span>{s}</li>)}</ol>
      ) : p.line && p.line !== e.summary ? <span className="pbx-peek-line">{p.line}</span> : null}
      <span className="pbx-meta">
        {projectId && <ProjectLogo projectId={projectId} />}
        <span>{e.project || 'Anywhere'}</span>
        {e.tags.slice(0, big ? 4 : 2).map((t) => <i key={t}>{t}</i>)}
        <em>{ago(e.updatedAt)}{big ? ` · ${minutes(e)} min read` : ''}</em>
        {big && <ArrowUpRight size={15} className="pbx-go" />}
      </span>
    </button>
  );
}

function EmptyArchive({ onWrite }: { onWrite(): void }) {
  return (
    <section className="pbx-empty">
      <div className="pbx-grid ghost" aria-hidden="true">
        {EXAMPLES.map((x) => (
          <div key={x.kind} className={`pbx-card ghost ${x.kind}`}>
            <span className="pbx-kind"><i className={`pbx-mark ${x.kind}`} />{kindInfo(x.kind).one}</span>
            <strong className="pbx-title">{x.title}</strong>
            <span className="pbx-sum">{kindInfo(x.kind).blurb}</span>
            {x.kind === 'howto'
              ? <ol className="pbx-peek-steps">{x.peek.map((s, n) => <li key={n}><span>{n + 1}</span>{s}</li>)}</ol>
              : <span className="pbx-peek-line">{x.peek[0]}</span>}
          </div>
        ))}
      </div>
      <div className="pbx-empty-say">
        <h2>Your archive starts with one entry</h2>
        <p>Ask a session to write up something it built, a plan it made, or a lesson it learned. Or tell any session "record how you did this". Every project can read what lands here.</p>
        <button className="btn primary" onClick={onWrite}><PenLine size={15} />Write the first one</button>
      </div>
    </section>
  );
}

function AskRow({ sessions, templates, onDone }: { sessions: ReturnType<typeof useLive>['sessions']; templates: ReturnType<typeof useLive>['templates']; onDone(): void }) {
  const running = useMemo(() => sessions.filter((s) => s.status === 'running' && templates.find((t) => t.id === s.templateId)?.kind === 'claude'), [sessions, templates]);
  const [who, setWho] = useState('');
  const [what, setWhat] = useState('');
  const [kind, setKind] = useState<PlaybookKind>('howto');
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const ask = async () => {
    const id = who || running[0]?.id;
    if (!id) return;
    const r = await window.elysium.recordPlaybook(id, what, kind);
    if (r.ok) { setWhat(''); setNote('Asked. It writes it up when it is free, and it shows up here.'); setTimeout(onDone, 2600); } else setNote(r.reason);
  };
  if (!running.length) return <div className="pbx-ask"><p className="pbx-ask-note">Start a Claude session first; it can write up what it did. You can also tell any session "record how you did this".</p></div>;
  const hint = kind === 'strategy' ? 'Which plan, like pricing the first paid plan' : kind === 'showcase' ? 'What turned out well, like the onboarding' : kind === 'lesson' ? 'What happened, like the broken restart' : 'What to explain, like the Stripe checkout';
  return (
    <div className="pbx-ask">
      <div className="pbx-kinds" role="radiogroup" aria-label="Kind">
        {KINDS.map((k) => <button key={k.id} role="radio" aria-checked={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}><i className={`pbx-mark ${k.id}`} />{k.one}</button>)}
      </div>
      <div className="pbx-ask-row">
        <select className="pbx-who" value={who || running[0].id} onChange={(e) => setWho(e.target.value)} aria-label="Session">
          {running.map((s) => { const t = templates.find((x) => x.id === s.templateId); return <option key={s.id} value={s.id}>{t?.title}{t?.projectName ? `, ${t.projectName}` : ''}</option>; })}
        </select>
        <input ref={input} value={what} onChange={(e) => setWhat(e.target.value)} placeholder={hint} onKeyDown={(e) => { if (e.key === 'Enter') void ask(); if (e.key === 'Escape') onDone(); }} />
        <button className="btn primary" onClick={() => void ask()}>Ask</button>
      </div>
      {note && <p className="pbx-ask-note" role="status">{note}</p>}
    </div>
  );
}

function PlaybookPage({ e, projectId, onBack }: { e: PlaybookEntry; projectId?: string; onBack(): void }) {
  const { html, toc } = useMemo(() => render(e.body), [e.body]);
  const scroller = useRef<HTMLDivElement>(null);
  const jump = (id: string) => scroller.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const k = kindInfo(e.kind);
  return (
    <div className="page page-enter" ref={scroller}>
      <div className="pb-doc-wrap pbx-doc-wrap">
        <article className={`pb-doc pbx-doc ${e.kind}`}>
          <nav className="pb-crumb"><button className="link-btn" onClick={onBack}><ArrowLeft size={14} />Playbook</button><span>/</span><span>{e.project || 'Anywhere'}</span></nav>
          <span className="pbx-kind"><i className={`pbx-mark ${e.kind}`} />{k.label}</span>
          <h1 className="pb-doc-title">{e.title}</h1>
          {e.summary && <p className="pb-doc-lede">{e.summary}</p>}
          <dl className="pb-props">
            <dt>Project</dt><dd>{projectId && <ProjectLogo projectId={projectId} />}{e.project || 'Anywhere'}</dd>
            {e.author && <><dt>Written by</dt><dd>{e.author}</dd></>}
            {e.tags.length > 0 && <><dt>Tags</dt><dd className="pbx-tags">{e.tags.map((t) => <i key={t}>{t}</i>)}</dd></>}
            <dt>Updated</dt><dd>{ago(e.updatedAt)}</dd>
            <dt>Reading</dt><dd>{minutes(e)} min</dd>
          </dl>
          <div className="pb-doc-body" onClick={onLinkClick} dangerouslySetInnerHTML={{ __html: html }} />
        </article>
        {toc.length > 1 && (
          <aside className="pb-toc" aria-label="On this page">
            <span>On this page</span>
            {toc.map((h) => <button key={h.id} className={h.level === 3 ? 'sub' : ''} onClick={() => jump(h.id)}>{h.text}</button>)}
          </aside>
        )}
      </div>
    </div>
  );
}
