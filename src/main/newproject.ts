// Projects made in the app: clone a repository, start one from scratch, or add a
// folder that is already on disk. Saved to projects.json beside workspace.json and
// added to the live project table at start up. Removing one only takes it out of
// the app; its folder, git history and Claude history stay where they are.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, homedir, totalmem } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import type { NewProjectRequest, NewProjectResult } from '@shared/ipc';
import { dataDir } from './paths';
import { PROJECT_FOLDERS, PROJECTS, registerProject, unregisterProject, type ProjectDef } from './templates';

const FILE = () => join(dataDir(), 'projects.json');
const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';

function run(cmd: string, args: string[], cwd?: string, timeout = 120000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((r) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (e, out, err) => r({ ok: !e, out: String(out ?? ''), err: String(err ?? (e ? e.message : '')) }));
  });
}

function saved(): ProjectDef[] {
  try {
    const rows = JSON.parse(readFileSync(FILE(), 'utf8')) as ProjectDef[];
    return Array.isArray(rows) ? rows.filter((p) => p && typeof p.id === 'string' && typeof p.folder === 'string') : [];
  } catch { return []; }
}

/** The owner's own list, kept on this PC only (profile.json beside workspace.json). */
function profileProjects(): ProjectDef[] {
  try {
    const j = JSON.parse(readFileSync(join(dataDir(), 'profile.json'), 'utf8')) as { projects?: ProjectDef[] };
    return (Array.isArray(j.projects) ? j.projects : []).filter((p) => p && typeof p.id === 'string' && typeof p.folder === 'string' && typeof p.name === 'string');
  } catch { return []; }
}

function save(): void {
  writeFileSync(FILE(), JSON.stringify(PROJECTS.filter((p) => p.source === 'custom'), null, 2));
}

/** What the Laptop session is for and how it works on this PC. */
function laptopNote(): string {
  const shell = existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe') ? 'PowerShell 7 (pwsh) and Windows PowerShell 5.1' : 'Windows PowerShell 5.1 (pwsh is not installed)';
  return [
    '# PC Helper', '',
    'This session is a tool for this computer itself, not a codebase. The owner asks it to fix things on the PC or to audit it: slowness, disk space, startup apps, drivers, Windows Update, network and Wi-Fi, battery health, security settings, installed software, scheduled tasks, odd processes.', '',
    `Machine: Windows on ${arch() === 'arm64' ? 'ARM64' : arch()}, ${Math.round(totalmem() / 1024 ** 3)} GB of memory. Shell: ${shell}.`, '',
    'How to work:',
    '- Look before changing. Audits are read only: report what you found, in plain words, and what you would change.',
    '- Before anything hard to undo (uninstalling, deleting files, registry edits, changing services, drivers or firewall rules, anything that needs a reboot), say exactly what you will do and wait for a yes.',
    '- Never print or save the contents of passwords, keys, tokens or other secrets. Paths only.',
    '- Do not stop or kill Elysium (electron.exe) or any claude.exe process; other work runs in them.',
    '- When something is done, check that it worked and say how you checked.',
    '- Keep a short log in notes/log.md: the date, what was asked, what you found, what you changed.', '',
  ].join('\n');
}

/** The Laptop tool's folder and its CLAUDE.md, which says how to work on this PC. Never overwritten. */
function ensureLaptopTool(): void {
  const p = PROJECTS.find((x) => x.id === 'laptop');
  if (!p) return;
  try {
    mkdirSync(join(p.folder, 'notes'), { recursive: true });
    const md = join(p.folder, 'CLAUDE.md');
    if (!existsSync(md)) writeFileSync(md, laptopNote());
  } catch { /* the session reports a missing folder itself */ }
}

/** Adds the saved projects to the live table. Called once at start up. */
export function loadCustomProjects(): void {
  ensureLaptopTool();
  for (const p of profileProjects()) registerProject({ ...p, source: 'profile' });
  for (const p of saved()) registerProject({ ...p, custom: true, source: 'custom' });
}

/** "owner/repo" from a GitHub address, or null for anything else. */
function githubSlug(url: string): string | null {
  const m = url.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'project';
  let id = base;
  for (let i = 2; PROJECT_FOLDERS[id]; i += 1) id = `${base}-${i}`;
  return id;
}

const isEmptyDir = (dir: string) => { try { return readdirSync(dir).length === 0; } catch { return false; } };

