// Usage: how close each Claude account is to its limits, and where the tokens go
// (by project, by model, by day), plus Saver mode for when you want to stretch a plan.
import { useEffect, useMemo, useState } from 'react';
import { Leaf, ShieldCheck } from 'lucide-react';
import type { TokenStats } from '@shared/ipc';
import { useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';
import { Meter, effectiveLimits } from './TopBarExtras';

const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export function Usage() {
  const { accounts, limits } = useLive();
  const { doc, setSettings } = useWorkspace();
  const [t, setT] = useState<TokenStats | null>(null);
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { void window.elysium.tokens().then(setT); }, []);
  const label = (id: string) => doc.accounts[id]?.label ?? (id === 'main' ? 'Main account' : id);
  const saver = Boolean(doc.settings.saver);

  const total = t ? Object.values(t.totals[range]).reduce((a, b) => a + b, 0) : 0;
  const cachePct = t && total ? Math.round((t.totals[range].cacheRead / total) * 100) : 0;
  const days = useMemo(() => (t ? t.perDay.slice(range === 'week' ? -7 : -30).map((d) => ({ day: d.day, n: d.input + d.output + d.cacheRead + d.cacheWrite })) : []), [t, range]);
  const peak = Math.max(1, ...days.map((d) => d.n));

  return (
    <div className="page page-enter">
      <div className="page-inner usage-page">
        <h1 className="page-title">Usage</h1>
        <p className="page-sub">How close you are to your plan's limits, and where the work goes.</p>

        <section className={`saver-card ${saver ? 'on' : ''}`}>
          <span className="saver-icon"><Leaf size={20} /></span>
          <div className="saver-text">
            <strong>Saver mode</strong>
            <span>Stretches your plan. Turns off Flow summaries and the command box's Sonnet fallback, runs chats on Sonnet, and compacts long sessions sooner. Your sessions keep working as usual.</span>
          </div>
          <button className={`ob-switch-btn ${saver ? 'on' : ''}`} role="switch" aria-checked={saver} aria-label="Saver mode"
            onClick={() => setSettings({ saver: !saver, ...(!saver ? { flowSummaries: false, autoCompact: { ...doc.settings.autoCompact, enabled: true, percent: Math.min(doc.settings.autoCompact.percent, 70) } } : {}) })}>
            <i />
          </button>
        </section>

        <div className="plan-note"><ShieldCheck size={15} />Every session runs on your Claude plan. Elysium removes API keys from what it starts, so nothing here is billed per token.</div>

        <h2 className="usage-h">Plan limits</h2>
        <div className="usage-limits">
          {accounts.filter((a) => limits[a.id]).map((a) => {
            const e = effectiveLimits(limits[a.id]!);
            return (
              <div key={a.id} className="usage-card">
                <div className="usage-card-head"><strong>{label(a.id)}</strong></div>
                <Meter label="Five hour limit" pct={e.five} reset={e.fiveReset} />
                <Meter label="Weekly limit" pct={e.week} reset={e.weekReset} />
              </div>
            );
          })}
          {!accounts.some((a) => limits[a.id]) && <p className="muted">Limits appear once a session has run on an account.</p>}
        </div>

        <div className="usage-h-row">
          <h2 className="usage-h">Tokens</h2>
          <div className="seg">{(['week', 'month'] as const).map((r) => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r === 'week' ? '7 days' : '30 days'}</button>)}</div>
        </div>
        {!t && <div className="usage-loading">Reading your session history…</div>}
        {t && (
          <>
            <div className="usage-tiles">
              <div className="usage-tile"><div className="usage-big">{fmt(total)}</div><div className="usage-tile-label">tokens in all</div></div>
              <div className="usage-tile"><div className="usage-big">{fmt(t.totals[range].output)}</div><div className="usage-tile-label">written by Claude</div></div>
              <div className="usage-tile"><div className="usage-big">{cachePct}%</div><div className="usage-tile-label">read from cache, the cheap kind</div></div>
            </div>

            <div className="usage-chart" role="img" aria-label="Tokens per day">
              {days.map((d, i) => (
                <div key={d.day} className="usage-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {hover === i && <div className="usage-tip"><strong>{fmt(d.n)}</strong><span>{new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>}
                  <div className={`usage-colbar ${i === days.length - 1 ? 'today' : ''}`} style={{ height: `${Math.max(2, (d.n / peak) * 100)}%` }} />
                </div>
              ))}
            </div>

            <div className="usage-two">
              <Breakdown title="By project" rows={t.projects.map((p) => ({ name: p.name, n: p[range] }))} />
              <Breakdown title="By model" rows={t.models.map((m) => ({ name: m.name, n: m[range] }))} />
            </div>
            {t.accounts.length > 1 && <Breakdown title="By account" rows={t.accounts.map((a) => ({ name: label(a.id), n: a[range] }))} />}
            <p className="usage-foot">Counted from the usage numbers Claude Code writes on this PC; message content is never read. Cache reads are how Claude Code avoids re-sending context, and count far less against limits.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; n: number }[] }) {
  const list = rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
  const top = Math.max(1, ...list.map((r) => r.n));
  const sum = list.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <section className="usage-break">
      <h3>{title}</h3>
      {!list.length && <p className="muted small">Nothing yet.</p>}
      {list.map((r) => (
        <div key={r.name} className="usage-row" title={`${r.name}: ${r.n.toLocaleString()} tokens`}>
          <div className="usage-row-top"><span>{r.name}</span><span className="muted">{fmt(r.n)} · {Math.round((r.n / sum) * 100)}%</span></div>
          <div className="usage-bar"><i style={{ width: `${(r.n / top) * 100}%` }} /></div>
        </div>
      ))}
    </section>
  );
}
