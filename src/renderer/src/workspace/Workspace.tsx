import { useEffect, useMemo, useRef, useState, type FunctionComponent } from 'react';
import { createPortal } from 'react-dom';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type IWatermarkPanelProps,
} from 'dockview-react';
import { AppWindow, FolderTree,
  Activity, BookOpen, Check, Eye, FoldVertical, Workflow, FileText, GitBranch, LayoutGrid, ListTodo, Maximize2, MemoryStick, MessageCircle, Minimize2,
  NotebookPen, PanelsTopLeft, PictureInPicture2, Plus, Radio, Rocket, Sparkles, SquareTerminal, TriangleAlert, X,
} from 'lucide-react';
import type { TemplateInfo } from '@shared/ipc';
import { useLive } from './live';
import { useWorkspace, type OpenRequest, type PanelKind, type View } from './store';
import { TerminalPanel } from './TerminalPanel';
import { ContextMeter, LauncherWidget, MachineWidget, NotesWidget, SessionsWidget, WatcherWidget } from './widgets';
import { GitWidget, RelayWidget, TasksWidget } from './project-widgets';
import { DocumentPanel } from './DocumentPanel';
import { ClaudePanel, overlayClosed, overlayOpened } from './ClaudePanel';
import { SitePanel } from './SitePanel';
import { Dashboard, PROJECT_EXTRAS } from './Dashboard';
import { ToolIntro } from './ToolIntro';
import { ChatPanel } from './ChatPanel';
import { CodePanel, FilesPanel } from './FilesPanel';
import { TOOL_INFO } from '../tools';
import { FlowPanel } from './FlowPanel';

export const WIDGETS: { kind: PanelKind; title: string; blurb: string; icon: FunctionComponent<{ size?: number }> }[] = [
  { kind: 'claude', title: 'Claude', blurb: 'Your planning chat, beside the terminals', icon: MessageCircle },
  { kind: 'dashboard', title: 'Dashboard', blurb: 'Tasks, numbers, links and requests for this project', icon: LayoutGrid },
  { kind: 'flow', title: 'Live flow', blurb: 'What each session is doing, as it happens', icon: Workflow },
  { kind: 'relay', title: 'Relay', blurb: 'What waits on you, and what agents are doing', icon: Radio },
  { kind: 'tasks', title: 'Tasks', blurb: 'Open board issues', icon: ListTodo },
  { kind: 'launcher', title: 'Launch', blurb: 'Start a session', icon: Rocket },
  { kind: 'sessions', title: 'Sessions', blurb: 'Everything running, with context', icon: Activity },
  { kind: 'watcher', title: 'Watcher', blurb: 'New board tasks as they arrive', icon: Eye },
  { kind: 'files', title: 'Files', blurb: 'The project\'s folders, like VS Code\'s explorer', icon: FolderTree },
  { kind: 'git', title: 'Git', blurb: 'Branch, changes, recent commits', icon: GitBranch },
  { kind: 'machine', title: 'Memory', blurb: 'What uses RAM, and how to free it', icon: MemoryStick },
  { kind: 'document', title: 'Document', blurb: 'Markdown, PDF, text', icon: BookOpen },
  { kind: 'notes', title: 'Notes', blurb: 'A scratchpad saved as you type', icon: NotebookPen },
];

export const iconFor = (kind: string, templateKind?: string) => {
  if (kind === 'terminal') return templateKind === 'claude' ? Sparkles : SquareTerminal;
  if (kind === 'document') return FileText;
  return WIDGETS.find((w) => w.kind === kind)?.icon ?? LayoutGrid;
};

const components: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  terminal: TerminalPanel as FunctionComponent<IDockviewPanelProps>,
  machine: MachineWidget,
  sessions: SessionsWidget,
  notes: NotesWidget,
  launcher: LauncherWidget,
  watcher: WatcherWidget,
  relay: RelayWidget as FunctionComponent<IDockviewPanelProps>,
  tasks: TasksWidget as FunctionComponent<IDockviewPanelProps>,
  git: GitWidget as FunctionComponent<IDockviewPanelProps>,
  document: DocumentPanel as FunctionComponent<IDockviewPanelProps>,
  claude: ClaudePanel as FunctionComponent<IDockviewPanelProps>,
  web: SitePanel as FunctionComponent<IDockviewPanelProps>,
  dashboard: Dashboard as FunctionComponent<IDockviewPanelProps>,
  tool: ToolIntro as FunctionComponent<IDockviewPanelProps>,
  chat: ChatPanel as FunctionComponent<IDockviewPanelProps>,
  files: FilesPanel as FunctionComponent<IDockviewPanelProps>,
  code: CodePanel as FunctionComponent<IDockviewPanelProps>,
  flow: FlowPanel as FunctionComponent<IDockviewPanelProps>,
};

