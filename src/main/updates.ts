// Updates for an installed copy. The installer clones Elysium and works on a
// branch called "mine", so the owner's own changes (made by Customize Elysium or
// by hand) sit on top. Getting an update saves those changes as a commit, merges
// the new version in, rebuilds, and asks for a restart. A clash is never forced:
// the merge is undone and Customize Elysium can be asked to combine them.
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdateInfo } from '@shared/ipc';
import { APP_SOURCE } from './templates';

const UPSTREAM = 'origin/main';
let pendingInstall = false;

/** Whether the update still needs its new parts installed, which happens as the app restarts. */
export const updateNeedsRestartInstall = () => pendingInstall;

/**
 * Quit, install the new parts and build, then open again. A small hidden helper
 * does it, because the running app holds its own files open.
 */
export function restartAndInstall(pid: number, electron: string, quit: () => void): void {
  const ps = [
    `while (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 400 }`,
    `Set-Location '${APP_SOURCE.replace(/'/g, "''")}'`,
    'npm ci --no-audit --no-fund',
    "if (-not (Test-Path 'node_modules/electron/dist/electron.exe')) { node node_modules/electron/install.js }",
    'npx electron-vite build',
    `Start-Process -FilePath '${electron.replace(/'/g, "''")}' -ArgumentList '"${APP_SOURCE.replace(/'/g, "''")}"' -WorkingDirectory '${APP_SOURCE.replace(/'/g, "''")}'`,
  ].join('; ');
  const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', ps], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  quit();
}

function git(args: string[], timeout = 120000): Promise<{ ok: boolean; out: string }> {
  return new Promise((r) => execFile('git', ['-C', APP_SOURCE, ...args], { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (e, out, err) => r({ ok: !e, out: `${out ?? ''}${err ?? ''}`.trim() })));
}
function npm(args: string[], timeout = 600000): Promise<{ ok: boolean; out: string }> {
  return new Promise((r) => execFile(process.platform === 'win32' ? 'cmd.exe' : 'npx', process.platform === 'win32' ? ['/d', '/c', 'npx', ...args] : args,
    { cwd: APP_SOURCE, timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (e, out, err) => r({ ok: !e, out: `${out ?? ''}${err ?? ''}`.trim().slice(-2000) })));
}

export async function checkUpdates(): Promise<UpdateInfo> {
  if (!existsSync(join(APP_SOURCE, '.git'))) return { managed: false, behind: 0, changes: [], mine: 0, error: null };
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out;
  // Only installed copies update this way; a developer's checkout is left alone.
  if (branch !== 'mine') return { managed: false, behind: 0, changes: [], mine: 0, error: null };
  const f = await git(['fetch', '--quiet', 'origin', 'main']);
  if (!f.ok) return { managed: true, behind: 0, changes: [], mine: 0, error: 'Could not reach GitHub. Check the connection and try again.' };
  const behind = Number((await git(['rev-list', '--count', `HEAD..${UPSTREAM}`])).out) || 0;
  const mine = Number((await git(['rev-list', '--count', `${UPSTREAM}..HEAD`])).out) || 0;
  const changes = behind ? (await git(['log', '--format=%s', '-n', '15', `HEAD..${UPSTREAM}`])).out.split(/\r?\n/).filter(Boolean) : [];
  return { managed: true, behind, changes, mine, error: null };
}

export async function applyUpdate(progress: (step: string) => void): Promise<{ ok: boolean; reason: string | null }> {
  const info = await checkUpdates();
  if (!info.managed) return { ok: false, reason: 'This copy is not an installed one.' };
  if (!info.behind) return { ok: true, reason: null };
  progress('Saving your changes');
  if ((await git(['status', '--porcelain'])).out) {
    await git(['add', '-A']);
    const c = await git(['commit', '-q', '-m', 'My changes, saved before an update']);
    if (!c.ok) return { ok: false, reason: 'Could not save your changes first.' };
  }
  const before = (await git(['rev-parse', 'HEAD'])).out;
  progress('Merging the new version');
  const m = await git(['merge', '--no-edit', UPSTREAM]);
  if (!m.ok) {
    await git(['merge', '--abort']);
    return { ok: false, reason: 'The update touches the same places as your changes. Nothing was changed. Open Customize Elysium and ask it to "merge the latest update"; it can combine them.' };
  }
  const lockChanged = (await git(['diff', '--name-only', before, 'HEAD'])).out.split(/\r?\n/).includes('package-lock.json');
  // New parts cannot be installed while the app runs (Windows keeps its files open); that happens on restart.
  if (lockChanged) { pendingInstall = true; return { ok: true, reason: null }; }
  progress('Building');
  const b = await npm(['electron-vite', 'build']);
  if (!b.ok) {
    await git(['reset', '--hard', before]);
    await npm(['electron-vite', 'build']);
    return { ok: false, reason: 'The new version did not build with your changes, so it was undone. Ask Customize Elysium to "merge the latest update".' };
  }
  return { ok: true, reason: null };
}
