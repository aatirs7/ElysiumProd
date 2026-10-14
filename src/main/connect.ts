// Onboarding's Connect step: what is installed and signed in (Claude Code and its
// accounts, Git, GitHub, Vercel, Neon), and a way to fix each. Signing in always
// happens in the tool's own login, in a window the person can see; Elysium never
// handles a password or token, it only checks whether the sign in is there.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { ConnectService, ConnectStatus, RepoCandidate } from '@shared/ipc';
import { listAccounts } from './accounts';
import { DEMO, demoAddAccount, demoConnect, demoConnections, demoRepos } from './demo';
import { resolveClaude } from './claude';
import { PROJECT_FOLDERS } from './templates';

const APPDATA = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const VERCEL_JS = join(APPDATA, 'npm', 'node_modules', 'vercel', 'dist', 'vc.js');
const VERCEL_AUTH = [join(APPDATA, 'com.vercel.cli', 'Data', 'auth.json'), join(APPDATA, 'xdg.data', 'com.vercel.cli', 'auth.json'), join(homedir(), '.local', 'share', 'com.vercel.cli', 'auth.json')];
const NEON_CRED = join(homedir(), '.config', 'neonctl', 'credentials.json');
const GH_PATHS = ['C:\\Program Files\\GitHub CLI\\gh.exe', join(process.env.LOCALAPPDATA ?? '', 'Programs', 'GitHub CLI', 'gh.exe')];

function run(cmd: string, args: string[], timeout = 10000): Promise<{ ok: boolean; out: string }> {
  return new Promise((r) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (e, out, err) => r({ ok: !e, out: `${out ?? ''}\n${err ?? ''}` }));
  });
}

async function which(name: string): Promise<string | null> {
  const r = await run('where.exe', [name], 5000);
  return r.ok ? r.out.split(/\r?\n/).map((x) => x.trim()).find(Boolean) ?? null : null;
}

async function ghPath(): Promise<string | null> {
  return GH_PATHS.find((p) => existsSync(p)) ?? (await which('gh'));
}

/** Everything the Connect step shows. All checks are files or quick lookups, run at once, so it answers in about a second. */
export async function connections(): Promise<ConnectStatus[]> {
  if (DEMO) return demoConnections();
  const [git, gh, node, vercelBin] = await Promise.all([which('git'), ghPath(), which('node'), existsSync(VERCEL_JS) ? Promise.resolve(VERCEL_JS) : which('vercel')]);
  const ghAuth = gh ? await run(gh, ['auth', 'status', '--hostname', 'github.com'], 8000) : null;
  const ghUser = ghAuth?.out.match(/account\s+(\S+)/i)?.[1] ?? ghAuth?.out.match(/as\s+(\S+)/i)?.[1] ?? null;
  // A file check, not `vercel whoami`, which takes many seconds.
  const vercelSignedIn = VERCEL_AUTH.some((f) => existsSync(f));
  const claude = resolveClaude(true);
  const accounts = listAccounts();
  return [
    { id: 'claude', name: 'Claude Code', what: 'Runs every session. Add more accounts to run more at once.', installed: Boolean(claude), signedIn: accounts.some((a) => a.loggedIn), who: null, required: true,
      accounts: accounts.map((a) => ({ id: a.id, configDir: a.configDir, signedIn: a.loggedIn })) },
    { id: 'git', name: 'Git', what: 'Tracks changes in your projects.', installed: Boolean(git), signedIn: Boolean(git), who: null, required: true },
    { id: 'github', name: 'GitHub', what: 'Clone repositories, see issues and pull requests.', installed: Boolean(gh), signedIn: Boolean(ghAuth?.ok), who: ghAuth?.ok ? ghUser : null, required: false },
    { id: 'vercel', name: 'Vercel', what: 'Deploys and what each project costs to host.', installed: Boolean(vercelBin && node), signedIn: vercelSignedIn, who: null, required: false },
    { id: 'neon', name: 'Neon', what: 'Database usage and cost per project.', installed: Boolean(node), signedIn: existsSync(NEON_CRED), who: null, required: false },
  ];
}

/** Opens a visible PowerShell window that runs the tool's own installer or sign in. */
function openWindow(title: string, lines: string[]): void {
  const script = [`$Host.UI.RawUI.WindowTitle = 'Elysium: ${title.replace(/'/g, '')}'`, `Write-Host ''`, `Write-Host '  ${title.replace(/'/g, '')}' -ForegroundColor Cyan`, `Write-Host ''`, ...lines,
    `Write-Host ''`, `Write-Host '  Done. You can close this window and go back to Elysium.' -ForegroundColor Green`].join('; ');
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', script], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
}

