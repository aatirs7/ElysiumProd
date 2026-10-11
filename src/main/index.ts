// ElysiumProd main process, Phase 1: one window, one terminal pane,
// SessionManager, scrollback with caps, the resource gate, clean shutdown.
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { Channels, type ResourceSample, type SessionInfo } from '@shared/ipc';
import { dataDir, scrollbackDir } from './paths';
import { Resources } from './resources';
import { enforceCaps } from './scrollback';
import { SessionManager } from './sessions';
import { templateInfo, templates } from './templates';
import { runSmoke } from './smoke';
import { flushWorkspace, loadWorkspace, saveWorkspace } from './workspace';
import { listProjects, readGit, readRelay, readTasks } from './projects';
import { pickDocument, readDocument } from './files';
import { endProgram, listProcessGroups } from './processes';
import { attachWeb, detachWeb, hideAllWeb, navWeb, readClipboard, setWebBounds } from './webviews';

const SMOKE = process.argv.includes('--smoke');

// %APPDATA%\elysiumprod rather than Electron's default product-name folder.
app.setPath('userData', dataDir());

// Two copies managing the same PTYs and files would be bad (spec 16).
if (!SMOKE && !app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

const resources = new Resources(dataDir(), (r: ResourceSample) => send(Channels.resourcesUpdate, r));
const sessions = new SessionManager(
  scrollbackDir(),
  {
    data: (id, d, end) => send(Channels.sessionData, id, d, end),
    update: (s: SessionInfo) => send(Channels.sessionUpdate, s),
  },
  () => resources.latest()?.refuseReason ?? null,
);

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#0E1116',
    title: 'ElysiumProd',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Terminals must keep rendering and animating while the window is in the background.
      backgroundThrottling: false,
    },
  });
  w.once('ready-to-show', () => w.show());
  // No remote content and no new windows (spec 17).
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void w.loadFile(join(__dirname, '../renderer/index.html'));
  return w;
}

function registerIpc(): void {
  ipcMain.handle(Channels.appInfo, () => {
    const raw = userInfo().username || 'there';
    return { userName: raw.charAt(0).toUpperCase() + raw.slice(1), version: app.getVersion() };
  });
  ipcMain.handle(Channels.templatesList, () => templates.map(templateInfo));
  ipcMain.handle(Channels.sessionsList, () => sessions.list());
  ipcMain.handle(Channels.sessionCreate, (_e, templateId: unknown, cols: unknown, rows: unknown) =>
    sessions.create(String(templateId), Number(cols) || 120, Number(rows) || 30));
  ipcMain.on(Channels.sessionWrite, (_e, id: unknown, data: unknown) => {
    if (typeof id === 'string' && typeof data === 'string') sessions.write(id, data);
  });
  ipcMain.on(Channels.sessionResize, (_e, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id === 'string') sessions.resize(id, Number(cols), Number(rows));
  });
  ipcMain.handle(Channels.sessionKill, (_e, id: unknown) => { if (typeof id === 'string') sessions.kill(id); });
  ipcMain.handle(Channels.resourcesGet, () => resources.latest());
  ipcMain.handle(Channels.sessionReplay, (_e, id: unknown) => (typeof id === 'string' ? sessions.replay(id) : null));
  ipcMain.handle(Channels.workspaceGet, () => loadWorkspace());
  ipcMain.handle(Channels.projectsList, () => listProjects());
  ipcMain.handle(Channels.relayRead, (_e, id: unknown) => readRelay(String(id)));
  ipcMain.handle(Channels.tasksRead, (_e, id: unknown) => readTasks(String(id)));
  ipcMain.handle(Channels.gitRead, (_e, id: unknown) => readGit(String(id)));
  ipcMain.handle(Channels.docPick, () => pickDocument(win));
  ipcMain.handle(Channels.procList, () => listProcessGroups());
  ipcMain.handle(Channels.procEnd, (_e, name: unknown) => endProgram(String(name)));
  ipcMain.on(Channels.webAttach, (_e, id: unknown) => { if (win && typeof id === 'string') attachWeb(win, id); });
  ipcMain.on(Channels.webBounds, (_e, id: unknown, b: unknown, visible: unknown) => {
    if (typeof id === 'string' && b && typeof b === 'object') setWebBounds(id, b as { x: number; y: number; width: number; height: number }, Boolean(visible));
  });
  ipcMain.on(Channels.webDetach, (_e, id: unknown) => { if (typeof id === 'string') detachWeb(win, id); });
  ipcMain.on(Channels.webNav, (_e, id: unknown, action: unknown) => {
    if (typeof id === 'string' && (action === 'back' || action === 'forward' || action === 'reload' || action === 'home')) navWeb(id, action);
  });
  ipcMain.on(Channels.webHideAll, (_e, hide: unknown) => hideAllWeb(Boolean(hide)));
  ipcMain.handle(Channels.clipboardRead, () => readClipboard());
  ipcMain.handle(Channels.docRead, (_e, path: unknown) => readDocument(String(path)));
  ipcMain.on(Channels.openExternal, (_e, url: unknown) => {
    // Only web links leave the app, and only to the system browser (spec 17).
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url);
  });
  ipcMain.on(Channels.workspaceSet, (_e, json: unknown) => { if (typeof json === 'string') saveWorkspace(json); });
}

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  resources.stop();
  try { flushWorkspace(); } catch { /* never block quit */ }
  void sessions.shutdown().finally(() => app.exit(0));
});

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  try { enforceCaps(scrollbackDir()); } catch { /* never block startup on cleanup */ }
  registerIpc();
  await resources.start();
  win = createWindow();
  if (SMOKE) void runSmoke({ win, sessions, resources });
});
