// Files, like VS Code's explorer: the project's folders as a tree, and a click
// opens the file read only in a tab beside it. Not an editor: changes are the
// sessions' job, or yours in your own editor (Open in VS Code is one click).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ChevronRight, Eye, EyeOff, FolderOpen, RefreshCw } from 'lucide-react';
import type { FileEntry } from '@shared/ipc';
import { useLive } from './live';
import { useWorkspace } from './store';

/** VS Code like colours by kind of file. */
export function fileColor(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const m: Record<string, string> = {
    ts: '#3178C6', tsx: '#3178C6', js: '#E8C547', jsx: '#E8C547', mjs: '#E8C547', cjs: '#E8C547', json: '#CBCB41', md: '#519ABA', mdx: '#519ABA',
    css: '#42A5F5', scss: '#F06292', html: '#E44D26', py: '#4B8BBE', rs: '#DEA584', go: '#00ADD8', java: '#E76F00', kt: '#A97BFF', swift: '#F05138',
    sql: '#DAD8D8', yml: '#CB171E', yaml: '#CB171E', toml: '#9C4221', sh: '#89E051', ps1: '#5391FE', svg: '#FFB13B', png: '#A074C4', jpg: '#A074C4',
    lock: '#8A8A8A', env: '#ECD53F', txt: '#9AA0A6', prisma: '#5A67D8', vue: '#41B883', svelte: '#FF3E00',
  };
  return m[ext] ?? '#9AA0A6';
}

const extLabel = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 3).toUpperCase() : '');

export function FilesPanel(props: IDockviewPanelProps<{ projectId?: string }>) {
  const { projects } = useLive();
  const { activeView, open } = useWorkspace();
  const projectId = props.params.projectId ?? activeView?.projectId ?? '';
  const project = projects.find((p) => p.id === projectId);
  const [tree, setTree] = useState<Record<string, FileEntry[]>>({});
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set(['']));
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (rel: string) => {
    const list = await window.elysium.listDir(projectId, rel, hidden);
    setTree((t) => ({ ...t, [rel]: list }));
  }, [projectId, hidden]);
  useEffect(() => { setTree({}); void Promise.all([...openDirs].map((d) => load(d))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId, hidden]);

  const toggle = (e: FileEntry) => {
    if (!e.dir) {
      setSelected(e.path);
      open({ kind: 'code', title: e.name, params: { projectId, path: e.path } });
      return;
    }
    setOpenDirs((s) => { const n = new Set(s); if (n.has(e.path)) n.delete(e.path); else { n.add(e.path); if (!tree[e.path]) void load(e.path); } return n; });
  };

  const rows = useMemo(() => {
    const out: { e: FileEntry; depth: number }[] = [];
    const walk = (rel: string, depth: number) => { for (const e of tree[rel] ?? []) { out.push({ e, depth }); if (e.dir && openDirs.has(e.path)) walk(e.path, depth + 1); } };
    walk('', 0);
    return out;
  }, [tree, openDirs]);

  if (!projectId) return <div className="files empty"><div className="empty-state">Open a project to see its files.</div></div>;
  return (
    <div className="files">
      <div className="files-head">
        <span className="files-title">{(project?.name ?? 'Files').toUpperCase()}</span>
        <span className="spacer" />
        <button className="ghost-icon tiny" title={hidden ? 'Hide build and dependency folders' : 'Show build and dependency folders'} onClick={() => setHidden((h) => !h)}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        <button className="ghost-icon tiny" title="Refresh" onClick={() => void Promise.all([...openDirs].map((d) => load(d)))}><RefreshCw size={13} /></button>
        <button className="ghost-icon tiny" title="Open the folder in Explorer" onClick={() => window.elysium.openFolder(projectId)}><FolderOpen size={13} /></button>
      </div>
      <div className="files-tree" role="tree">
        {rows.map(({ e, depth }) => (
          <button key={e.path} role="treeitem" aria-expanded={e.dir ? openDirs.has(e.path) : undefined} className={`file-row ${selected === e.path ? 'on' : ''} ${e.dim ? 'dim' : ''}`}
            style={{ paddingLeft: `${0.45 + depth * 0.85}rem` }} onClick={() => toggle(e)} title={e.path}
            onContextMenu={(ev) => { ev.preventDefault(); window.elysium.revealProjectFile(projectId, e.path, 'explorer'); }}>
            {e.dir ? <ChevronRight size={13} className="file-chev" style={{ transform: openDirs.has(e.path) ? 'rotate(90deg)' : undefined }} /> : <span className="file-chev-pad" />}
            {e.dir ? <span className={`file-folder ${openDirs.has(e.path) ? 'open' : ''}`} /> : <span className="file-badge" style={{ color: fileColor(e.name) }}>{extLabel(e.name) || '•'}</span>}
            <span className="file-name">{e.name}</span>
          </button>
        ))}
        {!rows.length && <div className="files-none">Nothing here.</div>}
      </div>
    </div>
  );
}

/** A file, read only, with line numbers, the way an editor shows it. */
export function CodePanel(props: IDockviewPanelProps<{ projectId: string; path: string }>) {
  const { projectId, path } = props.params;
  const [f, setF] = useState<import('@shared/ipc').FileText | null>(null);
  const load = useCallback(() => void window.elysium.readProjectFile(projectId, path).then(setF), [projectId, path]);
  useEffect(() => { load(); }, [load]);
  const lines = useMemo(() => (f?.text ?? '').split(/\r?\n/), [f]);
  return (
    <div className="code">
      <div className="code-bar">
        <span className="code-path">{path.split('/').map((p, i, a) => <span key={i}>{p}{i < a.length - 1 && <ChevronRight size={11} />}</span>)}</span>
        <span className="spacer" />
        <button className="link-btn" onClick={load}>Reload</button>
        <button className="link-btn" onClick={() => window.elysium.revealProjectFile(projectId, path, 'vscode')} title="Open in VS Code">VS Code</button>
        <button className="link-btn" onClick={() => window.elysium.revealProjectFile(projectId, path, 'explorer')} title="Show in Explorer">Explorer</button>
      </div>
      {!f && <div className="code-msg">Opening…</div>}
      {f && !f.ok && <div className="code-msg">{f.error}</div>}
      {f?.binary && <div className="code-msg">This is not a text file.</div>}
      {f?.ok && !f.binary && (
        <div className="code-body" role="document">
          <pre className="code-gutter" aria-hidden="true">{lines.map((_, i) => `${i + 1}\n`).join('')}</pre>
          <pre className="code-text">{f.text}</pre>
        </div>
      )}
    </div>
  );
}
