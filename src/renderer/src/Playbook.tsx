// The playbook: how features were built, written by the sessions that built them.
// Laid out like a Notion workspace: a gallery of how-tos grouped by project, and
// each one a page with its properties, a contents list and calm reading type.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookMarked, FolderOpen, NotebookPen, Search } from 'lucide-react';
import type { PlaybookEntry } from '@shared/ipc';
import { ago, useLive } from './workspace/live';
import { md, onLinkClick } from './workspace/project-widgets';
import { ProjectLogo } from './ProjectLogo';

const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

export function Playbook() {
  const { sessions, templates, projects } = useLive();
  const [list, setList] = useState<PlaybookEntry[] | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<PlaybookEntry | null>(null);
  const [who, setWho] = useState('');
  const [what, setWhat] = useState('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { void window.elysium.playbook().then(setList); }, []);

  const running = useMemo(() => sessions.filter((s) => s.status === 'running' && templates.find((t) => t.id === s.templateId)?.kind === 'claude'), [sessions, templates]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (list ?? []).filter((e) => words.every((w) => `${e.title} ${e.summary} ${e.project} ${e.tags.join(' ')} ${e.body}`.toLowerCase().includes(w)));
  }, [list, q]);
  // Grouped by project, the busiest project first.
  const groups = useMemo(() => {
    const m = new Map<string, PlaybookEntry[]>();
    for (const e of shown) m.set(e.project || 'Anywhere', [...(m.get(e.project || 'Anywhere') ?? []), e]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown]);
  const projectIdOf = (name: string) => projects.find((p) => p.name === name)?.id;

  const record = async () => {
    const id = who || running[0]?.id;
    if (!id) return;
    const r = await window.elysium.recordPlaybook(id, what);
    setNote(r.ok ? 'Asked. It writes the how-to when it is free, and it shows up here.' : r.reason);
    if (r.ok) setWhat('');
  };

  if (open) return <PlaybookPage e={open} projectId={projectIdOf(open.project)} onBack={() => setOpen(null)} />;

  return (
    <div className="page page-enter">
      <div className="page-inner pb">
        <div className="help-hero">
          <span className="pb-icon"><BookMarked size={26} /></span>
          <h1>Playbook</h1>
          <p className="page-sub">How things were built, written by the sessions that built them. Every project can look these up before it starts.</p>
          <label className="help-search"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search how-tos" /></label>
        </div>

        <section className="pb-ask">
          <div className="pb-ask-title"><NotebookPen size={15} />Ask a session to write one up</div>
          {running.length ? (
            <div className="pb-ask-row">
              <select className="picker" value={who || running[0].id} onChange={(e) => setWho(e.target.value)} aria-label="Session">
                {running.map((s) => { const t = templates.find((x) => x.id === s.templateId); return <option key={s.id} value={s.id}>{t?.title}{t?.projectName ? ` (${t.projectName})` : ''}</option>; })}
              </select>
              <input className="text-input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What to explain, like the Stripe checkout" onKeyDown={(e) => { if (e.key === 'Enter') void record(); }} />
              <button className="btn primary" onClick={() => void record()}>Ask</button>
            </div>
          ) : <p className="muted small">Start a session first; it can explain what it built. You can also tell any session "record how you did this".</p>}
          {note && <p className="muted small" role="status">{note}</p>}
        </section>

        {list !== null && !list.length && <p className="home-empty pb-empty">Nothing here yet. Ask a session above, or tell any session "record how you did this".</p>}
        {groups.map(([project, items]) => (
          <section key={project} className="pb-group">
            <div className="pb-group-head">
              {projectIdOf(project) ? <ProjectLogo projectId={projectIdOf(project)!} /> : <BookMarked size={15} />}
              <span>{project}</span><em>{items.length}</em>
            </div>
            <div className="pb-gallery">
              {items.map((e, i) => (
                <button key={e.slug} className="pb-card" style={{ animationDelay: `${i * 40}ms` }} onClick={() => setOpen(e)}>
                  <span className="pb-cover" aria-hidden="true"><span>{e.title.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span></span>
                  <span className="pb-card-body">
                    <strong>{e.title}</strong>
                    <span className="pb-sum">{e.summary}</span>
                    <span className="pb-chips">{e.tags.slice(0, 3).map((t) => <i key={t}>{t}</i>)}<em>{ago(e.updatedAt)}</em></span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {list !== null && list.length > 0 && !shown.length && <p className="home-empty pb-empty">No how-to matches that.</p>}
        <div className="pb-foot"><button className="link-btn" onClick={() => void window.elysium.openPlaybookFolder()}><FolderOpen size={14} />Open the playbook folder</button></div>
      </div>
    </div>
  );
}

function PlaybookPage({ e, projectId, onBack }: { e: PlaybookEntry; projectId?: string; onBack(): void }) {
  const { html, toc } = useMemo(() => render(e.body), [e.body]);
  const scroller = useRef<HTMLDivElement>(null);
  const jump = (id: string) => scroller.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const words = e.body.split(/\s+/).length;
  return (
    <div className="page page-enter" ref={scroller}>
      <div className="pb-doc-wrap">
        <article className="pb-doc">
          <nav className="pb-crumb"><button className="link-btn" onClick={onBack}><ArrowLeft size={14} />Playbook</button><span>/</span><span>{e.project || 'Anywhere'}</span></nav>
          <h1 className="pb-doc-title">{e.title}</h1>
          {e.summary && <p className="pb-doc-lede">{e.summary}</p>}
          <dl className="pb-props">
            <dt>Project</dt><dd>{projectId && <ProjectLogo projectId={projectId} />}{e.project || 'Anywhere'}</dd>
            {e.tags.length > 0 && <><dt>Tags</dt><dd className="pb-chips">{e.tags.map((t) => <i key={t}>{t}</i>)}</dd></>}
            <dt>Updated</dt><dd>{ago(e.updatedAt)}</dd>
            <dt>Reading</dt><dd>{Math.max(1, Math.round(words / 220))} min</dd>
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
