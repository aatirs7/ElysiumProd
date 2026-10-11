// The Claude pane: claude.ai in its own WebContentsView, laid over the pane's
// rectangle. A deliberate, narrow exception to "no remote content":
//
//   - one persistent partition per Claude account, so two accounts stay signed
//     in side by side and neither shares cookies with the app;
//   - no preload and no Node, sandboxed, context isolated;
//   - it may only navigate to Claude, Anthropic and sign-in hosts; any other link
//     opens in the system browser;
//   - it never receives app IPC, and the app never reads its pages.
import { app, BrowserWindow, WebContentsView, clipboard, session, shell, type Session } from 'electron';
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

/**
 * Keep claude.ai signed in across restarts. Some of its sign-in cookies are
 * session cookies, which Chromium drops when the app quits; those are rewritten
 * with a 30 day expiry. Cookies are also flushed to disk every minute and on quit,
 * so even a hard stop keeps the sign-in.
 */
const kept = new Set<string>();
function keepSignedIn(partition: string): Session {
  const ses = session.fromPartition(partition);
  if (kept.has(partition)) return ses;
  kept.add(partition);
  ses.cookies.on('changed', (_e, c, _cause, removed) => {
    if (removed || c.expirationDate || !c.domain || !/(^|\.)(claude\.ai|anthropic\.com)$/.test(c.domain.replace(/^\./, ''))) return;
    const host = c.domain.replace(/^\./, '');
    void ses.cookies.set({
      url: `https://${host}${c.path ?? '/'}`, name: c.name, value: c.value, domain: c.hostOnly ? undefined : c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400,
    }).catch(() => { /* a cookie we cannot rewrite stays a session cookie */ });
  });
  return ses;
}
export async function flushWebSessions(): Promise<void> {
  await Promise.all([...kept].map(async (p) => { try { const ses = session.fromPartition(p); await ses.cookies.flushStore(); ses.flushStorageData(); } catch { /* best effort */ } }));
}
setInterval(() => void flushWebSessions(), 60000).unref?.();

interface Bounds { x: number; y: number; width: number; height: number }
interface Entry { view: WebContentsView; accountId: string; home: string }

const views = new Map<string, Entry>();
let hiddenAll = false;

/** A chat or project page on claude.ai the owner pinned for a project; anything else falls back to a new chat. */
function startUrl(u: string | null | undefined): string {
  try { const h = new URL(u ?? ''); return h.protocol === 'https:' && /(^|\.)claude\.ai$/.test(h.hostname) ? h.toString() : HOME; } catch { return HOME; }
}

export function attachWeb(win: BrowserWindow, id: string, accountId: string, emit: (s: WebState) => void, start?: string | null): void {
  const existing = views.get(id);
  const home = startUrl(start);
  if (existing && existing.accountId === accountId) {
    // Same account: only move to a newly pinned chat, never interrupt the one that is open.
    if (existing.home !== home) {
      existing.home = home;
      const here = existing.view.webContents.getURL().split('?')[0];
      if (here !== home.split('?')[0]) void existing.view.webContents.loadURL(home);
    }
    return;
  }
  if (existing) detachWeb(win, id);
  keepSignedIn(`persist:claude-${accountId}`);
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
  views.set(id, { view, accountId, home });
  void wc.loadURL(home);
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
  const e = views.get(id);
  const wc = e?.view.webContents;
  if (!e || !wc) return;
  if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  else if (action === 'reload') wc.reload();
  else if (action === 'home') void wc.loadURL(e.home);
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
