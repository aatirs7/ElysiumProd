// `electron . --smoke`: drives the real app end to end and writes
// smoke-out/result.json and smoke-out/window.png, then quits.
// Uses the PowerShell template only; it never starts a Claude session.
import { app, type BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Resources } from './resources';
import type { SessionManager } from './sessions';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSmoke(ctx: { win: BrowserWindow; sessions: SessionManager; resources: Resources }): Promise<void> {
  const out = join(process.cwd(), 'smoke-out');
  mkdirSync(out, { recursive: true });
  const r: Record<string, unknown> = { startedAt: new Date().toISOString() };
  const finish = async () => {
    r.finishedAt = new Date().toISOString();
    writeFileSync(join(out, 'result.json'), JSON.stringify(r, null, 2));
    app.quit();
  };
  try {
    await new Promise<void>((res) => (ctx.win.webContents.isLoading() ? ctx.win.webContents.once('did-finish-load', () => res()) : res()));
    await sleep(1500);
    r.resources = ctx.resources.latest();
    // Launch through the renderer, the same path a click takes.
    r.launch = await ctx.win.webContents.executeJavaScript(`window.__smoke && window.__smoke.launch('local.shell')`);
    await sleep(2500);
    const s = ctx.sessions.list()[0];
    r.session = s;
    if (!s) return finish();
    await ctx.win.webContents.executeJavaScript(`window.__smoke.type(${JSON.stringify('echo smoke-$((6*7))\r')})`);
    await sleep(2500);
    r.screenText = await ctx.win.webContents.executeJavaScript(`window.__smoke.screen()`);
    r.echoSeenInXterm = typeof r.screenText === 'string' && (r.screenText as string).includes('smoke-42');
    const img = await ctx.win.webContents.capturePage();
    writeFileSync(join(out, 'window.png'), img.toPNG());
    r.scrollbackExists = existsSync(s.scrollbackPath);
    await sleep(500);
    r.echoSeenInScrollback = r.scrollbackExists ? readFileSync(s.scrollbackPath, 'utf8').includes('smoke-42') : false;
    r.pid = s.pid;
  } catch (e) {
    r.error = e instanceof Error ? e.stack : String(e);
  }
  await finish();
}
