// Top bar pieces: plan usage for every Claude account, the chat watcher switch,
// and the notices that say a session you are not looking at has replied.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Moon, Radio, Sun, X } from 'lucide-react';
import type { AccountLimits, ChatWatch, ReaderEntry } from '@shared/ipc';
import { ProjectLogo } from './ProjectLogo';
import { ago, useLive } from './workspace/live';
import { THEMES, useWorkspace } from './workspace/store';

/** resets_at arrives as epoch seconds or as a date string, depending on the CLI version. */
function toMs(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

const when = (ms: number) => {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

const tone = (pct: number | null) => (pct == null ? '' : pct >= 95 ? 'bad' : pct >= 80 ? 'warn' : '');

function effective(l: AccountLimits): { five: number | null; week: number | null; fiveReset: number | null; weekReset: number | null } {
  const fiveReset = toMs(l.fiveHourResetsAt as unknown as number | string | null);
  const weekReset = toMs(l.sevenDayResetsAt as unknown as number | string | null);
  const now = Date.now();
  // Past its reset, a window starts again from nothing.
  return {
    five: fiveReset && fiveReset < now ? 0 : l.fiveHourPercent,
    week: weekReset && weekReset < now ? 0 : l.sevenDayPercent,
    fiveReset: fiveReset && fiveReset > now ? fiveReset : null,
    weekReset: weekReset && weekReset > now ? weekReset : null,
  };
}

/** Each account's five hour and weekly use, as the CLI last reported it. */
export function AccountUsage() {
  const { accounts, limits } = useLive();
  const { doc } = useWorkspace();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  const label = (id: string) => doc.accounts[id]?.label ?? (id === 'main' ? 'Main' : id);
  // Two config folders signed in to the same Claude account report the same figures; show them once.
  const rows: { id: string; ids: string[]; l: AccountLimits }[] = [];
  for (const a of accounts) {
    const l = limits[a.id];
    if (!l) continue;
    const same = rows.find((r) => r.l.fiveHourResetsAt === l.fiveHourResetsAt && r.l.sevenDayResetsAt === l.sevenDayResetsAt
      && r.l.fiveHourPercent === l.fiveHourPercent && r.l.sevenDayPercent === l.sevenDayPercent);
    if (same) same.ids.push(a.id); else rows.push({ id: a.id, ids: [a.id], l });
  }
  if (!rows.length) return null;
  return (
    <div className="usage-strip" aria-label="Claude plan usage">
      {rows.map(({ id, ids, l }) => {
        const e = effective(l!);
        const names = ids.map(label).join(' and ');
        const tip = [
          `${names}: ${e.five ?? '?'}% of the five hour limit${e.fiveReset ? `, resets ${when(e.fiveReset)}` : ''}.`,
          `${e.week ?? '?'}% of the weekly limit${e.weekReset ? `, resets ${when(e.weekReset)}` : ''}.`,
          `Last reported ${ago(l!.at)} by one of its sessions.`,
          ids.length > 1 ? 'These are signed in to the same Claude account, so they share one limit.' : '',
        ].join(' ');
        return (
          <span key={id} className="usage-acc" title={tip}>
            <span className="usage-name">{ids.length > 1 ? ids.map(label).join() : label(id)}</span>
            <span className={`usage-num ${tone(e.five)}`}>{e.five == null ? '–' : `${Math.round(e.five)}%`}<small>5h</small></span>
            <span className={`usage-num ${tone(e.week)}`}>{e.week == null ? '–' : `${Math.round(e.week)}%`}<small>wk</small></span>
          </span>
        );
      })}
    </div>
  );
}

/** On and off for a project's chat watcher, which runs inside its watching session. */
export function ChatWatchSwitch({ projectId, onNote }: { projectId: string; onNote(text: string): void }) {
  const { sessions } = useLive();
  const [w, setW] = useState<ChatWatch | null>(null);
  const [pending, setPending] = useState<{ on: boolean; since: number } | null>(null);
  const live = useRef(true);
  const load = useCallback(() => void window.elysium.chatWatch(projectId).then((x) => { if (live.current) setW(x); }), [projectId]);
  useEffect(() => {
    live.current = true; setW(null); setPending(null);
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => { live.current = false; clearInterval(t); };
  }, [load]);
  // While switching, look more often and stop waiting once it shows the new state (or after three minutes).
  useEffect(() => {
    if (!pending) return;
    if (w && w.running === pending.on) { setPending(null); return; }
    if (Date.now() - pending.since > 180000) { setPending(null); onNote(pending.on ? 'The watcher has not started yet. Prime starts it when its current turn ends.' : 'The watcher is still running.'); return; }
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [pending, w, load, onNote]);
  if (!w?.available) return null;
  const anyRunning = sessions.some((s) => s.status === 'running' && s.templateId.startsWith(`${projectId}.`));
  const toggle = async () => {
    const on = !w.running;
    if (on && !anyRunning) { onNote('Start Prime first. The chat watcher runs inside its session.'); return; }
    setPending({ on, since: Date.now() });
    const r = await window.elysium.setChatWatch(projectId, on);
    if (!r.ok) { setPending(null); if (r.reason) onNote(r.reason); }
    load();
  };
  const label = pending ? (pending.on ? 'Starting' : 'Stopping') : w.running ? 'Watcher' : 'Watcher off';
  return (
    <button className={`pill watch-switch ${w.running ? 'on' : ''}`} onClick={() => void toggle()} disabled={Boolean(pending)}
      title={w.running ? 'The chat watcher is checking for new tasks. Click to stop it.' : 'The chat watcher is not running. Click to have the watching session start it.'}>
      <Radio size={14} /><span className={`dot ${pending ? 'busy' : w.running ? 'idle' : 'off'}`} />{label}
    </button>
  );
}

export interface Notice { id: string; sessionId: string; templateId: string; projectId: string | null; title: string; body: string; kind: 'reply' | 'waiting' | 'info' }

/** A short plain line from a Claude reply: no code, no markdown marks. */
export function plainLine(text: string, max = 180): string {
  const t = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_>|]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Notices for sessions out of view: a Claude reply, or a session that needs an
 * answer. In the app they show as cards; with the window in the background,
 * as a Windows notification instead.
 */
export function useNotices(isVisible: (sessionId: string) => boolean, enabled: boolean) {
  const { sessions, templates, telemetry, compacting } = useLive();
  const [notices, setNotices] = useState<Notice[]>([]);
  const ref = useRef({ sessions, templates, isVisible, enabled, compacting });
  ref.current = { sessions, templates, isVisible, enabled, compacting };
  const lastState = useRef<Record<string, string>>({});

  const push = useCallback((n: Omit<Notice, 'id'>) => {
    const away = !document.hasFocus() || document.visibilityState === 'hidden';
    if (away && n.kind !== 'info') { window.elysium.notifyOs(n.sessionId, n.title, n.body); return; }
    setNotices((list) => [{ ...n, id: Math.random().toString(36).slice(2) }, ...list.filter((x) => x.sessionId !== n.sessionId || x.kind !== n.kind)].slice(0, 4));
  }, []);

  const about = useCallback((sessionId: string) => {
    const s = ref.current.sessions.find((x) => x.id === sessionId);
    const t = s ? ref.current.templates.find((x) => x.id === s.templateId) : undefined;
    return { s, t, name: t?.title ?? s?.title ?? 'A session' };
  }, []);

  useEffect(() => window.elysium.onReader((sessionId: string, e: ReaderEntry) => {
    if (e.role !== 'claude' || !ref.current.enabled || ref.current.isVisible(sessionId) || ref.current.compacting[sessionId]) return;
    const { s, t, name } = about(sessionId);
    if (!s || t?.kind !== 'claude') return;
    push({ sessionId, templateId: s.templateId, projectId: t.project, title: `${name} replied`, body: plainLine(e.text), kind: 'reply' });
  }), [about, push]);

  useEffect(() => {
    for (const [id, t] of Object.entries(telemetry)) {
      const prev = lastState.current[id];
      lastState.current[id] = t.state;
      if (t.state !== 'waiting' || prev === 'waiting' || !ref.current.enabled || ref.current.isVisible(id)) continue;
      const { s, t: tpl, name } = about(id);
      if (!s) continue;
      push({ sessionId: id, templateId: s.templateId, projectId: tpl?.project ?? null, title: `${name} needs you`, body: t.waitingMessage ?? 'It is waiting for your answer.', kind: 'waiting' });
    }
  }, [telemetry, about, push]);

  // Cards leave by themselves; one that needs you stays a while longer.
  useEffect(() => {
    if (!notices.length) return;
    const t = setTimeout(() => setNotices((l) => l.slice(0, -1)), notices[notices.length - 1].kind === 'waiting' ? 30000 : 12000);
    return () => clearTimeout(t);
  }, [notices]);

  const dismiss = useCallback((id: string) => setNotices((l) => l.filter((x) => x.id !== id)), []);
  return { notices, push, dismiss };
}

export function NoticeStack({ notices, onOpen, onDismiss }: { notices: Notice[]; onOpen(n: Notice): void; onDismiss(id: string): void }) {
  if (!notices.length) return null;
  return (
    <div className="notice-stack over-native" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} onClick={() => { onDismiss(n.id); onOpen(n); }} role="button" tabIndex={0}>
          {n.projectId ? <ProjectLogo projectId={n.projectId} /> : <span className="dot busy" />}
          <div className="notice-text">
            <div className="notice-title">{n.title}</div>
            <div className="notice-body">{n.body}</div>
          </div>
          <button className="ghost-icon tiny" onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }} aria-label="Dismiss"><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}

/** Every theme, one click from the top bar. */
export function ThemeToggle() {
  const { doc, setSettings } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, [open]);
  const light = ['claude-light', 'paper', 'sand', 'mint'].includes(document.documentElement.dataset.theme ?? '');
  return (
    <div className="theme-pick" ref={ref}>
      <button className="glance-btn icon-only" onClick={() => setOpen((o) => !o)} title="Theme" aria-label="Choose a theme" aria-expanded={open}>
        {light ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      {open && (
        <div className="theme-menu" role="menu">
          {THEMES.map((t) => (
            <button key={t.id} role="menuitemradio" aria-checked={doc.settings.theme === t.id} className={`theme-item ${doc.settings.theme === t.id ? 'on' : ''}`}
              onClick={() => { setSettings({ theme: t.id }); setOpen(false); }}>
              <span className="theme-sw">{t.swatch.map((c, i) => <span key={i} style={{ background: c }} />)}</span>
              <span className="theme-name">{t.name}</span>
              {doc.settings.theme === t.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
