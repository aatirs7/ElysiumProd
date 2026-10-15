// The typed IPC contract between main and renderer. Every channel the renderer
// may use is listed here; the preload exposes nothing else (spec section 17).

export type SessionStatus = 'starting' | 'running' | 'exited' | 'error';

export interface TemplateInfo {
  id: string; // stable, ElysiumProd owned (spec 8.3.2)
  title: string;
  /** agent: another coding agent's CLI (Codex, Gemini CLI), run in a terminal like a shell. */
  kind: 'shell' | 'claude' | 'agent';
  project: string | null;
  projectName: string | null;
  role: 'prime' | 'meridian' | 'solo' | 'agent';
  /** Which agent, for kind agent. */
  agent?: string;
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
  ramFreeBytes: number;
  ramTotalBytes: number;
  diskFreeBytes: number | null;
  diskPath: string;
  ramLevel: Level;
  diskLevel: Level;
  /** Why new sessions are refused right now, or null when they are allowed. */
  refuseReason: string | null;
}

export type CreateResult = { ok: true; session: SessionInfo } | { ok: false; reason: string; /** Refused only for low memory or disk; Start anyway overrides it. */ lowResources?: boolean };

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
  appRestart: 'app:restart',
  quickOpenMain: 'quick:open-main',
  quickShown: 'quick:shown',
  shortcutGet: 'shortcut:get',
  shortcutSet: 'shortcut:set',
  titleBarColors: 'titlebar:colors',
  focusSession: 'focus:session',
  usageStats: 'usage:stats',
  readerGet: 'reader:get',
  wrapUp: 'project:wrap-up',
  projectGlance: 'project:glance',
  readerUpdate: 'reader:update',
  clipboardRead: 'clipboard:read',
  limitsAll: 'limits:all',
  limitsUpdate: 'limits:update',
  compact: 'session:compact',
  compactUpdate: 'compact:update',
  chatWatchGet: 'chatwatch:get',
  chatWatchSet: 'chatwatch:set',
  notifyOs: 'notify:os',
  projectCreate: 'project:create',
  projectRemove: 'project:remove',
  folderPick: 'folder:pick',
  projectsChanged: 'projects:changed',
  costsGet: 'costs:get',
  webGo: 'web:go',
  flowGet: 'flow:get',
  flowUpdate: 'flow:update',
  flowSummary: 'flow:summary',
  commandRun: 'command:run',
  projectAction: 'project:action',
  homeDir: 'app:home-dir',
  filesList: 'files:list',
  filesRead: 'files:read',
  filesReveal: 'files:reveal',
  newsGet: 'news:get',
  updatesCheck: 'updates:check',
  updatesApply: 'updates:apply',
  updatesProgress: 'updates:progress',
  updatesFinish: 'updates:finish',
  readerAsk: 'reader:ask',
  tokenStats: 'usage:tokens',
  chatGet: 'chat:get',
  chatSend: 'chat:send',
  chatStop: 'chat:stop',
  chatReset: 'chat:reset',
  chatUpdate: 'chat:update',
  connections: 'connect:status',
  connect: 'connect:run',
  addClaudeAccount: 'connect:add-claude',
  scanRepos: 'connect:scan-repos',
  openFolder: 'project:open-folder',
  dictate: 'dictate:start',
  clipboardHasImage: 'clipboard:has-image',
} as const;

export interface ProcGroup { name: string; pids: number[]; bytes: number; windowTitle: string | null; protected: boolean; agentHost: boolean }

export interface ChatMessage { id: string; role: 'you' | 'claude'; text: string; at: string; steps: FlowEvent[]; costUsd?: number }
export interface ChatState { id: string; conversationId: string | null; messages: ChatMessage[]; running: boolean; error: string | null }
export interface ChatEvent { chatId: string; state: ChatState; finished?: boolean }
/** The built in ones, the extra integrations (aws, supabase, ...) and custom:<id> for your own. */
export type ConnectService = string;
export interface ConnectStatus {
  id: ConnectService; name: string; what: string; installed: boolean; signedIn: boolean; who: string | null; required: boolean;
  /** core: shown first; more: the extra integrations; custom: added by you. */
  group?: 'core' | 'more' | 'custom';
  accounts?: { id: string; configDir: string; signedIn: boolean }[];
}
export interface FileEntry { name: string; path: string; dir: boolean; dim: boolean }
export interface FileText { ok: boolean; error: string | null; text: string; size: number; binary: boolean }
export interface NewsItem { title: string; url: string; source: string; at: string | null; points?: number }
/** A tool you added yourself: a command that succeeds when you are signed in, and one that signs you in. */
export interface CustomTool { id: string; name: string; check: string; signin: string }
export interface RepoCandidate { folder: string; name: string; touchedAt: string }
export interface ProjectExtras { links?: { id: string; label: string; url: string }[]; people?: string[]; open?: string; checkWhat?: string }
export interface ProjectInfo { id: string; name: string; folder: string; repo: string | null; tier: 'main' | 'side'; hasRelay: boolean; waitingHeading: string; exists: boolean; custom: boolean; extras: ProjectExtras | null; builtin: boolean }

