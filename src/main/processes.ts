// Memory view: what is using RAM on this machine, grouped by program, and a way
// to end a program. Windows and ElysiumProd's own processes are protected and
// can never be ended from here. Ending anything else is always the owner's
// choice: a click in the Memory widget, or an auto-end list the owner fills in.
import { execFile } from 'node:child_process';
import type { ProcGroup } from '@shared/ipc';

const PROTECTED = new Set([
  'system', 'idle', 'registry', 'memory compression', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso',
  'svchost', 'dwm', 'explorer', 'fontdrvhost', 'sihost', 'ctfmon', 'taskhostw', 'searchhost', 'startmenuexperiencehost',
  'runtimebroker', 'securityhealthservice', 'msmpeng', 'nissrv', 'audiodg', 'conhost', 'openconsole', 'spoolsv', 'wudfhost',
  'textinputhost', 'shellexperiencehost', 'applicationframehost', 'systemsettings', 'lockapp', 'electron', 'elysiumprod',
]);

/** Programs that host the owner's agents: shown, but flagged so ending them is never casual. */
const AGENT_HOSTS = new Set(['claude', 'node', 'code', 'powershell', 'pwsh', 'windowsterminal', 'git']);

function ps(script: string, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (e, out) => (e ? reject(e) : resolve(String(out))));
  });
}

export async function listProcessGroups(): Promise<ProcGroup[]> {
  const raw = await ps('Get-Process | Select-Object Name,Id,WorkingSet64,MainWindowTitle | ConvertTo-Json -Compress');
  const list = JSON.parse(raw || '[]') as { Name: string; Id: number; WorkingSet64: number; MainWindowTitle: string }[];
  const groups = new Map<string, ProcGroup>();
  const mine = new Set([process.pid, process.ppid]);
  for (const p of Array.isArray(list) ? list : [list]) {
    const key = p.Name.toLowerCase();
    const g = groups.get(key) ?? { name: p.Name, pids: [], bytes: 0, windowTitle: null, protected: PROTECTED.has(key), agentHost: AGENT_HOSTS.has(key) };
    g.pids.push(p.Id);
    g.bytes += p.WorkingSet64 || 0;
    if (!g.windowTitle && p.MainWindowTitle) g.windowTitle = p.MainWindowTitle;
    if (mine.has(p.Id)) g.protected = true;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 30);
}

/** Ends every process of a program by name. Refuses protected programs. */
export async function endProgram(name: string): Promise<{ ok: boolean; error: string | null; ended: number }> {
  const key = name.toLowerCase();
  if (PROTECTED.has(key)) return { ok: false, error: `${name} is protected`, ended: 0 };
  if (!/^[\w .-]{1,80}$/.test(name)) return { ok: false, error: 'Unexpected program name', ended: 0 };
  const mine = [process.pid, process.ppid];
  try {
    const out = await ps(`$p = Get-Process -Name '${name.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin @(${mine.join(',')}) }; $n = @($p).Count; $p | Stop-Process -Force -ErrorAction SilentlyContinue; $n`);
    return { ok: true, error: null, ended: Number(out.trim()) || 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split('\n')[0] : String(e), ended: 0 };
  }
}
