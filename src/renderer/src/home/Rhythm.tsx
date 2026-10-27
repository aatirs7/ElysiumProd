// Your rhythm: when in the day you build, as a 24 hour clock. Each hour is a spoke as
// long as the agent time in it over the last 30 days; the peak hour is lit. Around it,
// the last 30 days as a ring of ticks, today at the top. Plain SVG, drawn once.
import type { UsageStats } from '@shared/ipc';

const label = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

export function Rhythm({ usage }: { usage: UsageStats | null }) {
  const perHour = usage?.perHour ?? Array.from({ length: 24 }, () => 0);
  const days = (usage?.perDay ?? []).slice(-30);
  const max = Math.max(1, ...perHour);
  const peak = perHour.indexOf(Math.max(...perHour));
  const total = perHour.reduce((a, b) => a + b, 0);
  // The busiest three hour stretch, which says more than a single hour.
  let best = 0, bestAt = 0;
  for (let h = 0; h < 24; h++) { const s = perHour[h] + perHour[(h + 1) % 24] + perHour[(h + 2) % 24]; if (s > best) { best = s; bestAt = h; } }
  const night = perHour.slice(22).concat(perHour.slice(0, 5)).reduce((a, b) => a + b, 0);
  const dayMax = Math.max(1, ...days.map((d) => d.minutes));
  const C = 130, R0 = 34, R1 = 92;
  const at = (h: number, r: number): [number, number] => { const a = (h / 24) * Math.PI * 2 - Math.PI / 2; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };
  return (
    <div className="rhythm">
      <svg viewBox="0 0 260 260" className="rhythm-clock" role="img" aria-label={total ? `Most of your agent time falls between ${label(bestAt)} and ${label((bestAt + 3) % 24)}` : 'No agent time yet'}>
        {[0.33, 0.66, 1].map((k) => <circle key={k} cx={C} cy={C} r={R0 + (R1 - R0) * k} className="rh-ring" />)}
        {Array.from({ length: 24 }, (_, h) => {
          const len = R0 + (R1 - R0) * (perHour[h] / max);
          const [x0, y0] = at(h, R0), [x1, y1] = at(h, Math.max(R0 + 2, len));
          const inBest = total > 0 && ((h - bestAt + 24) % 24) < 3;
          return (
            <g key={h}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} className={`rh-spoke ${inBest ? 'hot' : ''} ${perHour[h] ? '' : 'zero'}`} style={{ animationDelay: `${h * 18}ms` }}>
                <title>{`${label(h)}: ${perHour[h] >= 60 ? `${(perHour[h] / 60).toFixed(1)} h` : `${perHour[h]} min`} over 30 days`}</title>
              </line>
            </g>
          );
        })}
        {[0, 6, 12, 18].map((h) => { const [x, y] = at(h, R1 + 13); return <text key={h} x={x} y={y + 3.5} className="rh-hour">{h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</text>; })}
        {/* The last 30 days, today at the top, going clockwise back in time. */}
        {days.map((d, i) => {
          const k = days.length - 1 - i;
          const a = -Math.PI / 2 + (k / 30) * Math.PI * 2 * -1;
          const r0 = R1 + 22, r1 = r0 + 3 + (d.minutes / dayMax) * 9;
          return <line key={d.day} x1={C + Math.cos(a) * r0} y1={C + Math.sin(a) * r0} x2={C + Math.cos(a) * r1} y2={C + Math.sin(a) * r1} className={`rh-day ${d.minutes ? '' : 'zero'} ${k === 0 ? 'today' : ''}`}><title>{`${new Date(`${d.day}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.minutes >= 60 ? `${(d.minutes / 60).toFixed(1)} h` : `${d.minutes} min`}`}</title></line>;
        })}
        <text x={C} y={C - 3} className="rh-big">{total ? label(peak).replace(' ', '') : '–'}</text>
        <text x={C} y={C + 13} className="rh-small">peak hour</text>
      </svg>
      <div className="rhythm-facts">
        <div><strong>{total ? `${label(bestAt)} to ${label((bestAt + 3) % 24)}` : 'Not yet'}</strong><span>your prime window</span></div>
        <div><strong>{usage ? `${usage.streakDays} day${usage.streakDays === 1 ? '' : 's'}` : '…'}</strong><span>streak</span></div>
        <div><strong>{total ? `${Math.round((night / total) * 100)}%` : '–'}</strong><span>after 10 PM</span></div>
      </div>
    </div>
  );
}
