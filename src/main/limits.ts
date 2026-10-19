// The plan limits of each Claude account, so the top bar can show both accounts
// even when only one has a session running. Two sources: every few minutes the
// same usage figures claude.ai shows, read with the account's own Claude Code
// sign in (never refreshed or changed here), and between those, each session's
// status line (rate_limits). Kept in limits.json so they survive a restart.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountLimits, Telemetry } from '@shared/ipc';
import { listAccounts } from './accounts';
import { dataDir } from './paths';

const secs = (v: unknown): number | null => {
  if (typeof v === 'number') return v > 1e12 ? Math.round(v / 1000) : v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : Math.round(t / 1000); }
  return null;
};

/** One window's figure: a reading from an older window is stale; in the same window use only grows. */
function merge(pct: number | null | undefined, at: number | null | undefined, prevPct: number | null | undefined, prevAt: number | null | undefined, exact: boolean): [number | null, number | null] {
  const p = pct ?? null, a = secs(at), pp = prevPct ?? null, pa = secs(prevAt);
  if (p == null) return [pp, pa];
  if (a != null && pa != null && a < pa - 60) return [pp, pa];
  if (!exact && a != null && pa != null && Math.abs(a - pa) <= 60 && pp != null) return [Math.max(p, pp), pa];
  return [p, a ?? pa];
}

export class Limits {
  private byAccount = new Map<string, AccountLimits>();
  private path = join(dataDir(), 'limits.json');
  private timer: NodeJS.Timeout | null = null;

  constructor(private emit: (l: AccountLimits) => void) {
    try {
      const rows = JSON.parse(readFileSync(this.path, 'utf8')) as AccountLimits[];
      for (const r of rows) if (r && typeof r.accountId === 'string') this.byAccount.set(r.accountId, r);
    } catch { /* first run */ }
  }

  all(): AccountLimits[] { return [...this.byAccount.values()]; }

  update(accountId: string, t: Pick<Telemetry, 'fiveHourPercent' | 'sevenDayPercent' | 'fiveHourResetsAt' | 'sevenDayResetsAt'>, exact = false): void {
    if (t.fiveHourPercent == null && t.sevenDayPercent == null) return;
    const prev = this.byAccount.get(accountId);
    const [five, fiveAt] = merge(t.fiveHourPercent, t.fiveHourResetsAt, prev?.fiveHourPercent, prev?.fiveHourResetsAt, exact);
    const [week, weekAt] = merge(t.sevenDayPercent, t.sevenDayResetsAt, prev?.sevenDayPercent, prev?.sevenDayResetsAt, exact);
    const next: AccountLimits = { accountId, fiveHourPercent: five, sevenDayPercent: week, fiveHourResetsAt: fiveAt, sevenDayResetsAt: weekAt, at: new Date().toISOString() };
    const same = prev && prev.fiveHourPercent === next.fiveHourPercent && prev.sevenDayPercent === next.sevenDayPercent
      && secs(prev.fiveHourResetsAt) === next.fiveHourResetsAt && secs(prev.sevenDayResetsAt) === next.sevenDayResetsAt;
    this.byAccount.set(accountId, next);
    if (same) return;
    this.emit(next);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { writeFileSync(this.path, JSON.stringify(this.all(), null, 2)); } catch { /* best effort */ }
    }, 5000);
  }

  private polling = false;
  private lastPoll = 0;

  /** Reads every signed in account's live usage. At most once a minute; quiet on any failure. */
  async poll(): Promise<void> {
    if (this.polling || Date.now() - this.lastPoll < 60000) return;
    this.polling = true;
    this.lastPoll = Date.now();
    try {
      await Promise.all(listAccounts().filter((a) => a.loggedIn).map(async (a) => {
        try {
          const c = (JSON.parse(readFileSync(join(a.configDir, '.credentials.json'), 'utf8')) as { claudeAiOauth?: { accessToken?: string; expiresAt?: number } }).claudeAiOauth;
          // An expired sign in is left for Claude Code to refresh; this never refreshes it.
          if (!c?.accessToken || (c.expiresAt && c.expiresAt < Date.now())) return;
          const r = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: `Bearer ${c.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(8000) });
          if (!r.ok) return;
          const j = (await r.json()) as { five_hour?: { utilization?: number; resets_at?: string } | null; seven_day?: { utilization?: number; resets_at?: string } | null };
          this.update(a.id, {
            fiveHourPercent: j.five_hour?.utilization ?? null, fiveHourResetsAt: secs(j.five_hour?.resets_at),
            sevenDayPercent: j.seven_day?.utilization ?? null, sevenDayResetsAt: secs(j.seven_day?.resets_at),
          }, true);
        } catch { /* offline or signed out: keep the last figures */ }
      }));
    } finally { this.polling = false; }
  }

  /** Polls now, every four minutes, and when the window comes back into focus (see index.ts). */
  start(): void {
    setTimeout(() => void this.poll(), 4000);
    setInterval(() => void this.poll(), 4 * 60000).unref?.();
  }
}
