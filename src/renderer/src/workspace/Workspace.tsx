import { useEffect, useMemo, useRef, useState, type FunctionComponent } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type IWatermarkPanelProps,
} from 'dockview-react';
import {
  Activity, BookOpen, Eye, FileText, GitBranch, LayoutGrid, ListTodo, Maximize2, MemoryStick, MessageCircle, Minimize2,
  NotebookPen, PictureInPicture2, Plus, Radio, Rocket, Sparkles, SquareTerminal, TriangleAlert, X,
} from 'lucide-react';
import { useLive } from './live';
import { useWorkspace, type OpenRequest, type PanelKind, type View } from './store';
import { TerminalPanel } from './TerminalPanel';
import { ContextMeter, LauncherWidget, MachineWidget, NotesWidget, SessionsWidget, WatcherWidget } from './widgets';
import { GitWidget, RelayWidget, TasksWidget } from './project-widgets';
import { DocumentPanel } from './DocumentPanel';
import { ClaudePanel, overlayClosed, overlayOpened } from './ClaudePanel';

export const WIDGETS: { kind: PanelKind; title: string; blurb: string; icon: FunctionComponent<{ size?: number }> }[] = [
  { kind: 'claude', title: 'Claude', blurb: 'Your planning chat, beside the terminals', icon: MessageCircle },
  { kind: 'relay', title: 'Relay', blurb: 'What waits on you, and what agents are doing', icon: Radio },
  { kind: 'tasks', title: 'Tasks', blurb: 'Open board issues', icon: ListTodo },
  { kind: 'launcher', title: 'Launch', blurb: 'Start a session', icon: Rocket },
  { kind: 'sessions', title: 'Sessions', blurb: 'Everything running, with context', icon: Activity },
  { kind: 'watcher', title: 'Watcher', blurb: 'New board tasks as they arrive', icon: Eye },
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
    const termGroup = api.groups.find((g) => g.panels.some((p) => kindOf(p.id) === 'terminal'));
    const launcherGroup = api.groups.find((g) => g.panels.some((p) => kindOf(p.id) === 'launcher'));
    if (termGroup) position = { referenceGroup: termGroup.id };
    else if (launcherGroup) position = { referenceGroup: launcherGroup.id, direction: 'right' };
    else if (ref) position = { referenceGroup: ref.id, direction: ref.panels.length ? 'right' : 'within' };
  } else if (ref) {
    position = { referenceGroup: ref.id };
  }
  api.addPanel({ id, component: req.kind, title, params, position });
}

/**
 * A project view starts with: Launch on the left, Claude on the project's
 * account on the right, and the board (relay and tasks, or git) tabbed with it.
 * Terminals open between them. A plain view starts with Launch and Claude.
 */
function seedLayout(api: DockviewApi, view: View, projectHasRelay: boolean, accountId: string) {
  api.addPanel({ id: `launcher-${uid()}`, component: 'launcher', title: 'Launch' });
  api.addPanel({ id: `claude-${uid()}`, component: 'claude', title: 'Claude', params: { accountId }, position: { direction: 'right' } });
  const right = api.groups[api.groups.length - 1];
  if (view.projectId) {
    if (projectHasRelay) {
      api.addPanel({ id: `relay-${uid()}`, component: 'relay', title: 'Relay', params: { projectId: view.projectId }, position: { referenceGroup: right.id }, inactive: true });
      api.addPanel({ id: `tasks-${uid()}`, component: 'tasks', title: 'Tasks', params: { projectId: view.projectId }, position: { referenceGroup: right.id }, inactive: true });
    } else {
      api.addPanel({ id: `git-${uid()}`, component: 'git', title: 'Git', params: { projectId: view.projectId }, position: { referenceGroup: right.id }, inactive: true });
    }
  }
  const left = api.groups[0];
  setTimeout(() => { try { left.api.setSize({ width: 260 }); } catch { /* sizes are a nicety */ } }, 60);
}

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
  return (
    <div className="ep-tab" onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); props.api.close(); } }}>
      <Icon size={14} />
      <span className="ep-tab-title">{title}</span>
      {kind === 'terminal' && <span className={`dot ${state}`} title={state === 'waiting' ? tel?.waitingMessage ?? 'Waiting on you' : state} />}
      {kind === 'terminal' && t?.kind === 'claude' && <ContextMeter t={tel} compact />}
      {drift && (
        <button className="ep-tab-close drift" style={{ opacity: 1 }} onClick={(e) => void fix(e)}
          title={note ?? `Running as "${tel!.sessionName}", but its partner expects "${t!.title}". Click to rename it back.`}>
          <TriangleAlert size={13} />
        </button>
      )}
      <button className="ep-tab-close" onClick={(e) => { e.stopPropagation(); props.api.close(); }} aria-label={`Close ${title}`}><X size={13} /></button>
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
  const sessionTemplates = activeView?.projectId ? templates.filter((t) => t.project === activeView.projectId || t.kind === 'shell') : templates;
  return (
    <div className="ep-actions">
      <button className="ep-act" onClick={() => setMenu((m) => !m)} title="Add a pane here" aria-label="Add a pane here"><Plus size={15} /></button>
      {!floating && (
        <button className="ep-act" title="Float" aria-label="Float this group" onClick={() => props.containerApi.addFloatingGroup(props.group)}><PictureInPicture2 size={14} /></button>
      )}
      <button className="ep-act" title={max ? 'Restore' : 'Maximize'} aria-label={max ? 'Restore' : 'Maximize'} onClick={() => (max ? props.api.exitMaximized() : props.api.maximize())}>
        {max ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
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
  const { projects } = useLive();
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
        rightHeaderActionsComponent={GroupActions}
        watermarkComponent={Watermark}
        onReady={(e) => {
          const api = e.api;
          apiRef.current = api;
          let restored = false;
          if (view.layout) {
            try { api.fromJSON(view.layout); restored = true; } catch { api.clear(); }
          }
          if (!restored) seedLayout(api, view, hasRelay, accountFor(view.projectId));
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
