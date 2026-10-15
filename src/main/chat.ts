// Chats: Claude Code behind a chat window instead of a terminal. Each message runs
// `claude -p` with stream-json output, resuming the chat's own conversation, so it
// is a real Claude Code session (same tools, same history) shown as messages.
//
// Three kinds:
//   tool:elysiumprod  Customize Elysium: full tools in the app's own source.
//   tool:laptop       PC Helper: full tools in its folder; its CLAUDE.md says to ask first.
//   plan:<project>    Planning: read only tools in the project, and a fresh context pack
//                     (recent commits, open tasks, what the coding sessions said lately)
//                     with every message, so it is always up to date without a relay.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatEvent, ChatMessage, ChatState } from '@shared/ipc';
import { accountEnv } from './accounts';
import { resolveClaude } from './claude';
import { childEnv } from './env';
import { flowStep } from './ingest';
import { dataDir } from './paths';
import { saverOn } from './settings';
import { readGit, readTasks } from './projects';
import { PROJECT_FOLDERS } from './templates';

interface Chat { state: ChatState; child: ChildProcess | null; stopped?: boolean }

const FILE = (id: string) => join(dataDir(), 'chats', `${id.replace(/[^\w.-]/g, '_')}.json`);
const KEEP = 400;

const SYSTEM: Record<string, string> = {
  'tool:elysiumprod': [
    'You are the Elysium Builder, working inside the source of the Elysium desktop app itself (Electron, React, TypeScript). The person talking to you uses this app and wants it changed.',
    'Make the change they ask for, in the style of the surrounding code. Then run `npx tsc --noEmit -p tsconfig.json` and `npx electron-vite build` and fix anything that fails.',
    'Never stop, kill or restart electron.exe or any claude.exe process: you run inside the app. When a change is built, tell them to use Restart Elysium (tray, Settings or Ctrl K) to load it.',
    'Keep the app fast: measure before and after anything that could slow startup, opening a screen or scrolling, and say what changed.',
    'Answer in plain, short sentences. No code dumps unless asked.',
  ].join('\n'),
  'tool:laptop': [
    'You are the PC Helper, a tool for auditing and fixing this Windows computer. You are not working on a codebase.',
    'Look before changing anything. Explain findings in plain words for someone who is not an IT person. Before anything hard to undo, say exactly what you will do and wait for a yes.',
    'Never print secrets. Never stop Elysium (electron.exe) or claude.exe.',
    'Lay every answer out the same way, so it reads at a glance:',
    '- Start with one or two sentences that give the answer itself.',
    '- Then a few sections, each under a "### " heading, such as "What I found", "What is using the most" or "Disk space".',
    '- Short bullets inside a section, each starting with the thing in bold, then what it means. Numbers with their units.',
    '- A table only when three or more items share the same columns (for example the top programs by memory: Program, Memory, What it is).',
    '- End with "### What I would do": a numbered list, safest and most useful first, each with what it saves or fixes. Then ask which ones to go ahead with.',
    'Show numbers as pictures, which the app draws from fenced blocks of plain lines:',
    '- ```stats for the headline numbers, one "Label: value" per line; write "4.4 GB of 15.6 GB" or "41%" and it gets a meter.',
    '- ```bars to compare things, one "Name: value unit" per line, biggest first, at most eight.',
    '- ```status for checks, one "ok: ...", "warn: ..." or "bad: ..." per line.',
    'Use stats near the top of a check, bars instead of a list of sizes, and status instead of a list of findings. Keep the words short around them.',
    'No long paragraphs, no repeated points, nothing about how you looked unless it matters.'
  ].join('\n'),
};

const PLAN_SYSTEM = (name: string) => [
  `You are the planning partner for the project "${name}". The person is the owner. Coding happens in other Claude sessions; you are where they think out loud: product, pricing, go to market, priorities, architecture, what to build next.`,
  'You can read the project\'s files to ground what you say, but you do not edit code or run commands. Each message comes with a fresh context pack: recent commits, open tasks, and what the coding sessions said lately. Use it; it is current.',
  'When you and the owner settle on something the coding session should do, end your reply with a short, self contained task under a line that says exactly "Task for the builder:". The owner can send it with one click.',
  'Be direct, concrete and brief. Plain sentences, no filler.',
].join('\n');

