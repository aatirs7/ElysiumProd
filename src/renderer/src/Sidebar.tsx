import { useState } from 'react';
import { BarChart3, Check, ChevronDown, CircleDollarSign, FolderClosed, FolderPlus, Gauge, Leaf, Pencil, RotateCcw, Wrench, CircleHelp, FolderOpen, FoldVertical, Home, Layers, LayoutGrid, MemoryStick, Moon, MoreHorizontal, PinOff, Play, Plus, Search, Settings as SettingsIcon, Square, X } from 'lucide-react';
import { Logo } from './Logo';
import { ProjectLogo } from './ProjectLogo';
import { useLive, useMachine } from './workspace/live';
import { CHECKS, TOOL_INFO } from './tools';
import { TINTS } from './workspace/Workspace';
import { useWorkspace } from './workspace/store';

export type Page = 'home' | 'workspace' | 'settings' | 'help' | 'stats' | 'costs' | 'usage';

interface Props {
  page: Page;
  go(p: Page): void;
  onPalette(): void;
  onMemory(): void;
  onDeleteView(id: string): void;
  onNewProject(): void;
  /** Opens a project with its Claude pane and sessions. */
  onProject(id: string, name: string): void;
  /** Puts a project's sessions into another view. */
  onAddToView(projectId: string, viewId: string): void;
  onDashboard(projectId: string, name: string): void;
  onNote(text: string): void;
  /** Shows a running session's pane. */
  onFocus(sessionId: string, templateId: string): void;
  /** Runs one of the PC Helper's quick checks. */
  onRunCheck(checkId: string): void;
}

