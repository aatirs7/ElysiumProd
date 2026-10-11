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
  templates: () => ipcRenderer.invoke(Channels.templatesList),
  sessions: () => ipcRenderer.invoke(Channels.sessionsList),
  create: (templateId, cols, rows) => ipcRenderer.invoke(Channels.sessionCreate, templateId, cols, rows),
  write: (id, data) => ipcRenderer.send(Channels.sessionWrite, id, data),
  resize: (id, cols, rows) => ipcRenderer.send(Channels.sessionResize, id, cols, rows),
  kill: (id) => ipcRenderer.invoke(Channels.sessionKill, id),
  resources: () => ipcRenderer.invoke(Channels.resourcesGet),
  onData: (cb) => subscribe<[string, string]>(Channels.sessionData, cb),
  onSession: (cb) => subscribe<[SessionInfo]>(Channels.sessionUpdate, cb),
  onResources: (cb) => subscribe<[ResourceSample]>(Channels.resourcesUpdate, cb),
};

contextBridge.exposeInMainWorld('elysium', api);
