// Phase 1 templates, hardcoded. Phase 2 replaces this file with the first run
// import from cs.ps1, mods.json and sessions.json (spec 8.3.1).
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { TemplateInfo } from '@shared/ipc';
import { resolveClaude } from './claude';

export interface Template extends TemplateInfo {
  /** Resolved at launch, so a missing CLI is reported, not crashed on. */
  command(): string | null;
  args: string[];
  env: Record<string, string>;
}

function shell(): string {
  const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  return existsSync(pwsh) ? pwsh : 'powershell.exe';
}

const MODS = 'C:\\Users\\aatir\\securitposture_2026\\plugins\\securitposture-mods';

export const templates: Template[] = [
  {
    id: 'local.shell',
    title: 'PowerShell',
    kind: 'shell',
    cwd: homedir(),
    confirm: null,
    command: shell,
    args: ['-NoLogo'],
    env: {},
  },
  {
    // From cs.ps1: 'Prime Posture' = securitposture_2026, SP_SESSION_NAME Prime,
    // with --model claude-opus-5-5 --advisor claude-fable-5-1 (board 187).
    id: 'posture.prime',
    title: 'Prime Posture',
    kind: 'claude',
    cwd: 'C:\\Users\\aatir\\securitposture_2026',
    confirm: 'This resumes your Prime Posture session, exactly as cs prime posture does. If it is open in another terminal, close it there first so two copies do not run at once.',
    command: resolveClaude,
    args: ['--resume', 'Prime Posture', '--dangerously-skip-permissions', '--plugin-dir', MODS, '--model', 'claude-opus-5-5', '--advisor', 'claude-fable-5-1'],
    env: { SP_SESSION_NAME: 'Prime' },
  },
];

export function templateInfo(t: Template): TemplateInfo {
  const { id, title, kind, cwd, confirm } = t;
  return { id, title, kind, cwd, confirm };
}

export function findTemplate(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}
