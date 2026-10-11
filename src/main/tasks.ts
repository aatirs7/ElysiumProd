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

export class Tasks {
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

  /** Called on every telemetry update. */
  onTelemetry(t: Telemetry): void {
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
