// Costs across providers, per project, read only.
//  - Vercel: `vercel usage --group-by project`, the CLI's own billing figures.
//  - Neon: each project's compute time this period and its branches' size, from
//    Neon's API with the neonctl sign in. Neon's Launch plan has no billing API,
//    so the dollars are an estimate at Neon's published Launch rates.
//  - AWS: the SecurITPosture plugin's daily Cost Explorer check (mods-cost.json).
//    No AWS call is made here.
// Results are cached for an hour in costs-cache.json. No token is written anywhere.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { CostItem, CostReport } from '@shared/ipc';
import { dataDir } from './paths';
import { PROJECT_FOLDERS } from './templates';

const VERCEL_JS = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', 'vercel', 'dist', 'vc.js');
const NEON_CRED = join(homedir(), '.config', 'neonctl', 'credentials.json');
/** Neon Launch, from neon.com: compute per CU hour, storage per GB month. */
export const NEON_RATES = { cuHour: 0.106, gbMonth: 0.35 };
const CACHE = () => join(dataDir(), 'costs-cache.json');
const TTL = 60 * 60 * 1000;

function run(cmd: string, args: string[], timeout = 120000): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((r) => {
    execFile(cmd, args, { cwd: homedir(), timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } },
      (e, out, err) => r({ ok: !e, out: String(out ?? ''), err: String(err ?? (e ? e.message : '')) }));
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Which ElysiumProd project a provider project belongs to: a .vercel link first, then a name match. */
function matcher(): (provider: string, name: string, id?: string) => string | null {
  const links = new Map<string, string>();
  const names = new Map<string, string>();
  for (const [pid, p] of Object.entries(PROJECT_FOLDERS)) {
    try {
      const f = join(p.folder, '.vercel', 'project.json');
      if (existsSync(f)) {
        const j = JSON.parse(readFileSync(f, 'utf8')) as { projectId?: string; projectName?: string };
        if (j.projectId) links.set(j.projectId, pid);
        if (j.projectName) links.set(`name:${j.projectName}`, pid);
      }
    } catch { /* unreadable link, fall back to names */ }
    for (const n of [pid, p.name, basename(p.folder), p.repo?.split('/')[1] ?? '']) if (n) names.set(norm(n), pid);
  }
  return (provider, name, id) => {
    if (provider === 'vercel') {
      const byLink = (id && links.get(id)) || links.get(`name:${name}`);
      if (byLink) return byLink;
    }
    return names.get(norm(name)) ?? null;
  };
}

async function vercel(from?: string, to?: string): Promise<{ items: CostItem[]; error: string | null; period: { from: string; to: string } | null }> {
  if (!existsSync(VERCEL_JS)) return { items: [], error: 'The Vercel CLI is not installed.', period: null };
  const args = [VERCEL_JS, 'usage', '--group-by', 'project', '--format', 'json', ...(from ? ['--from', from] : []), ...(to ? ['--to', to] : [])];
  const r = await run('node', args);
  const start = r.out.indexOf('{');
  if (start < 0) return { items: [], error: /login|auth/i.test(r.err) ? 'Sign in with vercel login.' : 'Vercel did not answer.', period: null };
  try {
    const j = JSON.parse(r.out.slice(start)) as { period: { from: string; to: string }; groupBy: { data: { name: string; services: { name: string; billedCost: number; effectiveCost: number }[]; totals: { billedCost: number; effectiveCost: number } }[] } };
    const match = matcher();
    const items = j.groupBy.data.map((p): CostItem => ({
      provider: 'vercel', key: `vercel:${p.name}`, name: p.name, cost: p.totals.billedCost, value: p.totals.effectiveCost, estimate: false,
      projectId: p.name === '(unattributed)' ? null : match('vercel', p.name),
      services: p.services.filter((s) => s.effectiveCost > 0.0005).map((s) => ({ name: s.name, cost: s.billedCost, value: s.effectiveCost })),
      note: null,
    }));
    return { items, error: null, period: j.period };
  } catch {
    return { items: [], error: 'Vercel answered in a form this version does not read.', period: null };
  }
}

interface NeonCred { access_token?: string; expires_at?: number }
function neonToken(): NeonCred | null {
  try { return JSON.parse(readFileSync(NEON_CRED, 'utf8')) as NeonCred; } catch { return null; }
}

async function neon(): Promise<{ items: CostItem[]; error: string | null }> {
  let cred = neonToken();
  if (!cred?.access_token) return { items: [], error: 'Sign in with neonctl auth.' };
  // neonctl refreshes its own sign in when it runs; let it do that rather than handling the refresh token here.
  if (!cred.expires_at || cred.expires_at < Date.now() + 60000) {
    await run(process.platform === 'win32' ? 'cmd.exe' : 'npx', process.platform === 'win32' ? ['/d', '/c', 'npx', '-y', 'neonctl@latest', 'me', '-o', 'json'] : ['-y', 'neonctl@latest', 'me', '-o', 'json'], 240000);
    cred = neonToken();
    if (!cred?.access_token || (cred.expires_at && cred.expires_at < Date.now())) return { items: [], error: 'The Neon sign in has expired. Run neonctl auth.' };
  }
  const h = { Authorization: `Bearer ${cred.access_token}`, Accept: 'application/json' };
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const r = await fetch(`https://console.neon.tech/api/v2${path}`, { headers: h, signal: AbortSignal.timeout(20000) });
      return r.ok ? ((await r.json()) as T) : null;
    } catch { return null; }
  };
  const orgs = await get<{ organizations: { id: string; name: string; plan: string; managed_by: string }[] }>('/users/me/organizations');
  if (!orgs) return { items: [], error: 'Neon did not answer.' };
  const match = matcher();
  const items: CostItem[] = [];
  for (const o of orgs.organizations) {
    const list = await get<{ projects: { id: string; name: string; compute_time_seconds?: number; consumption_period_start?: string; consumption_period_end?: string }[] }>(`/projects?org_id=${o.id}&limit=400`);
    for (const p of list?.projects ?? []) {
      // The list leaves out usage; the project itself carries this period's compute time.
      const full = (await get<{ project: typeof p }>(`/projects/${p.id}`))?.project ?? p;
      const branches = await get<{ branches: { logical_size?: number }[] }>(`/projects/${p.id}/branches`);
      const bytes = (branches?.branches ?? []).reduce((n, b) => n + (b.logical_size ?? 0), 0);
      const gb = bytes / 1e9;
      const cuHours = (full.compute_time_seconds ?? 0) / 3600;
      const start = Date.parse(full.consumption_period_start ?? '') || Date.now();
      const end = Date.parse(full.consumption_period_end ?? '') || Date.now();
      const elapsed = Math.min(1, Math.max(0, (Date.now() - start) / Math.max(1, end - start)));
      // A free plan, or one billed through Vercel, costs nothing here.
      const paid = o.plan !== 'free' && o.managed_by !== 'vercel';
      const compute = cuHours * NEON_RATES.cuHour;
      const storage = gb * NEON_RATES.gbMonth * elapsed;
      items.push({
        provider: 'neon', key: `neon:${p.id}`, name: p.name, cost: paid ? compute + storage : 0, value: compute + storage, estimate: true,
        projectId: match('neon', p.name),
        services: [
          { name: `Compute, ${cuHours.toFixed(1)} CU hours`, cost: paid ? compute : 0, value: compute },
          { name: `Storage, ${gb < 1 ? `${Math.round(bytes / 1e6)} MB` : `${gb.toFixed(2)} GB`}`, cost: paid ? storage : 0, value: storage },
        ],
        note: paid ? `${o.name}, ${o.plan} plan` : o.managed_by === 'vercel' ? 'Billed through Vercel' : 'Free plan',
      });
    }
  }
  return { items, error: null };
}

