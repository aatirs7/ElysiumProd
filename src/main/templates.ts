// Projects and their session templates. Main projects run a Prime and Meridian
// pair, mirroring cs.ps1 exactly (folders, SP_SESSION_NAME, flags). Side projects
// run one Claude session that continues the folder's most recent conversation.
// Phase 2 of the spec replaces this table with the first run import (8.3.1).
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
const H = 'C:\\Users\\aatir';

export interface ProjectDef {
  id: string;
  name: string;
  folder: string;
  repo: string | null;
  tier: 'main' | 'side';
  /** Main projects only: the cs.ps1 names. */
  pair?: { prime: string; meridian: string; pluginPrime: string; pluginMeridian: string; extra: string[] };
}

/** Every project with work in the last 20 days (AUDIT-REPOS.md), newest first within each tier. */
export const PROJECTS: ProjectDef[] = [
  { id: 'posture', name: 'SecurITPosture', folder: `${H}\\securitposture_2026`, repo: 'SecurITPosture-01/securitposture_2026', tier: 'main',
    pair: { prime: 'Prime Posture', meridian: 'Meridian Posture', pluginPrime: 'Prime', pluginMeridian: 'Meridian', extra: ['--model', 'claude-opus-5-5', '--advisor', 'claude-fable-5-1'] } },
  { id: 'intern', name: 'Elysium Intern', folder: `${H}\\Documents\\Elysium Ventures LLC\\elysiumintern`, repo: 'aatirs7/elysiumintern', tier: 'main',
    pair: { prime: 'Prime Intern', meridian: 'Meridian Intern', pluginPrime: 'Prime Intern', pluginMeridian: 'Meridian Intern', extra: [] } },
  { id: 'gulf', name: 'Gulf', folder: `${H}\\Gulf`, repo: 'aatirs7/Gulf', tier: 'main',
    pair: { prime: 'Prime Gulf', meridian: 'Meridian Gulf', pluginPrime: 'Prime Gulf', pluginMeridian: 'Meridian Gulf', extra: [] } },
  { id: 'attestia', name: 'Attestia', folder: `${H}\\truestate`, repo: 'aatirs7/attestia', tier: 'main',
    pair: { prime: 'Prime Attestia', meridian: 'Meridian Attestia', pluginPrime: 'Prime Attestia', pluginMeridian: 'Meridian Attestia', extra: [] } },
  { id: 'builds', name: 'Elysium Builds', folder: `${H}\\elysiumbuilds`, repo: 'aatirs7/elysiumbuilds', tier: 'side' },
  { id: 'phirmilingay', name: 'Phir Milingay', folder: `${H}\\phirmilingay`, repo: 'aatirs7/phirmilingay', tier: 'side' },
  { id: 'winboard', name: 'Winboard', folder: `${H}\\winboard`, repo: 'aatirs7/winboard', tier: 'side' },
  { id: 'bookmarks', name: 'Bookmark Vault', folder: `${H}\\twitterbookmarksite`, repo: 'aatirs7/twitterbookmarksite', tier: 'side' },
  { id: 'sharjeelcrm', name: 'Sharjeel CRM', folder: `${H}\\Documents\\sharjeelcrm`, repo: 'aatirs7/sharjeelcrm', tier: 'side' },
  { id: 'accshop', name: 'AccShop', folder: `${H}\\accshop`, repo: 'aatirs7/accshop', tier: 'side' },
  { id: 'ventures', name: 'Elysium Ventures', folder: `${H}\\ElysiumVentures`, repo: 'aatirs7/ElysiumVentures', tier: 'side' },
  { id: 'elysiumprod', name: 'ElysiumProd', folder: `${H}\\ElysiumProd`, repo: 'aatirs7/ElysiumProd', tier: 'side' },
];

function pairTemplate(p: ProjectDef, role: 'prime' | 'meridian'): Template {
  const pair = p.pair!;
  const title = role === 'prime' ? pair.prime : pair.meridian;
  return {
    id: `${p.id}.${role}`, title, kind: 'claude', project: p.id, projectName: p.name, role, cwd: p.folder,
    confirm: `This resumes your ${title} session, exactly as cs ${title.toLowerCase()} does. If it is open in another terminal, close it there first so two copies do not run at once.`,
    command: resolveClaude,
    args: ['--resume', title, '--dangerously-skip-permissions', '--plugin-dir', MODS, ...pair.extra],
    env: { SP_SESSION_NAME: role === 'prime' ? pair.pluginPrime : pair.pluginMeridian },
  };
}

function soloTemplate(p: ProjectDef): Template {
  return {
    id: `${p.id}.claude`, title: p.name, kind: 'claude', project: p.id, projectName: p.name, role: 'solo', cwd: p.folder,
    confirm: `This continues the most recent Claude session in ${p.name}. If it is open in another terminal, close it there first.`,
    command: resolveClaude,
    args: ['--continue', '--dangerously-skip-permissions'],
    env: {},
  };
}

export const templates: Template[] = [
  { id: 'local.shell', title: 'PowerShell', kind: 'shell', project: null, projectName: null, role: 'solo', cwd: homedir(), confirm: null, command: shell, args: ['-NoLogo'], env: {} },
  ...PROJECTS.flatMap((p) => (p.tier === 'main' ? [pairTemplate(p, 'prime'), pairTemplate(p, 'meridian')] : [soloTemplate(p)])),
];

export function templateInfo(t: Template): TemplateInfo {
  const { id, title, kind, cwd, confirm, project, projectName, role } = t;
  return { id, title, kind, cwd, confirm, project, projectName, role };
}

export function findTemplate(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}

/** The template that takes a task for a project: Prime for a pair, the single session otherwise. */
export function leadTemplate(projectId: string): Template | undefined {
  return templates.find((t) => t.project === projectId && (t.role === 'prime' || t.role === 'solo'));
}

export const PROJECT_FOLDERS: Record<string, { name: string; folder: string; repo: string | null; tier: 'main' | 'side' }> =
  Object.fromEntries(PROJECTS.map((p) => [p.id, { name: p.name, folder: p.folder, repo: p.repo, tier: p.tier }]));
