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
import { dirname, join } from 'node:path';
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
const gh = (args: string[], cwd?: string, timeout?: number) => run(existsSync(GH) ? GH : 'gh', args, cwd, timeout);

function read<T>(file: string, empty: T): T {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T; } catch { return empty; }
}
const boards = () => read<Record<string, Board>>(FILE(), {});

/** Projects with the bridge on, and those with a bridge of their own (.claude/mods.json), which are left alone. */
export function boardList(): BoardInfo[] {
  const on = boards();
  const own = Object.entries(PROJECT_FOLDERS).filter(([id, p]) => !on[id] && existsSync(join(p.folder, '.claude', 'mods.json'))).map(([projectId]) => ({ projectId, repo: '', own: true }));
  return [...Object.entries(on).map(([projectId, b]) => ({ projectId, repo: b.repo })), ...own];
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
  if (!existsSync(join(folder, '.claude', 'rules', 'elysium-bridge.md'))) writeFileSync(join(folder, '.claude', 'rules', 'elysium-bridge.md'), RULE);
  const md = join(folder, 'CLAUDE.md');
  const had = existsSync(md) ? readFileSync(md, 'utf8') : '';
  if (!had.includes('@.claude/rules/elysium-bridge.md')) writeFileSync(md, `${had}${had && !had.endsWith('\n') ? '\n' : ''}@.claude/rules/elysium-bridge.md\n`);
  return ['.elysium/board.json', RELAY, '.claude/rules/elysium-bridge.md', 'CLAUDE.md'];
}

const IGNORE = ['node_modules/', '.env', '.env.*', '*.pem', '*.key', '*.p8', 'dist/', 'build/', '.next/', '.expo/', '.vercel/', ''].join('\n');

/**
 * Turns the chat bridge on for a project: its own commit, pushed. A project not
 * on GitHub yet is put there first, as a private repository (and a folder that is
 * not a git repository yet becomes one, with secrets and build output ignored).
 */
export async function enableBoard(projectId: string): Promise<{ ok: boolean; reason: string | null; made?: string }> {
  const p = PROJECT_FOLDERS[projectId];
  if (!p) return { ok: false, reason: 'No such project.' };
  if (existsSync(join(p.folder, '.claude', 'mods.json'))) return { ok: false, reason: 'This project has a chat bridge of its own, so it is left as it is.' };
  const login = await ghLogin();
  if (!login) return { ok: false, reason: 'GitHub is not signed in here. Run gh auth login in a terminal, then try again.' };
  let repo = await originSlug(p.folder);
  const isGit = (await run('git', ['rev-parse', '--is-inside-work-tree'], p.folder, 10000)).ok;
  let files: string[];
  try { files = writeBoardFiles(p.folder, p.name, login); } catch (e) {
    return { ok: false, reason: `Could not write the board files: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isGit) {
    if (!existsSync(join(p.folder, '.gitignore'))) writeFileSync(join(p.folder, '.gitignore'), IGNORE);
    const init = await run('git', ['init', '-b', 'main'], p.folder);
    if (!init.ok) return { ok: false, reason: `Could not set up git: ${init.err.trim().slice(0, 200)}` };
    await run('git', ['add', '-A'], p.folder);
    const first = await run('git', ['commit', '-m', `Start ${p.name}`], p.folder);
    if (!first.ok) return { ok: false, reason: `Could not make the first commit: ${first.err.trim().slice(0, 200)}` };
  } else {
    await run('git', ['add', '--', ...files], p.folder);
    const c = await run('git', ['commit', '-m', 'Turn on the Elysium chat bridge', '--', ...files], p.folder);
    if (!c.ok && !/nothing to commit/i.test(c.out + c.err)) return { ok: false, reason: `Could not commit the board files: ${c.err.trim().slice(0, 200)}` };
  }
  let made: string | undefined;
  if (!repo) {
    // Not on GitHub yet: a private repository named after the folder (or with a number when that is taken).
    const base = (p.folder.split(/[\\/]/).pop() ?? p.name).replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'project';
    for (let i = 1; i <= 5 && !repo; i += 1) {
      const name = i === 1 ? base : `${base}-${i}`;
      const r = await gh(['repo', 'create', name, '--private', '--source', p.folder, '--remote', 'origin', '--push'], p.folder, 600000);
      if (r.ok) repo = await originSlug(p.folder);
      else if (!/already exists/i.test(r.err)) return { ok: false, reason: `GitHub would not make the repository: ${r.err.trim().split('\n').pop()?.slice(0, 200) ?? ''}` };
    }
    if (!repo) return { ok: false, reason: 'GitHub already has repositories with that name. Rename the folder, then try again.' };
    made = repo;
  } else {
    const push = await run('git', ['push', '-u', 'origin', 'HEAD'], p.folder, 120000);
    if (!push.ok) return { ok: false, reason: `The board files are committed but did not push: ${push.err.trim().split('\n').pop()?.slice(0, 200) ?? ''}` };
  }
  await addBoard(projectId, repo, login);
  return { ok: true, reason: null, ...(made ? { made } : {}) };
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

const FILES_LINE = /^Files \(branch ([\w./-]+)\): (.+)$/m;

/** Copies the chat's files from their side branch into the project folder, as they are. Returns the paths saved. */
async function fetchFiles(repo: string, branch: string, list: string, folder: string, token: string): Promise<string[]> {
  const saved: string[] = [];
  for (const path of list.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20)) {
    // Only into docs/from-chat, never anywhere else in the folder.
    if (!path.startsWith('docs/from-chat/') || path.split('/').some((x) => x === '..' || x === '')) continue;
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'elysium' },
    }).catch(() => null);
    if (!r?.ok) continue;
    try {
      const to = join(folder, ...path.split('/'));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, Buffer.from(await r.arrayBuffer()));
      saved.push(path);
    } catch { /* the message still names what could not be saved */ }
  }
  return saved;
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
        // Files the chat made arrive as files in the project folder before Prime hears about them.
        const body = (i.body ?? '').replace(/^Source:.*\n+/, '');
        const sent = body.match(FILES_LINE);
        const saved = sent ? await fetchFiles(b.repo, sent[1], sent[2], PROJECT_FOLDERS[id].folder, token) : [];
        const text = body.replace(FILES_LINE, saved.length ? `Files from the chat, saved in this folder as they were written: ${saved.join(', ')}` : '').trim();
        const filesOnly = /^Files from the planning chat/.test(i.title);
        this.deliver(id, lead.id, [
          filesOnly ? `The planning chat sent files, issue #${i.number}.` : `A task from the planning chat, issue #${i.number}: ${i.title}`, '',
          text.slice(0, 6000), '',
          filesOnly
            ? `Read them, then close the issue with a one line comment (gh issue close ${i.number} --comment "...").`
            : `When it is done, close it with a one line comment (gh issue close ${i.number} --comment "...") and update ${RELAY}.`,
        ].join('\n'), i.title);
      }
    }));
    if (changed) writeFileSync(SEEN(), JSON.stringify(seen));
  }
}
