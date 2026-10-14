// Live flow: what each Claude session in this view is doing, drawn as a trail of
// steps that grows as it works, with the current step in front and a short
// Sonnet summary on top. The steps cost nothing (they come from the session's own
// hooks); the summary is one small call at most every five minutes per session.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { Bot, FileSearch, FilePen, Globe, MessageSquare, MessageCircleQuestion, Search, Sparkles, SquareTerminal, Wrench } from 'lucide-react';
import type { FlowEvent, FlowKind, ReaderEntry } from '@shared/ipc';
import { ProjectLogo } from '../ProjectLogo';
import { ago, useLive } from './live';
import { useWorkspace } from './store';
import { shortModel } from './Workspace';

const KINDS: Record<FlowKind, { name: string; color: string; icon: typeof Bot }> = {
  edit: { name: 'Editing', color: '#5B8DEF', icon: FilePen },
  run: { name: 'Running', color: '#D9A043', icon: SquareTerminal },
  read: { name: 'Reading', color: '#8E8E8E', icon: FileSearch },
  search: { name: 'Searching', color: '#3FB5B0', icon: Search },
  web: { name: 'On the web', color: '#9B7BE0', icon: Globe },
  agent: { name: 'Helper agent', color: '#E06C8C', icon: Bot },
  message: { name: 'Messaging', color: '#4FA97A', icon: MessageSquare },
  ask: { name: 'Asking you', color: '#E5534B', icon: MessageCircleQuestion },
  other: { name: 'Other tools', color: '#8E8E8E', icon: Wrench },
};

/** Repeated steps fold into one node: "Edit store.tsx ×3". */
function fold(events: FlowEvent[]): { kind: FlowKind; label: string; n: number; at: string; to?: string }[] {
  const out: { kind: FlowKind; label: string; n: number; at: string; to?: string }[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last.kind === e.kind && last.label === e.label) { last.n += 1; last.at = e.at; } else out.push({ kind: e.kind, label: e.label, n: 1, at: e.at, to: e.to });
  }
  return out;
}

