// Background tasks from the quick bar: hand a task to a project's lead session
// (Prime, or the single session of a side project) without opening anything.
// The session starts on the project's account if it is not running, the task is
// pasted once the session reports it is ready, and a Windows notification says
// when it finishes or needs you. Clicking the notification opens that session.
import { app, Notification } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Telemetry } from '@shared/ipc';
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

interface Wrap { projectName: string; stage: 'asked' | 'working' | 'exiting'; startedAt: number }

export class Tasks {
  private wraps = new Map<string, Wrap>();
  private pending = new Map<string, Pending>();
  private watching = new Map<string, { projectName: string; lastState: string }>();

  constructor(
    private sessions: SessionManager,
    private ingest: Ingest,
    private focus: (sessionId: string, templateId: string) => void,
  ) {}

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
    // Ready once the CLI reports in and is not mid turn; give up waiting after two minutes.
    const ready = tel && (tel.state === 'idle') ;
    if (!ready) {
      if (Date.now() - p.startedAt > 120000) { this.pending.delete(sessionId); this.notify(sessionId, `${p.projectName} did not start`, 'The session never became ready. Open it to see why.'); }
      return;
    }
    p.sent = true;
    // Bracketed paste keeps a multi line task together; Enter submits it.
    this.sessions.write(sessionId, `\x1b[200~${p.text}\x1b[201~`);
    setTimeout(() => this.sessions.write(sessionId, '\r'), 150);
    const w = this.watching.get(sessionId);
    if (w) w.lastState = 'busy';
  }

  private notify(sessionId: string, title: string, body: string): void {
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
