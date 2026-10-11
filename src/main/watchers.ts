// Board watchers run by ElysiumProd instead of inside Prime (spec 13.1).
// Each project's own command comes from its .claude/mods.json (watchStart).
// Off until the owner turns one on. Restarted on exit with back off. A line is
// typed into Prime only when the owner chose that and Prime is idle; otherwise it
// is shown, and the project's inbox hook still reaches the same issue on its own.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WatcherConfig, WatcherState } from '@shared/ipc';
import { childEnv } from './env';
import { PROJECT_FOLDERS } from './templates';

interface W { cfg: WatcherConfig; state: WatcherState; proc: ChildProcess | null; timer: NodeJS.Timeout | null; backoff: number; buf: string }

/** "node scripts/board-watch.mjs, as a Monitor with ..." becomes "node scripts/board-watch.mjs". */
export function watcherCommand(projectId: string): string | null {
  const p = PROJECT_FOLDERS[projectId];
  if (!p) return null;
  const f = join(p.folder, '.claude', 'mods.json');
  try {
    if (!existsSync(f)) return null;
    const s = JSON.parse(readFileSync(f, 'utf8')).watchStart as string | undefined;
    if (!s) return null;
    const cmd = s.split(/,\s*as\s+a\s/i)[0].trim();
    return /^node\s+[\w./\\-]+(\s+[\w:/.=@-]+)*$/.test(cmd) ? cmd : null;
  } catch {
    return null;
  }
}

export class Watchers {
  private ws = new Map<string, W>();

  constructor(
    private emit: (s: WatcherState) => void,
    /** Types the line into Prime if Prime is running and idle; returns whether it did. */
    private deliver: (projectId: string, line: string) => boolean,
  ) {}

  all(): WatcherState[] {
    return Object.keys(PROJECT_FOLDERS).map((id) => this.get(id).state);
  }

  set(projectId: string, cfg: WatcherConfig): void {
    if (!PROJECT_FOLDERS[projectId]) return;
    const w = this.get(projectId);
    const wasOn = w.cfg.enabled;
    w.cfg = cfg;
    if (cfg.enabled && !wasOn) this.start(projectId);
    if (!cfg.enabled && wasOn) this.stop(projectId);
    this.emit({ ...w.state });
  }

  stopAll(): void { for (const id of this.ws.keys()) this.stop(id); }

  private get(projectId: string): W {
    let w = this.ws.get(projectId);
    if (!w) {
      const command = watcherCommand(projectId);
      w = { cfg: { enabled: false, delivery: 'notify' }, proc: null, timer: null, backoff: 5000, buf: '',
        state: { projectId, command, status: command ? 'off' : 'unconfigured', restarts: 0, lines: [], error: null } };
      this.ws.set(projectId, w);
    }
    return w;
  }

  private start(projectId: string): void {
    const w = this.get(projectId);
    if (!w.state.command) { w.state.status = 'unconfigured'; return; }
    const [cmd, ...args] = w.state.command.split(/\s+/);
    try {
      const proc = spawn(cmd, args, { cwd: PROJECT_FOLDERS[projectId].folder, env: childEnv(), windowsHide: true });
      w.proc = proc;
      w.state.status = 'running';
      w.state.error = null;
      const onOut = (chunk: Buffer) => {
        w.buf += chunk.toString('utf8');
        const parts = w.buf.split(/\r?\n/);
        w.buf = parts.pop() ?? '';
        for (const text of parts.map((x) => x.trim()).filter(Boolean)) {
          const delivered = w.cfg.delivery === 'prime-when-idle' && this.deliver(projectId, text);
          w.state.lines = [...w.state.lines.slice(-99), { at: new Date().toISOString(), text: text.slice(0, 400), delivered }];
          this.emit({ ...w.state });
        }
        if (w.buf.length > 10000) w.buf = '';
      };
      proc.stdout?.on('data', onOut);
      proc.stderr?.on('data', (c: Buffer) => { w.state.error = c.toString('utf8').trim().split('\n').pop()?.slice(0, 200) ?? null; });
      proc.on('exit', () => {
        w.proc = null;
        if (!w.cfg.enabled) { w.state.status = 'off'; this.emit({ ...w.state }); return; }
        w.state.restarts += 1;
        w.state.status = w.state.restarts > 3 && w.backoff >= 40000 ? 'failed' : 'restarting';
        this.emit({ ...w.state });
        w.timer = setTimeout(() => { w.timer = null; if (w.cfg.enabled) this.start(projectId); }, w.backoff);
        w.backoff = Math.min(w.backoff * 2, 300000);
      });
      this.emit({ ...w.state });
    } catch (e) {
      w.state.status = 'failed';
      w.state.error = e instanceof Error ? e.message : String(e);
      this.emit({ ...w.state });
    }
  }

  private stop(projectId: string): void {
    const w = this.get(projectId);
    if (w.timer) { clearTimeout(w.timer); w.timer = null; }
    w.backoff = 5000;
    try { w.proc?.kill(); } catch { /* already gone */ }
    w.proc = null;
    w.state.status = w.state.command ? 'off' : 'unconfigured';
  }
}
