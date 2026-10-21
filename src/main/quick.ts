// The quick bar: a small search window summoned from anywhere with a global
// shortcut (Alt+Space by default, like PowerToys Run), plus the tray icon that
// keeps ElysiumProd running in the background when its window is closed.
import { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray } from 'electron';
import { join } from 'node:path';

let quick: BrowserWindow | null = null;
let tray: Tray | null = null;
let registered: string | null = null;

export const SHORTCUT_CANDIDATES = ['Control+Alt+Space', 'Alt+Space', 'Control+Shift+Space'];

function trayIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'resources', 'tray.png');
}

export function createQuickWindow(loadRenderer: (w: BrowserWindow, hash: string) => void): BrowserWindow {
  quick = new BrowserWindow({
    width: 640, height: 420, show: false, frame: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, transparent: true, backgroundColor: '#00000000', hasShadow: true, roundedCorners: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  quick.on('blur', () => quick?.hide());
  quick.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  quick.webContents.on('will-navigate', (e) => e.preventDefault());
  loadRenderer(quick, 'quick');
  return quick;
}

export function toggleQuick(): void {
  if (!quick) return;
  if (quick.isVisible()) { quick.hide(); return; }
  // Centre on the screen under the cursor, a third of the way down, like a launcher.
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  quick.setBounds({ x: Math.round(d.x + (d.width - 640) / 2), y: Math.round(d.y + d.height * 0.22), width: 640, height: 420 });
  quick.show();
  quick.focus();
  quick.webContents.send('quick:shown');
}

export function hideQuick(): void { quick?.hide(); }

/** Registers the first free shortcut; returns which one, or null if all are taken. */
export function registerShortcut(preferred?: string): string | null {
  if (registered) globalShortcut.unregister(registered);
  registered = null;
  for (const acc of preferred ? [preferred, ...SHORTCUT_CANDIDATES] : SHORTCUT_CANDIDATES) {
    try {
      if (globalShortcut.register(acc, toggleQuick)) { registered = acc; break; }
    } catch { /* invalid accelerator, try the next */ }
  }
  return registered;
}

export function currentShortcut(): string | null { return registered; }

export function createTray(showMain: () => void, quit: () => void, restart: () => void, restartResume: () => void): void {
  const img = nativeImage.createFromPath(trayIconPath());
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
  tray.setToolTip('Elysium Development');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Elysium', click: showMain },
    { label: `Quick task${registered ? `    ${registered.replace('Control', 'Ctrl')}` : ''}`, click: toggleQuick },
    { type: 'separator' },
    { label: 'Restart Elysium', click: restart },
    { label: 'Restart and resume', click: restartResume },
    { label: 'Quit Elysium', click: quit },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', showMain);
}

export function disposeQuick(): void {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
}
