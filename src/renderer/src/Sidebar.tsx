import { useState } from 'react';
import { Home, Layers, Plus, Search, Settings as SettingsIcon, Sparkles, SquareTerminal, X } from 'lucide-react';
import { Logo } from './Logo';
import { useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';
import { since } from './workspace/widgets';

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

export type Page = 'home' | 'workspace' | 'settings';

export function Sidebar({ page, go, onPalette, onFocusSession, onDeleteView }: { page: Page; go(p: Page): void; onPalette(): void; onFocusSession(id: string): void; onDeleteView(id: string): void }) {
  const { doc, addView, renameView, setActiveView } = useWorkspace();
  const { sessions, templates, res } = useLive();
  const [editing, setEditing] = useState<string | null>(null);
  const live = sessions.filter((s) => s.status === 'running' || s.status === 'starting');

  return (
    <aside className="sidebar" aria-label="Navigation">
      <div className="brand"><Logo />ElysiumProd</div>

      <button className="nav-item" onClick={onPalette}>
        <Search size={16} strokeWidth={1.75} />
        <span className="grow">Search and run</span>
        <kbd>Ctrl K</kbd>
      </button>
      <button className={`nav-item ${page === 'home' ? 'active' : ''}`} onClick={() => go('home')}>
        <Home size={16} strokeWidth={1.75} />
        <span className="grow">Home</span>
      </button>

      <div className="section-label row">
        <span>Views</span>
        <button className="ghost-icon tiny" onClick={() => { addView(); go('workspace'); }} title="New view" aria-label="New view"><Plus size={14} /></button>
      </div>
      <div className="side-scroll">
        {doc.views.map((v) => (
          <div key={v.id} className={`nav-item view-item ${page === 'workspace' && doc.activeViewId === v.id ? 'active' : ''}`}
            onClick={() => { setActiveView(v.id); go('workspace'); }} onDoubleClick={() => setEditing(v.id)} title="Double click to rename">
            <Layers size={16} strokeWidth={1.75} />
            {editing === v.id ? (
              <input className="rename" autoFocus defaultValue={v.name} onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { renameView(v.id, e.target.value); setEditing(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
            ) : <span className="grow">{v.name}</span>}
            {doc.views.length > 1 && editing !== v.id && (
              <button className="ghost-icon tiny hover-only" onClick={(e) => { e.stopPropagation(); onDeleteView(v.id); }} title="Delete view" aria-label={`Delete ${v.name}`}><X size={13} /></button>
            )}
          </div>
        ))}

        <div className="section-label">Running</div>
        {live.length ? live.map((s) => {
          const t = templates.find((x) => x.id === s.templateId);
          return (
            <button key={s.id} className="nav-item" onClick={() => onFocusSession(s.id)} title={t?.cwd}>
              {t?.kind === 'claude' ? <Sparkles size={16} strokeWidth={1.75} /> : <SquareTerminal size={16} strokeWidth={1.75} />}
              <span className="grow">{s.title}</span>
              <span className="hint">{since(s.startedAt)}</span>
              <span className={`dot ${s.status}`} />
            </button>
          );
        }) : <div className="empty">Nothing running</div>}
      </div>

      <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
        <SettingsIcon size={16} strokeWidth={1.75} />
        <span className="grow">Settings</span>
      </button>
      {doc.settings.showMachineLine && (
        <div className="machine" aria-label="Machine resources">
          {res ? (
            <>
              <span className={res.ramLevel === 'ok' ? '' : res.ramLevel}>Memory {res.ramUsedPercent.toFixed(0)}%</span>
              <span aria-hidden="true">·</span>
              <span className={res.diskLevel === 'ok' ? '' : res.diskLevel}>{res.diskFreeBytes != null ? `${gb(res.diskFreeBytes)} free` : 'disk unknown'}</span>
            </>
          ) : <span>Reading this machine</span>}
        </div>
      )}
    </aside>
  );
}
