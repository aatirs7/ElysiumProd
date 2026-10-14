// ElysiumProd main process: the main window, the quick bar and tray, sessions,
// telemetry, watchers, background tasks, and everything they read.
import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import { appendFileSync, existsSync } from 'node:fs';
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
import { listProjects, projectGlance, readGit, readRelay, readTasks } from './projects';
import { pickDocument, readDocument } from './files';
import { endProgram, listProcessGroups } from './processes';
import { hasHistory, listAccounts } from './accounts';
import { Ingest } from './ingest';
import { projectStats } from './stats';
import { usageStats } from './usage';
import { Watchers } from './watchers';
import { Tasks } from './tasks';
import { Limits } from './limits';
import { createProject, loadCustomProjects, removeProject } from './newproject';
import { costReport } from './costs';
import { dialog } from 'electron';
import { endWatchers, findWatchers } from './chatwatch';
import { findTemplate } from './templates';
import { createQuickWindow, createTray, currentShortcut, disposeQuick, hideQuick, registerShortcut } from './quick';
import { flushWebSessions } from './webviews';
import { attachWeb, goWeb, detachWeb, hideAllWeb, navWeb, readClipboard, setWebBounds } from './webviews';

const SMOKE = process.argv.includes('--smoke');

// %APPDATA%\elysiumprod rather than Electron's default product-name folder.
app.setPath('userData', dataDir());
// Groups notifications under ElysiumProd in Windows.
app.setAppUserModelId('ElysiumProd');

// Two copies managing the same PTYs and files would be bad (spec 16).
// `--send <template id> <message>` from a second launch. Chromium adds and
// reorders switches in the argv the first copy sees, so the request travels
// in the lock's own data instead, read here before Chromium touches it.
function sendRequest(argv: string[]): { templateId: string; message: string } | null {
  const i = argv.indexOf('--send');
  if (i < 0) return null;
  const rest = argv.slice(i + 1).filter((x) => !x.startsWith('--'));
  return rest.length >= 2 ? { templateId: rest[0], message: rest.slice(1).join(' ') } : null;
}
if (!SMOKE && !app.requestSingleInstanceLock({ send: sendRequest(process.argv) })) app.quit();

let win: BrowserWindow | null = null;
const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
};

const resources = new Resources(dataDir(), (r: ResourceSample) => send(Channels.resourcesUpdate, r));
let tasks: Tasks | null = null;
const limits = new Limits((l) => send(Channels.limitsUpdate, l));
const ingest = new Ingest((t) => {
  send(Channels.telemetryUpdate, t);
  tasks?.onTelemetry(t);
  const acc = sessions.list().find((x) => x.id === t.sessionId)?.accountId;
  if (acc) limits.update(acc, t);
}, (id, e) => send(Channels.readerUpdate, id, e));
const sessions = new SessionManager(
  scrollbackDir(),
  {
    data: (id, d, end) => send(Channels.sessionData, id, d, end),
    update: (s: SessionInfo) => send(Channels.sessionUpdate, s),
  },
  () => resources.latest()?.refuseReason ?? null,
  (id) => ingest.register(id),
);

/** A watcher line goes into Prime only when Prime runs here and is idle. */
const watchers = new Watchers(
  (w) => send(Channels.watcherUpdate, w),
  (projectId, line) => {
    const s = sessions.runningFor(`${projectId}.prime`);
    if (!s || ingest.get(s.id)?.state !== 'idle') return false;
    sessions.write(s.id, `${line}\r`);
    return true;
  },
);

