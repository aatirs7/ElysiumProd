// Telemetry ingest (spec 10). Claude sessions launched by ElysiumProd get one
// extra --settings file whose status line and hooks run a tiny Node script
// that POSTs the CLI's own JSON here. Bound to 127.0.0.1 on a random port; every
// post must carry its session's secret, so nothing else on the machine can feed it.
// Prompt and response text is never stored: only the fields listed in Telemetry.
// The live flow keeps, in memory only, each tool call's name and a short label
// (a file's name, a command's own one line description, an agent's title),
// never a tool's input or output.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import type { FlowEvent, ReaderEntry, Telemetry } from '@shared/ipc';
import { dataDir } from './paths';

const HOOK_EVENTS = ['SessionStart', 'SessionEnd', 'Stop', 'Notification', 'UserPromptSubmit', 'PreCompact', 'PostCompact', 'PreToolUse'];
/** These run in the background where the CLI supports it, so a tool call never waits on the shim. */
const ASYNC_EVENTS = new Set(['PreToolUse']);

const POST_SCRIPT = `// ElysiumProd telemetry shim. Reads the CLI's JSON on stdin and posts it to the
// local ingest. Never blocks the CLI: two second timeout, always exits 0.
const http = require('http');
const kind = process.argv[2] || 'hook';
let d = '';
process.stdin.on('data', (c) => (d += c)).on('end', () => {
  const url = process.env.ELYSIUM_INGEST, sid = process.env.ELYSIUM_SID, secret = process.env.ELYSIUM_SECRET;
  if (kind === 'status') process.stdout.write('');
  if (!url || !sid) return process.exit(0);
  const body = JSON.stringify({ sid, secret, kind, event: process.argv[3] || null, payload: d });
  const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, timeout: 2000 }, (r) => { r.resume(); r.on('end', () => process.exit(0)); });
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
});
`;

interface Registered { secret: string; t: Telemetry; reader: ReaderEntry[]; flow: FlowEvent[]; conversation?: string }

