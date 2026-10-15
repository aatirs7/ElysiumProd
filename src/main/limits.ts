// The last plan limits each Claude account reported, so the top bar can show
// both accounts even when only one has a session running. The figures come from
// the CLI's own status line (rate_limits); nothing here calls Anthropic.
// Kept in limits.json so they survive a restart.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountLimits, Telemetry } from '@shared/ipc';
import { dataDir } from './paths';

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

  update(accountId: string, t: Telemetry): void {
    if (t.fiveHourPercent == null && t.sevenDayPercent == null) return;
    const prev = this.byAccount.get(accountId);
    const next: AccountLimits = {
      accountId,
      fiveHourPercent: t.fiveHourPercent ?? prev?.fiveHourPercent ?? null,
      sevenDayPercent: t.sevenDayPercent ?? prev?.sevenDayPercent ?? null,
      fiveHourResetsAt: t.fiveHourResetsAt ?? prev?.fiveHourResetsAt ?? null,
      sevenDayResetsAt: t.sevenDayResetsAt ?? prev?.sevenDayResetsAt ?? null,
      at: new Date().toISOString(),
    };
    const same = prev && prev.fiveHourPercent === next.fiveHourPercent && prev.sevenDayPercent === next.sevenDayPercent && prev.fiveHourResetsAt === next.fiveHourResetsAt;
    this.byAccount.set(accountId, next);
    if (same) return;
    this.emit(next);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try { writeFileSync(this.path, JSON.stringify(this.all(), null, 2)); } catch { /* best effort */ }
    }, 5000);
  }
}