export class Chats {
  private chats = new Map<string, Chat>();

  constructor(
    private emit: (e: ChatEvent) => void,
    /** What the project's coding sessions said lately, newest last. */
    private recentFromSessions: (projectId: string) => string[],
    private accountFor: (projectId: string) => string,
  ) {}

  private load(id: string): Chat {
    let c = this.chats.get(id);
    if (c) return c;
    let state: ChatState = { id, conversationId: null, messages: [], running: false, error: null };
    try { state = { ...state, ...(JSON.parse(readFileSync(FILE(id), 'utf8')) as Partial<ChatState>), running: false, error: null }; } catch { /* a new chat */ }
    c = { state, child: null };
    this.chats.set(id, c);
    return c;
  }

  private save(c: Chat): void {
    try {
      mkdirSync(join(dataDir(), 'chats'), { recursive: true });
      const { id, conversationId, messages } = c.state;
      writeFileSync(FILE(c.state.id), JSON.stringify({ id, conversationId, messages: messages.slice(-KEEP) }));
    } catch { /* history is a nicety */ }
  }

  get(id: string): ChatState { return this.load(id).state; }

  /** Where a chat works and what it may do. */
  private setup(id: string): { cwd: string; projectId: string; system: string; readOnly: boolean } | null {
    if (id.startsWith('tool:')) {
      const projectId = id.slice(5);
      const p = PROJECT_FOLDERS[projectId];
      if (!p || !SYSTEM[id]) return null;
      return { cwd: p.folder, projectId, system: SYSTEM[id], readOnly: false };
    }
    if (id.startsWith('plan:')) {
      const projectId = id.slice(5);
      const p = PROJECT_FOLDERS[projectId];
      if (!p) return null;
      return { cwd: p.folder, projectId, system: PLAN_SYSTEM(p.name), readOnly: true };
    }
    return null;
  }