function resourcePath(name: string): string {
  return app.isPackaged ? join(process.resourcesPath, name) : join(app.getAppPath(), 'resources', name);
}
function appIcon(): string {
  return resourcePath(process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

/**
 * Windows takes a taskbar button's icon from the Start Menu shortcut that
 * carries the app's ID; without one it shows the program file's own icon,
 * which in development is Electron's. So ElysiumProd keeps a Start Menu
 * shortcut with its ID and the Elysium mark. It also gives you an
 * "ElysiumProd" entry to launch and pin.
 */
function ensureStartMenuShortcut(): void {
  if (process.platform !== 'win32') return;
  try {
    const lnk = join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ElysiumProd.lnk');
    const options = {
      target: process.execPath,
      args: app.isPackaged ? '' : `"${app.getAppPath()}"`,
      cwd: app.isPackaged ? undefined : app.getAppPath(),
      description: 'ElysiumProd',
      icon: resourcePath('icon.ico'),
      iconIndex: 0,
      appUserModelId: 'ElysiumProd',
    };
    shell.writeShortcutLink(lnk, existsSync(lnk) ? 'replace' : 'create', options);
  } catch { /* the window icon still applies */ }
}

function loadRenderer(w: BrowserWindow, hash = ''): void {
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash ? `#${hash}` : ''}`);
  else void w.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined);
}

/** Restart: the normal quit (sessions stop, cookies and layout saved), then start again. */
function restartApp(): void {
  app.relaunch();
  app.quit();
}

function showMain(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 500,
    backgroundColor: '#262624',
    title: 'ElysiumProd',
    // The Elysium mark in the taskbar, Alt+Tab and the window corner.
    icon: appIcon(),
    autoHideMenuBar: true,
    show: false,
    // The Windows 11 caption buttons float over the app's own top bar, so there
    // is no separate, old style title bar. The renderer recolours them per theme.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#262624', symbolColor: '#C3C1B8', height: 44 },
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
  // Closing the window keeps ElysiumProd in the tray, so agents and the quick bar keep working.
  w.on('close', (e) => {
    if (quitting || SMOKE) return;
    e.preventDefault();
    w.hide();
    // The first time only: say where it went, so closing never looks like a quit.
    const flag = join(dataDir(), 'tray-notice-shown');
    if (!existsSync(flag)) {
      try { appendFileSync(flag, new Date().toISOString()); } catch { /* shown again next time */ }
      if (Notification.isSupported()) new Notification({ title: 'ElysiumProd is still running', body: 'It keeps your sessions going in the tray. To load a new version, right-click the tray icon and choose Restart ElysiumProd, or use Settings.', icon: appIcon() }).show();
    }
  });
  loadRenderer(w);
  return w;
}

/** Whether a project's chat watcher is running, telling its watcher apart from other projects'. */
function chatWatch(projectId: string) {
  const pidsOf = (pred: (project: string | null | undefined) => boolean) => sessions.list()
    .filter((x) => x.status === 'running' && x.pid && pred(findTemplate(x.templateId)?.project))
    .map((x) => x.pid as number);
  return findWatchers(projectId, pidsOf((p) => p === projectId), pidsOf((p) => Boolean(p) && p !== projectId));
}

function registerIpc(): void {
  ipcMain.handle(Channels.appInfo, () => {
    const raw = userInfo().username || 'there';
    return { userName: raw.charAt(0).toUpperCase() + raw.slice(1), version: app.getVersion() };
  });
  ipcMain.handle(Channels.templatesList, () => templates.map(templateInfo));
  ipcMain.handle(Channels.sessionsList, () => sessions.list());
  ipcMain.handle(Channels.sessionCreate, (_e, templateId: unknown, cols: unknown, rows: unknown, opts: unknown) =>
    sessions.create(String(templateId), Number(cols) || 120, Number(rows) || 30, { accountId: typeof (opts as { accountId?: unknown })?.accountId === 'string' ? (opts as { accountId: string }).accountId : null }));
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
  ipcMain.on(Channels.webAttach, (_e, id: unknown, accountId: unknown, start: unknown, site: unknown) => {
    if (win && typeof id === 'string') attachWeb(win, id, typeof accountId === 'string' && /^[\w-]{1,40}$/.test(accountId) ? accountId : 'main', (s) => send(Channels.webState, s), typeof start === 'string' ? start : null, typeof site === 'string' && /^[\w-]{1,40}$/.test(site) ? site : null);
  });
  ipcMain.on(Channels.webGo, (_e, id: unknown, url: unknown) => { if (typeof id === 'string' && typeof url === 'string' && url.length < 2000) goWeb(id, url); });
  ipcMain.on(Channels.webBounds, (_e, id: unknown, b: unknown, visible: unknown) => {
    if (typeof id === 'string' && b && typeof b === 'object') setWebBounds(id, b as { x: number; y: number; width: number; height: number }, Boolean(visible));
  });
  ipcMain.on(Channels.webDetach, (_e, id: unknown) => { if (typeof id === 'string') detachWeb(win, id); });
  ipcMain.on(Channels.webNav, (_e, id: unknown, action: unknown) => {
    if (typeof id === 'string' && (action === 'back' || action === 'forward' || action === 'reload' || action === 'home' || action === 'external')) navWeb(id, action);
  });
  ipcMain.on(Channels.webHideAll, (_e, hide: unknown) => hideAllWeb(Boolean(hide)));
  ipcMain.handle(Channels.clipboardRead, () => readClipboard());
  ipcMain.handle(Channels.accountsList, () => listAccounts());
  ipcMain.handle(Channels.projectStats, () => projectStats());
  ipcMain.handle(Channels.usageStats, () => usageStats());
  ipcMain.handle(Channels.projectGlance, (_e, id: unknown) => projectGlance(String(id)));
  ipcMain.handle(Channels.wrapUp, (_e, projectId: unknown) => (typeof projectId === 'string' && tasks ? tasks.wrapUp(projectId) : []));
  ipcMain.handle(Channels.limitsAll, () => limits.all());
  ipcMain.handle(Channels.costsGet, (_e, force: unknown) => costReport(Boolean(force)));
  ipcMain.handle(Channels.projectCreate, async (_e, req: unknown) => {
    const r = await createProject((req ?? {}) as Parameters<typeof createProject>[0]);
    if (r.ok) send(Channels.projectsChanged);
    return r;
  });
  ipcMain.handle(Channels.projectRemove, (_e, id: unknown) => {
    if (typeof id !== 'string' || sessions.list().some((s) => s.status === 'running' && s.templateId.startsWith(`${id}.`))) return false;
    const ok = removeProject(id);
    if (ok) send(Channels.projectsChanged);
    return ok;
  });
  ipcMain.handle(Channels.folderPick, async () => {
    const r = win ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }) : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0] ?? null;
  });
  ipcMain.handle(Channels.compact, (_e, ids: unknown) => (Array.isArray(ids) && tasks ? tasks.compact(ids.filter((x): x is string => typeof x === 'string')) : []));
  ipcMain.handle(Channels.chatWatchGet, (_e, projectId: unknown) => chatWatch(String(projectId)));
  ipcMain.handle(Channels.chatWatchSet, async (_e, projectId: unknown, on: unknown) => {
    const id = String(projectId);
    const w = await chatWatch(id);
    if (!w.available) return { ok: false, reason: 'This project has no chat watcher.' };
    const told = tasks ? tasks.chatWatchMessage(id, Boolean(on)) : 0;
    if (on) return told ? { ok: true, reason: null } : { ok: false, reason: 'Start Prime first; the watcher runs inside its session.' };
    // Give the session a moment to read "do not start it again" before its watcher ends.
    await new Promise((r) => setTimeout(r, 3000));
    await endWatchers(id, w.pids);
    return { ok: true, reason: null };
  });
  ipcMain.on(Channels.notifyOs, (_e, sessionId: unknown, title: unknown, body: unknown) => {
    if (typeof sessionId === 'string' && typeof title === 'string' && typeof body === 'string') tasks?.notify(sessionId, title.slice(0, 120), body.slice(0, 300));
  });
  ipcMain.handle(Channels.readerGet, (_e, id: unknown) => (typeof id === 'string' ? ingest.reader(id) : []));
  ipcMain.handle(Channels.historyCheck, (_e, accountId: unknown, cwd: unknown) => hasHistory(String(accountId), String(cwd)));
  ipcMain.handle(Channels.telemetryAll, () => ingest.all());
  ipcMain.handle(Channels.watchersAll, () => watchers.all());
  ipcMain.on(Channels.watcherSet, (_e, projectId: unknown, cfg: unknown) => {
    const c = cfg as { enabled?: unknown; delivery?: unknown };
    if (typeof projectId === 'string') watchers.set(projectId, { enabled: Boolean(c?.enabled), delivery: c?.delivery === 'prime-when-idle' ? 'prime-when-idle' : 'notify' });
  });
  ipcMain.handle(Channels.sessionRename, (_e, id: unknown, title: unknown) => {
    if (typeof id !== 'string' || typeof title !== 'string' || !/^[\w .-]{1,60}$/.test(title)) return { ok: false, reason: 'Unexpected name' };
    const t = ingest.get(id);
    if (!t || t.state !== 'idle') return { ok: false, reason: 'The session is busy. Try again when its turn ends.' };
    sessions.write(id, `/rename ${title}\r`);
    return { ok: true, reason: null };
  });
  ipcMain.handle(Channels.docRead, (_e, path: unknown) => readDocument(String(path)));
  ipcMain.on(Channels.openExternal, (_e, url: unknown) => {
    // Only web links leave the app, and only to the system browser (spec 17).
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url);
  });
  ipcMain.handle(Channels.quickRun, (_e, projectId: unknown, text: unknown) => {
    const r = tasks!.run(String(projectId), String(text ?? '').slice(0, 20000));
    if (r.ok) hideQuick();
    return r;
  });
  ipcMain.on(Channels.quickHide, () => hideQuick());
  ipcMain.on(Channels.appRestart, () => restartApp());
  ipcMain.on(Channels.quickOpenMain, () => { hideQuick(); showMain(); });
  ipcMain.handle(Channels.shortcutGet, () => currentShortcut());
  ipcMain.handle(Channels.shortcutSet, (_e, acc: unknown) => registerShortcut(typeof acc === 'string' ? acc : undefined));
  ipcMain.on(Channels.titleBarColors, (_e, color: unknown, symbol: unknown) => {
    const hex = /^#[0-9a-f]{6}$/i;
    if (win && typeof color === 'string' && typeof symbol === 'string' && hex.test(color) && hex.test(symbol)) {
      try { win.setTitleBarOverlay({ color, symbolColor: symbol, height: 44 }); } catch { /* not supported */ }
    }
  });
  ipcMain.on(Channels.workspaceSet, (_e, json: unknown) => { if (typeof json === 'string') saveWorkspace(json); });
}

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  resources.stop();
  watchers.stopAll();
  ingest.stop();
  disposeQuick();
  try { flushWorkspace(); } catch { /* never block quit */ }
  void Promise.all([sessions.shutdown(), flushWebSessions()]).finally(() => app.exit(0));
});

/**
 * A second launch hands its arguments here. `--send <template id> <message>`
 * gives a session a message in the background, exactly like a quick task;
 * anything else just shows the window.
 */
app.on('second-instance', (_e, argv, _cwd, data) => {
  const req = (data as { send?: { templateId: string; message: string } | null } | undefined)?.send ?? sendRequest(argv);
  if (req && tasks) {
    const r = tasks.runTemplate(req.templateId, req.message);
    try { appendFileSync(join(dataDir(), 'send.log'), `${new Date().toISOString()} ${req.templateId} ${r.ok ? 'ok' : r.reason}
`); } catch { /* log is optional */ }
    return;
  }
  showMain();
});

// With the tray, closing the window does not quit; only Quit from the tray or the app does.
app.on('window-all-closed', () => { if (SMOKE) app.quit(); });

// Projects made in the app join the table before anything reads it.
loadCustomProjects();

app.whenReady().then(async () => {
  try { enforceCaps(scrollbackDir()); } catch { /* never block startup on cleanup */ }
  registerIpc();
  await resources.start();
  await ingest.start();
  if (!SMOKE) ensureStartMenuShortcut();
  win = createWindow();
  tasks = new Tasks(sessions, ingest, (sessionId, templateId) => { showMain(); send(Channels.focusSession, sessionId, templateId); }, (c) => send(Channels.compactUpdate, c));
  if (!SMOKE) {
    createQuickWindow(loadRenderer);
    registerShortcut();
    createTray(showMain, () => app.quit(), restartApp);
  }
  if (SMOKE) void runSmoke({ win, sessions, resources });
});
