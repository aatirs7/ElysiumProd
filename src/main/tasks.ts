// Background tasks from the quick bar: hand a task to a project's lead session
// (Prime, or the single session of a side project) without opening anything.
// The session starts on the project's account if it is not running, the task is
// pasted once the session reports it is ready, and a Windows notification says
// when it finishes or needs you. Clicking the notification opens that session.
import { app, Notification } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompactState, Telemetry } from '@shared/ipc';
import { dataDir } from './paths';
import type { Ingest } from './ingest';
import type { SessionManager } from './sessions';
import { findTemplate, leadTemplate } from './templates';

interface Pending { sessionId: string; projectName: string; text: string; sent: boolean; startedAt: number }

/** The account the owner assigned to a project in the app (workspace.json), else main. */
function accountForProject(projectId: string): string {
  try {
    const d = JSON.parse(readFileSync(join(dataDir(), 'workspace.json'), 'utf8')) as { projectAccounts?: Record<string, string> };
    return d.projectAccounts?.[projectId] || 'main';
  } catch {
    return 'main';
  }
}

const WRAP_PROMPT = 'Please wrap up now. Bring your current step to a clean stopping point, commit or note anything uncommitted as the project rules say, update your resume note and your line on the relay, then stop. Do not start anything new.';
const WRAP_TIMEOUT_MS = 20 * 60 * 1000;

const COMPACT_PREP = 'This session will be compacted in a moment to free up context. Bring your current step to a clean stopping point now: finish or pause what you are doing, commit or note anything uncommitted as the project rules say, and update your resume note and your relay line with exactly where you are and what comes next, so nothing is lost. Do not start anything new. Reply in one line when you are ready.';
const COMPACT_CMD = '/compact Keep what this session was doing, the path of its resume note, open tasks and decisions, and anything uncommitted. After compacting, carry on from the resume note.';
const RESUME_PROMPT = 'Compaction is done. Read your resume note and carry on from where you left off.';
const COMPACT_TIMEOUT_MS = 25 * 60 * 1000;
const AUTO_COOLDOWN_MS = 15 * 60 * 1000;

interface Compact { projectName: string; stage: CompactState['stage']; auto: boolean; startedAt: number; stageAt: number; baseCompactions: number; sawBusy: boolean; askedYou: boolean }

/** Auto compaction settings from workspace.json, read at most every 15 seconds. */
let autoCache: { at: number; enabled: boolean; percent: number } | null = null;
function autoCompactSettings(): { enabled: boolean; percent: number } {
  if (autoCache && Date.now() - autoCache.at < 15000) return autoCache;
  let enabled = true, percent = 80;
  try {
    const d = JSON.parse(readFileSync(join(dataDir(), 'workspace.json'), 'utf8')) as { settings?: { autoCompact?: { enabled?: boolean; percent?: number } } };
    const a = d.settings?.autoCompact;
    if (typeof a?.enabled === 'boolean') enabled = a.enabled;
    if (typeof a?.percent === 'number' && a.percent >= 50 && a.percent <= 95) percent = a.percent;
  } catch { /* defaults */ }
  autoCache = { at: Date.now(), enabled, percent };
  return autoCache;
}

/** Bracketed paste keeps a message together; Enter submits it a moment later. */
function paste(sessions: SessionManager, sessionId: string, text: string): void {
  sessions.write(sessionId, '\x1b[200~' + text + '\x1b[201~');
  setTimeout(() => sessions.write(sessionId, '\r'), 150);
}

interface Wrap { projectName: string; stage: 'asked' | 'working' | 'exiting'; startedAt: number }

export class Tasks {
  private wraps = new Map<string, Wrap>();
  private pending = new Map<string, Pending>();
  private watching = new Map<string, { projectName: string; lastState: string }>();
  private compacts = new Map<string, Compact>();
  private lastAuto = new Map<string, number>();

  constructor(
    private sessions: SessionManager,
    private ingest: Ingest,
    private focus: (sessionId: string, templateId: string) => void,
    private emitCompact: (c: CompactState) => void = () => {},
  ) {
    // Some steps wait on time rather than on a telemetry event.
    setInterval(() => { for (const id of [...this.compacts.keys()]) this.stepCompact(id); }, 3000).unref();
  }

  /**
   * Compact sessions without losing work: each is asked to reach a clean
   * stopping point and save its notes, then /compact runs, then it is told to
   * carry on (unless its own plugin already did). Returns the sessions started.
   */
  compact(sessionIds: string[], auto = false): string[] {
    const started: string[] = [];
    for (const id of sessionIds) {
      const s = this.sessions.list().find((x) => x.id === id);
      const t = s ? findTemplate(s.templateId) : undefined;
      if (!s || s.status !== 'running' || !t || t.kind !== 'claude' || this.compacts.has(id) || this.wraps.has(id)) continue;
      const now = Date.now();
      this.compacts.set(id, { projectName: t.projectName ?? t.title, stage: 'asked', auto, startedAt: now, stageAt: now, baseCompactions: this.ingest.get(id)?.compactions ?? 0, sawBusy: false, askedYou: false });
      started.push(id);
      this.emitStage(id);
      this.stepCompact(id);
    }
    return started;
  }