export function Sidebar({ page, go, onPalette, onMemory, onDeleteView, onNewProject, onProject, onAddToView, onDashboard, onNote, onFocus, onRunCheck }: Props) {
  const [menu, setMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const { doc, activeView, setActiveView, renameView, addView, togglePin, patchDoc } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const { projects, sessions, telemetry, templates } = useLive();
  const { res } = useMachine();
  const [editing, setEditing] = useState<string | null>(null);
  const pinned = doc.pinned.map((id) => projects.find((p) => p.id === id && !p.builtin)).filter(Boolean) as typeof projects;
  const nameOf = (p: { id: string; name: string }) => doc.projectNames[p.id] || p.name;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [toolMenu, setToolMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const setGroups = (g: typeof doc.groups) => patchDoc({ groups: g });
  const grouped = new Set(doc.groups.flatMap((g) => g.ids));
  const rows: ({ kind: 'p'; p: (typeof projects)[number] } | { kind: 'group'; g: (typeof doc.groups)[number] })[] = [
    ...pinned.filter((p) => !grouped.has(p.id)).map((p) => ({ kind: 'p' as const, p })),
    ...doc.groups.flatMap((g) => [{ kind: 'group' as const, g }, ...(g.collapsed ? [] : g.ids.map((id) => projects.find((x) => x.id === id)).filter(Boolean).map((p) => ({ kind: 'p' as const, p: p! })))]),
  ];
  const moveTo = (projectId: string, groupId: string | null) => {
    const next = doc.groups.map((g) => ({ ...g, ids: g.ids.filter((x) => x !== projectId) }));
    const target = next.find((g) => g.id === groupId);
    if (target) target.ids.push(projectId);
    patchDoc({ groups: next, pinned: doc.pinned.includes(projectId) ? doc.pinned : [...doc.pinned, projectId] });
  };
  const tools = projects.filter((p) => p.builtin);
  const [checksOpen, setChecksOpen] = useState(false);
  const freeViews = doc.views.filter((v) => !v.projectId);
  const unpinned = projects.filter((p) => !doc.pinned.includes(p.id) && !p.builtin);

  /** A project's status: waiting on you beats busy beats running. */
  const status = (projectId: string) => {
    const mine = sessions.filter((s) => s.status === 'running' && s.templateId.startsWith(`${projectId}.`));
    if (!mine.length) return null;
    const states = mine.map((s) => telemetry[s.id]?.state);
    return states.includes('waiting') ? 'waiting' : states.includes('busy') ? 'busy' : 'idle';
  };
  const ram = res ? Math.round(res.ramUsedPercent) : null;
  const ramTone = !res ? '' : res.ramLevel === 'refuse' || res.diskLevel === 'refuse' ? 'bad' : res.ramUsedPercent >= 85 || res.diskLevel === 'warn' ? 'warn' : '';

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
      <button className={`nav ${page === 'usage' ? 'active' : ''}`} onClick={() => go('usage')}>
        <Gauge size={17} strokeWidth={1.75} /><span className="grow">Usage</span>{doc.settings.saver && <Leaf size={13} className="saver-dot" aria-label="Saver mode on" />}
      </button>
      <button className={`nav ${page === 'costs' ? 'active' : ''}`} onClick={() => go('costs')}>
        <CircleDollarSign size={17} strokeWidth={1.75} /><span className="grow">Costs</span>
      </button>

      <div className="side-scroll">
        <div className="side-label">
          <span>Projects</span>
          <button className="ghost-icon tiny" onClick={() => setAdding((a) => !a)} title="New or pin a project" aria-label="New or pin a project" aria-expanded={adding}><Plus size={14} /></button>
        </div>
        {adding && (
          <div className="pin-picker" role="menu">
            <button className="nav new-project" role="menuitem" onClick={() => { setAdding(false); onNewProject(); }}>
              <span className="plogo new"><Plus size={13} /></span><span className="grow">New project</span>
            </button>
            {unpinned.length > 0 && <div className="pin-picker-label">Pin one you have</div>}
            {unpinned.map((p) => (
              <button key={p.id} className="nav" role="menuitem" onClick={() => togglePin(p.id)} title={p.folder}>
                <ProjectLogo projectId={p.id} /><span className="grow">{p.name}</span><Plus size={14} className="muted" />
              </button>
            ))}
          </div>
        )}
        {rows.map((row) => {
          if (row.kind === 'group') {
            const g = row.g;
            return (
              <div key={`g-${g.id}`} className="side-group" onContextMenu={(e) => { e.preventDefault(); setGroupMenu({ id: g.id, x: e.clientX, y: e.clientY }); }}>
                <button className="side-group-head" onClick={() => setGroups(doc.groups.map((x) => (x.id === g.id ? { ...x, collapsed: !x.collapsed } : x)))} aria-expanded={!g.collapsed}>
                  <ChevronDown size={12} style={{ transform: g.collapsed ? 'rotate(-90deg)' : undefined, transition: 'transform .2s' }} />
                  {renamingGroup === g.id
                    ? <input className="rename" autoFocus defaultValue={g.name} onClick={(e) => e.stopPropagation()} onBlur={(e) => { setGroups(doc.groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value.trim() || x.name } : x))); setRenamingGroup(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingGroup(null); }} />
                    : <span className="grow">{g.name}</span>}
                  <span className="side-group-count">{g.ids.filter((id) => projects.some((x) => x.id === id)).length}</span>
                </button>
              </div>
            );
          }
          const p = row.p;
          const st = status(p.id);
          const active = page === 'workspace' && activeView?.projectId === p.id;
          return (
            <div key={p.id} className="side-project">
            <div style={doc.projectColors[p.id] ? { ['--pc' as string]: doc.projectColors[p.id] } : undefined} className={`nav view-item ${doc.projectColors[p.id] ? 'colored' : ''} ${active ? 'active' : ''} ${menu?.id === p.id ? 'menu-open' : ''}`} role="button" tabIndex={0} onClick={() => onProject(p.id, p.name)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ id: p.id, name: p.name, x: e.clientX, y: e.clientY }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') onProject(p.id, p.name); }} title={p.folder}>
              <ProjectLogo projectId={p.id} />
              {renaming === p.id
                ? <input className="rename grow" autoFocus defaultValue={nameOf(p)} onClick={(e) => e.stopPropagation()} onBlur={(e) => { const v = e.target.value.trim(); patchDoc({ projectNames: { ...doc.projectNames, [p.id]: v && v !== p.name ? v : undefined as unknown as string } }); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} />
                : <span className="grow">{nameOf(p)}</span>}
              {st && <span className={`dot ${st}`} title={st === 'waiting' ? 'Waiting on you' : st === 'busy' ? 'Working' : 'Running'} />}
              <button className="ghost-icon tiny hover-only" onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ id: p.id, name: p.name, x: r.left, y: r.bottom }); }} title="More" aria-label={`More for ${p.name}`} aria-haspopup="menu"><MoreHorizontal size={14} /></button>
            </div>
            {/* Its sessions, right under it, while any run or the project is open. */}
            {(() => {
              const mine = templates.filter((t) => t.kind === 'claude' && t.project === p.id);
              const live = mine.map((t) => ({ t, s: sessions.find((x) => x.templateId === t.id && x.status === 'running') }));
              if (!live.some((x) => x.s) && !active) return null;
              return (
                <div className="side-sessions">
                  {live.map(({ t, s }) => {
                    const tel = s ? telemetry[s.id] : undefined;
                    const label = t.role === 'prime' ? 'Prime' : t.role === 'meridian' ? 'Meridian' : t.title;
                    const state = !s ? 'off' : tel?.state === 'waiting' ? 'waiting' : tel?.state === 'busy' ? 'busy' : 'idle';
                    const word = state === 'off' ? 'off' : state === 'waiting' ? 'needs you' : state === 'busy' ? 'working' : 'idle';
                    return (
                      <button key={t.id} className="side-session" onClick={() => (s ? onFocus(s.id, t.id) : onProject(p.id, p.name))} title={s ? `Show ${t.title}` : `Open ${p.name} to start ${t.title}`}>
                        <span className={`dot ${state === 'off' ? '' : state}`} />
                        <span className="grow">{label}</span>
                        <span className="side-session-state">{tel?.contextPercent != null && s ? `${Math.round(tel.contextPercent)}% · ` : ''}{word}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            </div>
          );
        })}
        {!pinned.length && !adding && <div className="nav muted">Use the plus to pin projects</div>}
        {menu && (() => {
          const st = status(menu.id);
          const running = Boolean(st);
          const act = async (type: 'start' | 'stop' | 'kill' | 'compact') => {
            setMenu(null);
            const r = await window.elysium.projectAction(menu.id, type);
            onNote(r.steps.map((s) => (s.ok ? s.label : `${s.label}: ${s.reason ?? 'failed'}`)).join('. ') || r.say || 'Nothing to do.');
          };
          const others = doc.views.filter((v) => v.projectId !== menu.id);
          return (
            <div className="menu-backdrop" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
              <div className="tab-menu over-native" style={{ left: Math.min(menu.x, window.innerWidth - 250), top: Math.min(menu.y + 4, window.innerHeight - 360) }} onMouseDown={(e) => e.stopPropagation()} role="menu" aria-label={menu.name}>
                <div className="tab-menu-label">{menu.name}</div>
                <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); onProject(menu.id, menu.name); }}><Layers size={14} />Open</button>
                <button className="tab-menu-item" role="menuitem" onClick={() => void act('start')}><Play size={14} />{running ? 'Start any that are off' : 'Start sessions'}</button>
                {running && <button className="tab-menu-item" role="menuitem" onClick={() => void act('compact')}><FoldVertical size={14} />Compact</button>}
                {running && <button className="tab-menu-item" role="menuitem" onClick={() => void act('stop')}><Moon size={14} />Wrap up and end</button>}
                {running && <button className="tab-menu-item danger" role="menuitem" onClick={() => void act('kill')}><Square size={14} />End now</button>}
                <div className="tab-menu-sep" />
                <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); onDashboard(menu.id, menu.name); }}><LayoutGrid size={14} />Dashboard</button>
                <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); window.elysium.openFolder(menu.id); }}><FolderOpen size={14} />Open folder</button>
                {others.length > 0 && <div className="tab-menu-label">Add its sessions to</div>}
                {others.map((v) => (
                  <button key={v.id} className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); onAddToView(menu.id, v.id); }}><Plus size={14} />{v.name}</button>
                ))}
                <div className="tab-menu-sep" />
                <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); setRenaming(menu.id); }}><Pencil size={14} />Rename</button>
                <div className="tab-menu-label">Colour</div>
                <div className="tint-row">
                  {TINTS.map((c) => (
                    <button key={c.name} className={`tint-swatch ${c.value ? '' : 'none'}`} style={c.value ? { background: c.value } : undefined} title={c.name} aria-label={c.name}
                      onClick={() => patchDoc({ projectColors: { ...doc.projectColors, [menu.id]: c.value } })}>
                      {(doc.projectColors[menu.id] ?? '') === c.value && <Check size={12} strokeWidth={3} />}
                    </button>
                  ))}
                </div>
                <div className="tab-menu-label">Group</div>
                {doc.groups.map((g) => {
                  const inIt = g.ids.includes(menu.id);
                  return <button key={g.id} className="tab-menu-item" role="menuitemradio" aria-checked={inIt} onClick={() => { setMenu(null); moveTo(menu.id, inIt ? null : g.id); }}><FolderClosed size={14} />{g.name}{inIt && <Check size={13} className="menu-check" />}</button>;
                })}
                {newGroup === null
                  ? <button className="tab-menu-item" role="menuitem" onClick={() => setNewGroup('')}><FolderPlus size={14} />New group</button>
                  : <form className="tab-menu-item" onSubmit={(e) => { e.preventDefault(); const n = newGroup.trim(); if (!n) return; const id = `g${Date.now().toString(36)}`; const next = [...doc.groups.map((g) => ({ ...g, ids: g.ids.filter((x) => x !== menu.id) })), { id, name: n, ids: [menu.id] }]; patchDoc({ groups: next, pinned: doc.pinned.includes(menu.id) ? doc.pinned : [...doc.pinned, menu.id] }); setNewGroup(null); setMenu(null); }}>
                      <FolderPlus size={14} /><input className="rename" autoFocus placeholder="Group name" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setNewGroup(null); }} />
                    </form>}
                <div className="tab-menu-sep" />
                <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); doc.groups.some((g) => g.ids.includes(menu.id)) && moveTo(menu.id, null); togglePin(menu.id); }}><PinOff size={14} />Unpin</button>
              </div>
            </div>
          );
        })()}

        <div className="side-label"><span>Tools</span></div>
        {tools.map((p) => {
          const info = TOOL_INFO[p.id];
          const Icon = info?.icon ?? Wrench;
          const active = page === 'workspace' && activeView?.projectId === p.id;
          const st = status(p.id);
          return (
            <div key={p.id}>
              <div className={`nav view-item ${active ? 'active' : ''}`} role="button" tabIndex={0} onClick={() => onProject(p.id, p.name)} onKeyDown={(e) => { if (e.key === 'Enter') onProject(p.id, p.name); }} title={info?.tagline ?? p.name}
                onContextMenu={(e) => { e.preventDefault(); setToolMenu({ id: p.id, x: e.clientX, y: e.clientY }); }}>
                <span className="tool-icon"><Icon size={14} /></span>
                <span className="grow">{info?.title ?? p.name}</span>
                {st && <span className={`dot ${st}`} />}
                {p.id === 'laptop' && <button className="ghost-icon tiny" onClick={(e) => { e.stopPropagation(); setChecksOpen((o) => !o); }} title="Quick checks" aria-label="Quick checks" aria-expanded={checksOpen}><ChevronDown size={13} style={{ transform: checksOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} /></button>}
              </div>
              {p.id === 'laptop' && checksOpen && (
                <div className="side-sessions">
                  {CHECKS.map((c) => (
                    <button key={c.id} className="side-session" title={c.blurb} onClick={() => onRunCheck(c.id)}><c.icon size={13} /><span className="grow">{c.title}</span></button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {toolMenu && (
          <div className="menu-backdrop" onMouseDown={() => setToolMenu(null)} onContextMenu={(e) => { e.preventDefault(); setToolMenu(null); }}>
            <div className="tab-menu over-native" style={{ left: Math.min(toolMenu.x, window.innerWidth - 250), top: Math.min(toolMenu.y + 4, window.innerHeight - 380) }} onMouseDown={(e) => e.stopPropagation()} role="menu">
              <div className="tab-menu-label">{TOOL_INFO[toolMenu.id]?.title ?? toolMenu.id}</div>
              <button className="tab-menu-item" role="menuitem" onClick={() => { const id = toolMenu.id; setToolMenu(null); onProject(id, TOOL_INFO[id]?.title ?? id); }}><Layers size={14} />Open</button>
              <button className="tab-menu-item" role="menuitem" onClick={() => { const id = toolMenu.id; setToolMenu(null); void window.elysium.chatReset(`tool:${id}`); onProject(id, TOOL_INFO[id]?.title ?? id); }}><RotateCcw size={14} />New conversation</button>
              <button className="tab-menu-item" role="menuitem" onClick={() => { const id = toolMenu.id; setToolMenu(null); window.elysium.openFolder(id); }}><FolderOpen size={14} />Open its folder</button>
              {toolMenu.id === 'laptop' && <>
                <div className="tab-menu-label">Run a check</div>
                {CHECKS.map((c) => <button key={c.id} className="tab-menu-item" role="menuitem" onClick={() => { setToolMenu(null); onRunCheck(c.id); }}><c.icon size={14} />{c.title}</button>)}
              </>}
            </div>
          </div>
        )}
        {groupMenu && (() => {
          const g = doc.groups.find((x) => x.id === groupMenu.id);
          if (!g) return null;
          return (
            <div className="menu-backdrop" onMouseDown={() => setGroupMenu(null)} onContextMenu={(e) => { e.preventDefault(); setGroupMenu(null); }}>
              <div className="tab-menu over-native" style={{ left: Math.min(groupMenu.x, window.innerWidth - 250), top: Math.min(groupMenu.y + 4, window.innerHeight - 200) }} onMouseDown={(e) => e.stopPropagation()} role="menu">
                <div className="tab-menu-label">{g.name}</div>
                <button className="tab-menu-item" role="menuitem" onClick={() => { setGroupMenu(null); setRenamingGroup(g.id); }}><Pencil size={14} />Rename group</button>
                <button className="tab-menu-item" role="menuitem" onClick={() => { setGroupMenu(null); setGroups(doc.groups.filter((x) => x.id !== g.id)); }}><X size={14} />Remove group, keep its projects</button>
              </div>
            </div>
          );
        })()}

        {freeViews.length > 0 && <>
        <div className="side-label">
          <span>Layouts</span>
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
        </>}
      </div>

      <button className={`nav ${page === 'help' ? 'active' : ''}`} onClick={() => go('help')}>
        <CircleHelp size={17} strokeWidth={1.75} /><span className="grow">Help</span>
      </button>
      <button className={`nav ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
        <SettingsIcon size={17} strokeWidth={1.75} /><span className="grow">Settings</span><span className="hint">Ctrl ,</span>
      </button>
      <div className="foot">
        <button className={`pill ${ramTone}`} onClick={onMemory} title={res ? `Memory: ${(res.ramFreeBytes / 1024 ** 3).toFixed(1)} GB free of ${(res.ramTotalBytes / 1024 ** 3).toFixed(1)} GB. Disk ${res.diskPath}: ${res.diskFreeBytes === null ? 'unknown' : `${(res.diskFreeBytes / 1024 ** 3).toFixed(1)} GB free`}.` : 'Memory and disk'}>
          <MemoryStick size={14} />{!res ? 'Memory' : `Memory ${(res.ramFreeBytes / 1024 ** 3).toFixed(1)} GB free`}
          {res && res.diskFreeBytes !== null && res.diskLevel !== 'ok' && <span className="muted">· disk {(res.diskFreeBytes / 1024 ** 3).toFixed(1)} GB</span>}
        </button>
      </div>
    </aside>
  );
}
