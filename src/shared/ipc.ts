// The typed IPC contract between main and renderer. Every channel the renderer
// may use is listed here; the preload exposes nothing else (spec section 17).

export type SessionStatus = 'starting' | 'running' | 'exited' | 'error';

export interface TemplateInfo {
  id: string; // stable, ElysiumProd owned (spec 8.3.2)
  title: string;
  kind: 'shell' | 'claude';
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
} as const;

export interface ElysiumApi {
  templates(): Promise<TemplateInfo[]>;
  sessions(): Promise<SessionInfo[]>;
  create(templateId: string, cols: number, rows: number): Promise<CreateResult>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  kill(sessionId: string): Promise<void>;
  resources(): Promise<ResourceSample | null>;
  onData(cb: (sessionId: string, data: string) => void): () => void;
  onSession(cb: (s: SessionInfo) => void): () => void;
  onResources(cb: (r: ResourceSample) => void): () => void;
}
