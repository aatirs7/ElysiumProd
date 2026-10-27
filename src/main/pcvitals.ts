// Live vitals for the PC Helper's top strip, beyond what resources.ts samples every
// two seconds: every fixed drive's free space, Wi-Fi name and signal, and uptime.
// Read only while the PC Helper asks (about every 30 s), cached briefly, and cheap:
// statfs for the drives and one netsh call (about 200 ms) for Wi-Fi.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { uptime } from 'node:os';
import type { PcVitals } from '@shared/ipc';

let cache: { at: number; v: PcVitals } | null = null;
let pending: Promise<PcVitals> | null = null;

function wifi(): Promise<PcVitals['wifi']> {
  return new Promise((ok) => {
    execFile('netsh.exe', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err || !out) return ok(null);
      const text = String(out);
      const state = /^\s*State\s*:\s*(.+)$/m.exec(text)?.[1]?.trim().toLowerCase();
      const ssid = /^\s*SSID\s*:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
      const signal = Number(/^\s*Signal\s*:\s*(\d+)%/m.exec(text)?.[1] ?? NaN);
      if (!ssid && !state) return ok(null);
      ok({ connected: state === 'connected' || Boolean(ssid), ssid, signal: Number.isFinite(signal) ? signal : null });
    });
  });
}

async function drives(): Promise<PcVitals['drives']> {
  const out: PcVitals['drives'] = [];
  for (const l of 'CDEFGH') {
    const root = `${l}:\\`;
    if (!existsSync(root)) continue;
    try {
      const s = await statfs(root);
      const total = Number(s.blocks) * Number(s.bsize);
      if (total > 0) out.push({ name: `${l}:`, freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: total });
    } catch { /* a drive that cannot be read, like an empty card reader */ }
  }
  return out;
}

export function pcVitals(): Promise<PcVitals> {
  if (cache && Date.now() - cache.at < 15000) return Promise.resolve(cache.v);
  if (pending) return pending;
  pending = Promise.all([drives(), wifi()]).then(([d, w]) => {
    const v: PcVitals = { at: new Date().toISOString(), drives: d, wifi: w, uptimeSec: Math.round(uptime()) };
    cache = { at: Date.now(), v };
    pending = null;
    return v;
  }, () => { pending = null; return { at: new Date().toISOString(), drives: [], wifi: null, uptimeSec: Math.round(uptime()) }; });
  return pending;
}
