// Delegation: every session Elysium starts gets a small tool (resources/elysium-mcp.cjs,
// an MCP server) that lets it see the other sessions, hand one a task, and wait for
// the answer. The tool talks to this local server, which only answers on 127.0.0.1
// and only with the token in bridge.json.
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { SessionInfo, Telemetry, ReaderEntry } from '@shared/ipc';
import { dataDir } from './paths';
import { findTemplate, leadTemplate, PROJECTS, templates, type Template } from './templates';
import type { SessionManager } from './sessions';
import { playbookAdd, playbookRead, playbookSearch, PLAYBOOK_DIR } from './playbook';

interface Deps {
  sessions: SessionManager;
  telemetry(sessionId: string): Telemetry | undefined;
  reader(sessionId: string): ReaderEntry[];
  /** Hands a Claude session a task the same way a quick task does. */
  runClaude(templateId: string, text: string): { ok: boolean; reason: string | null; sessionId?: string };
  accountFor(projectId: string): string;
  /** Tells the person, in the app, that one session handed another a task. */
  note(text: string): void;
}

const SCRIPT = () => join(app.getAppPath(), 'resources', 'elysium-mcp.cjs');
const FILE = () => join(dataDir(), 'bridge.json');
const plain = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b[()][A-Z0-9]/g, '').replace(/\r/g, '');

export class Bridge {
  private token = randomBytes(24).toString('hex');
  private port = 0;
  /** When each target was last handed a task, so a wait knows what counts as the answer. */
  private sentAt = new Map<string, number>();

  constructor(private d: Deps) {}

  async start(): Promise<void> {
    const server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const a = server.address();
    this.port = typeof a === 'object' && a ? a.port : 0;
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(FILE(), JSON.stringify({ port: this.port, token: this.token }));
  }

