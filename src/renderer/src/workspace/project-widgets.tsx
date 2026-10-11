import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { ArrowUpRight, CircleAlert, GitBranch, GitCommitHorizontal, MessageSquare, RefreshCw } from 'lucide-react';
import type { GitInfo, ProjectInfo, RelayInfo, TaskInfo } from '@shared/ipc';

export interface ProjectParams { projectId?: string }

export function ago(iso: string | null): string {
  if (!iso) return 'unknown';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** Markdown to sanitised HTML. Links are opened in the system browser by the click handler. */
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

function useProjects() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  useEffect(() => { void window.elysium.projects().then(setProjects); }, []);
  return projects;
}

/** A project picker that lives in the widget and is saved in the pane's params. */
function useProjectParam(props: IDockviewPanelProps<ProjectParams>) {
  const projects = useProjects();
  const projectId = props.params.projectId ?? projects[0]?.id;
  const set = (id: string) => props.api.updateParameters({ ...props.params, projectId: id });
  const picker = (
    <select className="picker" value={projectId ?? ''} onChange={(e) => set(e.target.value)} aria-label="Project">
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
  return { projectId, picker, project: projects.find((p) => p.id === projectId) };
}

function usePoll<T>(fn: (() => Promise<T>) | null, everyMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!fn) return;
    setLoading(true);
    try { setData(await fn()); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setData(null);
    void load();
    const t = setInterval(() => void load(), everyMs);
    return () => clearInterval(t);
  }, [load, everyMs]);
  return { data, loading, reload: load };
}

function Toolbar({ children, onRefresh, loading }: { children: React.ReactNode; onRefresh(): void; loading: boolean }) {
  return (
    <div className="glass-toolbar">
      {children}
      <span className="spacer" />
      <button className="ghost-icon" onClick={onRefresh} title="Refresh" aria-label="Refresh"><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>
    </div>
  );
}

/** Split a relay into the waiting section and the rest, by its configured heading. */
function splitRelay(text: string, heading: string): { waiting: string | null; rest: string } {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,4}\s/.test(l) && l.replace(/^#+\s*/, '').trim().toLowerCase() === heading.toLowerCase());
  if (start < 0) return { waiting: null, rest: text };
  const level = lines[start].match(/^#+/)![0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  const waiting = lines.slice(start + 1, end).join('\n').trim();
  return { waiting: waiting || null, rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n') };
}

export function RelayWidget(props: IDockviewPanelProps<ProjectParams>) {
  const { projectId, picker } = useProjectParam(props);
  const { data, loading, reload } = usePoll<RelayInfo>(projectId ? () => window.elysium.relay(projectId) : null, 120000, [projectId]);
  const parts = useMemo(() => (data?.ok ? splitRelay(data.text, data.waitingHeading) : null), [data]);
  const items = parts?.waiting ? parts.waiting.split('\n').filter((l) => /^\s*[-*]\s/.test(l)).length : 0;
  return (
    <div className="widget glass-widget">
      <Toolbar onRefresh={reload} loading={loading}>{picker}<span className="muted small">{data?.ok ? `updated ${ago(data.updatedAt)}` : ''}</span></Toolbar>
      <div className="glass-scroll" onClick={onLinkClick}>
        {!data && <div className="empty-state">Reading the relay</div>}
        {data && !data.ok && <div className="empty-state error-text">{data.error}</div>}
        {parts?.waiting && (
          <section className="glass-card callout">
            <div className="callout-head"><CircleAlert size={15} /><strong>{data!.waitingHeading}</strong><span className="count">{items || ''}</span></div>
            <div className="prose" dangerouslySetInnerHTML={{ __html: md(parts.waiting) }} />
          </section>
        )}
        {parts && <article className="glass-card prose" dangerouslySetInnerHTML={{ __html: md(parts.rest) }} />}
        {data?.ok && <div className="source">{data.source}</div>}
      </div>
    </div>
  );
}

export function TasksWidget(props: IDockviewPanelProps<ProjectParams>) {
  const { projectId, picker } = useProjectParam(props);
  const [mine, setMine] = useState(false);
  const { data, loading, reload } = usePoll(projectId ? () => window.elysium.tasks(projectId) : null, 120000, [projectId]);
  const tasks: TaskInfo[] = (data?.tasks ?? []).filter((t) => !mine || t.needsOwner);
  const needs = (data?.tasks ?? []).filter((t) => t.needsOwner).length;
  return (
    <div className="widget glass-widget">
      <Toolbar onRefresh={reload} loading={loading}>
        {picker}
        <div className="seg">
          <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>All {data?.tasks.length ?? ''}</button>
          <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>Needs me {needs || ''}</button>
        </div>
      </Toolbar>
      <div className="glass-scroll">
        {!data && <div className="empty-state">Reading the board</div>}
        {data && !data.ok && <div className="empty-state error-text">{data.error}</div>}
        {data?.ok && !tasks.length && <div className="empty-state">{mine ? 'Nothing is waiting on you' : 'No open tasks'}</div>}
        <div className="task-grid">
          {tasks.map((t) => (
            <button key={t.number} className={`glass-card task ${t.needsOwner ? 'needs' : ''}`} onClick={() => window.elysium.openExternal(t.url)} title="Open on GitHub">
              <div className="task-top"><span className="num">#{t.number}</span><span className="muted small">{ago(t.updatedAt)}</span><ArrowUpRight size={13} className="muted" /></div>
              <div className="task-title">{t.title}</div>
              <div className="task-meta">
                {t.labels.slice(0, 3).map((l) => <span key={l} className="label">{l}</span>)}
                {t.comments > 0 && <span className="muted small"><MessageSquare size={12} /> {t.comments}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GitWidget(props: IDockviewPanelProps<ProjectParams>) {
  const { projectId, picker } = useProjectParam(props);
  const { data, loading, reload } = usePoll<GitInfo>(projectId ? () => window.elysium.git(projectId) : null, 20000, [projectId]);
  return (
    <div className="widget glass-widget">
      <Toolbar onRefresh={reload} loading={loading}>{picker}</Toolbar>
      <div className="glass-scroll">
        {!data && <div className="empty-state">Reading git</div>}
        {data && !data.ok && <div className="empty-state error-text">{data.error}</div>}
        {data?.ok && (
          <>
            <div className="git-head glass-card">
              <div className="git-branch"><GitBranch size={15} />{data.branch}</div>
              <div className="git-stats">
                <span><b>{data.dirty}</b> changed</span>
                <span><b>{data.ahead}</b> ahead</span>
                <span><b>{data.behind}</b> behind</span>
              </div>
            </div>
            <div className="commit-list">
              {data.commits.map((c) => (
                <div key={c.hash} className="commit"><GitCommitHorizontal size={14} className="muted" /><code>{c.hash}</code><span className="grow">{c.subject}</span><span className="muted small">{c.when}</span></div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