  private emitStage(id: string, note: string | null = null): void {
    const c = this.compacts.get(id);
    if (c) this.emitCompact({ sessionId: id, stage: c.stage, auto: c.auto, note });
  }

  private setStage(id: string, c: Compact, stage: CompactState['stage'], note: string | null = null): void {
    c.stage = stage; c.stageAt = Date.now(); c.sawBusy = false;
    this.emitStage(id, note);
    if (stage === 'done' || stage === 'failed') setTimeout(() => this.compacts.delete(id), 1000);
  }

  private stepCompact(id: string): void {
    const c = this.compacts.get(id);
    if (!c || c.stage === 'done' || c.stage === 'failed') return;
    const s = this.sessions.list().find((x) => x.id === id);
    const tel = this.ingest.get(id);
    const now = Date.now();
    if (!s || s.status !== 'running') { this.setStage(id, c, 'failed', 'The session stopped.'); return; }
    if (now - c.startedAt > COMPACT_TIMEOUT_MS) {
      this.setStage(id, c, 'failed', 'It did not finish in 25 minutes, so it was left as it was.');
      this.notify(id, c.projectName + ' did not compact', 'It did not reach a stopping point in 25 minutes. Click to open it.');
      return;
    }
    const state = tel?.state;
    if (state === 'busy') c.sawBusy = true;
    if (state === 'waiting' && !c.askedYou) {
      c.askedYou = true;
      this.notify(id, c.projectName + ' needs you before compacting', 'It stopped to ask you something. Click to answer; it compacts once it is done.');
    }
    if (state !== 'waiting') c.askedYou = false;
    switch (c.stage) {
      case 'asked':
        if (state === 'idle') { paste(this.sessions, id, COMPACT_PREP); this.setStage(id, c, 'stopping'); }
        return;
      case 'stopping':
        // Its reply turn has ended: it has saved its notes and is at a stopping point.
        if (state === 'idle' && (c.sawBusy || now - c.stageAt > 20000) && now - c.stageAt > 3000) {
          this.sessions.write(id, COMPACT_CMD);
          setTimeout(() => this.sessions.write(id, '\r'), 200);
          this.setStage(id, c, 'compacting');
        }
        return;
      case 'compacting': {
        const done = (tel?.compactions ?? 0) > c.baseCompactions;
        if (done) this.setStage(id, c, 'resuming');
        else if (now - c.stageAt > 10 * 60 * 1000) this.setStage(id, c, 'failed', 'The compaction did not report back in 10 minutes.');
        return;
      }
      case 'resuming':
        // The project's plugin may already have told it to carry on; only nudge a session left sitting idle.
        if (state === 'busy' || state === 'waiting') { this.setStage(id, c, 'done'); return; }
        if (now - c.stageAt > 8000 && state === 'idle') { paste(this.sessions, id, RESUME_PROMPT); this.setStage(id, c, 'done'); }
        return;
    }
  }

  private maybeAutoCompact(t: Telemetry): void {
    const a = autoCompactSettings();
    if (!a.enabled || t.contextPercent == null || t.contextPercent < a.percent) return;
    if (this.compacts.has(t.sessionId) || this.wraps.has(t.sessionId) || this.pending.has(t.sessionId)) return;
    if (Date.now() - (this.lastAuto.get(t.sessionId) ?? 0) < AUTO_COOLDOWN_MS) return;
    this.lastAuto.set(t.sessionId, Date.now());
    this.compact([t.sessionId], true);
  }

  /**
   * Turns a project's chat watcher on or off through its own sessions: /watch
   * on|off for the plugin, then a plain message so the session that runs the
   * watcher starts or stops it. Returns how many sessions were told.
   */
  chatWatchMessage(projectId: string, on: boolean): number {
    let n = 0;
    for (const s of this.sessions.list()) {
      const t = findTemplate(s.templateId);
      if (!t || t.kind !== 'claude' || t.project !== projectId || s.status !== 'running') continue;
      n += 1;
      this.sessions.write(s.id, on ? '/watch on' : '/watch off');
      setTimeout(() => this.sessions.write(s.id, '\r'), 200);
      setTimeout(() => paste(this.sessions, s.id, on
        ? 'Chat watcher on: if you are the session that runs the chat watcher, start it now unless it is already running, and keep it running as your rules describe. Then carry on.'
        : 'Chat watcher off: if you are running the chat watcher, stop it now and do not start it again until I turn it back on. Then carry on with what you were doing.'), 1200);
    }
    return n;
  }

  run(projectId: string, text: string): { ok: boolean; reason: string | null; sessionId?: string } {
    const t = leadTemplate(projectId);
    if (!t) return { ok: false, reason: 'No session is set up for that project.' };
    return this.runTemplate(t.id, text);
  }

