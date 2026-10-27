// The chat bridge for a project: the planning chat on claude.ai (through the one
// Elysium board connector, see connector.ts) files a task as a GitHub issue, and
// Elysium hands it to that project's Prime session. Turning it on for a project
// writes .elysium/board.json (what makes the repository a board) and the relay
// file, makes the two labels, and adds the project to boards.json.
//
// One watcher serves every project: a single loop asks GitHub for each board's
// open tasks with an ETag, so an unchanged board costs nothing (304s do not count
// against the rate limit), instead of a script per project.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardInfo } from '@shared/ipc';
import { dataDir } from './paths';
import { leadTemplate, PROJECT_FOLDERS } from './templates';

const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const FILE = () => join(dataDir(), 'boards.json');
const SEEN = () => join(dataDir(), 'boards-seen.json');
const RELAY = 'docs/relay/from-prime.md';
const POLL_MS = 60000;

interface Board { repo: string; to: string; since: string }

function run(cmd: string, args: string[], cwd?: string, timeout = 60000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((r) => execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (e, out, err) => r({ ok: !e, out: String(out ?? ''), err: String(err ?? (e ? e.message : '')) })));
}
const gh = (args: string[], cwd?: string) => run(existsSync(GH) ? GH : 'gh', args, cwd);

function read<T>(file: string, empty: T): T {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; } catch { return empty; }
}
const boards = () => read<Record<string, Board>>(FILE(), {});

export function boardList(): BoardInfo[] {
  return Object.entries(boards()).map(([projectId, b]) => ({ projectId, repo: b.repo }));
}

/** "owner/repo" from a folder's origin on GitHub, or null. */
async function originSlug(folder: string): Promise<string | null> {
  const r = await run('git', ['remote', 'get-url', 'origin'], folder, 10000);
  const m = r.ok ? r.out.trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/) : null;
  return m ? `${m[1]}/${m[2]}` : null;
}

const RELAY_TEMPLATE = (name: string) => [
  `# ${name}: relay from Prime`, '',
  `Updated: ${new Date().toISOString().slice(0, 10)}`, '',
  '## Now', '', 'Just set up.', '',
  '## Shipped', '', '## Blocked on the owner', '', 'Nothing.', '',
  '## Questions', '', 'None.', '',
].join('\n');

const RULE = [
  '# The planning chat and the relay', '',
  'The owner plans in a claude.ai chat that reads this project through the Elysium board connector. It reads the relay below, the issues, and the files on GitHub.', '',
  `- Keep \`${RELAY}\` current: after each piece of work, update Now, Shipped, Blocked on the owner and Questions, and the Updated line, then commit and push it. Short, plain sentences.`,
  '- Tasks from the planning chat arrive here as GitHub issues labelled board:task; Elysium types each one in. When one is done, close it with a one line comment saying what changed (gh issue close <number> --comment "...").',
  '- The relay and issues are what the planning chat sees, so push before saying something is done.', '',
].join('\n');

/**
 * Makes a project a board. New projects call it before their first commit
 * (`commit: false`); an existing one gets its own commit, pushed.
 */
export const ghLogin = async () => (await gh(['api', 'user', '-q', '.login'])).out.trim();

/** The files that make a folder a board; CLAUDE.md gains a line that loads the relay rule. Returns what it wrote. */
export function writeBoardFiles(folder: string, name: string, login: string): string[] {
  mkdirSync(join(folder, '.elysium'), { recursive: true });
  writeFileSync(join(folder, '.elysium', 'board.json'), JSON.stringify({ name, relay: RELAY, to: login }, null, 2) + '\n');
  mkdirSync(join(folder, 'docs', 'relay'), { recursive: true });
  if (!existsSync(join(folder, RELAY))) writeFileSync(join(folder, RELAY), RELAY_TEMPLATE(name));
  mkdirSync(join(folder, '.claude', 'rules'), { recursive: true });
  writeFileSync(join(folder, '.claude', 'rules', 'relay.md'), RULE);
  const md = join(folder, 'CLAUDE.md');
  const had = existsSync(md) ? readFileSync(md, 'utf8') : '';
  if (!had.includes('@.claude/rules/relay.md')) writeFileSync(md, `${had}${had && !had.endsWith('\n') ? '\n' : ''}@.claude/rules/relay.md\n`);
  return ['.elysium/board.json', RELAY, '.claude/rules/relay.md', 'CLAUDE.md'];
}

