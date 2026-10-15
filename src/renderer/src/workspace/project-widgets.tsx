import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { visual } from './visuals';
import { ArrowUpRight, ChevronDown, ChevronRight, CircleCheck, GitBranch, RefreshCw } from 'lucide-react';
import type { GitInfo, RelayInfo, TaskInfo } from '@shared/ipc';
import { ago, useLive } from './live';
import { useWorkspace } from './store';
import { SkeletonRows } from './widgets';

export interface ProjectParams { projectId?: string }
export { ago };

// Fenced stats, bars and status blocks draw as small visuals (see visuals.ts).
marked.use({ renderer: { code(token) { return visual(token.lang, token.text) ?? false; } } });

/** Markdown to sanitised HTML. Links open in the system browser through onLinkClick. */
export function md(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string);
}

export function onLinkClick(e: React.MouseEvent) {
  const a = (e.target as HTMLElement).closest('a');
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute('href') ?? '';
  if (/^https:\/\//.test(href)) window.elysium.openExternal(href);
}

/** Project for a widget: its own saved choice, else the view's project, else the first. */
function useProject(props: IDockviewPanelProps<ProjectParams>) {
  const { projects } = useLive();
  const { activeView } = useWorkspace();
  const projectId = props.params.projectId ?? activeView?.projectId ?? projects[0]?.id;
  const picker = projects.length > 1 && !activeView?.projectId ? (
    <select className="picker" value={projectId ?? ''} onChange={(e) => props.api.updateParameters({ ...props.params, projectId: e.target.value })} aria-label="Project">
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  ) : null;
  return { projectId, picker };
}

function usePoll<T>(fn: (() => Promise<T>) | null, everyMs: number, key: string | undefined) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!fn) return;
    setLoading(true);
    try { setData(await fn()); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { setData(null); void load(); const t = setInterval(() => void load(), everyMs); return () => clearInterval(t); }, [load, everyMs]);
  return { data, loading, reload: load };
}

function Bar({ children, onRefresh, loading }: { children?: React.ReactNode; onRefresh(): void; loading: boolean }) {
  return (
    <div className="bar">
      {children}
      <span className="spacer" />
      <button className="ghost-icon" onClick={onRefresh} title="Refresh" aria-label="Refresh"><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
    </div>
  );
}

interface Section { heading: string; body: string }
function sections(text: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (m) { cur = { heading: m[1], body: '' }; out.push(cur); } else if (cur) cur.body += `${line}\n`;
  }
  return out;
}
/** Top level bullets of a section, as plain one line items. */
function bullets(body: string): string[] {
  return body.split(/\r?\n/).filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').replace(/`/g, '').trim());
}
const findSection = (all: Section[], names: string[]) => all.find((s) => names.some((n) => s.heading.toLowerCase().startsWith(n.toLowerCase())));

export function RelayWidget(props: IDockviewPanelProps<ProjectParams>) {
  const { projectId, picker } = useProject(props);
  const { data, loading, reload } = usePoll<RelayInfo>(projectId ? () => window.elysium.relay(projectId) : null, 120000, projectId);
  const [full, setFull] = useState(false);
  const parsed = useMemo(() => {
    if (!data?.ok) return null;
    const all = sections(data.text);
    const waiting = findSection(all, [data.waitingHeading, 'Blocked on the owner', 'Waiting on']);
    const now = findSection(all, ['Now']);
    return { waiting: waiting ? bullets(waiting.body) : [], now: now ? bullets(now.body) : [] };
  }, [data]);

  return (
    <div className="widget column">
      <Bar onRefresh={reload} loading={loading}>{picker}<span className="muted small">{data?.ok ? `Updated ${ago(data.updatedAt)}` : ''}</span></Bar>
      <div className="scroll pad stack-lg" onClick={onLinkClick}>
        {!data && <SkeletonRows n={4} />}
        {data && !data.ok && <div className="empty-state error-text">{data.error}</div>}
        {parsed && (
          <>
            <section className="stack-sm">
              <div className="section-title">Waiting on you <span className="count">{parsed.waiting.length || ''}</span></div>
              {parsed.waiting.length
                ? parsed.waiting.map((w, i) => <div key={i} className="item attention" style={{ animationDelay: `${i * 40}ms` }}>{w}</div>)
                : <div className="item calm"><CircleCheck size={16} />Nothing is waiting on you.</div>}
            </section>
            {parsed.now.length > 0 && (
              <section className="stack-sm">
                <div className="section-title">Right now</div>
                {parsed.now.map((n, i) => {
                  const [who, ...rest] = n.split(/:\s/);
                  return <div key={i} className="item"><span className="who">{rest.length ? who : ''}</span>{rest.length ? rest.join(': ') : n}</div>;
                })}
              </section>
            )}
            <button className="disclosure" onClick={() => setFull((f) => !f)}>{full ? <ChevronDown size={15} /> : <ChevronRight size={15} />}Read the full relay</button>
            {full && <article className="prose" dangerouslySetInnerHTML={{ __html: md(data!.text) }} />}
          </>
        )}
      </div>
    </div>
  );
}

