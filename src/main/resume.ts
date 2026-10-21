// Restart brings back what was running. Before the app quits to restart, the
// Claude sessions that are running are written down; the next launch starts them
// again, each resuming its own conversation, and their panes connect to them.
// Restart and resume also notes which sessions and chats were in the middle of
// something, and tells each to carry on once it is back.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';
import type { SessionManager } from './sessions';
import { findTemplate } from './templates';

/** One session to bring back: its template, its account, optionally the exact conversation, and what to tell it once it is ready. */
export interface ResumeEntry { templateId: string; accountId: string; resumeId?: string; say?: string }

/** What a session or chat was doing when Restart and resume ran. */
export interface Ongoing { busy(sessionId: string): boolean; unsent(sessionId: string): string | null; busyChats(): string[] }

interface Saved { sessions: ResumeEntry[]; chats?: string[] }

const file = () => join(dataDir(), 'resume-on-start.json');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CARRY_ON = 'Elysium restarted while you were in the middle of something. Pick up exactly where you left off and finish it. Anything that was running when it restarted (a command, a build, a test) was stopped, so run it again if it is still needed.';
export const CARRY_ON_CHAT = 'Elysium restarted while you were answering. Carry on from where you were and finish the answer.';

/** Write down the Claude sessions running now, for the next launch; with `ongoing`, also what each was in the middle of. */
export function saveRunning(sessions: SessionManager, ongoing?: Ongoing): number {
  let carrying = 0;
  const list: ResumeEntry[] = sessions.list()
    .filter((s) => s.status === 'running' && findTemplate(s.templateId)?.kind === 'claude')
    .map((s) => {
      if (!ongoing) return { templateId: s.templateId, accountId: s.accountId };
      // A task that never went in is handed over again; a session mid turn is told to carry on.
      const say = [ongoing.busy(s.id) ? CARRY_ON : '', ongoing.unsent(s.id) ?? ''].filter(Boolean).join('\n\n');
      if (say) carrying += 1;
      return { templateId: s.templateId, accountId: s.accountId, ...(say ? { say } : {}) };
    });
  const chats = ongoing?.busyChats() ?? [];
  const saved: Saved = { sessions: list, ...(chats.length ? { chats } : {}) };
  try { writeFileSync(file(), JSON.stringify(saved, null, 2)); } catch { /* restart still works, without resuming */ }
  return carrying + chats.length;
}

/**
 * Start again what the last run wrote down; the list is used once. `say` hands a
 * started session its carry on message (it goes in once the session is ready),
 * `chat` tells a chat to carry on. Returns how many started.
 */
export function resumeRunning(sessions: SessionManager, say?: (sessionId: string, text: string) => void, chat?: (chatId: string) => void): number {
  if (!existsSync(file())) return 0;
  let saved: Saved = { sessions: [] };
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as unknown;
    // Older copies wrote just the list of sessions.
    saved = Array.isArray(raw) ? { sessions: raw as ResumeEntry[] } : { ...(raw as Saved), sessions: (raw as Saved).sessions ?? [] };
  } catch { /* unreadable: nothing to resume */ }
  try { rmSync(file()); } catch { /* used once either way */ }
  let n = 0;
  for (const e of Array.isArray(saved.sessions) ? saved.sessions : []) {
    if (!e || typeof e.templateId !== 'string' || findTemplate(e.templateId)?.kind !== 'claude') continue;
    const resumeId = typeof e.resumeId === 'string' && UUID.test(e.resumeId) ? e.resumeId : undefined;
    const r = sessions.create(e.templateId, 120, 40, { accountId: typeof e.accountId === 'string' ? e.accountId : null, override: true }, resumeId);
    if (!r.ok) continue;
    n += 1;
    if (say && typeof e.say === 'string' && e.say.trim()) say(r.session.id, e.say);
  }
  for (const id of Array.isArray(saved.chats) ? saved.chats : []) if (chat && typeof id === 'string') chat(id);
  return n;
}
