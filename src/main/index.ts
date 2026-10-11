// ElysiumProd main process, Phase 1: one window, one terminal pane,
// SessionManager, scrollback with caps, the resource gate, clean shutdown.
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { Channels, type ResourceSample, type SessionInfo } from '@shared/ipc';
import { dataDir, scrollbackDir } from './paths';
import { Resources } from './resources';
import { enforceCaps } from './scrollback';
import { SessionManager } from './sessions';
import { templateInfo, templates } from './templates';
import { runSmoke } from './smoke';

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
    data: (id, d) => send(Channels.sessionData, id, d),
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
}

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  resources.stop();
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