const uid = () => Math.random().toString(36).slice(2, 10);
const kindOf = (panelId: string) => panelId.split('-')[0];

/** Adds a panel to a view. Exported so the app can call it after a confirmation. */
export function addPanel(api: DockviewApi, req: OpenRequest): void {
  const id = `${req.kind}-${uid()}`;
  const title = req.title ?? WIDGETS.find((w) => w.kind === req.kind)?.title ?? req.kind;
  const params = { ...(req.params ?? {}), ...(req.templateId ? { templateId: req.templateId } : {}) };
  let position: Parameters<DockviewApi['addPanel']>[0]['position'];
  const ref = req.referenceGroupId ? api.getGroup(req.referenceGroupId) : api.activeGroup;
  if (req.kind === 'terminal') {
    // Terminals gather in one area: next to an existing terminal, else right of the launcher.
    const launcherGroup = api.groups.find((g) => g.panels.some((p) => kindOf(p.id) === 'launcher'));
    // Two terminals stack top and bottom; a third and later become tabs in the lower one.
    const termGroups = api.groups.filter((g) => g.panels.some((p) => kindOf(p.id) === 'terminal'));
    if (termGroups.length === 1) position = { referenceGroup: termGroups[0].id, direction: 'below' };
    else if (termGroups.length > 1) position = { referenceGroup: termGroups[termGroups.length - 1].id };
    else if (launcherGroup) position = { referenceGroup: launcherGroup.id, direction: 'right' };
    else if (ref) position = { referenceGroup: ref.id, direction: ref.panels.length ? 'right' : 'within' };
  } else if (req.kind === 'files') {
    // The explorer sits at the far left, as in VS Code.
    position = { direction: 'left' };
  } else if (req.kind === 'code') {
    // Files open as tabs together, away from the explorer.
    const codeGroup = api.groups.find((g) => g.panels.some((p) => kindOf(p.id) === 'code'));
    const notFiles = api.groups.find((g) => !g.panels.some((p) => kindOf(p.id) === 'files'));
    position = codeGroup ? { referenceGroup: codeGroup.id } : notFiles ? { referenceGroup: notFiles.id } : undefined;
  } else if (ref) {
    position = { referenceGroup: ref.id };
  }
  const existing = req.kind === 'code' ? api.panels.find((p) => kindOf(p.id) === 'code' && (p.params as { path?: string })?.path === (params as { path?: string }).path) : undefined;
  if (existing) { existing.api.setActive(); return; }
  api.addPanel({ id, component: req.kind, title, params, position });
  if (req.kind === 'files') setTimeout(() => { try { api.getPanel(id)?.group.api.setSize({ width: 260 }); } catch { /* sizes are a nicety */ } }, 40);
}

/** Puts every terminal in the view one above another, in a single column. */
export function stackTerminals(api: DockviewApi): number {
  const terms = api.panels.filter((p) => kindOf(p.id) === 'terminal');
  if (terms.length < 2) return terms.length;
  let prev = terms[0];
  for (const p of terms.slice(1)) {
    try { p.api.moveTo({ group: prev.group, position: 'bottom' }); } catch { /* leave it where it is */ }
    prev = p;
  }
  return terms.length;
}

/**
 * A project view starts with: Launch on the left, Claude on the project's
 * account on the right, and the board (relay and tasks, or git) tabbed with it.
 * Terminals open between them. A plain view starts with Launch and Claude.
 */
/** A chat pane for a tool or a project's planning; shown if it exists, added beside Claude if not. */
export function openChat(api: DockviewApi, chatId: string, projectId: string, title: string): void {
  const have = api.panels.find((p) => (p.params as { chatId?: string } | undefined)?.chatId === chatId);
  if (have) { have.api.setActive(); return; }
  const claude = api.panels.find((p) => p.id.startsWith('claude-'));
  api.addPanel({ id: `chat-${uid()}`, component: 'chat', title, params: { chatId, projectId }, position: claude ? { referenceGroup: claude.group.id } : undefined });
}