  /** Hands a message to one session, starting it in the background on its project's account if needed. */
  runTemplate(templateId: string, text: string): { ok: boolean; reason: string | null; sessionId?: string } {
    const t = findTemplate(templateId);
    if (!t || t.kind !== 'claude') return { ok: false, reason: 'No Claude session by that name.' };
    const projectId = t.project ?? '';
    const task = text.trim();
    if (!task) return { ok: false, reason: 'Type a task first.' };
    let s = this.sessions.runningFor(t.id);
    if (!s) {
      const r = this.sessions.create(t.id, 120, 40, { accountId: accountForProject(projectId) });
      if (!r.ok) return { ok: false, reason: r.reason };
      s = r.session;
    }
    const p: Pending = { sessionId: s.id, projectName: t.projectName ?? t.title, text: task, sent: false, startedAt: Date.now() };
    this.pending.set(s.id, p);
    this.watching.set(s.id, { projectName: p.projectName, lastState: this.ingest.get(s.id)?.state ?? 'starting' });
    this.trySend(s.id);
    return { ok: true, reason: null, sessionId: s.id };
  }

  /**
   * Wrap up a project: every running Claude session of it is asked to reach a
   * stopping point, save its state, and stop; once it has, it is exited.
   * Returns the sessions being wrapped so the app can close their panes.
   */
  wrapUp(projectId: string): string[] {
    const ids: string[] = [];
    for (const s of this.sessions.list()) {
      const t = findTemplate(s.templateId);
      if (!t || t.kind !== 'claude' || t.project !== projectId || s.status !== 'running') continue;
      this.wraps.set(s.id, { projectName: t.projectName ?? t.title, stage: 'asked', startedAt: Date.now() });
      ids.push(s.id);
      this.stepWrap(s.id);
    }
    return ids;
  }

  private stepWrap(sessionId: string): void {
    const w = this.wraps.get(sessionId);
    if (!w) return;
    const state = this.ingest.get(sessionId)?.state;
    if (Date.now() - w.startedAt > WRAP_TIMEOUT_MS) {
      this.wraps.delete(sessionId);
      this.notify(sessionId, `${w.projectName} is still working`, 'It did not finish wrapping up in 20 minutes, so it was left running. Click to open it.');
      return;
    }
    if (w.stage === 'asked' && state === 'idle') {
      w.stage = 'working';
      this.sessions.write(sessionId, `\x1b[200~${WRAP_PROMPT}\x1b[201~`);
      setTimeout(() => this.sessions.write(sessionId, '\r'), 150);
      return;
    }
    if (w.stage === 'working' && state === 'waiting') {
      this.notify(sessionId, `${w.projectName} needs you to wrap up`, 'It stopped to ask you something. Click to answer; it closes once it is done.');
      return;
    }
    if (w.stage === 'working' && state === 'idle' && Date.now() - w.startedAt > 3000) {
      w.stage = 'exiting';
      this.sessions.write(sessionId, '/exit\r');
      setTimeout(() => { if (this.sessions.list().find((x) => x.id === sessionId)?.status === 'running') this.sessions.kill(sessionId); this.wraps.delete(sessionId); }, 15000);
    }
  }

  /** Called on every telemetry update. */
  onTelemetry(t: Telemetry): void {
    this.stepWrap(t.sessionId);
    this.stepCompact(t.sessionId);
    this.maybeAutoCompact(t);
    this.trySend(t.sessionId);
    const w = this.watching.get(t.sessionId);
    if (!w) return;
    const p = this.pending.get(t.sessionId);
    if (p?.sent && w.lastState === 'busy' && t.state === 'idle') {
      this.notify(t.sessionId, `${w.projectName} finished`, 'Your task is done. Click to open the session.');
      this.pending.delete(t.sessionId);
      this.watching.delete(t.sessionId);
      return;
    }
    if (t.state === 'waiting' && w.lastState !== 'waiting') this.notify(t.sessionId, `${w.projectName} needs you`, t.waitingMessage ?? 'It is waiting for your answer. Click to open it.');
    w.lastState = t.state;
  }

  private trySend(sessionId: string): void {
    const p = this.pending.get(sessionId);
    if (!p || p.sent) return;
    const tel = this.ingest.get(sessionId);
    // Ready once the CLI reports in and is not mid turn (the plugin may run a start-up turn first); give up after ten minutes.
    const ready = tel && (tel.state === 'idle') ;
    if (!ready) {
      if (Date.now() - p.startedAt > 600000) { this.pending.delete(sessionId); this.notify(sessionId, `${p.projectName} did not start`, 'The session never became ready. Open it to see why.'); }
      return;
    }
    p.sent = true;
    // Bracketed paste keeps a multi line task together; Enter submits it.
    this.sessions.write(sessionId, `\x1b[200~${p.text}\x1b[201~`);
    setTimeout(() => this.sessions.write(sessionId, '\r'), 150);
    const w = this.watching.get(sessionId);
    if (w) w.lastState = 'busy';
  }

  notify(sessionId: string, title: string, body: string): void {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: false, icon: join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), 'icon.png') });
    n.on('click', () => {
      const s = this.sessions.list().find((x) => x.id === sessionId);
      if (s) this.focus(sessionId, s.templateId);
    });
    n.show();
  }

  templateTitle(id: string): string { return findTemplate(id)?.title ?? id; }
}