  /** What a Claude session needs to load the tool: an --mcp-config file of its own. */
  claudeArgs(sessionId: string): string[] {
    const dir = join(dataDir(), 'mcp');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${sessionId}.json`);
    writeFileSync(file, JSON.stringify({ mcpServers: { elysium: { type: 'stdio', command: process.execPath, args: [SCRIPT()], env: this.env(sessionId) } } }));
    return ['--mcp-config', file];
  }

  /** The same tool for Codex, through its -c config overrides (TOML literal strings keep the backslashes). */
  codexArgs(sessionId: string): string[] {
    const lit = (s: string) => `'${s.replace(/'/g, '')}'`;
    const env = Object.entries(this.env(sessionId)).map(([k, v]) => `${k}=${lit(v)}`).join(', ');
    return ['-c', `mcp_servers.elysium.command=${lit(process.execPath)}`, '-c', `mcp_servers.elysium.args=[${lit(SCRIPT())}]`, '-c', `mcp_servers.elysium.env={ ${env} }`];
  }

  private env(sessionId: string): Record<string, string> {
    return { ELECTRON_RUN_AS_NODE: '1', ELYSIUM_BRIDGE: FILE(), ELYSIUM_FROM: sessionId };
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const reply = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${this.token}`) return reply(403, { error: 'no' });
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 200_000) return reply(413, { error: 'too big' }); }
    try {
      const { tool, args, from } = JSON.parse(raw) as { tool: string; args: Record<string, unknown>; from: string };
      reply(200, { text: await this.call(tool, args ?? {}, from) });
    } catch (e) { reply(200, { text: `Elysium could not do that: ${(e as Error).message}`, error: true }); }
  }

  private async call(tool: string, a: Record<string, unknown>, from: string): Promise<string> {
    const me = this.d.sessions.list().find((s) => s.id === from);
    const mine = me ? findTemplate(me.templateId) : undefined;
    if (tool === 'list') return this.list(mine);
    if (tool === 'playbook_search') {
      const hits = playbookSearch(String(a.query ?? ''));
      return hits.length ? ['Playbook entries (read one with elysium_playbook_read):', ...hits.map((e) => `- ${e.slug}: ${e.title}${e.project ? ` (${e.project})` : ''}. ${e.summary}`)].join('\n') : 'Nothing in the playbook matches that yet.';
    }
    if (tool === 'playbook_read') {
      const e = playbookRead(String(a.name ?? ''));
      return e ? `# ${e.title}\n${e.summary ? `\n${e.summary}\n` : ''}\nFrom ${e.project || 'no project'}, updated ${e.updatedAt.slice(0, 10)}.\n\n${e.body}` : 'No playbook entry by that name. Search first.';
    }
    if (tool === 'playbook_add') {
      const title = String(a.title ?? '').trim(), body = String(a.body ?? '').trim();
      if (!title || !body) return 'Give it a title and a body.';
      const e = playbookAdd({ title, body, summary: String(a.summary ?? ''), tags: Array.isArray(a.tags) ? a.tags.map(String) : String(a.tags ?? '').split(','), project: mine?.projectName ?? '', author: mine?.title ?? 'a session' });
      this.log(`${mine?.id ?? '?'} recorded playbook ${e.slug}`);
      this.d.note(`${mine?.title ?? 'A session'} added "${e.title}" to the playbook.`);
      return `Saved to the playbook as ${e.slug} (${PLAYBOOK_DIR}). Every project can find it now.`;
    }
    const t = this.resolve(String(a.to ?? ''), a.agent ? String(a.agent) : undefined);
    if (!t) return `No session matches "${String(a.to ?? '')}". Call elysium_sessions to see the names.`;
    if (mine && t.id === mine.id) return 'That is you. Pick another session.';
    if (tool === 'send') return this.send(t, String(a.message ?? ''), mine);
    if (tool === 'wait') return this.wait(t, Math.min(600, Math.max(5, Number(a.timeout_seconds ?? 300))));
    if (tool === 'read') return this.read(t, Math.min(10, Math.max(1, Number(a.count ?? 1))));
    return `Unknown tool ${tool}.`;
  }

  /** A template id, a project name or id, or "codex in posture". */
  private resolve(to: string, agent?: string): Template | undefined {
    const q = to.trim().toLowerCase();
    if (!q) return undefined;
    const exact = templates.find((t) => t.id.toLowerCase() === q || t.title.toLowerCase() === q);
    if (exact && !agent) return exact;
    const m = /^(\w[\w\s-]*?)\s+(?:in|for|on)\s+(.+)$/.exec(q);
    const want = agent?.toLowerCase() ?? (m ? m[1].trim() : undefined);
    const projectQ = m ? m[2].trim() : q;
    const p = PROJECTS.find((x) => x.id.toLowerCase() === projectQ || x.name.toLowerCase() === projectQ || (x.aliases ?? []).some((al) => al.toLowerCase() === projectQ));
    if (!p) return exact;
    if (want && want !== 'claude') return templates.find((t) => t.project === p.id && (t.agent === want || t.role === want || t.title.toLowerCase() === want));
    return leadTemplate(p.id);
  }

  private list(mine?: Template): string {
    const running = this.d.sessions.list().filter((s) => s.status === 'running');
    const rows = templates.filter((t) => t.kind !== 'shell').map((t) => {
      const s = running.find((x) => x.templateId === t.id);
      const st = s ? (t.kind === 'claude' ? this.d.telemetry(s.id)?.state ?? 'running' : 'running') : 'not started';
      const word = st === 'busy' ? 'working' : st === 'waiting' ? 'waiting on the owner' : st;
      return `- ${t.id}: ${t.title} (${t.projectName ?? 'no project'}, ${t.kind === 'agent' ? t.title : 'Claude'})${mine?.id === t.id ? ' [you]' : ''}: ${word}`;
    });
    return ['Sessions in Elysium. Use the id (or a project name, or "codex in <project>") as `to`.', ...rows].join('\n');
  }

  private async send(t: Template, message: string, from?: Template): Promise<string> {
    const text = message.trim();
    if (!text) return 'Write the task in `message`.';
    const who = from ? `${from.title}${from.projectName ? ` (${from.projectName})` : ''}` : 'another session';
    // A shell gets the command itself; an agent gets it as a task from a colleague.
    const task = t.kind === 'shell' ? text : `Task from ${who}, handed over through Elysium:\n\n${text}\n\nWhen you are done, end with a short summary of what you did and anything still open.`;
    this.sentAt.set(t.id, Date.now());
    this.log(`${from?.id ?? '?'} -> ${t.id}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
    this.d.note(`${from?.title ?? 'A session'} handed ${t.kind === 'agent' ? `${t.title} in ${t.projectName}` : t.title} a task.`);
    if (t.kind === 'claude') {
      const r = this.d.runClaude(t.id, task);
      return r.ok ? `Sent to ${t.title}. It starts on it as soon as it is free. Call elysium_wait with to "${t.id}" for the answer.` : `Could not send: ${r.reason}`;
    }
    // Another agent's terminal: type the task in, starting it first if needed.
    let s = this.d.sessions.runningFor(t.id);
    let fresh = false;
    if (!s) {
      const r = this.d.sessions.create(t.id, 120, 40, { accountId: this.d.accountFor(t.project ?? '') });
      if (!r.ok) return `Could not start ${t.title}: ${r.reason}`;
      s = r.session; fresh = true;
    }
    const id = s.id;
    setTimeout(() => { this.d.sessions.write(id, task.replace(/\n/g, ' ')); setTimeout(() => this.d.sessions.write(id, '\r'), 300); }, fresh ? 8000 : 200);
    return `Sent to ${t.title}${t.projectName ? ` in ${t.projectName}` : ''}${fresh ? ' (started it first)' : ''}. Call elysium_wait with to "${t.id}" for the answer.`;
  }

  private async wait(t: Template, seconds: number): Promise<string> {
    const since = this.sentAt.get(t.id) ?? 0;
    const end = Date.now() + seconds * 1000;
    let lastLen = -1, quietSince = Date.now();
    while (Date.now() < end) {
      const s = this.d.sessions.runningFor(t.id);
      if (!s) return `${t.title} is not running.`;
      if (t.kind === 'claude') {
        const tel = this.d.telemetry(s.id);
        const answer = this.d.reader(s.id).filter((e) => e.role === 'claude' && Date.parse(e.at) > since).pop();
        if (tel?.state === 'waiting') return `${t.title} is waiting on the owner: ${tel.waitingMessage ?? 'a question or a permission'}.${answer ? `\n\nLast thing it said:\n${answer.text}` : ''}`;
        if (answer && tel?.state === 'idle' && Date.now() - since > 3000) return `${t.title} finished:\n\n${answer.text}`;
      } else {
        // A terminal agent is done when its screen has been still for a while after the task.
        const len = this.d.sessions.replay(s.id)?.endOffset ?? 0;
        if (len !== lastLen) { lastLen = len; quietSince = Date.now(); }
        if (Date.now() - since > 15000 && Date.now() - quietSince > 12000) return `${t.title} has gone quiet. Its screen now:\n\n${this.screen(s)}`;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return `${t.title} is still working after ${seconds} seconds. Call elysium_wait again to keep waiting, or elysium_read to see where it is.`;
  }

  private read(t: Template, count: number): string {
    const s = this.d.sessions.runningFor(t.id);
    if (!s) return `${t.title} is not running.`;
    if (t.kind !== 'claude') return this.screen(s);
    const said = this.d.reader(s.id).filter((e) => e.role === 'claude').slice(-count);
    const st = this.d.telemetry(s.id)?.state ?? 'running';
    return said.length ? `${t.title} (${st === 'busy' ? 'working' : st}):\n\n${said.map((e) => e.text).join('\n\n---\n\n')}` : `${t.title} has not said anything yet (${st}).`;
  }

  private screen(s: SessionInfo): string {
    const text = plain(this.d.sessions.replay(s.id)?.data.slice(-20000) ?? '');
    return text.split('\n').map((l) => l.trimEnd()).filter((l, i, all) => l || all[i - 1]).slice(-60).join('\n').trim() || '(nothing on screen yet)';
  }

  private log(line: string): void {
    try { appendFileSync(join(dataDir(), 'delegations.log'), `${new Date().toISOString()} ${line}\n`); } catch { /* the log is optional */ }
  }
}
