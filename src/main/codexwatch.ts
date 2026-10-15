// Codex sessions, seen the way Claude sessions are: what you asked, what it said,
// and whether it is working. Codex writes each conversation to a file under
// ~/.codex/sessions; this follows the one for each running Codex pane.
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentState, ReaderEntry } from '@shared/ipc';

// CODEX_HOME moves Codex's own folder; it is honoured here too.
const ROOT = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions');

interface Watched { sessionId: string; cwd: string; startedAt: number; file: string | null; offset: number; rest: string; lastEventAt: number; state: AgentState; lookedAt: number }

export interface CodexSink {
  state(sessionId: string, state: AgentState): void;
  said(sessionId: string, e: ReaderEntry): void;
}

export class CodexWatch {
  private watched = new Map<string, Watched>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private sink: CodexSink) {}

  add(sessionId: string, cwd: string): void {
    this.watched.set(sessionId, { sessionId, cwd: cwd.toLowerCase(), startedAt: Date.now(), file: null, offset: 0, rest: '', lastEventAt: 0, state: 'starting', lookedAt: 0 });
    this.sink.state(sessionId, 'starting');
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1500);
  }

  remove(sessionId: string): void {
    this.watched.delete(sessionId);
    if (!this.watched.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private tick(): void {
    for (const w of this.watched.values()) {
      if (!w.file) {
        if (Date.now() - w.lookedAt < 3000) continue;
        w.lookedAt = Date.now();
        w.file = this.find(w);
        if (!w.file) continue;
        // A resumed conversation: only what comes after this pane opened.
        try { w.offset = statSync(w.file).birthtimeMs >= w.startedAt - 5000 ? 0 : statSync(w.file).size; } catch { w.offset = 0; }
        if (w.state === 'starting') this.set(w, 'idle');
      }
      this.read(w);
      // Codex has no "turn finished" mark in every version: a few quiet seconds after it spoke means done.
      if (w.state === 'busy' && Date.now() - w.lastEventAt > 6000) this.set(w, 'idle');
    }
  }

  /** The newest conversation file for this folder that changed since the pane opened. */
  private find(w: Watched): string | null {
    const files: { p: string; t: number }[] = [];
    const walk = (d: string, depth: number) => {
      let names: string[] = [];
      try { names = readdirSync(d); } catch { return; }
      // Newest folders first; only the last few days matter.
      for (const n of names.sort().reverse().slice(0, depth < 3 ? 3 : 400)) {
        const p = join(d, n);
        if (depth < 3) walk(p, depth + 1);
        else if (n.endsWith('.jsonl')) { try { const t = statSync(p).mtimeMs; if (t >= w.startedAt - 5000) files.push({ p, t }); } catch { /* gone */ } }
      }
    };
    walk(ROOT, 0);
    for (const f of files.sort((a, b) => b.t - a.t)) {
      try {
        const fd = openSync(f.p, 'r'); const buf = Buffer.alloc(4096); const n = readSync(fd, buf, 0, buf.length, 0); closeSync(fd);
        const m = buf.subarray(0, n).toString('utf8').match(/"cwd":"((?:[^"\\]|\\.)*)"/);
        if (m && (JSON.parse(`"${m[1]}"`) as string).toLowerCase() === w.cwd) return f.p;
      } catch { /* unreadable: next */ }
    }
    return null;
  }

  private read(w: Watched): void {
    if (!w.file) return;
    let size = 0;
    try { size = statSync(w.file).size; } catch { w.file = null; return; }
    if (size <= w.offset) return;
    const len = Math.min(size - w.offset, 4 * 1024 * 1024);
    const buf = Buffer.alloc(len);
    try { const fd = openSync(w.file, 'r'); readSync(fd, buf, 0, len, w.offset); closeSync(fd); } catch { return; }
    w.offset += len;
    const text = w.rest + buf.toString('utf8');
    const lines = text.split('\n');
    w.rest = lines.pop() ?? '';
    for (const l of lines) {
      let j: { timestamp?: string; type?: string; payload?: { type?: string; message?: string } };
      try { j = JSON.parse(l); } catch { continue; }
      if (j.type !== 'event_msg' && j.type !== 'response_item') continue;
      const kind = j.payload?.type;
      const at = j.timestamp ?? new Date().toISOString();
      w.lastEventAt = Date.now();
      if (j.type === 'event_msg' && kind === 'user_message' && j.payload?.message) { this.sink.said(w.sessionId, { at, role: 'you', text: j.payload.message }); this.set(w, 'busy'); }
      else if (j.type === 'event_msg' && kind === 'agent_message' && j.payload?.message) this.sink.said(w.sessionId, { at, role: 'claude', text: j.payload.message });
      else if (j.type === 'event_msg' && (kind === 'turn_aborted' || kind === 'task_complete')) this.set(w, 'idle');
      else if (w.state !== 'busy' && (kind === 'reasoning' || kind === 'function_call' || kind === 'agent_reasoning')) this.set(w, 'busy');
    }
  }

  private set(w: Watched, s: AgentState): void {
    if (w.state === s) return;
    w.state = s;
    this.sink.state(w.sessionId, s);
  }
}
