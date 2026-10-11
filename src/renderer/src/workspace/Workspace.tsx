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
  Activity, BookOpen, MessageCircle, FileText, GitBranch, LayoutGrid, ListTodo, Maximize2, MemoryStick, Minimize2, NotebookPen,
  PictureInPicture2, Plus, Radio, Rocket, Sparkles, SquareTerminal, X,
} from 'lucide-react';
import { useLive } from './live';
import { useWorkspace, type OpenRequest, type PanelKind, type View } from './store';
import { TerminalPanel } from './TerminalPanel';
import { LauncherWidget, MachineWidget, NotesWidget, SessionsWidget } from './widgets';
import { GitWidget, RelayWidget, TasksWidget } from './project-widgets';
import { DocumentPanel } from './DocumentPanel';
import { ClaudePanel, overlayClosed, overlayOpened } from './ClaudePanel';

export const WIDGETS: { kind: PanelKind; title: string; blurb: string; icon: FunctionComponent<{ size?: number }> }[] = [
  { kind: 'claude', title: 'Claude', blurb: 'Your planning chat, beside the terminals', icon: MessageCircle },
  { kind: 'relay', title: 'Relay', blurb: 'What the agents report, and what waits on you', icon: Radio },
  { kind: 'tasks', title: 'Tasks', blurb: 'Open board issues for a project', icon: ListTodo },
  { kind: 'launcher', title: 'Launch', blurb: 'Start any session', icon: Rocket },
  { kind: 'sessions', title: 'Sessions', blurb: 'Everything running', icon: Activity },
  { kind: 'machine', title: 'Memory', blurb: 'What uses RAM, and free it up', icon: MemoryStick },
  { kind: 'git', title: 'Git', blurb: 'Branch, changes, recent commits', icon: GitBranch },
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
  relay: RelayWidget as FunctionComponent<IDockviewPanelProps>,
  tasks: TasksWidget as FunctionComponent<IDockviewPanelProps>,
  git: GitWidget as FunctionComponent<IDockviewPanelProps>,
  document: DocumentPanel as FunctionComponent<IDockviewPanelProps>,
  claude: ClaudePanel,
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
    const termGroup = api.groups.find((g) => g.panels.some((p) => kindOf(p.id) === 'terminal'));
    if (termGroup) position = { referenceGroup: termGroup.id };
    else if (ref) position = { referenceGroup: ref.id, direction: req.besideLauncher || ref.panels.length ? 'right' : 'within' };
  } else if (ref) {
    position = { referenceGroup: ref.id };
  }
  api.addPanel({ id, component: req.kind, title, params, position });
}

/** The starter layout: launch on the left, terminals in the middle, Claude and the project board on the right. */
function seedLayout(api: DockviewApi) {
  api.addPanel({ id: `launcher-${uid()}`, component: 'launcher', title: 'Launch' });
  api.addPanel({ id: `claude-${uid()}`, component: 'claude', title: 'Claude', position: { direction: 'right' } });
  const right = api.groups[api.groups.length - 1];
  api.addPanel({ id: `relay-${uid()}`, component: 'relay', title: 'Relay', params: { projectId: 'posture' }, position: { referenceGroup: right.id }, inactive: true });
  api.addPanel({ id: `tasks-${uid()}`, component: 'tasks', title: 'Tasks', params: { projectId: 'posture' }, position: { referenceGroup: right.id }, inactive: true });
  // Sizes apply once the dock has its real width.
  const left = api.groups[0];
  setTimeout(() => { try { left.api.setSize({ width: 270 }); } catch { /* sizes are a nicety */ } }, 50);
}

function Tab(props: IDockviewPanelHeaderProps) {
  const { sessions, templates } = useLive();
  const kind = kindOf(props.api.id);
  const params = props.params as { sessionId?: string; templateId?: string };
  const t = templates.find((x) => x.id === params.templateId);
  const s = sessions.find((x) => x.id === params.sessionId);
  const Icon = iconFor(kind, t?.kind);
  const [title, setTitle] = useState(props.api.title ?? '');
  useEffect(() => { const d = props.api.onDidTitleChange((e) => setTitle(e.title)); return () => d.dispose(); }, [props.api]);
  return (
    <div className="ep-tab" onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); props.api.close(); } }}>
      <Icon size={13} />
      <span className="ep-tab-title">{title}</span>
      {kind === 'terminal' && <span className={`dot ${s?.status ?? 'exited'}`} />}
      <button className="ep-tab-close" onClick={(e) => { e.stopPropagation(); props.api.close(); }} aria-label={`Close ${title}`}><X size={12} /></button>
    </div>
  );
}

