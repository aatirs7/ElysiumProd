// Claude accounts as config directories (spec 11). The main account is the
// default directory and is launched with CLAUDE_CONFIG_DIR unset; any other
// account gets CLAUDE_CONFIG_DIR set (Phase 0 step 2 proved two at once work).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AccountInfo } from '@shared/ipc';

const MAIN = join(homedir(), '.claude');

export function listAccounts(): AccountInfo[] {
  const out: AccountInfo[] = [{ id: 'main', configDir: MAIN, isDefault: true, loggedIn: existsSync(join(MAIN, '.credentials.json')) }];
  for (const name of safeReaddir(homedir())) {
    if (!/^\.claude-[\w-]+$/.test(name)) continue;
    const dir = join(homedir(), name);
    out.push({ id: name.slice('.claude-'.length), configDir: dir, isDefault: false, loggedIn: existsSync(join(dir, '.credentials.json')) });
  }
  return out;
}

export function accountDir(accountId: string | null | undefined): string {
  if (!accountId || accountId === 'main') return MAIN;
  return listAccounts().find((a) => a.id === accountId)?.configDir ?? MAIN;
}

/** Environment for a session on this account: nothing for the main one, CLAUDE_CONFIG_DIR otherwise. */
export function accountEnv(accountId: string | null | undefined): Record<string, string> {
  if (!accountId || accountId === 'main') return {};
  const dir = accountDir(accountId);
  return dir === MAIN ? {} : { CLAUDE_CONFIG_DIR: dir };
}

/** Claude Code keeps transcripts under projects/<cwd with separators as dashes>. */
export function hasHistory(accountId: string | null | undefined, cwd: string): boolean {
  const slug = cwd.replace(/[:\\/ _.]/g, '-');
  const dir = join(accountDir(accountId), 'projects', slug);
  try { return readdirSync(dir).some((f) => f.endsWith('.jsonl')); } catch { return false; }
}

function safeReaddir(d: string): string[] {
  try { return readdirSync(d); } catch { return []; }
}
