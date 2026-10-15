// Token breakdown: how much each project and model used, per day, from the usage
// numbers Claude Code writes into its own transcripts. Only "model", "usage",
// "timestamp" and the message id are read with a pattern; message content is never
// parsed or kept. Cached incrementally like usage.ts, so rescans are quick.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { TokenStats } from '@shared/ipc';
import { listAccounts } from './accounts';
import { dataDir } from './paths';
import { PROJECT_FOLDERS } from './templates';

const CACHE = () => join(dataDir(), 'tokens-cache.json');
const KEEP_DAYS = 45;

/** day -> model -> [input, output, cacheRead, cacheWrite] */
type Days = Record<string, Record<string, [number, number, number, number]>>;
interface FileState { offset: number; days: Days; seen: string[] }
interface Cache { version: 1; files: Record<string, FileState & { project: string; account: string }> }

const slugOf = (folder: string) => folder.replace(/[:\\/ _.]/g, '-');
const num = (line: string, key: string) => Number(line.match(new RegExp(`"${key}":(\\d+)`))?.[1] ?? 0);

function loadCache(): Cache {
  try { const c = JSON.parse(readFileSync(CACHE(), 'utf8')) as Cache; if (c.version === 1) return c; } catch { /* rebuild */ }
  return { version: 1, files: {} };
}

async function scan(path: string, st: FileState, size: number): Promise<void> {
  const fh = await open(path, 'r');
  const seen = new Set(st.seen);
  try {
    const chunk = Buffer.alloc(4 * 1024 * 1024);
    let pos = st.offset, carry = '';
    while (pos < size) {
      const { bytesRead: n } = await fh.read(chunk, 0, Math.min(chunk.length, size - pos), pos);
      if (n <= 0) break;
      pos += n;
      const lines = (carry + chunk.toString('utf8', 0, n)).split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.includes('"usage"') || !line.includes('"type":"assistant"')) continue;
        // One reply is written several times as it streams; count each message id once.
        const id = line.match(/"message":\{[^{}]*?"id":"(msg_[^"]+)"/)?.[1] ?? line.match(/"id":"(msg_[^"]+)"/)?.[1];
        if (id) { if (seen.has(id)) continue; seen.add(id); }
        const ts = line.match(/"timestamp":"(\d{4}-\d\d-\d\d)T/)?.[1];
        const model = (line.match(/"model":"([^"]+)"/)?.[1] ?? 'unknown').replace(/^claude-/, '').replace(/-\d{8}$/, '');
        if (!ts || model === '<synthetic>') continue;
        const day = new Date(`${ts}T12:00:00Z`).toLocaleDateString('en-CA');
        const d = (st.days[day] ??= {});
        const m = (d[model] ??= [0, 0, 0, 0]);
        m[0] += num(line, 'input_tokens'); m[1] += num(line, 'output_tokens');
        m[2] += num(line, 'cache_read_input_tokens'); m[3] += num(line, 'cache_creation_input_tokens');
      }
    }
  } finally { await fh.close(); }
  st.offset = size;
  st.seen = [...seen].slice(-5000);
}

let running: Promise<TokenStats> | null = null;
let last: { at: number; value: TokenStats } | null = null;

export function tokenStats(): Promise<TokenStats> {
  if (last && Date.now() - last.at < 5 * 60 * 1000) return Promise.resolve(last.value);
  if (!running) running = compute().finally(() => { running = null; });
  return running;
}

async function compute(): Promise<TokenStats> {
  const cache = loadCache();
  const slugToProject = new Map(Object.entries(PROJECT_FOLDERS).map(([id, p]) => [slugOf(p.folder), id]));
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toLocaleDateString('en-CA');
  for (const acc of listAccounts()) {
    const root = join(acc.configDir, 'projects');
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      const project = slugToProject.get(dir) ?? 'other';
      let files: string[] = [];
      try { files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
      for (const f of files) {
        const path = join(root, dir, f);
        let size = 0, mtime = 0;
        try { const s = statSync(path); size = s.size; mtime = s.mtimeMs; } catch { continue; }
        // Files untouched for longer than the window cannot add anything new.
        if (!cache.files[path] && mtime < Date.now() - KEEP_DAYS * 86400000) continue;
        let st = cache.files[path];
        if (!st || size < st.offset) st = { offset: 0, days: {}, seen: [], project, account: acc.id };
        st.project = project; st.account = acc.id;
        if (size > st.offset) await scan(path, st, size);
        for (const d of Object.keys(st.days)) if (d < cutoff) delete st.days[d];
        cache.files[path] = st;
      }
    }
  }
  try { writeFileSync(CACHE(), JSON.stringify(cache)); } catch { /* cache is optional */ }

  const days: string[] = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toLocaleDateString('en-CA')); }
  const weekStart = days[days.length - 7];
  const perDay = Object.fromEntries(days.map((d) => [d, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }]));
  const byProject = new Map<string, { week: number; month: number }>();
  const byModel = new Map<string, { week: number; month: number }>();
  const byAccount = new Map<string, { week: number; month: number }>();
  const totals = { week: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, month: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const bump = (m: Map<string, { week: number; month: number }>, k: string, v: number, wk: boolean) => { const r = m.get(k) ?? { week: 0, month: 0 }; r.month += v; if (wk) r.week += v; m.set(k, r); };
  for (const st of Object.values(cache.files)) {
    for (const [day, models] of Object.entries(st.days)) {
      if (!(day in perDay)) continue;
      const wk = day >= weekStart;
      for (const [model, [i, o, cr, cw]] of Object.entries(models)) {
        const all = i + o + cr + cw;
        perDay[day].input += i; perDay[day].output += o; perDay[day].cacheRead += cr; perDay[day].cacheWrite += cw;
        for (const [k, v] of [['input', i], ['output', o], ['cacheRead', cr], ['cacheWrite', cw]] as const) { totals.month[k] += v; if (wk) totals.week[k] += v; }
        bump(byProject, st.project, all, wk); bump(byModel, model, all, wk); bump(byAccount, st.account, all, wk);
      }
    }
  }
  const list = (m: Map<string, { week: number; month: number }>, name: (k: string) => string) =>
    [...m.entries()].map(([id, v]) => ({ id, name: name(id), ...v })).filter((r) => r.month > 0).sort((a, b) => b.month - a.month);
  const value: TokenStats = {
    computedAt: new Date().toISOString(),
    totals,
    perDay: days.map((d) => ({ day: d, ...perDay[d] })),
    projects: list(byProject, (k) => (k === 'other' ? 'Other folders' : PROJECT_FOLDERS[k]?.name ?? k)),
    models: list(byModel, (k) => k),
    accounts: list(byAccount, (k) => k),
  };
  last = { at: Date.now(), value };
  return value;
}
