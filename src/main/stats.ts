// Home dashboard data: each project's logo and this week's activity. Read only:
// git log for commits and lines, transcript file times for when you last worked.
// Automated commits (bots and the daily "chore(tracker): day end") are not counted,
// so a paused project reads as paused (spec 8.2).
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { ProjectStats } from '@shared/ipc';
import { listAccounts } from './accounts';
import { PROJECT_FOLDERS } from './templates';

/** The real mark for each project, from its own repository. */
const LOGOS: Record<string, string[]> = {
  posture: ['public/brand/original/favicon-48.ico', 'app/favicon.ico'],
  intern: ['build/icons/apple-touch-icon.png', 'build/home/mark.svg', 'build/logo.svg'],
  attestia: ['app/icon.svg'],
  gulf: ['apps/site/app/icon.svg'],
  builds: ['app/icon.png'],
  winboard: ['mobile/assets/brand/icon.png'],
  sharjeelcrm: ['public/icon-192.png', 'app/favicon.ico'],
  accshop: ['public/admin/icon-192.png', 'src/app/favicon.ico'],
  ventures: ['favicon.svg', 'assets/icon-512.png'],
  elysiumprod: [],
};
const MIME: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' };

function logo(projectId: string, folder: string): string | null {
  for (const rel of LOGOS[projectId] ?? []) {
    const f = join(folder, rel);
    try {
      if (!existsSync(f) || statSync(f).size > 512 * 1024) continue;
      const mime = MIME[extname(f).toLowerCase()];
      if (mime) return `data:${mime};base64,${readFileSync(f).toString('base64')}`;
    } catch { /* try the next */ }
  }
  return null;
}

function git(folder: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['-C', folder, ...args], { windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (e, out) => resolve(e ? '' : String(out)));
  });
}

function lastSessionAt(folder: string): string | null {
  const slug = folder.replace(/[:\\/ _.]/g, '-');
  let newest = 0;
  for (const a of listAccounts()) {
    const dir = join(a.configDir, 'projects', slug);
    try {
      for (const f of readdirSync(dir)) if (f.endsWith('.jsonl')) newest = Math.max(newest, statSync(join(dir, f)).mtimeMs);
    } catch { /* no history on this account */ }
  }
  return newest ? new Date(newest).toISOString() : null;
}

let cache: { at: number; value: ProjectStats[] } | null = null;

export async function projectStats(): Promise<ProjectStats[]> {
  if (cache && Date.now() - cache.at < 60000) return cache.value;
  const value = await Promise.all(Object.entries(PROJECT_FOLDERS).map(async ([id, p]) => {
    if (!existsSync(p.folder)) return { id, name: p.name, logo: null, commitsThisWeek: 0, linesThisWeek: 0, activeDays: 0, lastCommitAt: null, lastSessionAt: null };
    const log = await git(p.folder, ['log', '--all', '--since=7.days', '--no-merges', '--format=@@%an|%cI|%s', '--numstat']);
    let commits = 0, lines = 0, counting = false;
    const days = new Set<string>();
    for (const line of log.split(/\r?\n/)) {
      if (line.startsWith('@@')) {
        const [author, date, ...subject] = line.slice(2).split('|');
        counting = !/\[bot\]/i.test(author) && !/^chore\(tracker\): day end/i.test(subject.join('|'));
        if (counting) { commits += 1; days.add(date.slice(0, 10)); }
      } else if (counting) {
        const m = line.match(/^(\d+)\t(\d+)\t(.+)$/);
        if (m && !/lock|\.min\.|dist\/|\.svg$|\.png$/.test(m[3])) lines += Number(m[1]) + Number(m[2]);
      }
    }
    const last = (await git(p.folder, ['log', '--all', '-1', '--no-merges', '--format=%cI', '--invert-grep', '--grep=chore(tracker): day end'])).trim() || null;
    return { id, name: p.name, logo: logo(id, p.folder), commitsThisWeek: commits, linesThisWeek: lines, activeDays: days.size, lastCommitAt: last, lastSessionAt: lastSessionAt(p.folder) };
  }));
  cache = { at: Date.now(), value };
  return value;
}
