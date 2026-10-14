// The Home command box: "tell Elysium Intern to fix the login", "start Gulf",
// "wrap up Attestia", "compact Prime Posture". Clear phrasings are read here by
// simple rules at no cost; anything else goes to Sonnet 5.5 once, which may only
// answer with actions on projects and sessions that exist. Nothing is deleted:
// "stop" wraps a session up cleanly, and only "force stop" ends it at once.
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandResult, CommandStep } from '@shared/ipc';
import { resolveClaude } from './claude';
import { childEnv } from './env';
import { dataDir } from './paths';
import type { SessionManager } from './sessions';
import type { Tasks } from './tasks';
import { PROJECT_FOLDERS, templates } from './templates';

type Action =
  | { type: 'send'; target: string; text: string }
  | { type: 'start' | 'stop' | 'kill' | 'compact' | 'open'; target: string };

interface Target { kind: 'project' | 'session'; id: string; name: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Every name you might call a project or session, longest first. */
function aliases(): { alias: string; t: Target }[] {
  const out: { alias: string; t: Target }[] = [];
  const add = (alias: string, t: Target) => { const a = norm(alias); if (a) out.push({ alias: a, t }); };
  for (const [id, p] of Object.entries(PROJECT_FOLDERS)) {
    const t: Target = { kind: 'project', id, name: p.name };
    add(p.name, t); add(id, t); add(p.folder.split('\\').pop() ?? '', t); if (p.repo) add(p.repo.split('/')[1], t);
    // "Elysium Intern" is also "intern"; "SecurITPosture" is also "posture" and "security posture".
    const words = norm(p.name).split(' ');
    if (words.length > 1) add(words[words.length - 1], t);
  }
  add('security posture', { kind: 'project', id: 'posture', name: 'SecurITPosture' });
  add('elysium prod', { kind: 'project', id: 'elysiumprod', name: 'ElysiumProd' });
  add('builder', { kind: 'session', id: 'elysiumprod.claude', name: 'ElysiumProd Builder' });
  for (const t of templates) {
    if (t.kind !== 'claude') continue;
    const target: Target = { kind: 'session', id: t.id, name: t.title };
    add(t.title, target);
    // "Prime" alone, or "prime of intern", within the project named next to it.
    if (t.role !== 'solo' && t.projectName) { add(`${t.role} ${t.projectName}`, target); add(`${t.projectName} ${t.role}`, target); }
  }
  return out.sort((a, b) => b.alias.length - a.alias.length);
}

/** The project or session a phrase starts with, and what follows it. */
function findTarget(phrase: string): { t: Target; rest: string } | null {
  const p = norm(phrase).replace(/^(the|my)\s+/, '');
  for (const a of aliases()) {
    if (p === a.alias || p.startsWith(`${a.alias} `)) return { t: a.t, rest: p.slice(a.alias.length).trim() };
  }
  return null;
}

/** Plain rules for the common phrasings. */
function byRules(text: string): Action[] | null {
  const raw = text.trim();
  const tell = raw.match(/^(?:tell|ask|have|get|message)\s+(.+)$/i);
  if (tell) {
    // Find the name on the original text so the task keeps its own words and case.
    const lower = tell[1];
    for (const a of aliases()) {
      const re = new RegExp(`^(?:the\\s+|my\\s+)?${a.alias.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^a-z0-9]+')}\\b[\\s,:]*(?:to\\s+|that\\s+)?`, 'i');
      const m = lower.match(re);
      if (m && lower.length > m[0].length) return [{ type: 'send', target: a.t.id, text: lower.slice(m[0].length).trim() }];
    }
    return null;
  }
  const verbs: [RegExp, Action['type']][] = [
    [/^(?:force\s+stop|kill|end)\s+(.+)$/i, 'kill'],
    [/^(?:stop|wrap\s+up|shut\s+down|close|pause)\s+(.+)$/i, 'stop'],
    [/^(?:compact)\s+(.+)$/i, 'compact'],
    [/^(?:start|launch|resume|spin\s+up|boot|run)\s+(.+)$/i, 'start'],
    [/^(?:open|show|go\s+to)\s+(.+)$/i, 'open'],
  ];
  for (const [re, type] of verbs) {
    const m = raw.match(re);
    if (!m) continue;
    const parts = m[1].split(/\s*(?:,|\band\b)\s*/i).filter(Boolean);
    const acts: Action[] = [];
    for (const part of parts) { const f = findTarget(part); if (!f || f.rest) return null; acts.push({ type, target: f.t.id } as Action); }
    return acts.length ? acts : null;
  }
  return null;
}

/** Sonnet reads anything the rules could not, and may only name targets listed for it. */
async function bySonnet(text: string, sessions: SessionManager): Promise<{ actions: Action[]; say: string | null } | null> {
  const command = resolveClaude();
  if (!command) return null;
  const running = new Set(sessions.list().filter((s) => s.status === 'running').map((s) => s.templateId));
  const lines = [
    ...Object.entries(PROJECT_FOLDERS).map(([id, p]) => `project ${id}: ${p.name}`),
    ...templates.filter((t) => t.kind === 'claude').map((t) => `session ${t.id}: ${t.title} (${t.projectName}${running.has(t.id) ? ', running' : ''})`),
  ].join('\n');
  const system = 'You turn the owner\'s request into actions for a tool that runs Claude Code sessions. Reply with JSON only, no prose: {"actions":[...],"say":"one short sentence"}. Action types: send {target: session or project id, text: the task in the owner\'s words}; start, stop (a clean wrap up), kill (only if the owner says force or kill), compact, open, each {target}. A project id means its lead session for send. Use only ids from the list. If nothing fits, return no actions and say why.';
  const input = `Targets:\n${lines}\n\nRequest: ${text}`;
  const cwd = join(dataDir(), 'flow-scratch');
  mkdirSync(cwd, { recursive: true });
  const out = await new Promise<string | null>((resolve) => {
    const child = execFile(command, ['-p', '--model', 'claude-sonnet-5-5', '--no-session-persistence', '--strict-mcp-config', '--tools', '', '--system-prompt', system, '--output-format', 'json'],
      { cwd, timeout: 90000, windowsHide: true, maxBuffer: 1024 * 1024, env: childEnv({}) },
      (e, stdout) => { if (e) return resolve(null); try { const j = JSON.parse(String(stdout)) as { result?: string }; resolve(j.result ?? null); } catch { resolve(null); } });
    child.stdin?.end(input);
  });
  if (!out) return null;
  try {
    const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as { actions?: Action[]; say?: string };
    const known = new Set([...Object.keys(PROJECT_FOLDERS), ...templates.map((t) => t.id)]);
    const ok = ['send', 'start', 'stop', 'kill', 'compact', 'open'];
    const actions = (j.actions ?? []).filter((a) => a && ok.includes(a.type) && known.has(a.target) && (a.type !== 'send' || (typeof (a as { text?: unknown }).text === 'string' && (a as { text: string }).text.trim())));
    return { actions, say: typeof j.say === 'string' ? j.say.slice(0, 200) : null };
  } catch { return null; }
}

const nameOf = (id: string) => templates.find((t) => t.id === id)?.title ?? PROJECT_FOLDERS[id]?.name ?? id;
const sessionsOf = (id: string) => (PROJECT_FOLDERS[id] ? templates.filter((t) => t.kind === 'claude' && t.project === id).map((t) => t.id) : [id]);

export async function runCommand(text: string, tasks: Tasks, sessions: SessionManager): Promise<CommandResult> {
  const t = text.trim().slice(0, 4000);
  if (!t) return { ok: false, via: 'rules', say: 'Type what you want done.', steps: [], open: null };
  let via: CommandResult['via'] = 'rules';
  let say: string | null = null;
  let actions = byRules(t);
  if (!actions) {
    via = 'sonnet';
    const s = await bySonnet(t, sessions);
    if (!s) return { ok: false, via, say: 'That could not be read. Try "tell Elysium Intern to …" or "start Gulf".', steps: [], open: null };
    actions = s.actions; say = s.say;
  }
  const steps: CommandStep[] = [];
  let open: string | null = null;
  const running = () => sessions.list().filter((s) => s.status === 'running');
  for (const a of actions) {
    if (a.type === 'send') {
      const r = PROJECT_FOLDERS[a.target] ? tasks.run(a.target, a.text) : tasks.runTemplate(a.target, a.text);
      steps.push({ label: `Sent to ${PROJECT_FOLDERS[a.target] ? `${nameOf(a.target)}'s lead session` : nameOf(a.target)}: ${a.text}`, ok: r.ok, reason: r.reason });
    } else if (a.type === 'start') {
      for (const id of sessionsOf(a.target)) { const r = tasks.startTemplate(id); steps.push({ label: r.already ? `${nameOf(id)} is already running` : `Started ${nameOf(id)}`, ok: r.ok, reason: r.reason }); }
    } else if (a.type === 'stop') {
      const ids = running().filter((s) => sessionsOf(a.target).includes(s.templateId)).map((s) => s.id);
      if (!ids.length) { steps.push({ label: `${nameOf(a.target)} is not running`, ok: true, reason: null }); continue; }
      tasks.wrapSessions(ids);
      steps.push({ label: `Wrapping up ${nameOf(a.target)}: it saves its notes, then closes`, ok: true, reason: null });
    } else if (a.type === 'kill') {
      const ids = running().filter((s) => sessionsOf(a.target).includes(s.templateId)).map((s) => s.id);
      for (const id of ids) sessions.kill(id);
      steps.push({ label: ids.length ? `Stopped ${nameOf(a.target)} at once` : `${nameOf(a.target)} is not running`, ok: true, reason: null });
    } else if (a.type === 'compact') {
      const ids = running().filter((s) => sessionsOf(a.target).includes(s.templateId)).map((s) => s.id);
      const started = tasks.compact(ids);
      steps.push({ label: started.length ? `Compacting ${nameOf(a.target)}: it saves its notes first` : `${nameOf(a.target)} has nothing running to compact`, ok: true, reason: null });
    } else if (a.type === 'open') {
      open = PROJECT_FOLDERS[a.target] ? a.target : templates.find((x) => x.id === a.target)?.project ?? null;
      steps.push({ label: `Opening ${nameOf(a.target)}`, ok: Boolean(open), reason: open ? null : 'Not a project' });
    }
  }
  if (!steps.length) return { ok: false, via, say: say ?? 'Nothing to do for that.', steps, open };
  return { ok: steps.every((s) => s.ok), via, say, steps, open };
}

/** For tests: the rule reader alone. */
export const readByRules = byRules;
