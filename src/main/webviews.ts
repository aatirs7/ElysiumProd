// The Claude pane: claude.ai in its own WebContentsView, laid over the pane's
// rectangle. A deliberate, narrow exception to "no remote content":
//
//   - one persistent partition per Claude account, so two accounts stay signed
//     in side by side and neither shares cookies with the app;
//   - no preload and no Node, sandboxed, context isolated;
//   - it may only navigate to Claude, Anthropic and sign-in hosts; any other link
//     opens in the system browser;
//   - it never receives app IPC, and the app never reads its pages.
import { app, BrowserWindow, WebContentsView, clipboard, shell } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WebState } from '@shared/ipc';
import { dataDir } from './paths';

const HOME = 'https://claude.ai/new';
const ALLOWED = [
  /^claude\.ai$/, /\.claude\.ai$/, /^claude\.com$/, /\.claude\.com$/, /^anthropic\.com$/, /\.anthropic\.com$/,
  /^accounts\.google\.com$/, /\.google\.com$/, /\.googleusercontent\.com$/, /\.gstatic\.com$/,
  /^appleid\.apple\.com$/, /^login\.microsoftonline\.com$/, /^challenges\.cloudflare\.com$/,
];

const allowed = (u: string) => {
  try { const h = new URL(u); return h.protocol === 'https:' && ALLOWED.some((r) => r.test(h.hostname)); } catch { return false; }
};

/**
 * claude.ai and Google sign-in refuse or stall on browsers that announce
 * themselves as Electron, so the pane presents the plain Chrome identity
 * Electron is built on, without the Electron and app tokens.
 */
function chromeUserAgent(): string {
  return app.userAgentFallback.replace(/\s?Electron\/\S+/i, '').replace(/\s?elysiumprod\/\S+/i, '').replace(/\s{2,}/g, ' ').trim();
}

const log = (line: string) => {
  try { appendFileSync(join(dataDir(), 'claude-pane.log'), `${new Date().toISOString()} ${line}\n`); } catch { /* diagnostics only */ }
};

interface Bounds { x: number; y: number; width: number; height: number }
interface Entry { view: WebContentsView; accountId: string }

const views = new Map<string, Entry>();
let hiddenAll = false;

export function attachWeb(win: BrowserWindow, id: string, accountId: string, emit: (s: WebState) => void): void {
  const existing = views.get(id);
  if (existing && existing.accountId === accountId) return;
  if (existing) detachWeb(win, id);
  const view = new WebContentsView({
    webPreferences: { partition: `persist:claude-${accountId}`, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const wc = view.webContents;
  wc.setUserAgent(chromeUserAgent());
  const state = (loading: boolean, error: string | null = null) => emit({ id, url: wc.getURL(), title: wc.getTitle(), loading, error, accountId });
  wc.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) void wc.loadURL(url); else if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const guard = (e: Electron.Event, url: string) => {
    if (allowed(url)) return;
    e.preventDefault();
    log(`blocked navigation to ${new URL(url).hostname}`);
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);
  wc.on('did-start-loading', () => state(true));
  wc.on('did-stop-loading', () => state(false));
  wc.on('page-title-updated', () => state(wc.isLoading()));
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 is an aborted load, normal during redirects
    log(`load failed ${code} ${desc} ${(() => { try { return new URL(url).hostname; } catch { return '?'; } })()}`);
    state(false, `${desc} (${code})`);
  });
  wc.on('render-process-gone', (_e, d) => { log(`renderer gone: ${d.reason}`); state(false, 'The page crashed. Reload to try again.'); });
  view.setVisible(false);
  win.contentView.addChildView(view);
  views.set(id, { view, accountId });
  void wc.loadURL(HOME);
}

export function setWebBounds(id: string, b: Bounds, visible: boolean): void {
  const v = views.get(id)?.view;
  if (!v) return;
  if (b.width > 0 && b.height > 0) v.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
  v.setVisible(visible && !hiddenAll && b.width > 0 && b.height > 0);
}

/** Native views draw above the page, so hide them while a menu, dialog or other page shows. */
export function hideAllWeb(hide: boolean): void {
  hiddenAll = hide;
  for (const e of views.values()) if (hide) e.view.setVisible(false);
}

export function navWeb(id: string, action: 'back' | 'forward' | 'reload' | 'home' | 'external'): void {
  const wc = views.get(id)?.view.webContents;
  if (!wc) return;
  if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  else if (action === 'reload') wc.reload();
  else if (action === 'home') void wc.loadURL(HOME);
  else if (action === 'external') void shell.openExternal(/^https:\/\//.test(wc.getURL()) ? wc.getURL() : HOME);
}

export function detachWeb(win: BrowserWindow | null, id: string): void {
  const e = views.get(id);
  if (!e) return;
  views.delete(id);
  try { win?.contentView.removeChildView(e.view); } catch { /* window closing */ }
  e.view.webContents.close();
}

export function webStates(): { id: string; url: string; title: string; loading: boolean }[] {
  return [...views.entries()].map(([id, e]) => ({ id, url: e.view.webContents.getURL(), title: e.view.webContents.getTitle(), loading: e.view.webContents.isLoading() }));
}

export async function captureWeb(id: string): Promise<Buffer | null> {
  const wc = views.get(id)?.view.webContents;
  if (!wc) return null;
  return (await wc.capturePage()).toPNG();
}

export async function readClipboard(): Promise<string> {
  return await clipboard.readText();
}
