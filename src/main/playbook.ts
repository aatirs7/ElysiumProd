// The playbook: one shared folder of the best work across every project (how things
// were built, strategies, things worth copying, lessons), written by the sessions
// themselves and readable by every project. Plain Markdown
// files in ~/Elysium Playbook, so it can be opened, edited or kept in git by hand.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PlaybookEntry, PlaybookKind } from '@shared/ipc';

const KINDS: PlaybookKind[] = ['howto', 'strategy', 'showcase', 'lesson'];
/** Anything unknown, or an entry from before kinds existed, is a how-to. */
const kindOf = (v: string | undefined): PlaybookKind => { const k = (v ?? '').toLowerCase().replace(/[^a-z]/g, ''); return (KINDS as string[]).includes(k) ? (k as PlaybookKind) : k === 'inspiration' ? 'showcase' : k === 'decision' ? 'lesson' : 'howto'; };

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
      kind: kindOf(meta.kind),
      author: meta.author ?? '',
    };
  } catch { return null; }
}

/** Every entry, newest first. Bodies are included; the folder is small and read on demand. */
export function playbookList(): PlaybookEntry[] {
  if (!existsSync(PLAYBOOK_DIR)) return [];
  let files: string[];
  try { files = readdirSync(PLAYBOOK_DIR); } catch { return []; }
  return files.filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md')
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
export function playbookAdd(e: { title: string; summary: string; body: string; project: string; tags: string[]; author: string; kind?: string }): PlaybookEntry {
  mkdirSync(PLAYBOOK_DIR, { recursive: true });
  const readme = join(PLAYBOOK_DIR, 'README.md');
  if (!existsSync(readme)) writeFileSync(readme, '# Elysium Playbook\n\nThe best work across every project: how things were built, strategies, things worth copying and lessons, written by the sessions that did them. Each file is one entry. Any project can search and read these through the Elysium tool, and you can edit them by hand.\n');
  const slug = slugOf(e.title);
  const one = (s: string) => s.replace(/\r?\n/g, ' ').trim();
  const text = [
    '---', `title: ${one(e.title)}`, `summary: ${one(e.summary)}`, `project: ${one(e.project)}`, `tags: ${e.tags.map(one).join(', ')}`, `kind: ${kindOf(e.kind)}`,
    `author: ${one(e.author)}`, `updated: ${new Date().toISOString()}`, '---', '', e.body.trim(), '',
  ].join('\n');
  writeFileSync(join(PLAYBOOK_DIR, `${slug}.md`), text);
  return parse(`${slug}.md`)!;
}

/** Added to every Claude session's instructions, so the playbook gets used without being asked. */
export const PLAYBOOK_HINT = [
  'Elysium keeps a shared playbook of the owner\'s best work across all of their projects: how features were built, strategies, things worth copying and lessons.',
  'Before building or planning something non-trivial, search it with the elysium_playbook_search tool for direction and follow a matching entry if there is one.',
  'When the owner asks you to explain or record how you did something, write it with elysium_playbook_add: what it is for, the steps in order, the files and commands involved, and the pitfalls you hit, so another project can repeat it.',
].join(' ');

/** What a session is asked when someone wants an entry written from the Playbook page. */
export function recordPrompt(what: string, kind?: string): string {
  const topic = what.trim();
  const save = 'Leave out secrets. Save it with the elysium_playbook_add tool';
  switch (kindOf(kind)) {
    case 'strategy': return `Write up the strategy behind ${topic || 'what you are working on'} for the shared playbook: the goal, the options you weighed, what you chose and why, and how to tell it is working. ${save} and kind "strategy", then tell me its name.`;
    case 'showcase': return `Write up ${topic || 'the best thing you built recently'} as a showcase for the shared playbook: what it is, what makes it good, and how another project could copy it, with the key files. ${save} and kind "showcase", then tell me its name.`;
    case 'lesson': return `Write up the lesson from ${topic || 'your most recent hard problem'} for the shared playbook: what happened, what you decided or got wrong, and what to do next time. ${save} and kind "lesson", then tell me its name.`;
    default: return `Explain how you built ${topic || 'what you just built'}, as a how-to another project could follow: what it is for, the steps in order, the files, commands and settings involved, and the pitfalls you hit. ${save}, then tell me its name.`;
  }
}