export async function connect(service: ConnectService, action: 'install' | 'signin', accountId?: string): Promise<{ ok: boolean; reason: string | null }> {
  if (DEMO) return demoConnect(service, action, accountId);
  const npm = 'npm install -g';
  switch (service) {
    case 'claude': {
      if (action === 'install') { openWindow('Install Claude Code', ['irm https://claude.ai/install.ps1 | iex']); return { ok: true, reason: null }; }
      const acc = listAccounts().find((a) => a.id === (accountId ?? 'main'));
      if (!acc) return { ok: false, reason: 'No such account.' };
      const claude = resolveClaude() ?? 'claude';
      const env = acc.isDefault ? 'Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue' : `$env:CLAUDE_CONFIG_DIR = '${acc.configDir.replace(/'/g, "''")}'`;
      openWindow(`Sign in to Claude (${acc.isDefault ? 'main account' : acc.id})`, [env, "Write-Host '  Claude Code opens below. Type /login and follow the browser, then /exit.' -ForegroundColor Gray", `& '${claude.replace(/'/g, "''")}'`]);
      return { ok: true, reason: null };
    }
    case 'git':
      openWindow('Install Git', ['winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements']);
      return { ok: true, reason: null };
    case 'github': {
      if (action === 'install') { openWindow('Install GitHub CLI', ['winget install --id GitHub.cli -e --source winget --accept-package-agreements --accept-source-agreements']); return { ok: true, reason: null }; }
      const gh = (await ghPath()) ?? 'gh';
      openWindow('Sign in to GitHub', [`& '${gh}' auth login --hostname github.com --git-protocol https --web`]);
      return { ok: true, reason: null };
    }
    case 'vercel':
      openWindow(action === 'install' ? 'Install Vercel CLI' : 'Sign in to Vercel', action === 'install' ? [`${npm} vercel`, 'vercel login'] : ['vercel login']);
      return { ok: true, reason: null };
    case 'neon':
      openWindow('Sign in to Neon', ['npx -y neonctl@latest auth']);
      return { ok: true, reason: null };
  }
  return { ok: false, reason: 'Unknown service.' };
}

/** A second (or third) Claude account: its own config folder, signed in separately. */
export function addClaudeAccount(name: string): { ok: boolean; reason: string | null; accountId?: string } {
  if (DEMO) return demoAddAccount(name);
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  if (!slug || slug === 'main') return { ok: false, reason: 'Give it a short name, like work or personal.' };
  const dir = join(homedir(), `.claude-${slug}`);
  try { mkdirSync(dir, { recursive: true }); } catch { return { ok: false, reason: 'Could not make its folder.' }; }
  void connect('claude', 'signin', slug);
  return { ok: true, reason: null, accountId: slug };
}

/** Git repositories in the usual places that are not projects yet, newest first. */
export function scanRepos(): RepoCandidate[] {
  if (DEMO) return demoRepos();
  const h = homedir();
  const roots = [h, join(h, 'Documents'), join(h, 'Desktop'), join(h, 'source', 'repos'), join(h, 'Projects'), join(h, 'projects'), join(h, 'dev'), join(h, 'code'), join(h, 'GitHub'), join(h, 'Documents', 'GitHub')];
  const known = new Set(Object.values(PROJECT_FOLDERS).map((p) => p.folder.toLowerCase()));
  const seen = new Set<string>();
  const out: RepoCandidate[] = [];
  for (const root of roots) {
    let names: string[] = [];
    try { names = readdirSync(root); } catch { continue; }
    for (const n of names) {
      if (n.startsWith('.') || n === 'node_modules' || n === 'AppData') continue;
      const folder = join(root, n);
      const key = folder.toLowerCase();
      if (seen.has(key) || known.has(key)) continue;
      seen.add(key);
      try {
        if (!statSync(folder).isDirectory() || !existsSync(join(folder, '.git'))) continue;
        out.push({ folder, name: basename(folder), touchedAt: statSync(join(folder, '.git')).mtime.toISOString() });
      } catch { /* unreadable: skip */ }
    }
  }
  return out.sort((a, b) => b.touchedAt.localeCompare(a.touchedAt)).slice(0, 40);
}
