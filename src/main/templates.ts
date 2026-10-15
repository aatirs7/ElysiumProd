// Projects and their session templates. The app ships with two built in
// projects (Elysium itself, so its own session can change the app, and the Laptop
// tool); everything else is the owner's: profile.json for a hand kept list and
// projects.json for the ones added in the app. Main projects run a Prime and
// Meridian pair; side projects run one Claude session.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';
import type { TemplateInfo } from '@shared/ipc';
import { resolveClaude } from './claude';
import { agentLaunch, type AgentDef } from './agents';

export interface Template extends TemplateInfo {
  /** Resolved at launch, so a missing CLI is reported, not crashed on. */
  command(): string | null;
  args: string[];
  env: Record<string, string>;
  /** Resume by name only once ElysiumProd has started that name on the account (see sessions.ts). */
  named?: boolean;
  /** Arguments that go before the template's own (an agent's script, when it runs under node). */
  prefix?(): string[];
}

function shell(): string {
  const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  return existsSync(pwsh) ? pwsh : 'powershell.exe';
}


export interface ProjectDef {
  id: string;
  name: string;
  folder: string;
  repo: string | null;
  tier: 'main' | 'side';
  /** Added in the app (projects.json), not part of the built-in table. */
  custom?: boolean;
  /** Side projects: a named session of their own instead of the folder's latest conversation. */
  sessionName?: string;
  /** Side projects: more folders the one session may work in (the iOS hub). */
  addDirs?: string[];
  /** Main projects only: the two session names, and optionally a plugin both load. */
  pair?: { prime: string; meridian: string; pluginDir?: string; pluginPrime?: string; pluginMeridian?: string; extra: string[] };
  /** Where it came from: built in, the owner's profile.json, or added in the app. */
  source?: 'builtin' | 'profile' | 'custom';
  /** Other names the command box knows it by. */
  aliases?: string[];
  /** Relay settings used when the repo has no .claude/mods.json. */
  mods?: { relayRepo?: string; relayFile?: string; relayIssue?: string; waitingHeading?: string; nowHeading?: string };
  /** The part of the chat watcher's command line that marks it. */
  watchPattern?: string;
  /** Dashboard extras: links, people to check on, a page to open beside Claude. */
  extras?: { links?: { id: string; label: string; url: string }[]; people?: string[]; open?: string; checkWhat?: string };
}

/** The app's own source folder: where its built in session works. */
export const APP_SOURCE = app.getAppPath();

/** Built in: Elysium itself, and the Laptop tool. */
export const PROJECTS: ProjectDef[] = [
  { id: 'elysiumprod', name: 'Customize Elysium', folder: APP_SOURCE, repo: null, tier: 'side', sessionName: 'Elysium Builder', source: 'builtin', aliases: ['elysium', 'elysiumprod', 'elysium prod', 'builder', 'the app'] },
  { id: 'laptop', name: 'PC Helper', folder: join(homedir(), 'laptop-tool'), repo: null, tier: 'side', sessionName: 'PC Helper', source: 'builtin', aliases: ['pc', 'computer', 'laptop', 'pc helper'] },
];

function pairTemplate(p: ProjectDef, role: 'prime' | 'meridian'): Template {
  const pair = p.pair!;
  const title = role === 'prime' ? pair.prime : pair.meridian;
  return {
    id: `${p.id}.${role}`, title, kind: 'claude', project: p.id, projectName: p.name, role, cwd: p.folder,
    confirm: null,
    command: resolveClaude,
    args: pair.pluginDir && existsSync(pair.pluginDir)
      ? ['--resume', title, '--dangerously-skip-permissions', '--plugin-dir', pair.pluginDir, ...pair.extra]
      : ['--resume', title, '--dangerously-skip-permissions', ...pair.extra],
    env: pair.pluginDir ? { SP_SESSION_NAME: (role === 'prime' ? pair.pluginPrime : pair.pluginMeridian) ?? title } : {},
    // Profile pairs were named before Elysium; resume them by title. New ones are named on first launch.
    named: p.source !== 'profile',
  };
}

function soloTemplate(p: ProjectDef): Template {
  const dirs = (p.addDirs ?? []).filter((d) => existsSync(d)).flatMap((d) => ['--add-dir', d]);
  return {
    id: `${p.id}.claude`, title: p.sessionName ?? p.name, kind: 'claude', project: p.id, projectName: p.name, role: 'solo', cwd: p.folder,
    confirm: null,
    command: resolveClaude,
    args: p.sessionName ? ['--resume', p.sessionName, '--dangerously-skip-permissions', ...dirs] : ['--continue', '--dangerously-skip-permissions', ...dirs],
    env: {},
    named: Boolean(p.sessionName),
  };
}

/** Agents found on this PC; each project gets a session for each. Filled in after launch. */
const agentsHere: AgentDef[] = [];

function agentTemplate(p: ProjectDef, a: AgentDef): Template {
  return {
    id: `${p.id}.${a.id}`, title: a.name, kind: 'agent', agent: a.id, project: p.id, projectName: p.name, role: 'agent', cwd: p.folder,
    confirm: null,
    command: () => agentLaunch(a.id)?.file ?? null,
    prefix: () => agentLaunch(a.id)?.prefix ?? [],
    args: [...(a.args ?? [])],
    env: {},
  };
}

/** Called once the background search for agents is done. */
export function addAgents(found: AgentDef[]): void {
  for (const a of found) {
    if (agentsHere.some((x) => x.id === a.id)) continue;
    agentsHere.push(a);
    for (const p of PROJECTS) if (p.source !== 'builtin') templates.push(agentTemplate(p, a));
  }
}

export const templates: Template[] = [
  { id: 'local.shell', title: 'PowerShell', kind: 'shell', project: null, projectName: null, role: 'solo', cwd: homedir(), confirm: null, command: shell, args: ['-NoLogo'], env: {} },
  ...PROJECTS.flatMap((p) => (p.tier === 'main' ? [pairTemplate(p, 'prime'), pairTemplate(p, 'meridian')] : [soloTemplate(p)])),
];

export function templateInfo(t: Template): TemplateInfo {
  const { id, title, kind, cwd, confirm, project, projectName, role, agent } = t;
  return { id, title, kind, cwd, confirm, project, projectName, role, ...(agent ? { agent } : {}) };
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

/** The full definition of a project, for the extras only some have. */
export function projectDef(id: string): ProjectDef | undefined {
  return PROJECTS.find((p) => p.id === id);
}

/** Adds a project at runtime (one made or cloned in the app). Everything reads these tables live. */
export function registerProject(p: ProjectDef): void {
  if (PROJECT_FOLDERS[p.id]) return;
  PROJECTS.push(p);
  templates.push(...(p.tier === 'main' ? [pairTemplate(p, 'prime'), pairTemplate(p, 'meridian')] : [soloTemplate(p)]), ...agentsHere.map((a) => agentTemplate(p, a)));
  PROJECT_FOLDERS[p.id] = { name: p.name, folder: p.folder, repo: p.repo, tier: p.tier };
}

/** Takes an added project out of the app. Its folder and history are left alone. */
export function unregisterProject(id: string): boolean {
  const i = PROJECTS.findIndex((x) => x.id === id && x.source !== 'builtin');
  if (i < 0) return false;
  PROJECTS.splice(i, 1);
  for (let j = templates.length - 1; j >= 0; j -= 1) if (templates[j].project === id) templates.splice(j, 1);
  delete PROJECT_FOLDERS[id];
  return true;
}
