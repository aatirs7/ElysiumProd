import { useCallback, useEffect, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { Eye, Sparkles, SquareTerminal } from 'lucide-react';
import type { ProcGroup, Telemetry } from '@shared/ipc';
import { ago, useLive, useMachine } from './live';
import { useWorkspace } from './store';
import { adviceFor } from '../memory';

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

export function since(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
}

/** Context fill as a small bar; colours follow the plugin's 75 and 85 percent lines. */
export function ContextMeter({ t, compact = false }: { t: Telemetry | undefined; compact?: boolean }) {
  if (!t || t.contextPercent === null) return compact ? null : <span className="meter-empty">context unknown</span>;
  const p = Math.round(t.contextPercent);
  const tone = p >= 85 ? 'bad' : p >= 75 ? 'warn' : 'ok';
  const title = `Context ${p} percent used${t.contextTokens ? `, ${Math.round(t.contextTokens / 1000)}K of ${Math.round((t.windowSize ?? 0) / 1000)}K tokens` : ''}. Input side only; updates after each turn.`;
  return (
    <span className={`ctx ${tone} ${compact ? 'compact' : ''}`} title={title}>
      <span className="ctx-track"><span className="ctx-fill" style={{ width: `${Math.min(100, Math.max(3, p))}%` }} /></span>
      {!compact && <span className="ctx-num">{p}%</span>}
    </span>
  );
}

export function SkeletonRows({ n = 4 }: { n?: number }) {
  return <div className="skeleton-list">{Array.from({ length: n }, (_, i) => <div key={i} className="skeleton" style={{ animationDelay: `${i * 90}ms` }} />)}</div>;
}

/** Memory: one clear answer at the top, then the programs, then the opt-in auto list. */
export function MachineWidget() {
  const { res } = useMachine();
  const { doc, setSettings } = useWorkspace();
  const [procs, setProcs] = useState<ProcGroup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const auto = doc.settings.autoEnd;

  const load = useCallback(async () => { try { setProcs(await window.elysium.processes()); } catch { setProcs([]); } }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);

  const end = async (name: string) => { setBusy(name); setArmed(null); await window.elysium.endProgram(name); setBusy(null); void load(); };
  const toggleAuto = (name: string) => {
    const has = auto.programs.some((p) => p.toLowerCase() === name.toLowerCase());
    setSettings({ autoEnd: { ...auto, programs: has ? auto.programs.filter((p) => p.toLowerCase() !== name.toLowerCase()) : [...auto.programs, name] } });
  };

  const visible = (procs ?? []).filter((p) => !p.protected).slice(0, 8);
  const top = visible[0]?.bytes ?? 1;
  const pct = res ? Math.round(res.ramUsedPercent) : null;
  return (
    <div className="widget pad stack-lg">
      <div className="hero-stat">
        <div className={`hero-num ${res?.ramLevel ?? ''}`}>{pct === null ? '...' : `${pct}%`}</div>
        <div className="hero-label">memory in use{res ? `, ${gb(res.ramUsedBytes)} of ${gb(res.ramTotalBytes)}` : ''}</div>
        {res && <div className="hero-note">{pct! >= 85 ? 'High. Closing the programs below frees the most.' : pct! >= 70 ? 'Fine. Windows keeps spare memory busy as cache.' : 'Plenty free.'}</div>}
      </div>

      <div className="stack-sm">
        <div className="section-title">Using the most</div>
        {!procs && <SkeletonRows n={5} />}
        {visible.map((p) => {
          const onList = auto.programs.some((x) => x.toLowerCase() === p.name.toLowerCase());
          const tip = adviceFor(p);
          return (
            <div key={p.name} className="proc" title={p.windowTitle ?? undefined}>
              <div className="proc-main">
                <div className="proc-line"><span className="proc-name">{tip.label}</span><span className="proc-size">{gb(p.bytes)}</span></div>
                <div className="proc-bar"><span style={{ width: `${Math.max(4, (p.bytes / top) * 100)}%` }} /></div>
                <div className="proc-tip">{tip.tip}</div>
              </div>
              <div className="proc-actions">
                <button className={`chip-btn ${onList ? 'on' : ''}`} onClick={() => toggleAuto(p.name)} title="End this automatically when memory runs high">{onList ? 'Auto on' : 'Auto'}</button>
                {armed === p.name
                  ? <button className="chip-btn danger" disabled={busy === p.name} onClick={() => void end(p.name)}>{busy === p.name ? 'Ending' : 'Sure?'}</button>
                  : <button className="chip-btn" onClick={() => setArmed(p.name)}>End</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card stack-sm">
        <div className="row-between">
          <div><strong>Auto free memory</strong><div className="muted small">Ends only programs marked Auto. Windows is never touched.</div></div>
          <div className="seg">
            <button className={!auto.enabled ? 'on' : ''} onClick={() => setSettings({ autoEnd: { ...auto, enabled: false } })}>Off</button>
            <button className={auto.enabled ? 'on' : ''} onClick={() => setSettings({ autoEnd: { ...auto, enabled: true } })}>On</button>
          </div>
        </div>
        <div className="row-between">
          <span className="muted">When memory passes {auto.thresholdPercent}%</span>
          <input type="range" min={70} max={95} value={auto.thresholdPercent} onChange={(e) => setSettings({ autoEnd: { ...auto, thresholdPercent: Number(e.target.value) } })} />
        </div>
        {auto.programs.length > 0 && <div className="wrap">{auto.programs.map((p) => <button key={p} className="chip-btn on" onClick={() => toggleAuto(p)}>{p} ×</button>)}</div>}
      </div>
    </div>
  );
}

export function SessionsWidget() {
  const { sessions, templates, telemetry } = useLive();
  const { doc, apiFor, setActiveView } = useWorkspace();
  const live = sessions.filter((s) => s.status === 'running' || s.status === 'starting');
  const focus = (sessionId: string) => {
    for (const v of doc.views) {
      const p = apiFor(v.id)?.panels.find((x) => (x.params as { sessionId?: string } | undefined)?.sessionId === sessionId);
      if (p) { setActiveView(v.id); p.api.setActive(); return; }
    }
  };
  if (!live.length) return <div className="widget empty-state">Nothing running</div>;
  return (
    <div className="widget pad-sm">
      {live.map((s) => {
        const t = templates.find((x) => x.id === s.templateId);
        const tel = telemetry[s.id];
        return (
          <button key={s.id} className="list-row tall" onClick={() => focus(s.id)} title={t?.cwd}>
            {t?.kind === 'claude' ? <Sparkles size={16} /> : <SquareTerminal size={16} />}
            <span className="grow">
              <span className="row-title">{s.title}</span>
              <span className="row-sub">{tel?.state === 'waiting' ? 'waiting on you' : tel?.state ?? 'running'} · {since(s.startedAt)}</span>
            </span>
            {t?.kind === 'claude' && <ContextMeter t={tel} />}
          </button>
        );
      })}
    </div>
  );
}

export function NotesWidget(props: IDockviewPanelProps) {
  const { doc, setNote } = useWorkspace();
  return (
    <div className="widget notes-widget">
      <textarea value={doc.notes[props.api.id] ?? ''} onChange={(e) => setNote(props.api.id, e.target.value)} placeholder="Plans, pasted prompts, anything. Saved as you type." spellCheck />
    </div>
  );
}

export function LauncherWidget(props: IDockviewPanelProps) {
  const { templates, sessions } = useLive();
  const { res } = useMachine();
  const { open, activeView, doc } = useWorkspace();
  const blocked = res?.refuseReason ?? null;
  const project = activeView?.projectId;
  // A project view lists that project's sessions; a plain view lists a shell and each pinned project's lead.
  const list = project
    ? templates.filter((t) => t.project === project || t.kind === 'shell')
    : templates.filter((t) => t.kind === 'shell' || (t.project && doc.pinned.includes(t.project) && t.role !== 'meridian'));
  const prime = project ? templates.find((t) => t.project === project && t.role === 'prime') : undefined;
  const meridian = project ? templates.find((t) => t.project === project && t.role === 'meridian') : undefined;
  const isRunning = (id?: string) => Boolean(id && sessions.some((s) => s.templateId === id && s.status === 'running'));
  return (
    <div className="widget pad-sm">
      {prime && meridian && !isRunning(prime.id) && !isRunning(meridian.id) && (
        <button className="btn primary start-pair" disabled={Boolean(blocked)}
          onClick={() => open({ kind: 'terminal', templateId: prime.id, title: prime.title, pairTemplateId: meridian.id, referenceGroupId: props.api.group.id, besideLauncher: true })}>
          Start Prime and Meridian
        </button>
      )}
      {list.map((t) => {
        const running = sessions.some((s) => s.templateId === t.id && s.status === 'running');
        return (
          <button key={t.id} className="list-row tall" disabled={Boolean(blocked)} title={blocked ?? t.cwd}
            onClick={() => open({ kind: 'terminal', templateId: t.id, title: t.title, referenceGroupId: props.api.group.id, besideLauncher: true })}>
            <span className="row-icon">{t.kind === 'claude' ? <Sparkles size={16} /> : <SquareTerminal size={16} />}</span>
            <span className="grow">
              <span className="row-title">{t.title}</span>
              <span className="row-sub">{t.kind !== 'claude' ? 'A plain shell' : t.role === 'prime' ? 'Leads the work' : t.role === 'meridian' ? 'Supports Prime' : 'Claude session'}</span>
            </span>
            {running && <span className="dot running" title="Running" />}
          </button>
        );
      })}
      {blocked && <div className="error-text small center pad-sm">{blocked}</div>}
    </div>
  );
}

/** The board watcher for this view's project: status, a switch, and the latest lines. */
export function WatcherWidget() {
  const { watchers, projects } = useLive();
  const { activeView, doc, setWatcher } = useWorkspace();
  const projectId = activeView?.projectId ?? projects[0]?.id;
  const w = projectId ? watchers[projectId] : undefined;
  const cfg = projectId ? doc.watchers[projectId] ?? { enabled: false, delivery: 'notify' as const } : null;
  if (!projectId || !cfg) return <div className="widget empty-state">Open a project to see its watcher</div>;
  if (w?.status === 'unconfigured') return <div className="widget empty-state">This project has no watcher command in .claude/mods.json</div>;
  return (
    <div className="widget pad stack">
      <div className="row-between">
        <div><strong>Board watcher</strong><div className="muted small">{w?.status === 'running' ? `Running, ${w.restarts} restarts` : w?.status ?? 'off'}</div></div>
        <div className="seg">
          <button className={!cfg.enabled ? 'on' : ''} onClick={() => setWatcher(projectId, { ...cfg, enabled: false })}>Off</button>
          <button className={cfg.enabled ? 'on' : ''} onClick={() => setWatcher(projectId, { ...cfg, enabled: true })}>On</button>
        </div>
      </div>
      <div className="row-between">
        <span className="muted">New tasks</span>
        <div className="seg">
          <button className={cfg.delivery === 'notify' ? 'on' : ''} onClick={() => setWatcher(projectId, { ...cfg, delivery: 'notify' })}>Just show</button>
          <button className={cfg.delivery === 'prime-when-idle' ? 'on' : ''} onClick={() => setWatcher(projectId, { ...cfg, delivery: 'prime-when-idle' })}>Hand to Prime</button>
        </div>
      </div>
      <div className="stack-sm">
        {(w?.lines ?? []).slice(-8).reverse().map((l, i) => (
          <div key={i} className="feed-row"><Eye size={13} /><span className="grow wrap-text">{l.text}</span><span className="muted small">{l.delivered ? 'sent to Prime' : ago(l.at)}</span></div>
        ))}
        {!w?.lines.length && <div className="muted small center">No new tasks yet.</div>}
      </div>
    </div>
  );
}
