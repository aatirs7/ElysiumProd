// SessionManager: owns every PTY. Spawns from a template with a scrubbed env,
// streams output to the renderer in small batches and to scrollback on disk,
// and kills everything on quit.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { IPty } from 'node-pty';
import type { CreateResult, SessionInfo } from '@shared/ipc';
import { childEnv } from './env';
import { Scrollback } from './scrollback';
import { findTemplate } from './templates';

interface Live {
  info: SessionInfo;
  pty: IPty | null;
  scrollback: Scrollback;
  pending: string;
}

export interface SessionEvents {
  data(sessionId: string, data: string): void;
  update(info: SessionInfo): void;
}

const FLUSH_MS = 16;

export class SessionManager {
  private live = new Map<string, Live>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private scrollbackDir: string,
    private events: SessionEvents,
    private gate: () => string | null,
  ) {}

  list(): SessionInfo[] {
    return [...this.live.values()].map((l) => l.info);
  }

  create(templateId: string, cols: number, rows: number): CreateResult {
    const t = findTemplate(templateId);
    if (!t) return { ok: false, reason: `No template called ${templateId}.` };
    const refused = this.gate();
    if (refused) return { ok: false, reason: refused };
    const command = t.command();
    if (!command) return { ok: false, reason: 'Claude Code was not found on PATH or in the npm global folder.' };
    if (!existsSync(t.cwd)) return { ok: false, reason: `The folder ${t.cwd} does not exist.` };
    for (const l of this.live.values()) {
      if (l.info.templateId === templateId && (l.info.status === 'running' || l.info.status === 'starting')) {
        return { ok: false, reason: `${t.title} is already running in this window.` };
      }
    }

    const id = randomUUID();
    const scrollback = new Scrollback(this.scrollbackDir, id);
    const info: SessionInfo = {
      id, templateId, title: t.title, status: 'starting', pid: null,
      startedAt: new Date().toISOString(), exitCode: null, scrollbackPath: scrollback.path,
    };
    const l: Live = { info, pty: null, scrollback, pending: '' };
    this.live.set(id, l);

    try {
      // Loaded lazily so a broken native module reports an error instead of
      // stopping the whole app from starting.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pty: typeof import('node-pty') = require('node-pty');
      const p = pty.spawn(command, t.args, {
        name: 'xterm-256color',
        cols: Math.max(20, cols),
        rows: Math.max(5, rows),
        cwd: t.cwd,
        env: childEnv(t.env),
        useConpty: true,
      });
      l.pty = p;
      info.pid = p.pid;
      info.status = 'running';
      p.onData((d) => {
        l.scrollback.write(d);
        l.pending += d;
        this.scheduleFlush();
      });
      p.onExit(({ exitCode }) => {
        this.flush();
        info.status = 'exited';
        info.exitCode = exitCode;
        l.pty = null;
        void l.scrollback.close();
        this.events.update({ ...info });
      });
    } catch (e) {
      info.status = 'error';
      void scrollback.close();
      this.events.update({ ...info });
      return { ok: false, reason: `Could not start ${t.title}: ${e instanceof Error ? e.message : String(e)}` };
    }
    this.events.update({ ...info });
    return { ok: true, session: { ...info } };
  }

  write(id: string, data: string): void {
    this.live.get(id)?.pty?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const p = this.live.get(id)?.pty;
    if (!p) return;
    try { p.resize(Math.max(20, cols), Math.max(5, rows)); } catch { /* the PTY may have just exited */ }
  }

  kill(id: string): void {
    const l = this.live.get(id);
    if (!l?.pty) return;
    try { l.pty.kill(); } catch { /* already gone */ }
  }

  /** Kill every PTY and close every scrollback; used on quit. */
  async shutdown(): Promise<void> {
    this.flush();
    const waits: Promise<void>[] = [];
    for (const l of this.live.values()) {
      if (l.pty) {
        const pid = l.pty.pid;
        try { l.pty.kill(); } catch { /* already gone */ }
        waits.push(waitForExit(pid, 3000));
      }
      waits.push(l.scrollback.close());
    }
    await Promise.all(waits);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    for (const l of this.live.values()) {
      if (!l.pending) continue;
      const d = l.pending;
      l.pending = '';
      this.events.data(l.info.id, d);
    }
  }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForExit(pid: number, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end && alive(pid)) await new Promise((r) => setTimeout(r, 50));
}
