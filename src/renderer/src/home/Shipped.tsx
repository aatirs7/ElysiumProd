// Just shipped: the newest commits across your projects as one timeline, read
// lazily after Home has painted (one git read per active project, cached in main).
import { useEffect, useState } from 'react';
import type { ProjectStats } from '@shared/ipc';
import { ProjectLogo } from '../ProjectLogo';

type Row = { project: string; name: string; hash: string; when: string; age: number; subject: string; kind: string };

/** Routine commits (trackers, relays, merges) say nothing about what shipped. */
const ROUTINE = /^(chore|ci|build|style)(\(.*?\))?!?:|^Merge\b|^Revert "Merge/i;
/** feat(scope): Add x  becomes  kind feat, subject Add x. */
function split(subject: string): { kind: string; subject: string } {
  const m = /^(\w+)(\(.*?\))?!?:\s*(.+)$/.exec(subject);
  if (!m) return { kind: '', subject };
  const k = m[1].toLowerCase();
  return { kind: k === 'feat' ? 'new' : k === 'fix' ? 'fix' : k === 'docs' ? 'docs' : k === 'perf' ? 'faster' : k === 'refactor' ? 'tidy' : k, subject: m[3].charAt(0).toUpperCase() + m[3].slice(1) };
}

/** git's "3 hours ago" or "2 weeks, 1 day ago" in seconds, for ordering across projects. */
function secondsAgo(rel: string): number {
  const unit: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
  let s = 0;
  for (const m of rel.matchAll(/(\d+)\s+(second|minute|hour|day|week|month|year)s?/g)) s += Number(m[1]) * unit[m[2]];
  return s || (/now/.test(rel) ? 0 : 9e9);
}
const short = (rel: string) => rel.replace(/ ago$/, '').replace(/(\d+) (second|minute|hour|day|week|month|year)s?/g, (_, n: string, u: string) => `${n}${u === 'month' ? 'mo' : u[0]}`).replace(', ', ' ');

export function Shipped({ stats, onOpen }: { stats: ProjectStats[]; onOpen(id: string, name: string): void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const active = stats.filter((s) => s.commitsThisWeek > 0).sort((a, b) => b.commitsThisWeek - a.commitsThisWeek).slice(0, 6);
  const key = active.map((s) => `${s.id}:${s.commitsThisWeek}`).join(',');
  useEffect(() => {
    let on = true;
    if (!active.length) { setRows([]); return; }
    // After the first paint: Home shows at once, the timeline fills in a moment later.
    const t = setTimeout(() => {
      void Promise.all(active.map(async (s) => {
        try { const g = await window.elysium.git(s.id); return g.ok ? g.commits.filter((c) => !ROUTINE.test(c.subject)).map((c) => ({ project: s.id, name: s.name, hash: c.hash, when: c.when, age: secondsAgo(c.when), ...split(c.subject) })) : []; } catch { return []; }
      })).then((all) => { if (on) { const seen = new Set<string>(); setRows(all.flat().sort((a, b) => a.age - b.age).filter((r) => !seen.has(r.subject) && seen.add(r.subject)).slice(0, 6)); } });
    }, 250);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const week = stats.reduce((n, s) => n + s.commitsThisWeek, 0);
  const lines = stats.reduce((n, s) => n + s.linesThisWeek, 0);

  return (
    <div className="shipped">
      <div className="shipped-head">
        <strong>{week}</strong><span>commits this week</span>
        {lines > 0 && <><strong>{lines >= 1000 ? `${(lines / 1000).toFixed(lines >= 10000 ? 0 : 1)}k` : lines}</strong><span>lines changed</span></>}
      </div>
      {rows === null && <div className="shipped-skeleton">{[0, 1, 2, 3].map((i) => <span key={i} />)}</div>}
      {rows && !rows.length && <p className="home-empty">Nothing committed this week yet. What your sessions ship shows up here.</p>}
      {rows && rows.length > 0 && (
        <ol className="shipped-line">
          {rows.map((r, i) => (
            <li key={`${r.project}-${r.hash}`} style={{ animationDelay: `${i * 45}ms` }}>
              <button className="shipped-row" onClick={() => onOpen(r.project, r.name)} title={`${r.name}: ${r.subject}`}>
                <span className="shipped-dot" aria-hidden="true" />
                <span className="shipped-subject">{r.kind && <span className={`shipped-kind k-${r.kind}`}>{r.kind}</span>}{r.subject}</span>
                <span className="shipped-meta"><ProjectLogo projectId={r.project} />{r.name}<span className="shipped-when">{short(r.when)}</span></span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
