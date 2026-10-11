import { useCallback, useEffect, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { Cpu, HardDrive, MemoryStick, RefreshCw, Sparkles, SquareTerminal } from 'lucide-react';
import type { ProcGroup, ResourceSample } from '@shared/ipc';
import { useLive } from './live';
import { useWorkspace } from './store';

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

export function since(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
}

function Spark({ values, max = 100, level }: { values: number[]; max?: number; level: string }) {
  const w = 160, h = 36;
  if (values.length < 2) return <svg className="spark" viewBox={`0 0 ${w} ${h}`} />;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (Math.min(v, max) / max) * (h - 4)).toFixed(1)}`);
  return (
    <svg className={`spark ${level}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,${h} ${pts.join(' ')} ${w},${h}`} className="spark-area" />
      <polyline points={pts.join(' ')} className="spark-line" />
    </svg>
  );
}

function Stat({ icon, label, value, sub, values, max, level }: { icon: React.ReactNode; label: string; value: string; sub: string; values: number[]; max?: number; level: string }) {
  return (
    <div className={`stat ${level}`}>
      <div className="stat-head">{icon}<span>{label}</span></div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
      <Spark values={values} max={max} level={level} />
    </div>
  );
}

/** Memory: live usage, the programs using the most RAM, and the opt-in auto free list. */
export function MachineWidget() {
  const { res, history } = useLive();
  const { doc, setSettings } = useWorkspace();
  const [procs, setProcs] = useState<ProcGroup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const auto = doc.settings.autoEnd;

  const load = useCallback(async () => { try { setProcs(await window.elysium.processes()); } catch { setProcs([]); } }, []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 10000); return () => clearInterval(t); }, [load]);

  const end = async (name: string) => {
    setBusy(name);
    setArmed(null);
    await window.elysium.endProgram(name);
    setBusy(null);
    void load();
  };
  const toggleAuto = (name: string) => {
    const has = auto.programs.some((p) => p.toLowerCase() === name.toLowerCase());
    setSettings({ autoEnd: { ...auto, programs: has ? auto.programs.filter((p) => p.toLowerCase() !== name.toLowerCase()) : [...auto.programs, name] } });
  };

  if (!res) return <div className="widget empty-state">Reading this machine</div>;
  const pick = (f: (r: ResourceSample) => number | null) => history.map(f).filter((v): v is number => v !== null);
  const visible = (procs ?? []).filter((p) => !p.protected).slice(0, 12);
  const top = visible[0]?.bytes ?? 1;
  return (
    <div className="widget mem-widget">
      <div className="mem-stats">
        <Stat icon={<MemoryStick size={13} />} label="Memory" value={`${res.ramUsedPercent.toFixed(0)}%`} sub={`${gb(res.ramUsedBytes)} of ${gb(res.ramTotalBytes)}`} values={pick((r) => r.ramUsedPercent)} level={res.ramLevel} />
        <Stat icon={<HardDrive size={13} />} label="Disk free" value={res.diskFreeBytes === null ? '?' : gb(res.diskFreeBytes)} sub={res.diskPath.replace(/\\$/, '')} values={pick((r) => (r.diskFreeBytes === null ? null : r.diskFreeBytes / 1024 ** 3))} max={64} level={res.diskLevel} />
        <Stat icon={<Cpu size={13} />} label="CPU" value={res.cpuPercent === null ? '?' : `${res.cpuPercent.toFixed(0)}%`} sub="all cores" values={pick((r) => r.cpuPercent)} level="ok" />
      </div>

      <div className="mem-head">
        <h3>Using the most memory</h3>
        <button className="ghost-icon" onClick={() => void load()} title="Refresh" aria-label="Refresh"><RefreshCw size={13} /></button>
      </div>
      <div className="proc-list">
        {!procs && <div className="empty-state">Reading programs</div>}
        {visible.map((p) => {
          const onList = auto.programs.some((x) => x.toLowerCase() === p.name.toLowerCase());
          return (
            <div key={p.name} className="proc" title={p.windowTitle ?? undefined}>
              <div className="proc-name">
                {p.name}
                <span className="muted">{p.pids.length > 1 ? `${p.pids.length} processes` : ''}{p.agentHost ? '  may host your agents' : ''}</span>
                <div className="proc-bar" style={{ width: `${Math.max(4, (p.bytes / top) * 100)}%` }} />
              </div>
              <span className="proc-size">{gb(p.bytes)}</span>
              <span className="proc-actions">
                <button className={`tag-btn ${onList ? 'on' : ''}`} onClick={() => toggleAuto(p.name)} title="End this automatically when memory runs high">{onList ? 'Auto' : '+ Auto'}</button>
                {armed === p.name ? (
                  <button className="tag-btn danger" disabled={busy === p.name} onClick={() => void end(p.name)}>{busy === p.name ? 'Ending' : 'Confirm'}</button>
                ) : (
                  <button className="tag-btn danger" onClick={() => setArmed(p.name)}>End</button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="glass-card auto-card">
        <div className="auto-row">
          <span><strong>Auto free memory</strong><br /><span className="muted small">Ends only programs marked Auto. Windows itself is never touched.</span></span>
          <div className="seg">
            <button className={!auto.enabled ? 'on' : ''} onClick={() => setSettings({ autoEnd: { ...auto, enabled: false } })}>Off</button>
            <button className={auto.enabled ? 'on' : ''} onClick={() => setSettings({ autoEnd: { ...auto, enabled: true } })}>On</button>
          </div>
        </div>
        <div className="auto-row">
          <span className="muted">When memory passes {auto.thresholdPercent}%</span>
          <input type="range" min={70} max={95} step={1} value={auto.thresholdPercent} onChange={(e) => setSettings({ autoEnd: { ...auto, thresholdPercent: Number(e.target.value) } })} />
        </div>
        <div className="auto-list">
          {auto.programs.length
            ? auto.programs.map((p) => <button key={p} className="tag-btn on" onClick={() => toggleAuto(p)} title="Remove from the list">{p}  ×</button>)
            : <span className="muted small">No programs marked Auto yet.</span>}
        </div>
      </div>
    </div>
  );
}

export function SessionsWidget() {
  const { sessions, templates } = useLive();
  const { doc, apiFor, setActiveView } = useWorkspace();
  const live = sessions.filter((s) => s.status === 'running' || s.status === 'starting');
  const focus = (sessionId: string) => {
    for (const v of doc.views) {
      const p = apiFor(v.id)?.panels.find((x) => (x.params as { sessionId?: string } | undefined)?.sessionId === sessionId);
      if (p) { setActiveView(v.id); p.api.setActive(); return; }
    }
  };
  if (!live.length) return <div className="widget empty-state">No sessions running</div>;
  return (
    <div className="widget list-widget">
      {live.map((s) => {
        const t = templates.find((x) => x.id === s.templateId);
        return (
          <button key={s.id} className="list-row" onClick={() => focus(s.id)} title={t?.cwd}>
            {t?.kind === 'claude' ? <Sparkles size={15} /> : <SquareTerminal size={15} />}
            <span className="grow">{s.title}</span>
            <span className="muted">{since(s.startedAt)}</span>
            <span className={`dot ${s.status}`} />
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
      <textarea
        value={doc.notes[props.api.id] ?? ''}
        onChange={(e) => setNote(props.api.id, e.target.value)}
        placeholder="Plans, pasted prompts, anything. Saved as you type."
        spellCheck
      />
    </div>
  );
}

export function LauncherWidget(props: IDockviewPanelProps) {
  const { templates, res } = useLive();
  const { open } = useWorkspace();
  const blocked = res?.refuseReason ?? null;
  return (
    <div className="widget launcher-widget">
      {templates.map((t) => (
        <button key={t.id} className="launch-row" disabled={Boolean(blocked)} title={blocked ?? t.cwd} onClick={() => open({ kind: 'terminal', templateId: t.id, title: t.title, referenceGroupId: props.api.group.id, besideLauncher: true })}>
          <span className="launch-icon">{t.kind === 'claude' ? <Sparkles size={16} /> : <SquareTerminal size={16} />}</span>
          <span className="grow">
            <span className="launch-title">{t.title}</span>
            <span className="launch-sub">{t.cwd}</span>
          </span>
        </button>
      ))}
      {blocked && <div className="launch-blocked">{blocked}</div>}
    </div>
  );
}
