import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { UsageStats } from '@shared/ipc';
import { ProjectLogo } from './ProjectLogo';
import { hours } from './Home';
import { useLive } from './workspace/live';
import { SkeletonRows } from './workspace/widgets';

/** One series per chart, one accent hue, a hover tooltip on every bar. */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const on = (text: string) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX + 12, y: e.clientY - 30, text }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null;
  return { on, node };
}

export function Stats() {
  const { stats } = useLive();
  const [u, setU] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { on, node } = useTip();
  const load = () => { setLoading(true); void window.elysium.usage().then((x) => { setU(x); setLoading(false); }); };
  useEffect(load, []);

  const maxDay = Math.max(1, ...(u?.perDay.map((d) => d.minutes) ?? [1]));
  const maxHour = Math.max(1, ...(u?.perHour ?? [1]));
  const projects = (u?.projects ?? []).filter((p) => p.minutesMonth > 0);
  const maxProject = Math.max(1, ...projects.map((p) => p.minutesMonth));
  const commitsWeek = stats.reduce((n, s) => n + s.commitsThisWeek, 0);
  const linesWeek = stats.reduce((n, s) => n + s.linesThisWeek, 0);
  const busiest = u ? u.perHour.indexOf(Math.max(...u.perHour)) : -1;
  const top = projects[0];
  const fmtHour = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;

  return (
    <div className="page page-enter">
      <div className="page-inner wide">
        <h1 className="page-title">Your stats</h1>
        <p className="page-sub">Agent time is counted in ten minute blocks from your Claude Code sessions on this machine. <button className="link-btn" onClick={load}><RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh</button></p>

        <div className="tiles">
          <div className="tile"><div className="tile-num">{u ? hours(u.minutesWeek) : '...'}</div><div className="tile-label">this week</div></div>
          <div className="tile" style={{ animationDelay: '40ms' }}><div className="tile-num">{u ? hours(u.minutesMonth) : '...'}</div><div className="tile-label">last 30 days</div></div>
          <div className="tile" style={{ animationDelay: '80ms' }}><div className="tile-num">{commitsWeek}</div><div className="tile-label">commits this week</div></div>
          <div className="tile" style={{ animationDelay: '120ms' }}><div className="tile-num">{linesWeek >= 1000 ? `${Math.round(linesWeek / 1000)}K` : linesWeek}</div><div className="tile-label">lines changed this week</div></div>
          <div className="tile" style={{ animationDelay: '160ms' }}><div className="tile-num">{u ? `${u.streakDays} d` : '...'}</div><div className="tile-label">streak</div></div>
        </div>

        {!u && <SkeletonRows n={6} />}
        {u && (
          <div className="stats-grid">
            <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
              <h3>Agent time per day <span className="hint">· last 30 days</span></h3>
              <div className="cols" role="img" aria-label="Agent minutes per day for the last 30 days">
                {u.perDay.map((d, i) => (
                  <div key={d.day} className={`col ${d.minutes ? '' : 'zero'}`} style={{ height: d.minutes ? `${Math.max(4, (d.minutes / maxDay) * 100)}%` : '3px', animationDelay: `${i * 12}ms` }}
                    {...on(`${new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${hours(d.minutes)}`)} />
                ))}
              </div>
              <div className="cols-axis"><span>{new Date(`${u.perDay[0].day}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>Today</span></div>
            </div>

            <div className="chart-card">
              <h3>Most worked on <span className="hint">· last 30 days</span></h3>
              <div className="bars-h">
                {projects.slice(0, 8).map((p, i) => (
                  <div key={p.id} className="bar-h" {...on(`${p.name}: ${hours(p.minutesMonth)} in 30 days, ${hours(p.minutesWeek)} this week`)}>
                    <span className="name"><ProjectLogo projectId={p.id} />{p.name}</span>
                    <span className="track"><span className="fill" style={{ width: `${(p.minutesMonth / maxProject) * 100}%`, animationDelay: `${i * 60}ms` }} /></span>
                    <span className="val">{hours(p.minutesMonth)}</span>
                  </div>
                ))}
                {!projects.length && <div className="muted">No agent time recorded yet.</div>}
              </div>
            </div>

            <div className="chart-card">
              <h3>When you work <span className="hint">· by hour of day</span></h3>
              <div className="cols" style={{ height: '6.5rem' }} role="img" aria-label="Agent minutes by hour of day">
                {u.perHour.map((m, h) => (
                  <div key={h} className={`col ${m ? '' : 'zero'}`} style={{ height: m ? `${Math.max(4, (m / maxHour) * 100)}%` : '3px', animationDelay: `${h * 15}ms` }} {...on(`${fmtHour(h)}: ${hours(m)}`)} />
                ))}
              </div>
              <div className="cols-axis"><span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11 pm</span></div>
              <p className="hint" style={{ marginTop: '.9rem' }}>
                {busiest >= 0 && u.perHour[busiest] ? `Your busiest hour is ${fmtHour(busiest)}.` : ''} {top ? `${top.name} has had most of your time.` : ''}
              </p>
            </div>
          </div>
        )}
      </div>
      {node}
    </div>
  );
}
