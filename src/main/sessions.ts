// SessionManager: owns every PTY. Spawns from a template with a scrubbed env,
// streams output to the renderer in small batches and to scrollback on disk,
// and kills everything on quit.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';
import type { IPty } from 'node-pty';
import type { CreateOptions, CreateResult, SessionInfo } from '@shared/ipc';
import { accountEnv, hasConversation, hasHistory } from './accounts';
import { childEnv } from './env';
import { Scrollback } from './scrollback';
import { findTemplate } from './templates';
import { agentDef } from './agents';
import { sessionOptionArgs } from './sessionopts';

interface Live {
  info: SessionInfo;
  pty: IPty | null;
  scrollback: Scrollback;
  pending: string;
  /** Recent output, so a pane that remounts (moved, floated, view switched) can redraw. */
  history: string;
  /** Total characters emitted; lets a pane drop live chunks its replay already covered. */
  offset: number;
}

export interface SessionEvents {
  data(sessionId: string, data: string, endOffset: number): void;
  update(info: SessionInfo): void;
}

const FLUSH_MS = 16;
const HISTORY_CHARS = 512 * 1024;

export class SessionManager {
  private live = new Map<string, Live>();
  /** Sessions launched with -n whose name is not yet backed by a saved conversation. */
  private pendingNames = new Map<string, { accountId: string; title: string; cwd: string }>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private scrollbackDir: string,
    private events: SessionEvents,
    private gate: () => string | null,
    /** Telemetry registration for Claude sessions: extra env and --settings args. */
    private telemetry: (sessionId: string) => { env: Record<string, string>; args: string[] },
    /** Extra arguments for another agent's session (the delegation tool for Codex). */
    private agentArgs: (sessionId: string, agent: string) => string[] = () => [],
  ) {}

  list(): SessionInfo[] {
    return [...this.live.values()].map((l) => l.info);
  }

  /** `resumeId` (main process only) resumes that exact conversation instead of the template's own. */
  create(templateId: string, cols: number, rows: number, opts: CreateOptions = {}, resumeId?: string): CreateResult {
    const t = findTemplate(templateId);
    if (!t) return { ok: false, reason: `No template called ${templateId}.` };
    const refused = opts.override ? null : this.gate();
    if (refused) return { ok: false, reason: refused, lowResources: true };
    const command = t.command();
    if (!command) return { ok: false, reason: t.kind === 'agent' ? `${t.title} was not found. Install it from Connect in Settings, then try again.` : 'Claude Code was not found on PATH or in the npm global folder.' };
    if (!existsSync(t.cwd)) return { ok: false, reason: `The folder ${t.cwd} does not exist.` };
    // A Claude template resumes one named session; two copies of it would fight.
    // Shells are independent, so any number may run.
    if (t.kind === 'claude') {
      for (const l of this.live.values()) {
        if (l.info.templateId === templateId && (l.info.status === 'running' || l.info.status === 'starting')) {
          return { ok: false, reason: `${t.title} is already running in this window.` };
        }
      }
    }

    const accountId = t.kind === 'claude' ? (opts.accountId || 'main') : 'main';
    const id = randomUUID();
    let args = [...(t.prefix?.() ?? []), ...t.args];
    let resumed = false;
    if (t.kind === 'agent') {
      if (t.agent) args = [...args, ...this.agentArgs(id, t.agent)];
      const a = t.agent ? agentDef(t.agent) : undefined;
      if (a?.resume && a.hasHistory?.(t.cwd)) { args = [...args, ...a.resume]; resumed = true; }
    }
    const env: Record<string, string> = { ...t.env };
    if (t.kind === 'claude' && !resumeId) {
      // The conversation this pane last ran, if its transcript is still there.
      const last = conversations()[convKey(accountId, templateId)];
      if (last && hasConversation(accountId, t.cwd, last)) resumeId = last;
    }
    if (t.kind === 'claude') {
      // Resume only where the history lives. A session's transcripts belong to the
      // account it ran on, so on another account the same title starts fresh.
      const r = args.indexOf('--resume');
      const c = args.indexOf('--continue');
      if (resumeId) {
        if (r >= 0) args.splice(r, 2); else if (c >= 0) args.splice(c, 1);
        const n = args.indexOf('-n'); if (n >= 0) args.splice(n, 2);
        args = ['--resume', resumeId, ...args];
        resumed = true;
      } else if (r >= 0 && t.named) {
        // The CLI refuses --resume with a name it has never seen, so the first launch names it instead.
        if (namedStarted(accountId, t)) resumed = true;
        else { args.splice(r, 2, '-n', t.title); this.pendingNames.set(id, { accountId, title: t.title, cwd: t.cwd }); }
      } else if (r >= 0) {
        if (hasHistory(accountId, t.cwd)) resumed = true;
        else args.splice(r, 2, '-n', t.title);
      } else if (c >= 0) {
        if (hasHistory(accountId, t.cwd)) resumed = true;
        else args.splice(c, 1, '-n', t.title);
      }
      Object.assign(env, accountEnv(accountId));
      const tel = this.telemetry(id);
      Object.assign(env, tel.env);
      args = [...args, ...sessionOptionArgs(t.project), ...tel.args];
    }
    const scrollback = new Scrollback(this.scrollbackDir, id);
    const info: SessionInfo = {
      id, templateId, title: t.title, accountId, resumed, status: 'starting', pid: null,
      startedAt: new Date().toISOString(), exitCode: null, scrollbackPath: scrollback.path,
    };
    const l: Live = { info, pty: null, scrollback, pending: '', history: '', offset: 0 };
    this.live.set(id, l);

    try {
      // Loaded lazily so a broken native module reports an error instead of
      // stopping the whole app from starting.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pty: typeof import('node-pty') = require('node-pty');
      const p = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols: Math.max(20, cols),
        rows: Math.max(5, rows),
        cwd: t.cwd,
        // Agents run on their own plan sign in too, so an API key in the environment never takes over.
        env: childEnv(env, t.kind === 'agent'),
        useConpty: true,
      });
      l.pty = p;
      info.pid = p.pid;
      info.status = 'running';
      p.onData((d) => {
        l.scrollback.write(d);
        l.pending += d;
        l.offset += d.length;
        l.history += d;
        if (l.history.length > HISTORY_CHARS * 1.25) l.history = l.history.slice(-HISTORY_CHARS);
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

  /** Recent output and the offset it ends at, for a pane that is (re)attaching. */
  replay(id: string): { info: SessionInfo; data: string; endOffset: number } | null {
    const l = this.live.get(id);
    if (!l) return null;
    this.flush();
    return { info: { ...l.info }, data: l.history, endOffset: l.offset };
  }

  /** Remember the conversation a session is in, so Start and Restart resume exactly it. */
  noteConversation(sessionId: string, conversationId: string): void {
    const l = this.live.get(sessionId);
    if (!l) return;
    // The first launch named it; now there is a conversation, later launches may resume by name.
    const named = this.pendingNames.get(sessionId);
    if (named) { markNamed(named.accountId, named); this.pendingNames.delete(sessionId); }
    const all = conversations();
    all[convKey(l.info.accountId, l.info.templateId)] = conversationId;
    try { writeFileSync(CONVERSATIONS(), JSON.stringify(all, null, 2)); } catch { /* falls back to the template's own resume */ }
  }

  /** The running session for a template, if any. */
  runningFor(templateId: string): SessionInfo | null {
    for (const l of this.live.values()) if (l.info.templateId === templateId && l.info.status === 'running') return l.info;
    return null;
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
      this.events.data(l.info.id, d, l.offset);
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

/** Named sessions ElysiumProd has started, per account: "account|title|folder". */
const CONVERSATIONS = () => join(dataDir(), 'conversations.json');
const convKey = (accountId: string, templateId: string) => `${accountId}|${templateId}`;
function conversations(): Record<string, string> {
  try { const j = JSON.parse(readFileSync(CONVERSATIONS(), 'utf8')) as unknown; return j && typeof j === 'object' ? j as Record<string, string> : {}; } catch { return {}; }
}

const NAMED = () => join(dataDir(), 'named-sessions.json');
function namedSet(): Set<string> {
  try { return new Set(JSON.parse(readFileSync(NAMED(), 'utf8')) as string[]); } catch { return new Set(); }
}
const namedKey = (accountId: string, t: { title: string; cwd: string }) => `${accountId}|${t.title}|${t.cwd.toLowerCase()}`;
function namedStarted(accountId: string, t: { title: string; cwd: string }): boolean { return namedSet().has(namedKey(accountId, t)); }
function markNamed(accountId: string, t: { title: string; cwd: string }): void {
  const s = namedSet();
  s.add(namedKey(accountId, t));
  try { writeFileSync(NAMED(), JSON.stringify([...s], null, 2)); } catch { /* next launch names it again */ }
}