export function FlowPanel(props: IDockviewPanelProps<{ projectId?: string }>) {
  const { sessions, templates, telemetry } = useLive();
  const { doc, activeView, setSettings } = useWorkspace();
  const projectId = props.params.projectId ?? activeView?.projectId;
  const lanes = useMemo(() => sessions.filter((s) => {
    const t = templates.find((x) => x.id === s.templateId);
    return s.status === 'running' && t?.kind === 'claude' && (!projectId || t.project === projectId);
  }).sort((a, b) => a.templateId.localeCompare(b.templateId) * -1), [sessions, templates, projectId]);
  const laneKey = lanes.map((l) => l.id).join(',');
  const [events, setEvents] = useState<Record<string, FlowEvent[]>>({});
  const [asks, setAsks] = useState<Record<string, ReaderEntry>>({});
  const [summaries, setSummaries] = useState<Record<string, { text: string; at: string }>>({});
  const summariesOn = doc.settings.flowSummaries !== false && !doc.settings.saver;
  const visible = useRef(props.api.isVisible);
  useEffect(() => { const d = props.api.onDidVisibilityChange((e) => { visible.current = e.isVisible; }); return () => d.dispose(); }, [props.api]);

  useEffect(() => {
    let live = true;
    for (const s of lanes) {
      void window.elysium.flow(s.id).then((f) => { if (!live) return; setEvents((m) => ({ ...m, [s.id]: f.events })); if (f.summary) setSummaries((m) => ({ ...m, [s.id]: f.summary! })); });
      void window.elysium.reader(s.id).then((r) => { const a = [...r].reverse().find((e) => e.role === 'you'); if (live && a) setAsks((m) => ({ ...m, [s.id]: a })); });
    }
    const offs = [
      window.elysium.onFlow((id, e) => setEvents((m) => ({ ...m, [id]: [...(m[id] ?? []), e].slice(-200) }))),
      window.elysium.onReader((id, e) => { if (e.role === 'you') setAsks((m) => ({ ...m, [id]: e })); }),
    ];
    return () => { live = false; for (const o of offs) o(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneKey]);

  // Summaries: only while this pane is showing; main keeps it to one call per session every five minutes.
  useEffect(() => {
    if (!summariesOn) return;
    const ask = () => {
      if (!visible.current || document.visibilityState !== 'visible') return;
      for (const s of lanes) void window.elysium.flowSummary(s.id).then((r) => { if (r.text && r.at) setSummaries((m) => ({ ...m, [s.id]: { text: r.text!, at: r.at! } })); });
    };
    const first = setTimeout(ask, 1500);
    const t = setInterval(ask, 60000);
    return () => { clearTimeout(first); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneKey, summariesOn]);

  if (!lanes.length) {
    return <div className="flow empty"><div className="empty-state">When a Claude session runs{projectId ? ' in this project' : ''}, its work shows here as it happens.</div></div>;
  }

  return (
    <div className="flow">
      <div className="flow-bar">
        <span className="flow-title">Live flow</span>
        <span className="spacer" />
        <button className={`pill ${summariesOn ? 'on' : ''}`} onClick={() => setSettings({ flowSummaries: !summariesOn })}
          title="One short Sonnet 5.5 summary per session, at most every five minutes and only while this pane shows. It counts toward the main account's plan limits.">
          <Sparkles size={13} />Summaries {summariesOn ? 'on' : 'off'}
        </button>
      </div>
      {lanes.map((s, li) => {
        const t = templates.find((x) => x.id === s.templateId);
        const tel = telemetry[s.id];
        const st = tel?.state ?? 'starting';
        const ask = asks[s.id];
        const all = events[s.id] ?? [];
        // This turn: steps since the latest ask.
        const turn = ask ? all.filter((e) => e.at >= ask.at) : all;
        const steps = fold(turn).slice(-10);
        const now = steps[steps.length - 1];
        const files = new Set(turn.filter((e) => e.kind === 'edit').map((e) => e.label)).size;
        const runs = turn.filter((e) => e.kind === 'run').length;
        const sum = summaries[s.id];
        const otherLane = lanes.find((x) => x.id !== s.id);
        const otherTitle = otherLane ? templates.find((x) => x.id === otherLane.templateId)?.title ?? '' : '';
        const lastMsg = [...turn].reverse().find((e) => e.kind === 'message');
        return (
          <div key={s.id} className={`flow-lane ${st}`} style={{ animationDelay: `${li * 60}ms` }}>
            <div className="flow-head">
              {t?.project && <ProjectLogo projectId={t.project} />}
              <strong>{t?.title ?? s.title}</strong>
              {tel?.model && <span className="model-chip">{shortModel(tel.model)}</span>}
              <span className={`flow-state ${st}`}><span className={`dot ${st}`} />{st === 'busy' ? 'Working' : st === 'waiting' ? 'Needs you' : st === 'idle' ? 'Idle' : 'Starting'}</span>
              {tel?.contextPercent != null && <span className="muted small">{Math.round(tel.contextPercent)}% context</span>}
            </div>
            {ask && <div className="flow-ask" title={ask.text.slice(0, 400)}>Asked: {ask.text.split('\n').find((l) => l.trim())?.slice(0, 140)}</div>}
            {summariesOn && sum && <div className="flow-summary"><Sparkles size={13} /><span>{sum.text}</span><em>{ago(sum.at)}</em></div>}
            {steps.length ? (
              <div className="flow-trail" role="list" aria-label="Steps this turn">
                {steps.map((step, i) => {
                  const k = KINDS[step.kind];
                  const Icon = k.icon;
                  const current = i === steps.length - 1 && st === 'busy';
                  return (
                    <div key={`${step.at}-${i}`} role="listitem" className={`flow-node ${current ? 'now' : ''}`} style={{ ['--k' as string]: k.color }} title={`${k.name}: ${step.label}${step.n > 1 ? ` (${step.n} times)` : ''}, ${ago(step.at)}`}>
                      {i > 0 && <span className="flow-link" />}
                      <span className="flow-dot"><Icon size={13} /></span>
                      <span className="flow-label">{step.label}{step.n > 1 && <b> ×{step.n}</b>}</span>
                    </div>
                  );
                })}
              </div>
            ) : <div className="flow-quiet">No steps yet this turn.</div>}
            <div className="flow-foot">
              {now && <span>Now: <strong style={{ color: KINDS[now.kind].color }}>{KINDS[now.kind].name}</strong></span>}
              <span>{files} file{files === 1 ? '' : 's'} edited</span>
              <span>{runs} command{runs === 1 ? '' : 's'}</span>
              {lastMsg && <span className="flow-msg"><MessageSquare size={12} />to {lastMsg.to ?? otherTitle} {ago(lastMsg.at)}</span>}
            </div>
          </div>
        );
      })}
      <div className="flow-legend">{(Object.keys(KINDS) as FlowKind[]).filter((k) => k !== 'other').map((k) => <span key={k}><i style={{ background: KINDS[k].color }} />{KINDS[k].name}</span>)}</div>
    </div>
  );
}
