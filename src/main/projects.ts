// Read-only views of the owner's projects: relay, board tasks and git state.
// Nothing here writes to another repository. GitHub is read through the gh CLI
// (the system credential path; ElysiumProd never handles tokens), and git is
// limited to status and log. Results are cached briefly so many widgets share one call.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GitInfo, ProjectInfo, RelayInfo, TaskInfo } from '@shared/ipc';
import { PROJECT_FOLDERS } from './templates';
import { isCustom } from './newproject';

function run(cmd: string, args: string[], cwd?: string, timeout = 15000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (e, out, err) => {
      resolve({ ok: !e, out: String(out ?? ''), err: String(err ?? (e ? e.message : '')) });
    });
  });
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

interface Mods { relayRepo?: string; relayFile?: string; relayIssue?: string; waitingHeading?: string; nowHeading?: string }

/** The plugin's defaults, used where a repo has no .claude/mods.json (SecurITPosture). */
const PLUGIN_DEFAULTS: Mods = { relayRepo: 'SecurITPosture-01/securitposture_2026', relayIssue: '105', waitingHeading: 'Waiting on Aatir', nowHeading: 'Now' };

/** Relay settings from the repo's .claude/mods.json; the plugin's own defaults only apply to SecurITPosture. */
function mods(folder: string, projectId?: string): Mods {
  const f = join(folder, '.claude', 'mods.json');
  const repo = projectId ? PROJECT_FOLDERS[projectId]?.repo ?? undefined : undefined;
  try {
    if (existsSync(f)) return { relayRepo: repo, ...JSON.parse(readFileSync(f, 'utf8')) };
    if (projectId === 'posture') return PLUGIN_DEFAULTS;
    return { relayRepo: repo };
  } catch { return { relayRepo: repo }; }
}

export function listProjects(): ProjectInfo[] {
  return Object.entries(PROJECT_FOLDERS).map(([id, p]) => {
    const m = mods(p.folder, id);
    return { id, name: p.name, folder: p.folder, repo: m.relayRepo ?? null, tier: p.tier, hasRelay: Boolean(m.relayFile || m.relayIssue), waitingHeading: m.waitingHeading ?? 'Blocked on the owner', exists: existsSync(p.folder), custom: isCustom(id) };
  });
}

export function readRelay(projectId: string): Promise<RelayInfo> {
  const p = PROJECT_FOLDERS[projectId];
  if (!p) return Promise.resolve({ ok: false, error: 'Unknown project', text: '', updatedAt: null, source: '', waitingHeading: '' });
  const m = mods(p.folder, projectId);
  const waitingHeading = m.waitingHeading ?? 'Blocked on the owner';
  return cached(`relay:${projectId}`, 60000, async () => {
    if (!m.relayRepo || (!m.relayFile && !m.relayIssue)) return { ok: false, error: 'This project has no relay', text: '', updatedAt: null, source: '', waitingHeading };
    if (m.relayFile) {
      const r = await run('gh', ['api', `repos/${m.relayRepo}/contents/${m.relayFile}`, '-H', 'Accept: application/vnd.github.raw']);
      const c = await run('gh', ['api', `repos/${m.relayRepo}/commits?path=${encodeURIComponent(m.relayFile)}&per_page=1`, '--jq', '.[0].commit.committer.date']);
      return { ok: r.ok, error: r.ok ? null : r.err.trim().split('\n')[0], text: r.out, updatedAt: c.ok ? c.out.trim() || null : null, source: `${m.relayRepo} ${m.relayFile}`, waitingHeading };
    }
    const r = await run('gh', ['issue', 'view', String(m.relayIssue), '-R', m.relayRepo, '--json', 'body,updatedAt']);
    if (!r.ok) return { ok: false, error: r.err.trim().split('\n')[0], text: '', updatedAt: null, source: `${m.relayRepo} #${m.relayIssue}`, waitingHeading };
    const j = JSON.parse(r.out) as { body: string; updatedAt: string };
    return { ok: true, error: null, text: j.body, updatedAt: j.updatedAt, source: `${m.relayRepo} #${m.relayIssue}`, waitingHeading };
  });
}

