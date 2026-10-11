// Templates: a local shell plus the eight sessions from cs.ps1, with the same
// folders, SP_SESSION_NAME values and flags. Phase 2 of the spec replaces this
// table with the first run import (8.3.1); until then it mirrors cs.ps1 exactly.
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

interface PairSpec { project: string; projectName: string; folder: string; prime: string; meridian: string; pluginPrime: string; pluginMeridian: string; extra: string[] }

const PAIRS: PairSpec[] = [
  { project: 'posture', projectName: 'SecurITPosture', folder: 'C:\\Users\\aatir\\securitposture_2026', prime: 'Prime Posture', meridian: 'Meridian Posture', pluginPrime: 'Prime', pluginMeridian: 'Meridian', extra: ['--model', 'claude-opus-5-5', '--advisor', 'claude-fable-5-1'] },
  { project: 'intern', projectName: 'Elysium Intern', folder: 'C:\\Users\\aatir\\Documents\\Elysium Ventures LLC\\elysiumintern', prime: 'Prime Intern', meridian: 'Meridian Intern', pluginPrime: 'Prime Intern', pluginMeridian: 'Meridian Intern', extra: [] },
  { project: 'gulf', projectName: 'Gulf', folder: 'C:\\Users\\aatir\\Gulf', prime: 'Prime Gulf', meridian: 'Meridian Gulf', pluginPrime: 'Prime Gulf', pluginMeridian: 'Meridian Gulf', extra: [] },
  { project: 'attestia', projectName: 'Attestia', folder: 'C:\\Users\\aatir\\truestate', prime: 'Prime Attestia', meridian: 'Meridian Attestia', pluginPrime: 'Prime Attestia', pluginMeridian: 'Meridian Attestia', extra: [] },
];

function claudeTemplate(p: PairSpec, role: 'prime' | 'meridian'): Template {
  const title = role === 'prime' ? p.prime : p.meridian;
  return {
    id: `${p.project}.${role}`,
    title,
    kind: 'claude',
    project: p.project,
    projectName: p.projectName,
    role,
    cwd: p.folder,
    confirm: `This resumes your ${title} session, exactly as cs ${title.toLowerCase()} does. If it is open in another terminal, close it there first so two copies do not run at once.`,
    command: resolveClaude,
    args: ['--resume', title, '--dangerously-skip-permissions', '--plugin-dir', MODS, ...p.extra],
    env: { SP_SESSION_NAME: role === 'prime' ? p.pluginPrime : p.pluginMeridian },
  };
}

export const templates: Template[] = [
  { id: 'local.shell', title: 'PowerShell', kind: 'shell', project: null, projectName: null, role: 'solo', cwd: homedir(), confirm: null, command: shell, args: ['-NoLogo'], env: {} },
  ...PAIRS.flatMap((p) => [claudeTemplate(p, 'prime'), claudeTemplate(p, 'meridian')]),
];

export function templateInfo(t: Template): TemplateInfo {
  const { id, title, kind, cwd, confirm, project, projectName, role } = t;
  return { id, title, kind, cwd, confirm, project, projectName, role };
}

export function findTemplate(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}

export const PROJECT_FOLDERS = Object.fromEntries(PAIRS.map((p) => [p.project, { name: p.projectName, folder: p.folder }]));
