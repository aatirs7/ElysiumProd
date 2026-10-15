// The playbook: one shared folder of how-tos ("SOPs") on how features were built,
// written by the sessions themselves and readable by every project. Plain Markdown
// files in ~/Elysium Playbook, so it can be opened, edited or kept in git by hand.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PlaybookEntry } from '@shared/ipc';

/** ELYSIUM_PLAYBOOK_DIR moves it, so a test run never writes into the real one. */
export const PLAYBOOK_DIR = process.env.ELYSIUM_PLAYBOOK_DIR || join(homedir(), 'Elysium Playbook');

const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'untitled';

function parse(file: string): PlaybookEntry | null {
  try {
    const text = readFileSync(join(PLAYBOOK_DIR, file), 'utf8');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
    const meta: Record<string, string> = {};
    for (const l of (m?.[1] ?? '').split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
    const body = m ? m[2] : text;
    return {
      slug: file.replace(/\.md$/i, ''),
      title: meta.title || body.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/i, ''),
      summary: meta.summary ?? '',
      project: meta.project ?? '',
      tags: (meta.tags ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      updatedAt: meta.updated || statSync(join(PLAYBOOK_DIR, file)).mtime.toISOString(),
      body,
    };
  } catch { return null; }
}

/** Every entry, newest first. Bodies are included; the folder is small and read on demand. */
export function playbookList(): PlaybookEntry[] {
  if (!existsSync(PLAYBOOK_DIR)) return [];
  return readdirSync(PLAYBOOK_DIR).filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .map(parse).filter((x): x is PlaybookEntry => Boolean(x))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function playbookRead(slug: string): PlaybookEntry | null {
  const file = `${slugOf(slug)}.md`;
  return existsSync(join(PLAYBOOK_DIR, file)) ? parse(file) : null;
}

/** Entries that mention every word of the query, best matches (title, then tags, then body) first. */
export function playbookSearch(query: string, limit = 8): PlaybookEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const all = playbookList();
  if (!words.length) return all.slice(0, limit);
  return all.map((e) => {
    const t = e.title.toLowerCase(), g = e.tags.join(' ').toLowerCase(), s = e.summary.toLowerCase(), b = e.body.toLowerCase();
    let score = 0;
    for (const w of words) score += (t.includes(w) ? 6 : 0) + (g.includes(w) ? 4 : 0) + (s.includes(w) ? 3 : 0) + (b.includes(w) ? 1 : 0);
    return { e, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.e);
}

/** Writes an entry. The same title updates the same file. */
export function playbookAdd(e: { title: string; summary: string; body: string; project: string; tags: string[]; author: string }): PlaybookEntry {
  mkdirSync(PLAYBOOK_DIR, { recursive: true });
  const readme = join(PLAYBOOK_DIR, 'README.md');
  if (!existsSync(readme)) writeFileSync(readme, '# Elysium Playbook\n\nHow features were built, written by the sessions that built them. Each file is one how-to. Any project can search and read these through the Elysium tool, and you can edit them by hand.\n');
  const slug = slugOf(e.title);
  const one = (s: string) => s.replace(/\r?\n/g, ' ').trim();
  const text = [
    '---', `title: ${one(e.title)}`, `summary: ${one(e.summary)}`, `project: ${one(e.project)}`, `tags: ${e.tags.map(one).join(', ')}`,
    `author: ${one(e.author)}`, `updated: ${new Date().toISOString()}`, '---', '', e.body.trim(), '',
  ].join('\n');
  writeFileSync(join(PLAYBOOK_DIR, `${slug}.md`), text);
  return parse(`${slug}.md`)!;
}

/** Added to every Claude session's instructions, so the playbook gets used without being asked. */
export const PLAYBOOK_HINT = [
  'Elysium keeps a shared playbook of how features were built, across all of the owner\'s projects.',
  'Before building something non-trivial, search it with the elysium_playbook_search tool and follow a matching how-to if there is one.',
  'When the owner asks you to explain or record how you did something, write it with elysium_playbook_add: what it is for, the steps in order, the files and commands involved, and the pitfalls you hit, so another project can repeat it.',
].join(' ');