/** Turns the chat bridge on for a project that is already on GitHub: its own commit, pushed. */
export async function enableBoard(projectId: string): Promise<{ ok: boolean; reason: string | null }> {
  const p = PROJECT_FOLDERS[projectId];
  if (!p) return { ok: false, reason: 'No such project.' };
  const login = await ghLogin();
  if (!login) return { ok: false, reason: 'GitHub is not signed in here. Run gh auth login in a terminal, then try again.' };
  const repo = await originSlug(p.folder);
  if (!repo) return { ok: false, reason: 'The chat bridge needs the project on GitHub first.' };
  let files: string[];
  try { files = writeBoardFiles(p.folder, p.name, login); } catch (e) {
    return { ok: false, reason: `Could not write the board files: ${e instanceof Error ? e.message : String(e)}` };
  }
  await run('git', ['add', '--', ...files], p.folder);
  const c = await run('git', ['commit', '-m', 'Turn on the Elysium chat bridge', '--', ...files], p.folder);
  if (!c.ok && !/nothing to commit/i.test(c.out + c.err)) return { ok: false, reason: `Could not commit the board files: ${c.err.trim().slice(0, 200)}` };
  const push = await run('git', ['push'], p.folder, 120000);
  if (!push.ok) return { ok: false, reason: `The board files are committed but did not push: ${push.err.trim().split('\n').pop()?.slice(0, 200) ?? ''}` };
  await addBoard(projectId, repo, login);
  return { ok: true, reason: null };
}

/** Once the repository is on GitHub: its labels, and the shared watcher starts watching it. */
export async function addBoard(projectId: string, repo: string, login?: string): Promise<void> {
  const to = login || (await gh(['api', 'user', '-q', '.login'])).out.trim();
  for (const [name, color] of [['board:task', '0e8a16'], [`to:${to}`, '5319e7']]) await gh(['label', 'create', name, '--repo', repo, '--color', color, '--force']);
  writeFileSync(FILE(), JSON.stringify({ ...boards(), [projectId]: { repo, to, since: new Date().toISOString() } }, null, 2));
}

export function removeBoard(projectId: string): void {
  const all = boards();
  delete all[projectId];
  writeFileSync(FILE(), JSON.stringify(all, null, 2));
}

interface Issue { number: number; title: string; body: string | null; created_at: string; user?: { login?: string }; pull_request?: unknown }

/**
 * The one watcher. Each new task (an open issue labelled board:task and
 * to:<owner>, opened by the owner's own account, newer than when the bridge was
 * turned on, give or take two minutes of clock difference) is handed to the project's Prime through `deliver`.
 */
export class BoardWatcher {
  private etags = new Map<string, string>();
  private token: { value: string; at: number } | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private deliver: (projectId: string, templateId: string, text: string, title: string) => void) {}

  start(): void {
    if (this.timer) return;
    const tick = () => { void this.poll().finally(() => { this.timer = setTimeout(tick, POLL_MS); this.timer.unref?.(); }); };
    this.timer = setTimeout(tick, 8000);
  }

  stop(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  private async ghToken(): Promise<string | null> {
    if (this.token && Date.now() - this.token.at < 3600000) return this.token.value;
    const r = await gh(['auth', 'token']);
    const value = r.out.trim();
    this.token = value ? { value, at: Date.now() } : null;
    return this.token?.value ?? null;
  }

  async poll(): Promise<void> {
    const all = boards();
    const ids = Object.keys(all).filter((id) => PROJECT_FOLDERS[id]);
    if (!ids.length) return;
    const token = await this.ghToken();
    if (!token) return;
    const seen = read<Record<string, number[]>>(SEEN(), {});
    let changed = false;
    await Promise.all(ids.map(async (id) => {
      const b = all[id];
      const url = `https://api.github.com/repos/${b.repo}/issues?state=open&per_page=30&labels=${encodeURIComponent(`board:task,to:${b.to}`)}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'elysium', ...(this.etags.has(id) ? { 'If-None-Match': this.etags.get(id)! } : {}) } }).catch(() => null);
      if (!r || r.status === 304 || !r.ok) return;
      const tag = r.headers.get('etag');
      if (tag) this.etags.set(id, tag);
      const issues = (await r.json().catch(() => [])) as Issue[];
      const lead = leadTemplate(id);
      for (const i of issues) {
        if (i.pull_request || (seen[id] ?? []).includes(i.number) || Date.parse(i.created_at) < Date.parse(b.since) - 120000 || i.user?.login !== b.to || !lead) continue;
        seen[id] = [...(seen[id] ?? []), i.number].slice(-200);
        changed = true;
        this.deliver(id, lead.id, [
          `A task from the planning chat, issue #${i.number}: ${i.title}`, '',
          (i.body ?? '').replace(/^Source:.*\n+/, '').slice(0, 6000), '',
          `When it is done, close it with a one line comment (gh issue close ${i.number} --comment "...") and update ${RELAY}.`,
        ].join('\n'), i.title);
      }
    }));
    if (changed) writeFileSync(SEEN(), JSON.stringify(seen));
  }
}
