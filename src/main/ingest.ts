// Telemetry ingest (spec 10). Claude sessions launched by ElysiumProd get one
// extra --settings file whose status line and hooks run a tiny Node script
// that POSTs the CLI's own JSON here. Bound to 127.0.0.1 on a random port; every
// post must carry its session's secret, so nothing else on the machine can feed it.
// Prompt and response text is never stored: only the fields listed in Telemetry.
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import type { Telemetry } from '@shared/ipc';
import { dataDir } from './paths';

const HOOK_EVENTS = ['SessionStart', 'SessionEnd', 'Stop', 'Notification', 'UserPromptSubmit', 'PreCompact', 'PostCompact'];

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

interface Registered { secret: string; t: Telemetry }

export class Ingest {
  private server: http.Server | null = null;
  private port = 0;
  private sessions = new Map<string, Registered>();
  readonly settingsPath: string;
  private scriptPath: string;

  constructor(private emit: (t: Telemetry) => void) {
    const dir = join(dataDir(), 'claude-hooks');
    mkdirSync(dir, { recursive: true });
    this.scriptPath = join(dir, 'post.js');
    this.settingsPath = join(dir, 'settings.json');
  }

  async start(): Promise<void> {
    writeFileSync(this.scriptPath, POST_SCRIPT);
    const node = `node "${this.scriptPath.split('\\').join('/')}"`;
    const hooks: Record<string, unknown> = {};
    for (const e of HOOK_EVENTS) hooks[e] = [{ hooks: [{ type: 'command', command: `${node} hook ${e}`, timeout: 5 }] }];
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
      sessionName: null, fiveHourPercent: null, sevenDayPercent: null, fiveHourResetsAt: null, costUsd: null,
      compactions: 0, lastEventAt: null, waitingMessage: null,
    };
    this.sessions.set(sessionId, { secret, t });
    return {
      env: { ELYSIUM_INGEST: `http://127.0.0.1:${this.port}/`, ELYSIUM_SID: sessionId, ELYSIUM_SECRET: secret },
      args: ['--settings', this.settingsPath],
    };
  }

  forget(sessionId: string): void { this.sessions.delete(sessionId); }

  get(sessionId: string): Telemetry | null { return this.sessions.get(sessionId)?.t ?? null; }
  all(): Telemetry[] { return [...this.sessions.values()].map((r) => r.t); }

  private accept(m: { sid?: string; secret?: string; kind?: string; event?: string | null; payload?: string }): void {
    const r = m.sid ? this.sessions.get(m.sid) : undefined;
    if (!r || m.secret !== r.secret) return;
    let p: Record<string, any> = {};
    try { p = JSON.parse(m.payload || '{}'); } catch { return; }
    const t = { ...r.t, lastEventAt: new Date().toISOString() };
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
      if (t.state === 'starting') t.state = 'idle';
    } else {
      switch (m.event) {
        case 'SessionStart': if (t.state === 'starting') t.state = 'idle'; t.sessionName = p.session_title ?? t.sessionName; break;
        case 'UserPromptSubmit': t.state = 'busy'; t.waitingMessage = null; t.sessionName = p.session_title ?? t.sessionName; break;
        case 'Stop': t.state = 'idle'; t.waitingMessage = null; break;
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
