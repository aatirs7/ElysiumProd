// Machine resources and the spawn gate (spec 10.6). RAM and CPU every 2s,
// free disk every 60s. Floors are fixed here in Phase 1; config.jsonc later.
import { statfs } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import { parse } from 'node:path';
import type { Level, ResourceSample } from '@shared/ipc';

export const FLOORS = {
  ramWarnPercent: 85,
  ramRefusePercent: 92,
  diskWarnBytes: 20 * 1024 ** 3,
  diskRefuseBytes: 8 * 1024 ** 3,
};

const GB = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

export class Resources {
  private last: ResourceSample | null = null;
  private prevCpu = cpuTimes();
  private disk: number | null = null;
  private timers: NodeJS.Timeout[] = [];
  readonly diskPath: string;

  constructor(dataDir: string, private emit: (r: ResourceSample) => void) {
    this.diskPath = parse(dataDir).root || 'C:\\';
  }

  async start(): Promise<void> {
    await this.sampleDisk();
    this.sample();
    this.timers.push(setInterval(() => this.sample(), 2000));
    this.timers.push(setInterval(() => void this.sampleDisk(), 60000));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
  }

  latest(): ResourceSample | null {
    return this.last;
  }

  private async sampleDisk(): Promise<void> {
    try {
      const s = await statfs(this.diskPath);
      this.disk = Number(s.bavail) * Number(s.bsize);
    } catch {
      this.disk = null;
    }
  }

  private sample(): void {
    const now = cpuTimes();
    const idle = now.idle - this.prevCpu.idle;
    const total = now.total - this.prevCpu.total;
    this.prevCpu = now;
    const tot = totalmem();
    const used = tot - freemem();
    const ramPct = (used / tot) * 100;
    const ramLevel: Level = ramPct >= FLOORS.ramRefusePercent ? 'refuse' : ramPct >= FLOORS.ramWarnPercent ? 'warn' : 'ok';
    const diskLevel: Level = this.disk === null ? 'ok' : this.disk < FLOORS.diskRefuseBytes ? 'refuse' : this.disk < FLOORS.diskWarnBytes ? 'warn' : 'ok';
    let refuseReason: string | null = null;
    if (ramLevel === 'refuse') refuseReason = `Memory is ${ramPct.toFixed(0)} percent used. New sessions start below ${FLOORS.ramRefusePercent} percent.`;
    else if (diskLevel === 'refuse') refuseReason = `Only ${GB(this.disk!)} free on ${this.diskPath}. New sessions need ${GB(FLOORS.diskRefuseBytes)}.`;
    this.last = {
      at: new Date().toISOString(),
      cpuPercent: total > 0 ? Math.max(0, Math.min(100, 100 - (idle / total) * 100)) : null,
      ramUsedPercent: ramPct,
      ramUsedBytes: used,
      ramTotalBytes: tot,
      diskFreeBytes: this.disk,
      diskPath: this.diskPath,
      ramLevel,
      diskLevel,
      refuseReason,
    };
    this.emit(this.last);
  }
}

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}
