// The typed IPC contract between main and renderer. Every channel the renderer
// may use is listed here; the preload exposes nothing else (spec section 17).

export type SessionStatus = 'starting' | 'running' | 'exited' | 'error';

export interface TemplateInfo {
  id: string; // stable, ElysiumProd owned (spec 8.3.2)
  title: string;
  kind: 'shell' | 'claude';
  project: string | null;
  projectName: string | null;
  role: 'prime' | 'meridian' | 'solo';
  cwd: string;
  /** Plain words shown before launch, when launching has a side effect worth knowing. */
  confirm: string | null;
}

export interface SessionInfo {
  id: string;
  templateId: string;
  title: string;
  accountId: string;
  /** True when a Claude template was resumed; false when it started fresh (no history on that account). */
  resumed: boolean;
  status: SessionStatus;
  pid: number | null;
  startedAt: string;
  exitCode: number | null;
  scrollbackPath: string;
}

export type Level = 'ok' | 'warn' | 'refuse';

export interface ResourceSample {
  at: string;
  cpuPercent: number | null;
  ramUsedPercent: number;
  ramUsedBytes: number;
  ramTotalBytes: number;
  diskFreeBytes: number | null;
  diskPath: string;
  ramLevel: Level;
  diskLevel: Level;
  /** Why new sessions are refused right now, or null when they are allowed. */
  refuseReason: string | null;
}

export type CreateResult = { ok: true; session: SessionInfo } | { ok: false; reason: string };

export const Channels = {
  templatesList: 'templates:list',
  sessionsList: 'sessions:list',
  sessionCreate: 'session:create',
  sessionWrite: 'session:write',
  sessionResize: 'session:resize',
  sessionKill: 'session:kill',
  sessionData: 'session:data',
  sessionUpdate: 'session:update',
  resourcesGet: 'resources:get',
  resourcesUpdate: 'resources:update',
  appInfo: 'app:info',
  sessionReplay: 'session:replay',
  workspaceGet: 'workspace:get',
  workspaceSet: 'workspace:set',
  projectsList: 'projects:list',
  relayRead: 'relay:read',
  tasksRead: 'tasks:read',
  gitRead: 'git:read',
  docPick: 'doc:pick',
  docRead: 'doc:read',
  openExternal: 'shell:open-external',
  procList: 'proc:list',
  procEnd: 'proc:end',
  webAttach: 'web:attach',
  webBounds: 'web:bounds',
  webDetach: 'web:detach',
  webNav: 'web:nav',
  webHideAll: 'web:hide-all',
  accountsList: 'accounts:list',
  historyCheck: 'accounts:history',
  telemetryUpdate: 'telemetry:update',
  telemetryAll: 'telemetry:all',
  watcherSet: 'watcher:set',
  watcherUpdate: 'watcher:update',
  watchersAll: 'watcher:all',
  sessionRename: 'session:rename',
  webState: 'web:state',
  projectStats: 'projects:stats',
  quickRun: 'quick:run',
  quickHide: 'quick:hide',
  quickOpenMain: 'quick:open-main',
  quickShown: 'quick:shown',
  shortcutGet: 'shortcut:get',
  shortcutSet: 'shortcut:set',
  titleBarColors: 'titlebar:colors',
  focusSession: 'focus:session',
  usageStats: 'usage:stats',
  clipboardRead: 'clipboard:read',
} as const;

export interface ProcGroup { name: string; pids: number[]; bytes: number; windowTitle: string | null; protected: boolean; agentHost: boolean }

export interface ProjectInfo { id: string; name: string; folder: string; repo: string | null; tier: 'main' | 'side'; hasRelay: boolean; waitingHeading: string; exists: boolean }
export interface RelayInfo { ok: boolean; error: string | null; text: string; updatedAt: string | null; source: string; waitingHeading: string }
export interface TaskInfo { number: number; title: string; labels: string[]; updatedAt: string; url: string; comments: number; needsOwner: boolean }
export interface GitInfo { ok: boolean; error: string | null; branch: string | null; ahead: number; behind: number; dirty: number; commits: { hash: string; when: string; subject: string }[] }
export interface DocFile { ok: boolean; error: string | null; path: string; kind: 'markdown' | 'text' | 'pdf'; text: string | null; bytes: Uint8Array | null }

export interface Replay {
  info: SessionInfo;
  data: string;
  endOffset: number;
}

export interface AppInfo {
  userName: string;
  version: string;
}