export function TasksWidget(props: IDockviewPanelProps<ProjectParams>) {
  const { projectId, picker } = useProject(props);
  const [mine, setMine] = useState(true);
  const { data, loading, reload } = usePoll(projectId ? () => window.elysium.tasks(projectId) : null, 120000, projectId);
  const all = data?.tasks ?? [];
  const needs = all.filter((t) => t.needsOwner);
  const tasks: TaskInfo[] = mine ? needs : all;
  return (
    <div className="widget column">
      <Bar onRefresh={reload} loading={loading}>
        {picker}
        <div className="seg">
          <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>Needs me{needs.length ? ` ${needs.length}` : ''}</button>
          <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>All{all.length ? ` ${all.length}` : ''}</button>
        </div>
      </Bar>
      <div className="scroll pad-sm">
        {!data && <SkeletonRows n={6} />}
        {data && !data.ok && <div className="empty-state error-text">{data.error}</div>}
        {data?.ok && !tasks.length && <div className="empty-state"><CircleCheck size={18} />{mine ? 'Nothing needs you' : 'No open tasks'}</div>}
        {tasks.map((t, i) => (
          <button key={t.number} className="list-row tall task-row" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }} onClick={() => window.elysium.openExternal(t.url)} title="Open on GitHub">
            {t.needsOwner && <span className="dot attention-dot" />}
            <span className="grow">
              <span className="row-title wrap-text">{t.title}</span>
              <span className="row-sub">#{t.number} · {ago(t.updatedAt)}{t.comments ? ` · ${t.comments} comments` : ''}</span>
            </span>
            <ArrowUpRight size={15} className="muted hover-show" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function GitWidget(props: IDockviewPanelProps<ProjectParams>) {
  const { projectId, picker } = useProject(props);
  const { data, loading, reload } = usePoll<GitInfo>(projectId ? () => window.elysium.git(projectId) : null, 20000, projectId);
  return (
    <div className="widget column">
      <Bar onRefresh={reload} loading={loading}>{picker}</Bar>
      <div className="scroll pad stack">
        {!data && <SkeletonRows n={5} />}
        {data && !data.ok && <div className="empty-state error-text">{data.error}</div>}
        {data?.ok && (
          <>
            <div className="hero-stat">
              <div className="hero-label"><GitBranch size={15} /> {data.branch}</div>
              <div className="hero-num small-num">{data.dirty}</div>
              <div className="hero-note">{data.dirty === 1 ? 'file changed' : 'files changed'}{data.ahead ? `, ${data.ahead} to push` : ''}{data.behind ? `, ${data.behind} to pull` : ''}</div>
            </div>
            <div className="stack-xs">
              {data.commits.map((c) => (
                <div key={c.hash} className="item"><span className="grow wrap-text">{c.subject}</span><span className="muted small nowrap">{c.when}</span></div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