async function remoteSlug(folder: string): Promise<string | null> {
  const r = await run('git', ['remote', 'get-url', 'origin'], folder, 10000);
  return r.ok ? githubSlug(r.out.trim()) : null;
}

export async function createProject(req: NewProjectRequest): Promise<NewProjectResult> {
  const name = String(req.name ?? '').trim();
  if (!/^[\w .()&+-]{1,60}$/.test(name)) return { ok: false, reason: 'Give it a name of up to 60 letters, numbers, spaces or dashes.' };
  const parent = req.parent && isAbsolute(req.parent) ? req.parent : homedir();
  let folder: string;
  let repo: string | null = null;

  if (req.mode === 'existing') {
    folder = String(req.folder ?? '');
    if (!isAbsolute(folder) || !existsSync(folder)) return { ok: false, reason: 'Pick a folder that exists.' };
    folder = resolve(folder);
    if (Object.values(PROJECT_FOLDERS).some((p) => resolve(p.folder).toLowerCase() === folder.toLowerCase())) return { ok: false, reason: 'That folder is already a project here.' };
    repo = await remoteSlug(folder);
  } else if (req.mode === 'clone') {
    const url = String(req.url ?? '').trim();
    const slug = githubSlug(url);
    const isUrl = /^https:\/\/[\w.-]+\/[\w./-]+$/.test(url) || /^git@[\w.-]+:[\w./-]+$/.test(url);
    if (!slug && !isUrl) return { ok: false, reason: 'Paste a repository address, such as https://github.com/owner/repo, or owner/repo.' };
    const source = slug && !isUrl ? `https://github.com/${slug}.git` : url;
    const dirName = (req.folderName || basename(slug ?? url).replace(/\.git$/, '')).replace(/[^\w.-]/g, '-');
    folder = join(parent, dirName);
    if (existsSync(folder) && !isEmptyDir(folder)) return { ok: false, reason: `${folder} already exists and is not empty. Choose another folder name.` };
    // gh uses your GitHub sign in, so private repositories clone too; plain git is the fallback.
    const r = existsSync(GH) && slug
      ? await run(GH, ['repo', 'clone', slug, folder], parent, 15 * 60000)
      : await run('git', ['clone', source, folder], parent, 15 * 60000);
    if (!r.ok) return { ok: false, reason: `The clone failed: ${r.err.trim().split('\n').slice(-2).join(' ').slice(0, 300)}` };
    repo = slug ?? (await remoteSlug(folder));
  } else {
    const dirName = (req.folderName || name).replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'project';
    folder = join(parent, dirName);
    if (existsSync(folder) && !isEmptyDir(folder)) return { ok: false, reason: `${folder} already exists and is not empty. Choose another folder name.` };
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'README.md'), `# ${name}\n`);
    const steps: [string, string[]][] = [['git', ['init', '-b', 'main']], ['git', ['add', 'README.md']], ['git', ['commit', '-m', `Start ${name}`]]];
    for (const [c, a] of steps) {
      const r = await run(c, a, folder, 30000);
      if (!r.ok) return { ok: false, reason: `Could not set up git in ${folder}: ${r.err.trim().slice(0, 200)}` };
    }
    if (req.github === 'private' || req.github === 'public') {
      if (!existsSync(GH)) return { ok: false, reason: 'The folder is ready, but the GitHub CLI is not installed, so no repository was made on GitHub.' };
      const r = await run(GH, ['repo', 'create', dirName, `--${req.github}`, '--source', folder, '--remote', 'origin', '--push'], folder, 120000);
      if (!r.ok) return { ok: false, reason: `The folder is ready, but GitHub said: ${r.err.trim().slice(0, 240)}` };
      repo = await remoteSlug(folder);
    }
  }

  const id = slugify(name);
  const pair = req.sessions === 'pair'
    ? { prime: `Prime ${name}`, meridian: `Meridian ${name}`, pluginPrime: `Prime ${name}`, pluginMeridian: `Meridian ${name}`, extra: [] }
    : undefined;
  const def: ProjectDef = { id, name, folder, repo, tier: pair ? 'main' : 'side', custom: true, ...(pair ? { pair } : {}) };
  registerProject(def);
  save();
  return { ok: true, reason: null, projectId: id };
}

export function removeProject(id: string): boolean {
  const ok = unregisterProject(id);
  if (ok) save();
  return ok;
}

export function isCustom(id: string): boolean {
  return PROJECTS.some((p) => p.id === id && p.source === 'custom');
}
