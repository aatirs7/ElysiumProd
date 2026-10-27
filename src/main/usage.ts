// Personal usage stats: agent hours per project and per day, from the timestamps
// in Claude Code's own transcripts, counted the way the Phase A audit did (a ten
// minute window counts if anything was written in it). Only the "timestamp" field
// is read; message content is never parsed or kept.
//
// The transcript format is internal to Claude Code (spec 10.4), so this is an
// estimate, cached incrementally: each file is read only from where the last scan
// stopped, so a second scan of about 2 GB of history takes a moment, not minutes.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { UsageStats } from '@shared/ipc';
import { listAccounts } from './accounts';
import { dataDir } from './paths';
import { PROJECT_FOLDERS } from './templates';

const CACHE = () => join(dataDir(), 'usage-cache.json');
const BUCKET_MS = 10 * 60 * 1000;
const KEEP_DAYS = 120;

interface FileState { offset: number; size: number; buckets: number[] }
interface Cache { version: 1; files: Record<string, FileState> }

function slugOf(folder: string): string { return folder.replace(/[:\\/ _.]/g, '-'); }

function loadCache(): Cache {
  try { const c = JSON.parse(readFileSync(CACHE(), 'utf8')) as Cache; if (c.version === 1) return c; } catch { /* rebuild */ }
  return { version: 1, files: {} };
}

/** Reads new bytes of a transcript and returns the ten minute buckets they touch. */
async function scanFrom(path: string, from: number, size: number): Promise<number[]> {
  const out = new Set<number>();
  // Asynchronous reads, so even the first scan of every transcript never freezes the app.
  const fh = await open(path, 'r');
  try {
    const chunk = Buffer.alloc(4 * 1024 * 1024);
    let pos = from, carry = '';
    while (pos < size) {
      const { bytesRead: n } = await fh.read(chunk, 0, Math.min(chunk.length, size - pos), pos);
      if (n <= 0) break;
      pos += n;
      const text = carry + chunk.toString('utf8', 0, n);
      const lines = text.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        const m = line.match(/"timestamp":"(\d{4}-\d\d-\d\dT[\d:.]+Z?)"/);
        if (!m || line.includes('"isSidechain":true')) continue;
        const t = Date.parse(m[1]);
        if (!Number.isNaN(t)) out.add(Math.floor(t / BUCKET_MS));
      }
    }
  } finally { await fh.close(); }
  return [...out];
}

let running: Promise<UsageStats> | null = null;
let last: { at: number; value: UsageStats } | null = null;

export function usageStats(): Promise<UsageStats> {
  if (last && Date.now() - last.at < 5 * 60 * 1000) return Promise.resolve(last.value);
  if (!running) running = compute().finally(() => { running = null; });
  return running;
}

async function compute(): Promise<UsageStats> {
  const cache = loadCache();
  const minBucket = Math.floor((Date.now() - KEEP_DAYS * 86400000) / BUCKET_MS);
  const byProject = new Map<string, Set<number>>();
  const all = new Set<number>();
  const slugToProject = new Map(Object.entries(PROJECT_FOLDERS).map(([id, p]) => [slugOf(p.folder), id]));

  for (const acc of listAccounts()) {
    const root = join(acc.configDir, 'projects');
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      const projectId = slugToProject.get(dir) ?? `other:${dir}`;
      let files: string[] = [];
      try { files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of files) {
        const path = join(root, dir, f);
        let size = 0;
        try { size = statSync(path).size; } catch { continue; }
        let st = cache.files[path];
        if (!st || size < st.offset) st = { offset: 0, size: 0, buckets: [] };
        if (size > st.offset) {
          const fresh = await scanFrom(path, st.offset, size);
          st = { offset: size, size, buckets: [...new Set([...st.buckets, ...fresh])].filter((b) => b >= minBucket) };
        }
        cache.files[path] = st;
        const set = byProject.get(projectId) ?? new Set<number>();
        for (const b of st.buckets) { set.add(b); all.add(b); }
        byProject.set(projectId, set);
      }
    }
  }
  try { writeFileSync(CACHE(), JSON.stringify(cache)); } catch { /* cache is optional */ }

  const dayKey = (b: number) => new Date(b * BUCKET_MS).toLocaleDateString('en-CA');
  const today = new Date();
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push(d.toLocaleDateString('en-CA')); }
  const perDay = Object.fromEntries(days.map((d) => [d, 0]));
  const perHour = Array.from({ length: 24 }, () => 0);
  for (const b of all) {
    const k = dayKey(b);
    if (k in perDay) perDay[k] += 10;
    if (k in perDay) perHour[new Date(b * BUCKET_MS).getHours()] += 10;
  }
  const weekAgo = Date.now() - 7 * 86400000, monthAgo = Date.now() - 30 * 86400000;
  const projects = [...byProject.entries()]
    .filter(([id]) => !id.startsWith('other:'))
    .map(([id, set]) => {
      let week = 0, month = 0, lastAt = 0;
      for (const b of set) {
        const t = b * BUCKET_MS;
        if (t >= weekAgo) week += 10;
        if (t >= monthAgo) month += 10;
        lastAt = Math.max(lastAt, t);
      }
      return { id, name: PROJECT_FOLDERS[id]?.name ?? id, minutesWeek: week, minutesMonth: month, lastAt: lastAt ? new Date(lastAt).toISOString() : null };
    })
    .sort((a, b) => b.minutesMonth - a.minutesMonth);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (perDay[days[i]] > 0) streak++; else if (i !== days.length - 1) break; }
  const sum = (o: Record<string, number>, from: number) => Object.entries(o).filter(([d]) => Date.parse(d) >= from - 86400000).reduce((s, [, v]) => s + v, 0);
  const value: UsageStats = {
    computedAt: new Date().toISOString(),
    minutesWeek: sum(perDay, weekAgo),
    minutesMonth: Object.values(perDay).reduce((a, b) => a + b, 0),
    streakDays: streak,
    perDay: days.map((d) => ({ day: d, minutes: perDay[d] })),
    perHour,
    projects,
  };
  last = { at: Date.now(), value };
  return value;
}
