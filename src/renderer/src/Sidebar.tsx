import { useState } from 'react';
import { BarChart3, CircleHelp, Home, Layers, MemoryStick, PinOff, Plus, Search, Settings as SettingsIcon, X } from 'lucide-react';
import { Logo } from './Logo';
import { ProjectLogo } from './ProjectLogo';
import { useLive, useMachine } from './workspace/live';
import { useWorkspace } from './workspace/store';

export type Page = 'home' | 'workspace' | 'settings' | 'help' | 'stats';

interface Props {
  page: Page;
  go(p: Page): void;
  onPalette(): void;
  onMemory(): void;
  onDeleteView(id: string): void;
}

export function Sidebar({ page, go, onPalette, onMemory, onDeleteView }: Props) {
  const { doc, activeView, openProject, setActiveView, renameView, addView, togglePin } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const { projects, sessions, telemetry } = useLive();
  const { res } = useMachine();
  const [editing, setEditing] = useState<string | null>(null);
  const pinned = doc.pinned.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as typeof projects;
  const freeViews = doc.views.filter((v) => !v.projectId);
  const unpinned = projects.filter((p) => !doc.pinned.includes(p.id));

  /** A project's status: waiting on you beats busy beats running. */
  const status = (projectId: string) => {
    const mine = sessions.filter((s) => s.status === 'running' && s.templateId.startsWith(`${projectId}.`));
    if (!mine.length) return null;
    const states = mine.map((s) => telemetry[s.id]?.state);
    return states.includes('waiting') ? 'waiting' : states.includes('busy') ? 'busy' : 'idle';
  };
  const ram = res ? Math.round(res.ramUsedPercent) : null;
  const ramTone = !res ? '' : res.ramLevel === 'refuse' ? 'bad' : res.ramUsedPercent >= 85 ? 'warn' : '';

  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="brand"><Logo />Elysium</div>

      <button className="nav" onClick={onPalette}>
        <Search size={17} strokeWidth={1.75} /><span className="grow">Search and run</span><span className="hint">Ctrl K</span>
      </button>
      <button className={`nav ${page === 'home' ? 'active' : ''}`} onClick={() => go('home')}>
        <Home size={17} strokeWidth={1.75} /><span className="grow">Home</span>
      </button>
      <button className={`nav ${page === 'stats' ? 'active' : ''}`} onClick={() => go('stats')}>
        <BarChart3 size={17} strokeWidth={1.75} /><span className="grow">Your stats</span>
      </button>

      <div className="side-scroll">
        <div className="side-label">
          <span>Projects</span>
          {unpinned.length > 0 && <button className="ghost-icon tiny" onClick={() => setAdding((a) => !a)} title="Pin a project" aria-label="Pin a project" aria-expanded={adding}><Plus size={14} /></button>}
        </div>
        {adding && (
          <div className="pin-picker" role="menu">
            {unpinned.map((p) => (
              <button key={p.id} className="nav" role="menuitem" onClick={() => { togglePin(p.id); if (unpinned.length === 1) setAdding(false); }} title={p.folder}>
                <ProjectLogo projectId={p.id} /><span className="grow">{p.name}</span><Plus size={14} className="muted" />
              </button>
            ))}
          </div>
        )}
        {pinned.map((p) => {
          const st = status(p.id);
          const active = page === 'workspace' && activeView?.projectId === p.id;
          return (
            <div key={p.id} className={`nav view-item ${active ? 'active' : ''}`} role="button" tabIndex={0} onClick={() => { openProject(p.id, p.name); go('workspace'); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { openProject(p.id, p.name); go('workspace'); } }} title={p.folder}>
              <ProjectLogo projectId={p.id} />
              <span className="grow">{p.name}</span>
              {st && <span className={`dot ${st}`} title={st === 'waiting' ? 'Waiting on you' : st === 'busy' ? 'Working' : 'Running'} />}
              <button className="ghost-icon tiny hover-only" onClick={(e) => { e.stopPropagation(); togglePin(p.id); }} title="Unpin" aria-label={`Unpin ${p.name}`}><PinOff size={13} /></button>
            </div>
          );
        })}
        {!pinned.length && !adding && <div className="nav muted">Use the plus to pin projects</div>}

        <div className="side-label">
          <span>Views</span>
          <button className="ghost-icon tiny" onClick={() => { addView(); go('workspace'); }} title="New view" aria-label="New view"><Plus size={14} /></button>
        </div>
        {freeViews.map((v) => (
          <div key={v.id} className={`nav view-item ${page === 'workspace' && doc.activeViewId === v.id ? 'active' : ''}`}
            onClick={() => { setActiveView(v.id); go('workspace'); }} onDoubleClick={() => setEditing(v.id)} title="Double click to rename" role="button" tabIndex={0}>
            <Layers size={17} strokeWidth={1.75} />
            {editing === v.id ? (
              <input className="rename" autoFocus defaultValue={v.name} onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { renameView(v.id, e.target.value); setEditing(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
            ) : <span className="grow">{v.name}</span>}
            {editing !== v.id && (
              <button className="ghost-icon tiny hover-only" onClick={(e) => { e.stopPropagation(); onDeleteView(v.id); }} title="Delete view" aria-label={`Delete ${v.name}`}><X size={13} /></button>
            )}
          </div>
        ))}
        {!freeViews.length && <div className="nav muted small" style={{ cursor: 'default' }}>Your own layouts appear here</div>}
      </div>

      <button className={`nav ${page === 'help' ? 'active' : ''}`} onClick={() => go('help')}>
        <CircleHelp size={17} strokeWidth={1.75} /><span className="grow">Help</span>
      </button>
      <button className={`nav ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
        <SettingsIcon size={17} strokeWidth={1.75} /><span className="grow">Settings</span><span className="hint">Ctrl ,</span>
      </button>
      <div className="foot">
        <button className={`pill ${ramTone}`} onClick={onMemory} title="What is using memory, and what to do about it">
          <MemoryStick size={14} />{ram === null ? 'Memory' : `Memory ${ram}%`}{ramTone ? ' · why?' : ''}
        </button>
      </div>
    </aside>
  );
}
