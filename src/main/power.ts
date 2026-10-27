// Keeping sessions working when the lid closes or the PC sits idle.
// Lid: Windows' own lid close action (powercfg), changed only when the person
// picks it in Settings, with the original values kept to put back.
// Idle: while any session is working, Windows is asked not to sleep the app.
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { powerSaveBlocker } from 'electron';
import { dataDir } from './paths';

export type LidMode = 'off' | 'plugged' | 'always';
const SAVED = () => join(dataDir(), 'power.json');

const run = (args: string[]) => new Promise<string>((ok) => {
  execFile('powercfg.exe', args, { windowsHide: true, timeout: 10000 }, (_e, out) => ok(String(out ?? '')));
});

/** The lid close action now, plugged in and on battery: 0 do nothing, 1 sleep, 2 hibernate, 3 shut down. */
async function lidNow(): Promise<{ ac: number; dc: number } | null> {
  const out = await run(['/qh', 'SCHEME_CURRENT', 'SUB_BUTTONS', 'LIDACTION']);
  const ac = /Current AC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(out);
  const dc = /Current DC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(out);
  return ac && dc ? { ac: parseInt(ac[1], 16), dc: parseInt(dc[1], 16) } : null;
}

export async function lidGet(): Promise<{ mode: LidMode; available: boolean }> {
  const now = await lidNow();
  if (!now) return { mode: 'off', available: false };
  return { mode: now.ac === 0 && now.dc === 0 ? 'always' : now.ac === 0 ? 'plugged' : 'off', available: true };
}

export async function lidSet(mode: LidMode): Promise<{ ok: boolean; mode: LidMode; reason: string | null }> {
  const now = await lidNow();
  if (!now) return { ok: false, mode: 'off', reason: 'This PC does not offer a lid setting.' };
  let orig = now;
  try { orig = JSON.parse(readFileSync(SAVED(), 'utf8')) as { ac: number; dc: number }; } catch { /* first change */ }
  // Remember what Windows had before Elysium changed it, once.
  if (!existsSync(SAVED()) && mode !== 'off') { try { writeFileSync(SAVED(), JSON.stringify(now)); } catch { /* best effort */ } }
  const ac = mode === 'off' ? (orig.ac === 0 ? 1 : orig.ac) : 0;
  const dc = mode === 'always' ? 0 : mode === 'plugged' ? (orig.dc === 0 ? 1 : orig.dc) : (orig.dc === 0 ? 1 : orig.dc);
  await run(['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_BUTTONS', 'LIDACTION', String(ac)]);
  await run(['/setdcvalueindex', 'SCHEME_CURRENT', 'SUB_BUTTONS', 'LIDACTION', String(dc)]);
  await run(['/setactive', 'SCHEME_CURRENT']);
  if (mode === 'off') { try { unlinkSync(SAVED()); } catch { /* nothing saved */ } }
  const got = await lidGet();
  return got.mode === mode ? { ok: true, mode, reason: null } : { ok: false, mode: got.mode, reason: 'Windows did not take the change. Try it from Settings, Power, Lid controls.' };
}

let blocker: number | null = null;
/** Called whenever a session's state changes: any working session keeps Windows from sleeping. */
export function keepAwake(anyWorking: boolean): void {
  if (anyWorking && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  else if (!anyWorking && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
}