  private async contextPack(projectId: string): Promise<string> {
    const [git, tasks] = await Promise.all([readGit(projectId).catch(() => null), readTasks(projectId).catch(() => null)]);
    const parts: string[] = [];
    if (git?.ok) parts.push(`Branch ${git.branch ?? '?'}, ${git.dirty} uncommitted files. Recent commits:\n${git.commits.slice(0, 12).map((c) => `- ${c.when}: ${c.subject}`).join('\n')}`);
    if (tasks?.ok && tasks.tasks.length) parts.push(`Open tasks:\n${tasks.tasks.slice(0, 15).map((t) => `- #${t.number} ${t.title}${t.needsOwner ? ' (needs the owner)' : ''}`).join('\n')}`);
    const said = this.recentFromSessions(projectId);
    if (said.length) parts.push(`What the coding sessions said lately (newest last):\n${said.map((s) => `- ${s.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n')}`);
    return parts.length ? `<context_pack generated="${new Date().toISOString()}">\n${parts.join('\n\n')}\n</context_pack>` : '';
  }

  async send(id: string, text: string): Promise<{ ok: boolean; reason: string | null }> {
    const c = this.load(id);
    const s = this.setup(id);
    if (!s) return { ok: false, reason: 'Unknown chat.' };
    if (c.child) return { ok: false, reason: 'Still answering the last message.' };
    const claude = resolveClaude();
    if (!claude) return { ok: false, reason: 'Claude Code was not found.' };
    if (!existsSync(s.cwd)) return { ok: false, reason: `The folder ${s.cwd} does not exist.` };
    const t = text.trim().slice(0, 20000);
    if (!t) return { ok: false, reason: 'Nothing to send.' };

    const you: ChatMessage = { id: `u${Date.now().toString(36)}`, role: 'you', text: t, at: new Date().toISOString(), steps: [] };
    const reply: ChatMessage = { id: `a${Date.now().toString(36)}`, role: 'claude', text: '', at: new Date().toISOString(), steps: [] };
    c.state = { ...c.state, messages: [...c.state.messages, you, reply], running: true, error: null };
    this.emit({ chatId: id, state: c.state });

    const pack = id.startsWith('plan:') ? await this.contextPack(s.projectId) : '';
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--append-system-prompt', s.system];
    if (c.state.conversationId) args.push('--resume', c.state.conversationId);
    if (saverOn()) args.push('--model', 'sonnet');
    if (s.readOnly) args.push('--permission-mode', 'default', '--allowedTools', 'Read Grep Glob WebSearch WebFetch', '--disallowedTools', 'Edit Write NotebookEdit Bash PowerShell');
    else args.push('--dangerously-skip-permissions');

    const child = spawn(claude, args, { cwd: s.cwd, windowsHide: true, env: childEnv(accountEnv(this.accountFor(s.projectId))) });
    c.child = child;
    child.stdin.end(pack ? `${pack}\n\n${t}` : t);

    let buf = '';
    const segments: string[] = [];
    const joined = () => segments.map((x) => x.trim()).filter(Boolean).join('\n\n');
    const update = (patch: Partial<ChatMessage>) => {
      const msgs = c.state.messages.slice();
      const i = msgs.findIndex((m) => m.id === reply.id);
      if (i >= 0) msgs[i] = { ...msgs[i], ...patch };
      c.state = { ...c.state, messages: msgs };
      this.emit({ chatId: id, state: c.state });
    };
    const current = () => c.state.messages.find((m) => m.id === reply.id)!;
    const onLine = (line: string) => {
      let e: Record<string, any>;
      try { e = JSON.parse(line); } catch { return; }
      if (typeof e.session_id === 'string' && e.session_id !== c.state.conversationId) c.state = { ...c.state, conversationId: e.session_id };
      // Each model message streams its own text; tool calls sit between them.
      if (e.type === 'stream_event' && e.event?.type === 'message_start') { segments.push(''); }
      else if (e.type === 'stream_event' && e.event?.type === 'content_block_delta' && e.event.delta?.type === 'text_delta') {
        if (!segments.length) segments.push('');
        segments[segments.length - 1] += e.event.delta.text;
        update({ text: joined() });
      } else if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
        const steps = [...current().steps];
        for (const b of e.message.content) {
          if (b.type === 'tool_use') steps.push({ ...flowStep(String(b.name), (b.input ?? {}) as Record<string, unknown>), at: new Date().toISOString() });
        }
        if (steps.length !== current().steps.length) update({ steps });
      } else if (e.type === 'result') {
        const final = joined() || (typeof e.result === 'string' ? e.result : '');
        update({ text: final || (e.is_error ? '' : 'Done.'), costUsd: typeof e.total_cost_usd === 'number' ? e.total_cost_usd : undefined });
        if (e.is_error) c.state = { ...c.state, error: typeof e.result === 'string' ? e.result.slice(0, 400) : 'Claude reported an error.' };
      }
    };
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      let n: number;
      while ((n = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1); if (line) onLine(line); }
    });
    let err = '';
    child.stderr.on('data', (d: Buffer) => { err = (err + d.toString('utf8')).slice(-2000); });
    child.on('close', (code) => {
      if (buf.trim()) onLine(buf.trim());
      c.child = null;
      const r = current();
      if (c.stopped) { c.stopped = false; if (!r.text) update({ text: '_Stopped._' }); }
      else if (code !== 0 && !r.text) c.state = { ...c.state, error: err.trim().split(/\r?\n/).pop() || `Claude stopped (code ${code}).` };
      if (c.state.error && /log ?in|sign ?in|authenticat|credential|\/login/i.test(c.state.error)) c.state = { ...c.state, error: 'LOGIN: Claude Code is not signed in on this account yet.' };
      c.state = { ...c.state, running: false };
      this.save(c);
      this.emit({ chatId: id, state: c.state, finished: true });
    });
    child.on('error', (e) => { c.child = null; c.state = { ...c.state, running: false, error: e.message }; this.emit({ chatId: id, state: c.state, finished: true }); });
    return { ok: true, reason: null };
  }

  stop(id: string): void {
    const c = this.chats.get(id);
    if (!c?.child) return;
    c.stopped = true;
    try { c.child.kill(); } catch { /* already gone */ }
  }

  /** Starts over: a new conversation, the old messages cleared from view. */
  reset(id: string): ChatState {
    const c = this.load(id);
    this.stop(id);
    c.state = { id, conversationId: null, messages: [], running: false, error: null };
    this.save(c);
    this.emit({ chatId: id, state: c.state });
    return c.state;
  }

  stopAll(): void { for (const id of this.chats.keys()) this.stop(id); }
}
