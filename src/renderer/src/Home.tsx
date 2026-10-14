import { useEffect, useMemo, useState } from 'react';
import type { ReaderEntry, UsageStats } from '@shared/ipc';
import { Logo } from './Logo';
import { ProjectLogo } from './ProjectLogo';
import { plainLine } from './TopBarExtras';
import { CommandBox } from './CommandBox';
import { ago, useLive } from './workspace/live';

function partOfDay(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const hours = (min: number) => (min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1)} h` : `${min} min`);

const STATE_WORDS: Record<string, string> = { busy: 'Working', waiting: 'Needs you', idle: 'Idle', starting: 'Starting', ended: 'Ended' };

interface Props {
  name: string;
  onOpen(projectId: string, projectName: string): void;
  onFocus(sessionId: string, templateId: string): void;
  onNewProject(): void;
}

export function Home({ name, onOpen, onFocus, onNewProject }: Props) {
  const { projects, stats, sessions, telemetry, templates, compacting } = useLive();
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [lastSaid, setLastSaid] = useState<Record<string, ReaderEntry>>({});
  useEffect(() => { void window.elysium.usage().then(setUsage); }, []);

  const live = useMemo(() => sessions.filter((s) => s.status === 'running' && templates.find((t) => t.id === s.templateId)?.kind === 'claude'), [sessions, templates]);
  const liveKey = live.map((s) => s.id).join(',');

  // The latest thing each running agent said, kept current as replies arrive.
  useEffect(() => {
    let on = true;
    void Promise.all(live.map(async (s) => [s.id, (await window.elysium.reader(s.id)).filter((e) => e.role === 'claude').pop()] as const))
      .then((rows) => { if (on) setLastSaid(Object.fromEntries(rows.filter((r) => r[1]) as [string, ReaderEntry][])); });
    const off = window.elysium.onReader((id, e) => { if (e.role === 'claude') setLastSaid((m) => ({ ...m, [id]: e })); });
    return () => { on = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  const commits = stats.reduce((n, s) => n + s.commitsThisWeek, 0);
  const waiting = live.filter((s) => telemetry[s.id]?.state === 'waiting').length;
  const working = live.filter((s) => telemetry[s.id]?.state === 'busy').length;

  const headline = waiting
    ? `${waiting} agent${waiting > 1 ? 's need' : ' needs'} you.`
    : working
      ? `${working} agent${working > 1 ? 's are' : ' is'} working right now.`
      : live.length ? `${live.length} agent${live.length > 1 ? 's' : ''} open and idle.` : 'All quiet. Pick up where you left off.';

  // The last two weeks of agent time, one column a day.
  const days = (usage?.perDay ?? []).slice(-14);
  const peak = Math.max(60, ...days.map((d) => d.minutes));

  return (
    <div className="home page-enter" onMouseMove={(e) => {
      const card = (e.target as HTMLElement).closest('.project-card, .live-card, .week-card') as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }}>
      <div className="home-aura" aria-hidden="true" />
      <div className="home-inner">
        <header className="hero">
          <div className="hero-mark"><Logo className="hero-logo" /></div>
          <h1 className="greeting">{partOfDay()}, {name}</h1>
          <p className={`greeting-sub ${waiting ? 'attn' : ''}`}>{headline}</p>
        </header>

        <CommandBox onOpenProject={(id) => onOpen(id, projects.find((p) => p.id === id)?.name ?? id)} />

        {live.length > 0 && (
          <section className="home-block">
            <div className="section-title">Right now</div>
            <div className="live-grid">
              {live.map((s, i) => {
                const t = templates.find((x) => x.id === s.templateId);
                const tel = telemetry[s.id];
                const st = tel?.state ?? 'starting';
                const said = lastSaid[s.id];
                const ctx = tel?.contextPercent;
                const c = compacting[s.id];
                return (
                  <button key={s.id} className={`live-card ${st}`} style={{ animationDelay: `${i * 50}ms` }} onClick={() => onFocus(s.id, s.templateId)}>
                    <div className="live-head">
                      {t?.project ? <ProjectLogo projectId={t.project} /> : null}
                      <span className="live-name">{t?.title ?? s.title}</span>
                      <span className={`live-state ${st}`}><span className={`dot ${st}`} />{c ? 'Compacting' : STATE_WORDS[st] ?? st}</span>
                    </div>
                    <p className="live-said">
                      {st === 'waiting' && tel?.waitingMessage ? tel.waitingMessage : said ? plainLine(said.text, 220) : 'Nothing said since it opened here.'}
                    </p>
                    <div className="live-foot">
                      <span>{said ? ago(said.at) : `opened ${ago(s.startedAt)}`}</span>
                      {ctx != null && (
                        <span className={`ctx ${ctx >= 85 ? 'bad' : ctx >= 70 ? 'warn' : ''}`} title="Context used">
                          <svg viewBox="0 0 20 20" className="ctx-ring" aria-hidden="true">
                            <circle cx="10" cy="10" r="8" className="ctx-track" />
                            <circle cx="10" cy="10" r="8" className="ctx-fill" strokeDasharray={`${(Math.min(100, ctx) / 100) * 50.27} 50.27`} />
                          </svg>
                          {Math.round(ctx)}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="home-block">
          <div className="week-card">
            <div className="week-main">
              <div className="week-num">{usage ? hours(usage.minutesWeek) : '…'}</div>
              <div className="week-label">with agents this week</div>
              <div className="week-minor">
                <span><strong>{commits}</strong> commits</span>
                <span><strong>{usage ? usage.streakDays : '…'}</strong> day streak</span>
              </div>
            </div>
            <div className="week-chart" role="img" aria-label="Agent time per day, last two weeks">
              {days.map((d, i) => {
                const today = i === days.length - 1;
                const label = new Date(`${d.day}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <div key={d.day} className="week-col" title={`${label}: ${d.minutes ? hours(d.minutes) : 'no agent time'}`}>
                    <div className={`week-bar ${today ? 'today' : ''} ${d.minutes ? '' : 'zero'}`} style={{ height: `${Math.max(4, (d.minutes / peak) * 100)}%`, animationDelay: `${i * 25}ms` }} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
