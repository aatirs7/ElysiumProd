// The Claude pane: claude.ai in its own WebContentsView, laid over the pane's
// rectangle. This is a deliberate, narrow exception to "no remote content":
//
//   - its own persistent session partition, so its cookies never mix with the app;
//   - no preload and no Node, sandboxed, context isolated;
//   - it may only navigate to Claude, Anthropic and sign-in hosts; any other link
//     opens in the system browser;
//   - it never receives app IPC and the app never reads its pages.
import { BrowserWindow, WebContentsView, clipboard, shell } from 'electron';

const PARTITION = 'persist:claude';
const HOME = 'https://claude.ai/new';
const ALLOWED = [/^claude\.ai$/, /\.claude\.ai$/, /^claude\.com$/, /\.claude\.com$/, /\.anthropic\.com$/, /^anthropic\.com$/,
  /^accounts\.google\.com$/, /\.googleusercontent\.com$/, /^appleid\.apple\.com$/, /^login\.microsoftonline\.com$/];

const allowed = (u: string) => {
  try { const h = new URL(u); return h.protocol === 'https:' && ALLOWED.some((r) => r.test(h.hostname)); } catch { return false; }
};

interface Bounds { x: number; y: number; width: number; height: number }

const views = new Map<string, WebContentsView>();
let hiddenAll = false;

export function attachWeb(win: BrowserWindow, id: string): void {
  if (views.has(id)) return;
  const view = new WebContentsView({
    webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) { void wc.loadURL(url); } else if (/^https:\/\//.test(url)) { void shell.openExternal(url); }
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!allowed(url)) { e.preventDefault(); if (/^https:\/\//.test(url)) void shell.openExternal(url); }
  });
  view.setBorderRadius?.(0);
  view.setVisible(false);
  win.contentView.addChildView(view);
  views.set(id, view);
  void wc.loadURL(HOME);
}

export function setWebBounds(id: string, b: Bounds, visible: boolean): void {
  const v = views.get(id);
  if (!v) return;
  if (b.width > 0 && b.height > 0) v.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
  v.setVisible(visible && !hiddenAll && b.width > 0 && b.height > 0);
}

/** Native views draw above the page, so hide them while a menu or dialog is open. */
export function hideAllWeb(hide: boolean): void {
  hiddenAll = hide;
  for (const v of views.values()) if (hide) v.setVisible(false);
}

export function navWeb(id: string, action: 'back' | 'forward' | 'reload' | 'home'): void {
  const wc = views.get(id)?.webContents;
  if (!wc) return;
  if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  else if (action === 'reload') wc.reload();
  else if (action === 'home') void wc.loadURL(HOME);
}

export function detachWeb(win: BrowserWindow | null, id: string): void {
  const v = views.get(id);
  if (!v) return;
  views.delete(id);
  try { win?.contentView.removeChildView(v); } catch { /* window closing */ }
  v.webContents.close();
}

export async function readClipboard(): Promise<string> {
  return await clipboard.readText();
}
