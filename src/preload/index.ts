// The only bridge between the sandboxed renderer and the main process.
// Exposes exactly the calls in ElysiumApi over the channels in Channels.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels, type AccountLimits, type CompactState, type ElysiumApi, type ResourceSample, type SessionInfo, type ReaderEntry, type Telemetry, type WatcherState, type WebState } from '@shared/ipc';

function subscribe<T extends unknown[]>(channel: string, cb: (...a: T) => void): () => void {
  const fn = (_e: IpcRendererEvent, ...a: unknown[]) => cb(...(a as T));
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

const api: ElysiumApi = {
  info: () => ipcRenderer.invoke(Channels.appInfo),
  templates: () => ipcRenderer.invoke(Channels.templatesList),
  sessions: () => ipcRenderer.invoke(Channels.sessionsList),
  create: (templateId, cols, rows, opts) => ipcRenderer.invoke(Channels.sessionCreate, templateId, cols, rows, opts ?? {}),
  write: (id, data) => ipcRenderer.send(Channels.sessionWrite, id, data),
  resize: (id, cols, rows) => ipcRenderer.send(Channels.sessionResize, id, cols, rows),
  kill: (id) => ipcRenderer.invoke(Channels.sessionKill, id),
  resources: () => ipcRenderer.invoke(Channels.resourcesGet),
  replay: (id) => ipcRenderer.invoke(Channels.sessionReplay, id),
  projects: () => ipcRenderer.invoke(Channels.projectsList),
  relay: (id) => ipcRenderer.invoke(Channels.relayRead, id),
  tasks: (id) => ipcRenderer.invoke(Channels.tasksRead, id),
  git: (id) => ipcRenderer.invoke(Channels.gitRead, id),
  pickDocument: () => ipcRenderer.invoke(Channels.docPick),
  readDocument: (path) => ipcRenderer.invoke(Channels.docRead, path),
  openExternal: (url) => ipcRenderer.send(Channels.openExternal, url),
  processes: () => ipcRenderer.invoke(Channels.procList),
  endProgram: (name) => ipcRenderer.invoke(Channels.procEnd, name),
  webAttach: (id, accountId, startUrl) => ipcRenderer.send(Channels.webAttach, id, accountId, startUrl ?? null),
  onWebState: (cb) => subscribe<[WebState]>(Channels.webState, cb),
  webBounds: (id, b, visible) => ipcRenderer.send(Channels.webBounds, id, b, visible),
  webDetach: (id) => ipcRenderer.send(Channels.webDetach, id),
  webNav: (id, action) => ipcRenderer.send(Channels.webNav, id, action),
  webHideAll: (hide) => ipcRenderer.send(Channels.webHideAll, hide),
  readClipboard: () => ipcRenderer.invoke(Channels.clipboardRead),
  accounts: () => ipcRenderer.invoke(Channels.accountsList),
  projectStats: () => ipcRenderer.invoke(Channels.projectStats),
  usage: () => ipcRenderer.invoke(Channels.usageStats),
  reader: (id) => ipcRenderer.invoke(Channels.readerGet, id),
  wrapUp: (projectId) => ipcRenderer.invoke(Channels.wrapUp, projectId),
  glance: (projectId) => ipcRenderer.invoke(Channels.projectGlance, projectId),
  onReader: (cb) => subscribe<[string, ReaderEntry]>(Channels.readerUpdate, cb),
  quickRun: (projectId, text) => ipcRenderer.invoke(Channels.quickRun, projectId, text),
  quickHide: () => ipcRenderer.send(Channels.quickHide),
  restartApp: () => ipcRenderer.send(Channels.appRestart),
  quickOpenMain: () => ipcRenderer.send(Channels.quickOpenMain),
  onQuickShown: (cb) => subscribe<[]>(Channels.quickShown, cb),
  shortcut: () => ipcRenderer.invoke(Channels.shortcutGet),
  setShortcut: (acc) => ipcRenderer.invoke(Channels.shortcutSet, acc),
  setTitleBarColors: (color, symbol) => ipcRenderer.send(Channels.titleBarColors, color, symbol),
  onFocusSession: (cb) => subscribe<[string, string]>(Channels.focusSession, cb),
  hasHistory: (accountId, cwd) => ipcRenderer.invoke(Channels.historyCheck, accountId, cwd),
  telemetry: () => ipcRenderer.invoke(Channels.telemetryAll),
  onTelemetry: (cb) => subscribe<[Telemetry]>(Channels.telemetryUpdate, cb),
  setWatcher: (projectId, cfg) => ipcRenderer.send(Channels.watcherSet, projectId, cfg),
  watchers: () => ipcRenderer.invoke(Channels.watchersAll),
  onWatcher: (cb) => subscribe<[WatcherState]>(Channels.watcherUpdate, cb),
  renameSession: (id, title) => ipcRenderer.invoke(Channels.sessionRename, id, title),
  limits: () => ipcRenderer.invoke(Channels.limitsAll),
  onLimits: (cb) => subscribe<[AccountLimits]>(Channels.limitsUpdate, cb),
  compact: (ids) => ipcRenderer.invoke(Channels.compact, ids),
  onCompact: (cb) => subscribe<[CompactState]>(Channels.compactUpdate, cb),
  chatWatch: (projectId) => ipcRenderer.invoke(Channels.chatWatchGet, projectId),
  setChatWatch: (projectId, on) => ipcRenderer.invoke(Channels.chatWatchSet, projectId, on),
  notifyOs: (sessionId, title, body) => ipcRenderer.send(Channels.notifyOs, sessionId, title, body),
  createProject: (req) => ipcRenderer.invoke(Channels.projectCreate, req),
  removeProject: (id) => ipcRenderer.invoke(Channels.projectRemove, id),
  pickFolder: () => ipcRenderer.invoke(Channels.folderPick),
  onProjectsChanged: (cb) => subscribe<[]>(Channels.projectsChanged, cb),
  loadWorkspace: () => ipcRenderer.invoke(Channels.workspaceGet),
  saveWorkspace: (json) => ipcRenderer.send(Channels.workspaceSet, json),
  onData: (cb) => subscribe<[string, string, number]>(Channels.sessionData, cb),
  onSession: (cb) => subscribe<[SessionInfo]>(Channels.sessionUpdate, cb),
  onResources: (cb) => subscribe<[ResourceSample]>(Channels.resourcesUpdate, cb),
};

contextBridge.exposeInMainWorld('elysium', api);
