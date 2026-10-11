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
  clipboardRead: 'clipboard:read',
} as const;

export interface ProcGroup { name: string; pids: number[]; bytes: number; windowTitle: string | null; protected: boolean; agentHost: boolean }

export interface ProjectInfo { id: string; name: string; folder: string; repo: string | null; waitingHeading: string; exists: boolean }
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
  create(templateId: string, cols: number, rows: number): Promise<CreateResult>;
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
  webAttach(id: string): void;
  webBounds(id: string, bounds: { x: number; y: number; width: number; height: number }, visible: boolean): void;
  webDetach(id: string): void;
  webNav(id: string, action: 'back' | 'forward' | 'reload' | 'home'): void;
  webHideAll(hide: boolean): void;
  readClipboard(): Promise<string>;
  /** The renderer owns the workspace shape; main stores it as text. */
  loadWorkspace(): Promise<string | null>;
  saveWorkspace(json: string): void;
  onData(cb: (sessionId: string, data: string, endOffset: number) => void): () => void;
  onSession(cb: (s: SessionInfo) => void): () => void;
  onResources(cb: (r: ResourceSample) => void): () => void;
}