export interface NewProjectRequest {
  mode: 'clone' | 'new' | 'existing';
  name: string;
  /** clone: a repository address or owner/repo. */
  url?: string;
  /** clone and new: the folder the project folder goes in. */
  parent?: string;
  folderName?: string;
  /** existing: the folder itself. */
  folder?: string;
  sessions: 'pair' | 'solo';
  /** new: also make a repository on GitHub. */
  github?: 'none' | 'private' | 'public';
}
export interface NewProjectResult { ok: boolean; reason: string | null; projectId?: string }
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
  /** Opens claude.ai in a pane on an account, at the project's pinned chat if it has one. */
  webAttach(id: string, accountId: string, startUrl?: string | null, site?: string | null): void;
  /** A site pane goes to a typed address. */
  webGo(id: string, url: string): void;
  onWebState(cb: (s: WebState) => void): () => void;
  webBounds(id: string, bounds: { x: number; y: number; width: number; height: number }, visible: boolean): void;
  webDetach(id: string): void;
  webNav(id: string, action: 'back' | 'forward' | 'reload' | 'home' | 'external'): void;
  webHideAll(hide: boolean): void;
  readClipboard(): Promise<string>;
  accounts(): Promise<AccountInfo[]>;
  projectStats(): Promise<ProjectStats[]>;
  usage(): Promise<UsageStats>;
  /** Turns seen since this session started in ElysiumProd, for the Reader view. Memory only. */
  reader(sessionId: string): Promise<ReaderEntry[]>;
  /** Asks every Claude session of a project to reach a stopping point, then exits each. Returns their ids. */
  wrapUp(projectId: string): Promise<string[]>;
  glance(projectId: string): Promise<{ awsTotal: number | null; awsCap: number | null; waiting: number | null }>;
  onReader(cb: (sessionId: string, e: ReaderEntry) => void): () => void;
  quickRun(projectId: string, text: string): Promise<{ ok: boolean; reason: string | null; sessionId?: string }>;
  quickHide(): void;
  /** Quits normally and starts again: running sessions stop and can be resumed. */
  restartApp(): void;
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
  /** Last known Claude plan limits per account, kept across restarts. */
  limits(): Promise<AccountLimits[]>;
  onLimits(cb: (l: AccountLimits) => void): () => void;
  /** Asks each session to reach a clean stopping point, then runs /compact. Returns the sessions started. */
  compact(sessionIds: string[]): Promise<string[]>;
  onCompact(cb: (c: CompactState) => void): () => void;
  chatWatch(projectId: string): Promise<ChatWatch>;
  setChatWatch(projectId: string, on: boolean): Promise<{ ok: boolean; reason: string | null }>;
  /** A Windows notification that opens the session when clicked. */
  notifyOs(sessionId: string, title: string, body: string): void;
  createProject(req: NewProjectRequest): Promise<NewProjectResult>;
  /** Takes a project made in the app out of the list; its folder is left alone. */
  removeProject(id: string): Promise<boolean>;
  pickFolder(): Promise<string | null>;
  onProjectsChanged(cb: () => void): () => void;
  /** Costs across Vercel, Neon and AWS; cached for an hour unless forced. */
  costs(force?: boolean): Promise<CostReport>;
  /** What a session has been doing: tool steps with short labels, memory only. */
  flow(sessionId: string): Promise<FlowState>;
  onFlow(cb: (sessionId: string, e: FlowEvent) => void): () => void;
  /** A one or two line summary from Sonnet, at most every few minutes per session. */
  flowSummary(sessionId: string): Promise<{ text: string | null; at: string | null; reason: string | null }>;
  /** The Home command box: tell, start, stop, compact or open any project or session. */
  runCommand(text: string): Promise<CommandResult>;
  projectAction(projectId: string, type: 'start' | 'stop' | 'kill' | 'compact'): Promise<CommandResult>;
  openFolder(projectId: string): void;
  homeDir(): Promise<string>;
  listDir(projectId: string, rel: string, showHidden?: boolean): Promise<FileEntry[]>;
  readProjectFile(projectId: string, rel: string): Promise<FileText>;
  revealProjectFile(projectId: string, rel: string, how: 'explorer' | 'vscode'): void;
  news(force?: boolean): Promise<{ items: NewsItem[]; at: string }>;
  checkUpdates(): Promise<UpdateInfo>;
  applyUpdate(): Promise<{ ok: boolean; reason: string | null; restartToInstall?: boolean }>;
  /** Restart that also installs an update's new parts. */
  finishUpdate(): void;
  onUpdateProgress(cb: (step: string) => void): () => void;
  readerAsk(sessionId: string, text: string): void;
  tokens(): Promise<TokenStats>;
  chatGet(chatId: string): Promise<ChatState>;
  chatSend(chatId: string, text: string): Promise<{ ok: boolean; reason: string | null }>;
  chatStop(chatId: string): void;
  chatReset(chatId: string): Promise<ChatState>;
  onChat(cb: (e: ChatEvent) => void): () => void;
  connections(): Promise<ConnectStatus[]>;
  connect(service: ConnectService, action: 'install' | 'signin', accountId?: string): Promise<{ ok: boolean; reason: string | null }>;
  addClaudeAccount(name: string): Promise<{ ok: boolean; reason: string | null; accountId?: string }>;
  scanRepos(): Promise<RepoCandidate[]>;
  /** Opens Windows voice typing (Win+H) for the focused text box. */
  dictate(): void;
  clipboardHasImage(): Promise<boolean>;
}