function seedLayout(api: DockviewApi, view: View, projectHasRelay: boolean, accountId: string, sessions: TemplateInfo[] = []) {
  // A tool is one calm chat, nothing else.
  if (view.projectId && TOOL_INFO[view.projectId]) {
    api.addPanel({ id: `chat-${uid()}`, component: 'chat', title: TOOL_INFO[view.projectId].title, params: { chatId: `tool:${view.projectId}`, projectId: view.projectId } });
    return;
  }
  // A project with sessions opens on them, one above the other; anything else starts with Launch.
  if (sessions.length) {
    api.addPanel({ id: `terminal-${uid()}`, component: 'terminal', title: sessions[0].title, params: { templateId: sessions[0].id } });
    for (const t of sessions.slice(1)) {
      api.addPanel({ id: `terminal-${uid()}`, component: 'terminal', title: t.title, params: { templateId: t.id }, position: { referenceGroup: api.groups[api.groups.length - 1].id, direction: 'below' } });
    }
  } else {
    api.addPanel({ id: `launcher-${uid()}`, component: 'launcher', title: 'Launch' });
  }
  api.addPanel({ id: `claude-${uid()}`, component: 'claude', title: 'Claude', params: { accountId, projectId: view.projectId }, position: { direction: 'right' } });
  const right = api.groups[api.groups.length - 1];
  if (view.projectId && TOOL_INFO[view.projectId]) {
    api.addPanel({ id: `tool-${uid()}`, component: 'tool', title: TOOL_INFO[view.projectId].title, params: { projectId: view.projectId }, position: { referenceGroup: right.id } });
  } else if (view.projectId) {
    api.addPanel({ id: `dashboard-${uid()}`, component: 'dashboard', title: 'Dashboard', params: { projectId: view.projectId }, position: { referenceGroup: right.id }, inactive: true });
    const start = PROJECT_EXTRAS[view.projectId]?.open;
    if (start) api.addPanel({ id: `web-${uid()}`, component: 'web', title: 'Admin', params: { url: start, projectId: view.projectId, title: 'Admin' }, position: { referenceGroup: right.id } });
    if (projectHasRelay) {
      api.addPanel({ id: `relay-${uid()}`, component: 'relay', title: 'Relay', params: { projectId: view.projectId }, position: { referenceGroup: right.id }, inactive: true });
      api.addPanel({ id: `tasks-${uid()}`, component: 'tasks', title: 'Tasks', params: { projectId: view.projectId }, position: { referenceGroup: right.id }, inactive: true });
    } else {
      api.addPanel({ id: `git-${uid()}`, component: 'git', title: 'Git', params: { projectId: view.projectId }, position: { referenceGroup: right.id }, inactive: true });
    }
  }
  const left = api.groups[0];
  // Terminals get a little over half the width; the launcher stays narrow.
  setTimeout(() => { try { left.api.setSize({ width: sessions.length ? Math.round(api.width * 0.56) : 260 }); } catch { /* sizes are a nicety */ } }, 60);
}

/** The Claude sessions a project opens with: Prime then Meridian, or its single session. */
export function projectSessions(templates: TemplateInfo[], projectId: string | undefined): TemplateInfo[] {
  if (!projectId) return [];
  const mine = templates.filter((t) => t.kind === 'claude' && t.project === projectId);
  const rank = (t: TemplateInfo) => (t.role === 'prime' ? 0 : t.role === 'meridian' ? 1 : 2);
  return mine.sort((a, b) => rank(a) - rank(b));
}

/**
 * Opening a project: each of its sessions gets a pane, and a pane whose session
 * has ended starts again. Nothing asks first.
 */