const FLOW_KEEP = 200;
const base = (p: unknown) => (typeof p === 'string' ? p.split(/[\\/]/).pop() ?? p : '');
const clip = (s: unknown, n = 70) => { const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''; return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** A tool call as a step in the flow: what kind of work, and a short label. Never the input itself. */
export function flowStep(tool: string, input: Record<string, unknown>): Omit<FlowEvent, 'at'> {
  switch (tool) {
    case 'Bash': case 'PowerShell': {
      const cmd = String(input.command ?? '').trim();
      // A quoted path to a program reads as the program's name: "C:\\...\\git.exe" status is Run git.
      const exe = (cmd.match(/^"([^"]+)"/)?.[1] ?? cmd.split(/\s+/)[0] ?? '').replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|ps1)$/i, '');
      const first = clip(exe.replace(/["']/g, ''), 24);
      return { kind: 'run', tool, label: clip(input.description) || (first ? `Run ${first}` : 'Run a command') };
    }
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return { kind: 'edit', tool, label: base(input.file_path ?? input.notebook_path) || 'Edit a file' };
    case 'Read': return { kind: 'read', tool, label: base(input.file_path) || 'Read a file' };
    case 'Grep': case 'Glob': return { kind: 'search', tool, label: `Search ${clip(input.pattern, 40)}` };
    case 'WebFetch': { let h = ''; try { h = new URL(String(input.url)).hostname; } catch { /* no host */ } return { kind: 'web', tool, label: h ? `Read ${h}` : 'Read a web page' }; }
    case 'WebSearch': return { kind: 'web', tool, label: `Search the web: ${clip(input.query, 40)}` };
    case 'Agent': case 'Task': return { kind: 'agent', tool, label: clip(input.description) || 'Start a helper agent' };
    case 'SendMessage': { const to = clip(input.to ?? input.recipient ?? input.target, 30); return { kind: 'message', tool, label: to ? `Message ${to}` : 'Send a message', ...(to ? { to } : {}) }; }
    case 'AskUserQuestion': return { kind: 'ask', tool, label: 'Ask you a question' };
    default: {
      // mcp__<server>__<tool> reads as "Attestia: get tasks".
      const parts = tool.split('__');
      if (parts[0] === 'mcp' && parts.length >= 3) return { kind: 'other', tool, label: `${parts[1].replace(/^claude_ai_/, '').replace(/_/g, ' ')}: ${parts.slice(2).join(' ').replace(/_/g, ' ')}` };
      return { kind: 'other', tool, label: tool };
    }
  }
}

/** The Reader view keeps the last turns in memory only; nothing here is written to disk. */
const READER_KEEP = 60;

export class Ingest {
  private server: http.Server | null = null;
  private port = 0;
  private sessions = new Map<string, Registered>();
  readonly settingsPath: string;
  private scriptPath: string;

  constructor(private emit: (t: Telemetry) => void, private emitReader: (sessionId: string, e: ReaderEntry) => void = () => {}, private emitFlow: (sessionId: string, e: FlowEvent) => void = () => {}) {
    const dir = join(dataDir(), 'claude-hooks');
    mkdirSync(dir, { recursive: true });
    this.scriptPath = join(dir, 'post.js');
    this.settingsPath = join(dir, 'settings.json');
  }

  async start(): Promise<void> {
    writeFileSync(this.scriptPath, POST_SCRIPT);
    const node = `node "${this.scriptPath.split('\\').join('/')}"`;
    const hooks: Record<string, unknown> = {};
    for (const e of HOOK_EVENTS) hooks[e] = [{ hooks: [{ type: 'command', command: `${node} hook ${e}`, timeout: 5, ...(ASYNC_EVENTS.has(e) ? { async: true } : {}) }] }];
    writeFileSync(this.settingsPath, JSON.stringify({ statusLine: { type: 'command', command: `${node} status`, padding: 0 }, hooks }, null, 2));

    this.server = http.createServer((req, res) => {
      if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
      let b = '';
      req.on('data', (c) => { b += c; if (b.length > 2_000_000) req.destroy(); });
      req.on('end', () => {
        res.writeHead(204); res.end();
        try { this.accept(JSON.parse(b)); } catch { /* malformed posts are dropped */ }
      });
    });
    await new Promise<void>((r) => this.server!.listen(0, '127.0.0.1', () => r()));
    this.port = (this.server.address() as { port: number }).port;
  }

  stop(): void { this.server?.close(); }

  /** Register a session before spawning it; returns the env and args it needs. */
  register(sessionId: string): { env: Record<string, string>; args: string[] } {
    const secret = randomBytes(18).toString('hex');
    const t: Telemetry = {
      sessionId, state: 'starting', model: null, contextPercent: null, contextTokens: null, windowSize: null,
      sessionName: null, fiveHourPercent: null, sevenDayPercent: null, fiveHourResetsAt: null, sevenDayResetsAt: null, costUsd: null,
      compactions: 0, lastEventAt: null, waitingMessage: null,
    };
    this.sessions.set(sessionId, { secret, t, reader: [], flow: [] });
    return {
      env: { ELYSIUM_INGEST: `http://127.0.0.1:${this.port}/`, ELYSIUM_SID: sessionId, ELYSIUM_SECRET: secret },
      args: ['--settings', this.settingsPath],
    };
  }

  forget(sessionId: string): void { this.sessions.delete(sessionId); }

  /** Called when a session's Claude conversation id is first seen or changes (a /clear starts a new one). */
  onConversation: ((sessionId: string, conversationId: string) => void) | null = null;

  /** A question sent from the Reader box. The prompt hook may log it again; that copy is skipped. */
  noteAsked(sessionId: string, text: string): void {
    const r = this.sessions.get(sessionId);
    const t = text.trim();
    if (!r || !t) return;
    this.addReader(r, sessionId, { at: new Date().toISOString(), role: 'you', text: t.slice(0, 20000) });
  }

  reader(sessionId: string): ReaderEntry[] { return this.sessions.get(sessionId)?.reader ?? []; }
  flow(sessionId: string): FlowEvent[] { return this.sessions.get(sessionId)?.flow ?? []; }

  private addFlow(r: Registered, sessionId: string, e: FlowEvent): void {
    r.flow = [...r.flow.slice(-(FLOW_KEEP - 1)), e];
    this.emitFlow(sessionId, e);
  }

  private addReader(r: Registered, sessionId: string, e: ReaderEntry): void {
    r.reader = [...r.reader.slice(-(READER_KEEP - 1)), e];
    this.emitReader(sessionId, e);
  }

  get(sessionId: string): Telemetry | null { return this.sessions.get(sessionId)?.t ?? null; }

  /** Another agent's session (Codex): no hooks, but the same status and Reader, fed from its own files. */
  registerAgent(sessionId: string): void {
    this.sessions.set(sessionId, { secret: '', reader: [], flow: [], t: {
      sessionId, state: 'starting', model: null, contextPercent: null, contextTokens: null, windowSize: null,
      sessionName: null, fiveHourPercent: null, sevenDayPercent: null, fiveHourResetsAt: null, sevenDayResetsAt: null, costUsd: null,
      compactions: 0, lastEventAt: null, waitingMessage: null,
    } });
  }

  agentState(sessionId: string, state: Telemetry['state']): void {
    const r = this.sessions.get(sessionId);
    if (!r) return;
    r.t = { ...r.t, state, lastEventAt: new Date().toISOString() };
    this.emit(r.t);
  }

  agentSaid(sessionId: string, e: ReaderEntry): void {
    const r = this.sessions.get(sessionId);
    if (r) this.addReader(r, sessionId, e);
  }
  all(): Telemetry[] { return [...this.sessions.values()].map((r) => r.t); }

  private accept(m: { sid?: string; secret?: string; kind?: string; event?: string | null; payload?: string }): void {
    const r = m.sid ? this.sessions.get(m.sid) : undefined;
    if (!r || m.secret !== r.secret) return;
    let p: Record<string, any> = {};
    try { p = JSON.parse(m.payload || '{}'); } catch { return; }
    const t = { ...r.t, lastEventAt: new Date().toISOString() };
    if (typeof p.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(p.session_id) && p.session_id !== r.conversation) {
      r.conversation = p.session_id;
      this.onConversation?.(m.sid!, p.session_id);
    }
    if (m.kind === 'status') {
      const cw = p.context_window ?? {};
      t.model = p.model?.display_name ?? t.model;
      t.contextPercent = typeof cw.used_percentage === 'number' ? cw.used_percentage : t.contextPercent;
      t.contextTokens = typeof cw.total_input_tokens === 'number' ? cw.total_input_tokens : t.contextTokens;
      t.windowSize = typeof cw.context_window_size === 'number' ? cw.context_window_size : t.windowSize;
      t.sessionName = p.session_name ?? t.sessionName;
      t.costUsd = typeof p.cost?.total_cost_usd === 'number' ? p.cost.total_cost_usd : t.costUsd;
      t.fiveHourPercent = p.rate_limits?.five_hour?.used_percentage ?? t.fiveHourPercent;
      t.sevenDayPercent = p.rate_limits?.seven_day?.used_percentage ?? t.sevenDayPercent;
      t.fiveHourResetsAt = p.rate_limits?.five_hour?.resets_at ?? t.fiveHourResetsAt;
      t.sevenDayResetsAt = p.rate_limits?.seven_day?.resets_at ?? t.sevenDayResetsAt;
      if (t.state === 'starting') t.state = 'idle';
    } else {
      switch (m.event) {
        case 'SessionStart': if (t.state === 'starting') t.state = 'idle'; t.sessionName = p.session_title ?? t.sessionName; break;
        case 'PreToolUse':
          if (typeof p.tool_name === 'string') this.addFlow(r, m.sid!, { at: new Date().toISOString(), ...flowStep(p.tool_name, (p.tool_input ?? {}) as Record<string, unknown>) });
          if (t.state !== 'waiting') t.state = 'busy';
          break;
        case 'UserPromptSubmit':
          t.state = 'busy'; t.waitingMessage = null; t.sessionName = p.session_title ?? t.sessionName;
          if (typeof p.prompt === 'string' && p.prompt.trim()) {
            const prev = [...r.reader].reverse().find((x) => x.role === 'you');
            const dup = prev && prev.text === p.prompt.trim().slice(0, 20000) && Date.now() - Date.parse(prev.at) < 10 * 60 * 1000;
            if (!dup) this.addReader(r, m.sid!, { at: new Date().toISOString(), role: 'you', text: p.prompt.slice(0, 20000) });
          }
          break;
        case 'Stop':
          t.state = 'idle'; t.waitingMessage = null;
          if (typeof p.last_assistant_message === 'string' && p.last_assistant_message.trim()) this.addReader(r, m.sid!, { at: new Date().toISOString(), role: 'claude', text: p.last_assistant_message.slice(0, 200000) });
          break;
        case 'Notification':
          // idle_prompt is "finished, ready for you"; anything else (a permission prompt) is waiting on you.
          if (p.notification_type === 'idle_prompt') { t.state = 'idle'; t.waitingMessage = null; }
          else { t.state = 'waiting'; t.waitingMessage = typeof p.message === 'string' ? p.message.slice(0, 160) : null; }
          break;
        case 'PostCompact': t.compactions += 1; break;
        case 'SessionEnd': t.state = 'ended'; break;
      }
    }
    r.t = t;
    this.emit(t);
  }
}
