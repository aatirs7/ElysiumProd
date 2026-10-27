// The chat watcher of a main project: a small node script that a Claude session
// starts in the background (SecurITPosture's scripts/chat-watch.mjs, Gulf's
// board-watch.mjs, Attestia's attestia.mjs watch). ElysiumProd does not run it;
// it only finds it, by command line, and can end it when the owner turns it off.
// A watcher belongs to a project when one of its parent processes is that
// project's session here, or, failing that, when its script name is the
// project's alone.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatWatch } from '@shared/ipc';
import { PROJECT_FOLDERS, projectDef } from './templates';

/** The part of a watcher's command line that marks it, per project. */
export function watchPattern(projectId: string): string | null {
  const own = projectDef(projectId)?.watchPattern;
  if (own) return own;
  const p = PROJECT_FOLDERS[projectId];
  if (!p) return null;
  try {
    const f = join(p.folder, '.claude', 'mods.json');
    if (!existsSync(f)) return null;
    const m = JSON.parse(readFileSync(f, 'utf8')) as { watchMonitor?: string; watchStart?: string };
    if (m.watchMonitor) return m.watchMonitor;
    const script = m.watchStart?.match(/[\w.-]+\.m?js(\s+watch)?/);
    return script ? script[0] : null;
  } catch {
    return null;
  }
}

interface Proc { ProcessId: number; ParentProcessId: number; Name: string; CommandLine: string | null }

function processes(): Promise<Proc[]> {
  const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\' or Name=\'bash.exe\' or Name=\'claude.exe\' or Name=\'pwsh.exe\' or Name=\'powershell.exe\' or Name=\'cmd.exe\' or Name=\'sh.exe\'" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress';
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([]);
      try {
        const j = JSON.parse(out || '[]') as Proc | Proc[];
        resolve(Array.isArray(j) ? j : [j]);
      } catch { resolve([]); }
    });
  });
}

/** Watcher processes of a project. sessionPids are the pty roots of that project's sessions here. */
export async function findWatchers(projectId: string, sessionPids: number[], otherPids: number[]): Promise<ChatWatch> {
  const pattern = watchPattern(projectId);
  if (!pattern) return { available: false, running: false, pids: [], script: null };
  const list = await processes();
  const byPid = new Map(list.map((p) => [p.ProcessId, p]));
  // Another project using the same script name means the name alone proves nothing.
  const shared = Object.keys(PROJECT_FOLDERS).some((id) => id !== projectId && watchPattern(id) === pattern);
  const ancestors = (p: Proc): number[] => {
    const out: number[] = [];
    let cur: Proc | undefined = p;
    for (let i = 0; cur && i < 12; i += 1) { out.push(cur.ParentProcessId); cur = byPid.get(cur.ParentProcessId); }
    return out;
  };
  const pids = list
    .filter((p) => p.Name.toLowerCase() === 'node.exe' && (p.CommandLine ?? '').includes(pattern))
    .filter((p) => {
      const up = ancestors(p);
      if (up.some((x) => sessionPids.includes(x))) return true;
      if (up.some((x) => otherPids.includes(x))) return false;
      return !shared;
    })
    .map((p) => p.ProcessId);
  return { available: true, running: pids.length > 0, pids, script: pattern };
}

/** Ends watcher processes, each checked again by command line just before. */
export async function endWatchers(projectId: string, pids: number[]): Promise<number> {
  const pattern = watchPattern(projectId);
  if (!pattern || !pids.length) return 0;
  const now = await processes();
  let n = 0;
  for (const pid of pids) {
    const p = now.find((x) => x.ProcessId === pid);
    if (!p || p.Name.toLowerCase() !== 'node.exe' || !(p.CommandLine ?? '').includes(pattern)) continue;
    try { process.kill(pid); n += 1; } catch { /* already gone */ }
  }
  return n;
}