export function ensureProjectSessions(api: DockviewApi, projectId: string, templates: TemplateInfo[]): void {
  if (TOOL_INFO[projectId]) { openChat(api, `tool:${projectId}`, projectId, TOOL_INFO[projectId].title); return; }
  for (const t of projectSessions(templates, projectId)) {
    const pane = api.panels.find((p) => (p.params as { templateId?: string } | undefined)?.templateId === t.id);
    if (!pane) addPanel(api, { kind: 'terminal', templateId: t.id, title: t.title });
    else window.dispatchEvent(new CustomEvent('ep:ensure-session', { detail: t.id }));
  }
  // A project with its own admin page shows it too.
  const start = PROJECT_EXTRAS[projectId]?.open;
  if (start && !api.panels.some((p) => p.id.startsWith('web-'))) {
    const claude = api.panels.find((p) => p.id.startsWith('claude-'));
    api.addPanel({ id: `web-${uid()}`, component: 'web', title: 'Admin', params: { url: start, projectId, title: 'Admin' }, position: claude ? { referenceGroup: claude.group.id } : undefined });
  }
}

/** Pane colours: a soft tint on the tab bar and a ring around the pane, so sessions are easy to tell apart. */
/** "Claude Opus 5.5" or "Opus 5.5 (1M context)" reads as "Opus 5.5". */
export function shortModel(m: string): string {
  return m.replace(/^claude\s+/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
}

export const TINTS: { name: string; value: string }[] = [
  { name: 'None', value: '' },
  { name: 'Blue', value: '#5B8DEF' },
  { name: 'Violet', value: '#9B7BE0' },
  { name: 'Pink', value: '#E06C8C' },
  { name: 'Red', value: '#E5534B' },
  { name: 'Amber', value: '#D9A043' },
  { name: 'Green', value: '#4FA97A' },
  { name: 'Teal', value: '#3FB5B0' },
];

function Tab(props: IDockviewPanelHeaderProps) {
  const { sessions, templates, telemetry } = useLive();
  const kind = kindOf(props.api.id);
  const params = props.params as { sessionId?: string; templateId?: string };
  const t = templates.find((x) => x.id === params.templateId);
  const s = sessions.find((x) => x.id === params.sessionId);
  const tel = params.sessionId ? telemetry[params.sessionId] : undefined;
  const Icon = iconFor(kind, t?.kind);
  const [title, setTitle] = useState(props.api.title ?? '');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { const d = props.api.onDidTitleChange((e) => setTitle(e.title)); return () => d.dispose(); }, [props.api]);
  // Name drift: Prime and Meridian find each other by exact name (spec 8.3.2).
  const drift = Boolean(t?.kind === 'claude' && t.role !== 'solo' && tel?.sessionName && tel.sessionName !== t.title);
  const fix = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!params.sessionId || !t) return;
    const r = await window.elysium.renameSession(params.sessionId, t.title);
    setNote(r.ok ? null : r.reason);
  };
  const state = s?.status !== 'running' ? s?.status ?? 'exited' : tel?.state ?? 'running';

  // The pane's colour lives in its params, so it is saved with the layout.
  const [tint, setTint] = useState<string>((props.params as { tint?: string }).tint ?? '');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { if (!menu) return; overlayOpened(); return () => overlayClosed(); }, [menu]);
  useEffect(() => {
    // Paint the group while this pane is the one it shows; a pane without a colour clears it.
    const paint = () => {
      const g = props.api.group;
      const raw = g?.element as HTMLElement | undefined;
      const el = raw ? (raw.classList.contains('dv-groupview') ? raw : (raw.querySelector('.dv-groupview') as HTMLElement | null) ?? (raw.closest('.dv-groupview') as HTMLElement | null) ?? raw) : undefined;
      if (!el || g.activePanel?.id !== props.api.id) return;
      if (tint) { el.style.setProperty('--tint', tint); el.classList.add('tinted'); }
      else { el.style.removeProperty('--tint'); el.classList.remove('tinted'); }
    };
    paint();
    const ds = [props.api.onDidActiveChange(paint), props.api.onDidVisibilityChange(paint), props.api.onDidGroupChange(() => setTimeout(paint, 0))];
    return () => { for (const d of ds) d.dispose(); };
  }, [tint, props.api]);
  const chooseTint = (value: string) => {
    setTint(value);
    props.api.updateParameters({ ...(props.params as object), tint: value || undefined });
    setMenu(null);
  };
  const canCompact = kind === 'terminal' && t?.kind === 'claude' && s?.status === 'running';

  return (
    <div className="ep-tab" style={tint ? ({ '--tint': tint } as React.CSSProperties) : undefined}
      onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); props.api.close(); } }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}>
      {tint && <span className="tint-dot" />}
      <Icon size={14} />
      <span className="ep-tab-title">{title}</span>
      {kind === 'terminal' && <span className={`dot ${state}`} title={state === 'waiting' ? tel?.waitingMessage ?? 'Waiting on you' : state} />}
      {kind === 'terminal' && t?.kind === 'claude' && tel?.model && <span className="model-chip" title={`Model: ${tel.model}`}>{shortModel(tel.model)}</span>}
      {kind === 'terminal' && t?.kind === 'claude' && <ContextMeter t={tel} compact />}
      {drift && (
        <button className="ep-tab-close drift" style={{ opacity: 1 }} onClick={(e) => void fix(e)}
          title={note ?? `Running as "${tel!.sessionName}", but its partner expects "${t!.title}". Click to rename it back.`}>
          <TriangleAlert size={13} />
        </button>
      )}
      <button className="ep-tab-close" onClick={(e) => { e.stopPropagation(); props.api.close(); }} aria-label={`Close ${title}`}><X size={13} /></button>
      {menu && createPortal(
        <div className="menu-backdrop" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div className="tab-menu over-native" style={{ left: Math.min(menu.x, window.innerWidth - 250), top: Math.min(menu.y + 6, window.innerHeight - 200) }} onMouseDown={(e) => e.stopPropagation()} role="menu">
            <div className="tab-menu-label">Pane colour</div>
            <div className="tint-row">
              {TINTS.map((c) => (
                <button key={c.name} className={`tint-swatch ${c.value ? '' : 'none'}`} style={c.value ? { background: c.value } : undefined} title={c.name} aria-label={c.name} onClick={() => chooseTint(c.value)}>
                  {tint === c.value && <Check size={12} strokeWidth={3} />}
                </button>
              ))}
            </div>
            {canCompact && (
              <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); void window.elysium.compact([params.sessionId!]); }}>
                <FoldVertical size={14} />Compact this session
              </button>
            )}
            <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); void props.containerApi.addPopoutGroup(props.api.group); }}><AppWindow size={14} />Open in new window</button>
            <button className="tab-menu-item" role="menuitem" onClick={() => { setMenu(null); props.api.close(); }}><X size={14} />Close</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function GroupActions(props: IDockviewHeaderActionsProps) {
  const { open, activeView } = useWorkspace();
  const { templates } = useLive();
  const [menu, setMenu] = useState(false);
  const [max, setMax] = useState(props.api.isMaximized());
  useEffect(() => { const d = props.containerApi.onDidMaximizedGroupChange(() => setMax(props.api.isMaximized())); return () => d.dispose(); }, [props.api, props.containerApi]);
  useEffect(() => { if (!menu) return; overlayOpened(); return () => overlayClosed(); }, [menu]);
  const add = (req: OpenRequest) => { setMenu(false); open({ ...req, referenceGroupId: props.group.id }); };
  const floating = props.group.api.location.type === 'floating';
  // Back into the grid, to the right of the largest docked group.
  const dock = () => {
    const docked = props.containerApi.groups.filter((g) => g !== props.group && g.api.location.type === 'grid');
    const target = docked.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    try {
      if (target) props.group.api.moveTo({ group: target, position: 'right' });
      else props.group.api.moveTo({ position: 'center' });
    } catch { /* drag the tab instead */ }
  };
  const sessionTemplates = activeView?.projectId ? templates.filter((t) => t.project === activeView.projectId || t.kind === 'shell') : templates;
  return (
    <div className="ep-actions">
      <button className="ep-act" onClick={() => setMenu((m) => !m)} title="Add a pane here" aria-label="Add a pane here"><Plus size={15} /></button>
      {floating ? (
        <button className="ep-act" title="Dock back into the layout" aria-label="Dock this group" onClick={dock}><PanelsTopLeft size={14} /></button>
      ) : (
        <button className="ep-act" title="Float" aria-label="Float this group" onClick={() => props.containerApi.addFloatingGroup(props.group)}><PictureInPicture2 size={14} /></button>
      )}
      {!floating && (
        <button className="ep-act" title={max ? 'Restore' : 'Maximize'} aria-label={max ? 'Restore' : 'Maximize'} onClick={() => (max ? props.api.exitMaximized() : props.api.maximize())}>
          {max ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <div className="menu" role="menu">
            <div className="menu-label">Sessions</div>
            {sessionTemplates.map((t) => (
              <button key={t.id} className="menu-item" role="menuitem" onClick={() => add({ kind: 'terminal', templateId: t.id, title: t.title })}>
                {t.kind === 'claude' ? <Sparkles size={16} /> : <SquareTerminal size={16} />}<span className="grow">{t.title}</span>
              </button>
            ))}
            <div className="menu-label">Panes</div>
            {WIDGETS.map((w) => (
              <button key={w.kind} className="menu-item" role="menuitem" onClick={() => add({ kind: w.kind, params: activeView?.projectId ? { projectId: activeView.projectId } : undefined })}>
                <w.icon size={16} /><span className="grow"><span>{w.title}</span><span className="menu-sub">{w.blurb}</span></span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Watermark(_p: IWatermarkPanelProps) {
  const { open } = useWorkspace();
  return (
    <div className="watermark">
      <div className="watermark-title">An empty view</div>
      <div className="watermark-sub">Add anything. Drag tabs to split, float or stack them.</div>
      <div className="watermark-grid">
        <button className="wm-card" onClick={() => open({ kind: 'terminal', templateId: 'local.shell', title: 'PowerShell' })}><SquareTerminal size={17} /><span>PowerShell</span></button>
        {WIDGETS.slice(0, 5).map((w) => <button key={w.kind} className="wm-card" onClick={() => open({ kind: w.kind })}><w.icon size={17} /><span>{w.title}</span></button>)}
      </div>
    </div>
  );
}

function ViewDock({ view, active, theme }: { view: View; active: boolean; theme: DockviewTheme }) {
  const { registerApi, setLayout, takeQueued, open, accountFor } = useWorkspace();
  const { projects, templates } = useLive();
  const apiRef = useRef<DockviewApi | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const hasRelay = projects.find((p) => p.id === view.projectId)?.hasRelay ?? false;

  // When a view is rebuilt (reset, preset applied) or deleted, its terminals stop with it.
  useEffect(() => () => {
    const api = apiRef.current;
    if (api) for (const p of api.panels) {
      const sid = (p.params as { sessionId?: string } | undefined)?.sessionId;
      if (sid) void window.elysium.kill(sid);
    }
    registerApi(view.id, null);
  }, [registerApi, view.id]);

  return (
    <div className="view-dock" style={{ display: active ? 'block' : 'none' }}>
      <DockviewReact
        theme={theme}
        components={components}
        defaultTabComponent={Tab}
        popoutUrl="popout.html"
        rightHeaderActionsComponent={GroupActions}
        watermarkComponent={Watermark}
        onReady={(e) => {
          const api = e.api;
          apiRef.current = api;
          let restored = false;
          if (view.layout) {
            try { api.fromJSON(view.layout); restored = true; } catch { api.clear(); }
          }
          if (!restored) seedLayout(api, view, hasRelay, accountFor(view.projectId), projectSessions(templates, view.projectId));
          // Closing a terminal pane ends its session. Moving, floating and
          // switching views do not, because every view stays mounted.
          api.onDidRemovePanel((p) => {
            const sid = (p.params as { sessionId?: string } | undefined)?.sessionId;
            if (sid) void window.elysium.kill(sid);
          });
          api.onDidLayoutChange(() => setLayout(view.id, api.toJSON()));
          registerApi(view.id, api);
          for (const req of takeQueued(view.id)) openRef.current(req);
        }}
      />
    </div>
  );
}

export function Workspace({ visible }: { visible: boolean }) {
  const { doc, ready } = useWorkspace();
  const gap = doc.settings.gap;
  const theme = useMemo<DockviewTheme>(() => ({ name: 'elysium', className: 'dockview-theme-elysium', gap, dndOverlayMounting: 'absolute' }), [gap]);
  if (!ready) return null;
  return (
    <div className="workspace" style={{ display: visible ? 'block' : 'none' }}>
      {doc.views.map((v) => <ViewDock key={`${v.id}-${v.rev ?? 0}`} view={v} active={v.id === doc.activeViewId} theme={theme} />)}
    </div>
  );
}