export function readTasks(projectId: string): Promise<{ ok: boolean; error: string | null; tasks: TaskInfo[] }> {
  const p = PROJECT_FOLDERS[projectId];
  const m = p ? mods(p.folder, projectId) : {};
  return cached(`tasks:${projectId}`, 60000, async () => {
    if (!m.relayRepo) return { ok: false, error: 'No repository configured', tasks: [] };
    const r = await run('gh', ['issue', 'list', '-R', m.relayRepo, '--state', 'open', '--limit', '60', '--json', 'number,title,labels,updatedAt,url,comments']);
    if (!r.ok) return { ok: false, error: r.err.trim().split('\n')[0], tasks: [] };
    const raw = JSON.parse(r.out) as { number: number; title: string; labels: { name: string }[]; updatedAt: string; url: string; comments: unknown[] }[];
    const tasks = raw.map((i) => {
      const labels = i.labels.map((l) => l.name);
      const needsOwner = labels.some((l) => /needs:owner|to:aatir|blocked/i.test(l)) || /^Decide/i.test(i.title);
      return { number: i.number, title: i.title, labels, updatedAt: i.updatedAt, url: i.url, comments: i.comments?.length ?? 0, needsOwner };
    });
    return { ok: true, error: null, tasks };
  });
}

export function readGit(projectId: string): Promise<GitInfo> {
  const p = PROJECT_FOLDERS[projectId];
  return cached(`git:${projectId}`, 15000, async () => {
    if (!p || !existsSync(p.folder)) return { ok: false, error: 'Folder not found', branch: null, ahead: 0, behind: 0, dirty: 0, commits: [] };
    const [st, log] = await Promise.all([
      run('git', ['-C', p.folder, 'status', '--porcelain=v1', '--branch']),
      run('git', ['-C', p.folder, 'log', '-8', '--format=%h%x09%cr%x09%s']),
    ]);
    if (!st.ok) return { ok: false, error: st.err.trim().split('\n')[0], branch: null, ahead: 0, behind: 0, dirty: 0, commits: [] };
    const lines = st.out.split(/\r?\n/).filter(Boolean);
    const head = lines[0] ?? '';
    const branch = head.startsWith('## HEAD') ? 'detached HEAD' : head.replace(/^## /, '').split('...')[0];
    const ahead = Number(head.match(/ahead (\d+)/)?.[1] ?? 0);
    const behind = Number(head.match(/behind (\d+)/)?.[1] ?? 0);
    const commits = log.out.split(/\r?\n/).filter(Boolean).map((l) => { const [hash, when, ...s] = l.split('\t'); return { hash, when, subject: s.join('\t') }; });
    return { ok: true, error: null, branch, ahead, behind, dirty: lines.length - 1, commits };
  });
}

/** What the plugin's line used to show, for the project top bar: AWS spend and items waiting on the owner. */
export async function projectGlance(projectId: string): Promise<{ awsTotal: number | null; awsCap: number | null; waiting: number | null }> {
  const p = PROJECT_FOLDERS[projectId];
  if (!p) return { awsTotal: null, awsCap: null, waiting: null };
  let awsTotal: number | null = null;
  try {
    const f = join(p.folder, '.claude', 'mods-cost.json');
    if (existsSync(f)) { const c = JSON.parse(readFileSync(f, 'utf8')) as { status?: string; total?: number }; if (c.status === 'ok' && typeof c.total === 'number') awsTotal = c.total; }
  } catch { /* no cost file */ }
  let waiting: number | null = null;
  const r = await readRelay(projectId);
  if (r.ok) {
    const lines = r.text.split(/\r?\n/);
    const start = lines.findIndex((l) => /^#{2,3}\s/.test(l) && l.replace(/^#+\s*/, '').trim().toLowerCase() === r.waitingHeading.toLowerCase());
    if (start >= 0) {
      waiting = 0;
      for (let i = start + 1; i < lines.length && !/^#{1,3}\s/.test(lines[i]); i++) if (/^[-*]\s/.test(lines[i])) waiting++;
    }
  }
  // The plugin's own budget line for this repository is 70 dollars a month.
  return { awsTotal, awsCap: awsTotal === null ? null : 70, waiting };
}
