// Other coding agents a project can run beside Claude Code: Codex, Gemini CLI.
// Each is a command line tool that runs in a terminal pane like any session. They
// are found once, in the background after launch, so startup never waits on them.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface AgentDef {
  id: string;
  name: string;
  bin: string;
  /** Arguments that continue the last conversation in this folder, when there is one. */
  resume?: string[];
  /** Whether a conversation was had in this folder before, so resuming means something. */
  hasHistory?: (cwd: string) => boolean;
  /** A file its sign in leaves behind. */
  authFiles: string[];
  signin: string;
  install: string;
  what: string;
}

const H = homedir();

export const AGENTS: AgentDef[] = [
  {
    id: 'codex', name: 'Codex', bin: 'codex', resume: ['resume', '--last'], hasHistory: codexHistory,
    authFiles: [join(H, '.codex', 'auth.json')], signin: 'codex login', install: 'npm install -g @openai/codex',
    what: 'OpenAI\'s coding agent. Runs in a project like a Claude session.',
  },
  {
    id: 'gemini', name: 'Gemini CLI', bin: 'gemini',
    authFiles: [join(H, '.gemini', 'oauth_creds.json'), join(H, '.gemini', 'google_accounts.json')], signin: 'gemini', install: 'npm install -g @google/gemini-cli',
    what: 'Google\'s coding agent. Runs in a project like a Claude session.',
  },
];

export const agentDef = (id: string) => AGENTS.find((a) => a.id === id);

/** How to start an agent: the program and any arguments that come first. */
export interface Launch { file: string; prefix: string[] }
const launches = new Map<string, Launch>();

/** Looks for every agent with one where.exe, then calls back with the ones found. */
export function findAgents(done: (found: AgentDef[]) => void): void {
  execFile('where.exe', [...AGENTS.map((a) => a.bin), 'node'], { windowsHide: true, timeout: 8000, encoding: 'utf8' }, (_e, out) => {
    const lines = String(out ?? '').split(/\r?\n/).map((x) => x.trim()).filter((x) => /^[a-z]:\\/i.test(x));
    const node = lines.find((l) => /\\node\.exe$/i.test(l)) ?? null;    const found: AgentDef[] = [];
    for (const a of AGENTS) {
      const hits = lines.filter((l) => l.split('\\').pop()!.replace(/\.(exe|cmd|ps1|bat)$/i, '').toLowerCase() === a.bin);
      const l = launchFor(hits, node);
      if (l) { launches.set(a.id, l); found.push(a); }
    }
    done(found);
  });
}

export const agentLaunch = (id: string): Launch | null => launches.get(id) ?? null;

// node-pty cannot start an npm .cmd shim cleanly (Ctrl+C asks to end a batch job),
// so the shim's script is run with node directly, as claude.ts does for Claude.
function launchFor(hits: string[], node: string | null): Launch | null {
  const exe = hits.find((h) => /\.exe$/i.test(h) && existsSync(h));
  if (exe) return { file: exe, prefix: [] };
  for (const h of hits.filter((x) => /\.cmd$/i.test(x))) {
    try {
      // The shim names node.exe first, then the agent's own script or program.
      const m = [...readFileSync(h, 'utf8').matchAll(/"%dp0%\\([^"]+\.(js|mjs|cjs|exe))"/gi)].find((x) => !/(^|\\)node\.exe$/i.test(x[1]));
      if (!m) continue;
      const target = join(dirname(h), m[1]);
      if (!existsSync(target)) continue;
      if (/\.exe$/i.test(target)) return { file: target, prefix: [] };
      if (node) return { file: node, prefix: [target] };
    } catch { /* unreadable shim: try the next */ }
  }
  return null;
}

/** Codex keeps each conversation as a file under ~/.codex/sessions; the first line says its folder. */
function codexHistory(cwd: string): boolean {
  const root = join(H, '.codex', 'sessions');
  const want = cwd.toLowerCase().replace(/\//g, '\\');
  const files: { p: string; t: number }[] = [];
  const walk = (d: string, depth: number) => {
    let names: string[] = [];
    try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      const p = join(d, n);
      if (depth < 3) walk(p, depth + 1);
      else if (n.endsWith('.jsonl')) { try { files.push({ p, t: statSync(p).mtimeMs }); } catch { /* gone */ } }
    }
  };
  walk(root, 0);
  // The newest few hundred are plenty; only the start of each is read.
  for (const f of files.sort((a, b) => b.t - a.t).slice(0, 300)) {
    try {
      const fd = openSync(f.p, 'r');
      const buf = Buffer.alloc(4096);
      const n = readSync(fd, buf, 0, buf.length, 0);
      closeSync(fd);
      const m = buf.subarray(0, n).toString('utf8').match(/"cwd":"((?:[^"\\]|\\.)*)"/);
      if (m && JSON.parse(`"${m[1]}"`).toLowerCase().replace(/\//g, '\\') === want) return true;
    } catch { /* unreadable: skip */ }
  }
  return false;
}
