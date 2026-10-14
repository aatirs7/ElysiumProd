import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, RotateCw, Rows2, Bookmark, BookmarkPlus, CircleHelp, CornerDownLeft, FileText, Home, Layers, Plus, Search, Settings as SettingsIcon, Sparkles, SquareTerminal } from 'lucide-react';
import { useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';
import { WIDGETS, stackTerminals } from './workspace/Workspace';
import { ProjectLogo } from './ProjectLogo';
import type { Page } from './Sidebar';

interface Action { id: string; label: string; hint: string; icon: React.ReactNode; run(): void }

export function Palette({ onClose, go, onProject, onRestart, onNewProject }: { onClose(): void; go(view: Page): void; onProject(id: string, name: string): void; onRestart(): void; onNewProject(): void }) {
  const { templates, projects } = useLive();
  const { doc, open, setActiveView, addView, applyPreset, savePreset, apiFor } = useWorkspace();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const actions = useMemo<Action[]>(() => {
    const toWs = (f: () => void) => () => { go('workspace'); f(); };
    return [
      { id: 'newproject', label: 'New project', hint: 'Clone a repository or start one', icon: <Plus size={15} />, run: onNewProject },
      ...projects.map((p) => ({ id: `p-open-${p.id}`, label: `Open ${p.name}`, hint: p.tier === 'main' ? 'Project' : 'Side project', icon: <ProjectLogo projectId={p.id} />, run: () => onProject(p.id, p.name) })),
      ...templates.map((t) => ({ id: `t-${t.id}`, label: `Start ${t.title}`, hint: t.kind === 'claude' ? 'Session' : 'Shell', icon: t.kind === 'claude' ? <Sparkles size={15} /> : <SquareTerminal size={15} />, run: toWs(() => open({ kind: 'terminal', templateId: t.id, title: t.title })) })),
      ...WIDGETS.map((w) => ({ id: `w-${w.kind}`, label: `Add ${w.title}`, hint: w.blurb, icon: <w.icon size={15} />, run: toWs(() => open({ kind: w.kind })) })),
      { id: 'doc', label: 'Open a document', hint: 'Markdown or PDF', icon: <FileText size={15} />, run: toWs(async () => { const p = await window.elysium.pickDocument(); if (p) open({ kind: 'document', params: { path: p } }); }) },
      ...doc.views.map((v) => ({ id: `v-${v.id}`, label: `Go to ${v.name}`, hint: 'View', icon: <Layers size={15} />, run: toWs(() => setActiveView(v.id)) })),
      ...doc.presets.map((p) => ({ id: `p-${p.id}`, label: `Apply preset ${p.name}`, hint: 'Rebuilds the current view', icon: <Bookmark size={15} />, run: toWs(() => applyPreset(p.id)) })),
      { id: 'savepreset', label: 'Save setup as a preset', hint: 'Panes and appearance', icon: <BookmarkPlus size={15} />, run: () => savePreset(`Preset ${doc.presets.length + 1}`) },
      { id: 'stack', label: 'Stack terminals', hint: 'One above another in this view', icon: <Rows2 size={15} />, run: toWs(() => { const api = doc.activeViewId ? apiFor(doc.activeViewId) : undefined; if (api) stackTerminals(api); }) },
      { id: 'newview', label: 'New view', hint: 'An empty layout', icon: <Plus size={15} />, run: toWs(() => addView()) },
      { id: 'home', label: 'Home', hint: 'Ctrl 0', icon: <Home size={15} />, run: () => go('home') },
      { id: 'settings', label: 'Settings', hint: 'Theme, projects, accounts', icon: <SettingsIcon size={15} />, run: () => go('settings') },
      { id: 'stats', label: 'Your stats', hint: 'Hours, projects, streak', icon: <BarChart3 size={15} />, run: () => go('stats') },
      { id: 'restart', label: 'Restart ElysiumProd', hint: 'Load the newest version', icon: <RotateCw size={15} />, run: onRestart },
      { id: 'help', label: 'Help', hint: 'How everything works', icon: <CircleHelp size={15} />, run: () => go('help') },
    ];
  }, [projects, templates, doc.views, doc.presets, open, setActiveView, addView, applyPreset, savePreset, go, onProject, apiFor, onRestart, onNewProject]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return actions;
    return actions.filter((a) => s.split(/\s+/).every((w) => `${a.label} ${a.hint}`.toLowerCase().includes(w)));
  }, [q, actions]);
  useEffect(() => setI(0), [q]);

  const run = (a?: Action) => { if (!a) return; onClose(); a.run(); };

  return (
    <div className="backdrop palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Start a session, add a widget, switch view"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              else if (e.key === 'Enter') run(list[i]);
              else if (e.key === 'Escape') onClose();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {list.map((a, n) => (
            <button key={a.id} className={`menu-item ${n === i ? 'hot' : ''}`} onMouseEnter={() => setI(n)} onClick={() => run(a)}>
              {a.icon}<span className="grow">{a.label}</span><span className="menu-sub">{a.hint}</span>
              {n === i && <CornerDownLeft size={13} className="muted" />}
            </button>
          ))}
          {!list.length && <div className="empty-state">Nothing matches</div>}
        </div>
      </div>
    </div>
  );
}