export interface ElysiumApi {
  info(): Promise<AppInfo>;
  templates(): Promise<TemplateInfo[]>;
  sessions(): Promise<SessionInfo[]>;
  create(templateId: string, cols: number, rows: number, opts?: CreateOptions): Promise<CreateResult>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  kill(sessionId: string): Promise<void>;
  resources(): Promise<ResourceSample | null>;
  replay(sessionId: string): Promise<Replay | null>;
  projects(): Promise<ProjectInfo[]>;
  relay(projectId: string): Promise<RelayInfo>;
  tasks(projectId: string): Promise<{ ok: boolean; error: string | null; tasks: TaskInfo[] }>;
  git(projectId: string): Promise<GitInfo>;
  pickDocument(): Promise<string | null>;
  readDocument(path: string): Promise<DocFile>;
  openExternal(url: string): void;
  processes(): Promise<ProcGroup[]>;
  endProgram(name: string): Promise<{ ok: boolean; error: string | null; ended: number }>;
  webAttach(id: string, accountId: string): void;
  onWebState(cb: (s: WebState) => void): () => void;
  webBounds(id: string, bounds: { x: number; y: number; width: number; height: number }, visible: boolean): void;
  webDetach(id: string): void;
  webNav(id: string, action: 'back' | 'forward' | 'reload' | 'home' | 'external'): void;
  webHideAll(hide: boolean): void;
  readClipboard(): Promise<string>;
  accounts(): Promise<AccountInfo[]>;
  projectStats(): Promise<ProjectStats[]>;
  usage(): Promise<UsageStats>;
  quickRun(projectId: string, text: string): Promise<{ ok: boolean; reason: string | null; sessionId?: string }>;
  quickHide(): void;
  quickOpenMain(): void;
  onQuickShown(cb: () => void): () => void;
  shortcut(): Promise<string | null>;
  setShortcut(accelerator: string): Promise<string | null>;
  setTitleBarColors(color: string, symbol: string): void;
  onFocusSession(cb: (sessionId: string, templateId: string) => void): () => void;
  hasHistory(accountId: string, cwd: string): Promise<boolean>;
  telemetry(): Promise<Telemetry[]>;
  onTelemetry(cb: (t: Telemetry) => void): () => void;
  setWatcher(projectId: string, cfg: WatcherConfig): void;
  watchers(): Promise<WatcherState[]>;
  onWatcher(cb: (w: WatcherState) => void): () => void;
  /** Sends /rename to a session's terminal; only when it is idle. */
  renameSession(sessionId: string, title: string): Promise<{ ok: boolean; reason: string | null }>;
  /** The renderer owns the workspace shape; main stores it as text. */
  loadWorkspace(): Promise<string | null>;
  saveWorkspace(json: string): void;
  onData(cb: (sessionId: string, data: string, endOffset: number) => void): () => void;
  onSession(cb: (s: SessionInfo) => void): () => void;
  onResources(cb: (r: ResourceSample) => void): () => void;
}

export interface AccountInfo { id: string; configDir: string; isDefault: boolean; loggedIn: boolean }

export type AgentState = 'starting' | 'idle' | 'busy' | 'waiting' | 'ended';
export interface Telemetry {
  sessionId: string;
  state: AgentState;
  model: string | null;
  /** Input side only, from the CLI status line; lags by up to one turn. */
  contextPercent: number | null;
  contextTokens: number | null;
  windowSize: number | null;
  /** The title the CLI itself reports, to catch name drift (spec 8.3.2). */
  sessionName: string | null;
  fiveHourPercent: number | null;
  sevenDayPercent: number | null;
  fiveHourResetsAt: number | null;
  costUsd: number | null;
  compactions: number;
  lastEventAt: string | null;
  waitingMessage: string | null;
}

export type WatcherDelivery = 'notify' | 'prime-when-idle';
export interface WatcherConfig { enabled: boolean; delivery: WatcherDelivery }
export interface WatcherState {
  projectId: string;
  command: string | null;
  status: 'off' | 'running' | 'restarting' | 'failed' | 'unconfigured';
  restarts: number;
  lines: { at: string; text: string; delivered: boolean }[];
  error: string | null;
}

export interface CreateOptions { accountId?: string | null }

export interface WebState { id: string; url: string; title: string; loading: boolean; error: string | null; accountId: string }

export interface ProjectStats {
  id: string;
  name: string;
  /** A data: URL of the project's own mark, read from its repository. */
  logo: string | null;
  commitsThisWeek: number;
  linesThisWeek: number;
  activeDays: number;
  lastCommitAt: string | null;
  lastSessionAt: string | null;
}

export interface UsageStats {
  computedAt: string;
  /** Minutes with agent activity, counted in ten minute windows across all sessions. */
  minutesWeek: number;
  minutesMonth: number;
  streakDays: number;
  perDay: { day: string; minutes: number }[];
  /** Minutes per local hour of day over the last 30 days. */
  perHour: number[];
  projects: { id: string; name: string; minutesWeek: number; minutesMonth: number; lastAt: string | null }[];
}
