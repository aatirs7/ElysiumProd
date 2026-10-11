// The only bridge between the sandboxed renderer and the main process.
// Exposes exactly the calls in ElysiumApi over the channels in Channels.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels, type ElysiumApi, type ResourceSample, type SessionInfo } from '@shared/ipc';

function subscribe<T extends unknown[]>(channel: string, cb: (...a: T) => void): () => void {
  const fn = (_e: IpcRendererEvent, ...a: unknown[]) => cb(...(a as T));
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

const api: ElysiumApi = {
  info: () => ipcRenderer.invoke(Channels.appInfo),
  templates: () => ipcRenderer.invoke(Channels.templatesList),
  sessions: () => ipcRenderer.invoke(Channels.sessionsList),
  create: (templateId, cols, rows) => ipcRenderer.invoke(Channels.sessionCreate, templateId, cols, rows),
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
  webAttach: (id) => ipcRenderer.send(Channels.webAttach, id),
  webBounds: (id, b, visible) => ipcRenderer.send(Channels.webBounds, id, b, visible),
  webDetach: (id) => ipcRenderer.send(Channels.webDetach, id),
  webNav: (id, action) => ipcRenderer.send(Channels.webNav, id, action),
  webHideAll: (hide) => ipcRenderer.send(Channels.webHideAll, hide),
  readClipboard: () => ipcRenderer.invoke(Channels.clipboardRead),
  loadWorkspace: () => ipcRenderer.invoke(Channels.workspaceGet),
  saveWorkspace: (json) => ipcRenderer.send(Channels.workspaceSet, json),
  onData: (cb) => subscribe<[string, string, number]>(Channels.sessionData, cb),
  onSession: (cb) => subscribe<[SessionInfo]>(Channels.sessionUpdate, cb),
  onResources: (cb) => subscribe<[ResourceSample]>(Channels.resourcesUpdate, cb),
};

contextBridge.exposeInMainWorld('elysium', api);
