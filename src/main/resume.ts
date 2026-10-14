// Restart brings back what was running. Before the app quits to restart, the
// Claude sessions that are running are written down; the next launch starts them
// again, each resuming its own conversation, and their panes connect to them.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';
import type { SessionManager } from './sessions';
import { findTemplate } from './templates';

/** One session to bring back: its template, its account, and optionally the exact conversation. */
export interface ResumeEntry { templateId: string; accountId: string; resumeId?: string }

const file = () => join(dataDir(), 'resume-on-start.json');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Write down the Claude sessions running now, for the next launch. */
export function saveRunning(sessions: SessionManager): void {
  const list: ResumeEntry[] = sessions.list()
    .filter((s) => s.status === 'running' && findTemplate(s.templateId)?.kind === 'claude')
    .map((s) => ({ templateId: s.templateId, accountId: s.accountId }));
  try { writeFileSync(file(), JSON.stringify(list, null, 2)); } catch { /* restart still works, without resuming */ }
}

/** Start again what the last run wrote down; the list is used once. Returns how many started. */
export function resumeRunning(sessions: SessionManager): number {
  if (!existsSync(file())) return 0;
  let list: ResumeEntry[] = [];
  try { list = JSON.parse(readFileSync(file(), 'utf8')) as ResumeEntry[]; } catch { /* unreadable: nothing to resume */ }
  try { rmSync(file()); } catch { /* used once either way */ }
  let n = 0;
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.templateId !== 'string' || findTemplate(e.templateId)?.kind !== 'claude') continue;
    const resumeId = typeof e.resumeId === 'string' && UUID.test(e.resumeId) ? e.resumeId : undefined;
    const r = sessions.create(e.templateId, 120, 40, { accountId: typeof e.accountId === 'string' ? e.accountId : null }, resumeId);
    if (r.ok) n += 1;
  }
  return n;
}
