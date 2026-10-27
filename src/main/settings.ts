// Settings the main process needs, read from workspace.json (the renderer owns it).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';

export function appSetting<T>(key: string, fallback: T): T {
  try {
    const d = JSON.parse(readFileSync(join(dataDir(), 'workspace.json'), 'utf8')) as { settings?: Record<string, unknown> };
    const v = d.settings?.[key];
    return v === undefined ? fallback : (v as T);
  } catch { return fallback; }
}

/** Saver mode: spend as few extra tokens as possible. */
export const saverOn = () => appSetting<boolean>('saver', false) === true;
