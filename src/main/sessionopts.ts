// Per project Claude options (model, advisor, effort), kept in sessionopts.json in
// the data folder. They become launch flags for that project's Claude sessions.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionOptions } from '@shared/ipc';
import { dataDir } from './paths';

const FILE = () => join(dataDir(), 'sessionopts.json');
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** A model alias or id as the CLI takes it; nothing that could pass as another flag. */
const MODEL = /^[a-z0-9][a-z0-9._-]{0,60}$/i;

let cache: Record<string, SessionOptions> | null = null;

function load(): Record<string, SessionOptions> {
  if (cache) return cache;
  try { cache = existsSync(FILE()) ? JSON.parse(readFileSync(FILE(), 'utf8')) : {}; } catch { cache = {}; }
  return cache!;
}

export function getSessionOptions(projectId: string): SessionOptions {
  return { ...(load()[projectId] ?? {}) };
}

export function setSessionOptions(projectId: string, opts: SessionOptions): SessionOptions {
  const clean: SessionOptions = {};
  if (typeof opts.model === 'string' && MODEL.test(opts.model)) clean.model = opts.model;
  if (typeof opts.advisor === 'string' && MODEL.test(opts.advisor)) clean.advisor = opts.advisor;
  if (typeof opts.effort === 'string' && EFFORTS.includes(opts.effort)) clean.effort = opts.effort;
  const all = load();
  if (Object.keys(clean).length) all[projectId] = clean; else delete all[projectId];
  try { writeFileSync(FILE(), JSON.stringify(all, null, 2)); } catch { /* kept in memory until the next save works */ }
  return { ...clean };
}

/** Launch flags for a project's Claude session. */
export function sessionOptionArgs(projectId: string | null): string[] {
  if (!projectId) return [];
  const o = load()[projectId];
  if (!o) return [];
  return [...(o.model ? ['--model', o.model] : []), ...(o.advisor ? ['--advisor', o.advisor] : []), ...(o.effort ? ['--effort', o.effort] : [])];
}