function aws(): { items: CostItem[]; error: string | null } {
  const items: CostItem[] = [];
  for (const [pid, p] of Object.entries(PROJECT_FOLDERS)) {
    const f = join(p.folder, '.claude', 'mods-cost.json');
    if (!existsSync(f)) continue;
    try {
      const c = JSON.parse(readFileSync(f, 'utf8')) as { status?: string; total?: number; bedrock?: number; fetchedOn?: string; month?: string };
      if (c.status !== 'ok' || typeof c.total !== 'number') continue;
      const bedrock = typeof c.bedrock === 'number' ? c.bedrock : 0;
      items.push({
        provider: 'aws', key: `aws:${pid}`, name: `${p.name} account`, cost: c.total, value: c.total, estimate: false, projectId: pid,
        services: [{ name: 'AWS services', cost: c.total - bedrock, value: c.total - bedrock }, ...(bedrock ? [{ name: 'Bedrock', cost: bedrock, value: bedrock }] : [])],
        note: `From the plugin's daily check on ${c.fetchedOn ?? 'an unknown day'}`,
      });
    } catch { /* skip an unreadable file */ }
  }
  return { items, error: null };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function costReport(force = false): Promise<CostReport> {
  if (!force) {
    try {
      const c = JSON.parse(readFileSync(CACHE(), 'utf8')) as CostReport;
      if (Date.now() - Date.parse(c.computedAt) < TTL) return c;
    } catch { /* first run */ }
  }
  const now = new Date();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const [v, vLast, n] = await Promise.all([vercel(), vercel(ymd(lastStart), ymd(lastEnd)), neon()]);
  const a = aws();
  const report: CostReport = {
    computedAt: new Date().toISOString(),
    period: v.period ?? { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() },
    items: [...v.items, ...n.items, ...a.items],
    lastMonth: { vercel: vLast.error ? null : vLast.items.reduce((s, i) => s + i.cost, 0), vercelValue: vLast.error ? null : vLast.items.reduce((s, i) => s + i.value, 0) },
    errors: { vercel: v.error, neon: n.error, aws: a.error },
    neonRates: NEON_RATES,
  };
  try { writeFileSync(CACHE(), JSON.stringify(report)); } catch { /* cache is optional */ }
  return report;
}
