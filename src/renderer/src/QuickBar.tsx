import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search, Sparkles } from 'lucide-react';
import type { ProjectInfo, ProjectStats } from '@shared/ipc';

/**
 * The quick bar, summoned with Alt+Space from anywhere: pick a project, type a
 * task, press Enter. The task goes to the project's lead session in the
 * background; nothing opens. A notification says when it is done.
 */
export function QuickBar() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [stats, setStats] = useState<ProjectStats[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [hot, setHot] = useState(0);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [task, setTask] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setQ(''); setHot(0); setProject(null); setTask(''); setError(null); setBusy(false); };
  useEffect(() => {
    void window.elysium.projects().then(setProjects);
    void window.elysium.projectStats().then(setStats);
    void window.elysium.loadWorkspace().then((j) => { try { setPinned((JSON.parse(j ?? '{}') as { pinned?: string[] }).pinned ?? []); } catch { /* defaults */ } });
    return window.elysium.onQuickShown(() => { reset(); setTimeout(() => input.current?.focus(), 30); });
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ordered = [...projects].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
    return s ? ordered.filter((p) => p.name.toLowerCase().includes(s) || p.id.includes(s)) : ordered;
  }, [q, projects, pinned]);
  useEffect(() => setHot(0), [q]);

  const choose = (p: ProjectInfo | undefined) => { if (!p) return; setProject(p); setQ(''); setTimeout(() => input.current?.focus(), 0); };
  const run = async () => {
    if (!project || !task.trim() || busy) return;
    setBusy(true);
    const r = await window.elysium.quickRun(project.id, task);
    setBusy(false);
    if (!r.ok) setError(r.reason);
  };
  const logo = (id: string) => stats.find((s) => s.id === id)?.logo;

  return (
    <div className="quickbar">
      <div className="qb-input">
        {project ? (
          <span className="qb-chip">
            {logo(project.id) ? <img className="plogo" src={logo(project.id)!} alt="" /> : <span className="plogo">{project.name[0]}</span>}
            {project.name}
          </span>
        ) : <Search size={19} className="muted" />}
        <input
          ref={input}
          autoFocus
          value={project ? task : q}
          placeholder={project ? 'What should it do?' : 'Which project?'}
          onChange={(e) => { setError(null); if (project) setTask(e.target.value); else setQ(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { if (project) { setProject(null); setTask(''); } else window.elysium.quickHide(); return; }
            if (!project) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHot((h) => Math.min(list.length - 1, h + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHot((h) => Math.max(0, h - 1)); }
              else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(list[hot]); }
            } else {
              if (e.key === 'Backspace' && !task) { setProject(null); }
              else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run(); }
            }
          }}
          spellCheck={false}
        />
        {busy && <Sparkles size={17} className="spin muted" />}
      </div>
      {!project && (
        <div className="qb-list">
          {list.map((p, i) => (
            <button key={p.id} className={`menu-item ${i === hot ? 'hot' : ''}`} onMouseEnter={() => setHot(i)} onClick={() => choose(p)}>
              {logo(p.id) ? <img className="plogo" src={logo(p.id)!} alt="" /> : <span className="plogo">{p.name[0]}</span>}
              <span className="grow">{p.name}</span>
              <span className="menu-sub">{p.tier === 'main' ? 'Prime' : 'Claude'}</span>
              {i === hot && <CornerDownLeft size={13} className="muted" />}
            </button>
          ))}
          {!list.length && <div className="empty-state" style={{ minHeight: 0 }}>No project matches</div>}
        </div>
      )}
      <div className="qb-foot">
        {error ? <span className="error-text">{error}</span> : <span>{project ? `Enter hands it to ${project.tier === 'main' ? 'Prime' : 'its session'} in the background. You will get a notification.` : 'Enter or Tab to choose. Esc to close.'}</span>}
        <button className="link-btn" onClick={() => window.elysium.quickOpenMain()}>Open Elysium</button>
      </div>
    </div>
  );
}