export interface CommandStep { label: string; ok: boolean; reason: string | null }
export interface CommandResult { ok: boolean; via: 'rules' | 'sonnet'; say: string | null; steps: CommandStep[]; open: string | null }

export type FlowKind = 'edit' | 'read' | 'run' | 'search' | 'web' | 'agent' | 'message' | 'ask' | 'other';
export interface FlowEvent { at: string; kind: FlowKind; tool: string; label: string; to?: string }
export interface FlowState { events: FlowEvent[]; summary: { text: string; at: string } | null }

export interface CostLine { name: string; cost: number; value: number }
export interface CostItem {
  provider: 'vercel' | 'neon' | 'aws';
  /** Stable across refreshes, for linking an item to a project by hand. */
  key: string;
  name: string;
  /** What is billed this period, in USD. */
  cost: number;
  /** The usage's list price before plan credits; equal to cost where there are none. */
  value: number;
  /** True where the dollars are worked out from usage rather than read from a bill. */
  estimate: boolean;
  projectId: string | null;
  services: CostLine[];
  note: string | null;
}
export interface CostReport {
  computedAt: string;
  /** An older report, shown while a new one is fetched. */
  refreshing?: boolean;
  period: { from: string; to: string };
  items: CostItem[];
  lastMonth: { vercel: number | null; vercelValue: number | null };
  errors: { vercel: string | null; neon: string | null; aws: string | null };
  neonRates: { cuHour: number; gbMonth: number };
  /** The Vercel team the figures are for, for links to its projects. */
  vercelTeam: string | null;
}

export interface AccountLimits { accountId: string; fiveHourPercent: number | null; sevenDayPercent: number | null; fiveHourResetsAt: number | null; sevenDayResetsAt: number | null; at: string }

export interface CompactState { sessionId: string; stage: 'asked' | 'stopping' | 'compacting' | 'resuming' | 'done' | 'failed'; auto: boolean; note: string | null }

export interface ChatWatch { available: boolean; running: boolean; pids: number[]; script: string | null }

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
  sevenDayResetsAt: number | null;
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

export interface CreateOptions { accountId?: string | null; /** Start even though memory or disk is low. */ override?: boolean }

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

/** An installed copy: how far behind the published version it is, and how many changes of its own it has. */
export interface UpdateInfo { managed: boolean; behind: number; changes: string[]; mine: number; error: string | null }
export interface TokenSplit { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface TokenStats {
  computedAt: string;
  totals: { week: TokenSplit; month: TokenSplit };
  perDay: ({ day: string } & TokenSplit)[];
  projects: { id: string; name: string; week: number; month: number }[];
  models: { id: string; name: string; week: number; month: number }[];
  accounts: { id: string; name: string; week: number; month: number }[];
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

export interface ReaderEntry { at: string; role: 'you' | 'claude'; text: string }