function GroupActions(props: IDockviewHeaderActionsProps) {
  const { open } = useWorkspace();
  const { templates } = useLive();
  const [menu, setMenu] = useState(false);
  const [max, setMax] = useState(props.api.isMaximized());
  useEffect(() => { const d = props.containerApi.onDidMaximizedGroupChange(() => setMax(props.api.isMaximized())); return () => d.dispose(); }, [props.api, props.containerApi]);
  const add = (req: OpenRequest) => { setMenu(false); open({ ...req, referenceGroupId: props.group.id }); };
  useEffect(() => { if (!menu) return; overlayOpened(); return () => overlayClosed(); }, [menu]);
  const floating = props.group.api.location.type === 'floating';
  return (
    <div className="ep-actions">
      <button className="ep-act" onClick={() => setMenu((m) => !m)} title="Add a pane here" aria-label="Add a pane here"><Plus size={14} /></button>
      {!floating && (
        <button className="ep-act" title="Float" aria-label="Float this group" onClick={() => props.containerApi.addFloatingGroup(props.group)}>
          <PictureInPicture2 size={13} />
        </button>
      )}
      <button className="ep-act" title={max ? 'Restore' : 'Maximize'} aria-label={max ? 'Restore' : 'Maximize'} onClick={() => (max ? props.api.exitMaximized() : props.api.maximize())}>
        {max ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <div className="menu glass-menu" role="menu">
            <div className="menu-label">Widgets</div>
            {WIDGETS.map((w) => (
              <button key={w.kind} className="menu-item" role="menuitem" onClick={() => add({ kind: w.kind })}>
                <w.icon size={15} /><span className="grow"><span>{w.title}</span><span className="menu-sub">{w.blurb}</span></span>
              </button>
            ))}
            <div className="menu-label">Sessions</div>
            {templates.map((t) => (
              <button key={t.id} className="menu-item" role="menuitem" onClick={() => add({ kind: 'terminal', templateId: t.id, title: t.title })}>
                {t.kind === 'claude' ? <Sparkles size={15} /> : <SquareTerminal size={15} />}<span className="grow">{t.title}</span>
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
        {WIDGETS.slice(0, 6).map((w) => (
          <button key={w.kind} className="glass-card wm-card" onClick={() => open({ kind: w.kind })}><w.icon size={16} /><span>{w.title}</span></button>
        ))}
        <button className="glass-card wm-card" onClick={() => open({ kind: 'terminal', templateId: 'local.shell', title: 'PowerShell' })}><SquareTerminal size={16} /><span>PowerShell</span></button>
      </div>
    </div>
  );
}

function ViewDock({ view, active, theme }: { view: View; active: boolean; theme: DockviewTheme }) {
  const { registerApi, setLayout, takeQueued } = useWorkspace();
  const apiRef = useRef<DockviewApi | null>(null);
  const { open } = useWorkspace();
  const openRef = useRef(open);
  openRef.current = open;

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
          if (!restored) seedLayout(api);
          // Closing a terminal pane ends its session. Moving, floating and
          // switching views do not, because the views stay mounted.
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
  const theme = useMemo<DockviewTheme>(() => ({ name: 'elysium', className: 'dockview-theme-elysium', colorScheme: 'dark', gap, dndOverlayMounting: 'absolute' }), [gap]);
  if (!ready) return null;
  return (
    <div className="workspace" style={{ display: visible ? 'block' : 'none' }}>
      {doc.views.map((v) => <ViewDock key={`${v.id}-${v.rev ?? 0}`} view={v} active={v.id === doc.activeViewId} theme={theme} />)}
    </div>
  );
}
