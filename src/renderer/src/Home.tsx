import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReaderEntry, UsageStats } from '@shared/ipc';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Constellation, type StarNode } from './home/Constellation';
import { Rhythm } from './home/Rhythm';
import { Shipped } from './home/Shipped';
import './home.css';
import { CHECKS } from './tools';
import { Meter, effectiveLimits } from './TopBarExtras';
import { monthlyOf, useWorkspace } from './workspace/store';

const HOME_WIDGETS = [
  { id: 'live', name: 'Right now' }, { id: 'week', name: 'This week' }, { id: 'map', name: 'Mission control' },
  { id: 'rhythm', name: 'Your rhythm' }, { id: 'shipped', name: 'Just shipped' }, { id: 'limits', name: 'Plan limits' }, { id: 'costs', name: 'This month' }, { id: 'checks', name: 'PC check-ups' },
];
const DEFAULT_WIDGETS = ['live', 'week', 'map', 'rhythm', 'shipped'];
/** Saved layouts from before: the project list became the map, the news became rhythm and shipped. */
function normalize(saved: string[] | undefined): string[] {
  if (!saved) return DEFAULT_WIDGETS;
  const out = saved.flatMap((id) => (id === 'recent' ? ['map'] : id === 'news' ? ['rhythm', 'shipped'] : [id]));
  return [...new Set(out)].filter((id) => HOME_WIDGETS.some((w) => w.id === id));
}
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

const HomeCtx = createContext<{ widgets: string[]; editing: boolean; setWidgets(w: string[]): void }>({ widgets: [], editing: false, setWidgets: () => undefined });

/** One Home widget: shown in your order, with move and remove while customizing. */
function W({ id, size, children }: { id: string; size: 'full' | 'half'; children: React.ReactNode }) {
  const { widgets, editing, setWidgets } = useContext(HomeCtx);
  const i = widgets.indexOf(id);
  if (i < 0) return null;
  const move = (d: number) => { const n = [...widgets]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setWidgets(n); };
  return (
    <div className={size === 'full' ? 'home-w full' : 'home-w half'} style={{ order: i }}>
      {editing && (
        <div className="home-w-tools">
          <button className="ghost-icon tiny" onClick={() => move(-1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={13} /></button>
          <button className="ghost-icon tiny" onClick={() => move(1)} disabled={i === widgets.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
          <button className="ghost-icon tiny" onClick={() => setWidgets(widgets.filter((x) => x !== id))} aria-label="Remove"><X size={13} /></button>
        </div>
      )}
      {children}
    </div>
  );
}

export function Home({ name, onOpen, onFocus, onNewProject }: Props) {
  const { projects, stats, sessions, telemetry, templates, compacting } = useLive();
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const { doc, setSettings } = useWorkspace();
  const { accounts, limits } = useLive();
  const [editing, setEditing] = useState(false);
  const widgets = normalize(doc.settings.homeWidgets);
  const setWidgets = (w: string[]) => setSettings({ homeWidgets: w });
  const hiddenWidgets = HOME_WIDGETS.filter((w) => !widgets.includes(w.id));
  const [costTotal, setCostTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!widgets.includes('costs')) return;
    void window.elysium.costs(false).then((r) => setCostTotal(r.items.reduce((n, i) => n + i.cost, 0) + doc.fixedCosts.reduce((n, f) => n + monthlyOf(f), 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets.join(',')]);
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

  // Mission control: every project, its agent time this month, this week's commits and its live sessions.
  const stars = useMemo<StarNode[]>(() => projects.filter((p) => !p.builtin && p.exists).map((p) => ({
    id: p.id, name: p.name,
    minutes: usage?.projects.find((x) => x.id === p.id)?.minutesMonth ?? 0,
    commits: stats.find((x) => x.id === p.id)?.commitsThisWeek ?? 0,
    sessions: sessions.filter((x) => x.status === 'running' && templates.find((t) => t.id === x.templateId)?.project === p.id).map((x) => ({ id: x.id, state: telemetry[x.id]?.state ?? 'starting' })),
  })), [projects, usage, stats, sessions, templates, telemetry]);
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
    <HomeCtx.Provider value={{ widgets, editing, setWidgets }}>
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

        <div className={`home-widgets ${editing ? 'editing' : ''}`}>
        {(live.length > 0 || editing) && (
          <W id="live" size="full">
          <section className="home-block">

            <div className="section-title">Right now</div>
            {!live.length && <p className="home-empty">Running sessions show here.</p>}
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
          </W>
        )}

        <W id="week" size="full">
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
        </W>

          <W id="map" size="full">
          <section className="home-block">
            <div className="section-title">Mission control<span className="mc-legend"><i className="busy" />working<i className="waiting" />needs you<i className="idle" />idle</span></div>
            {stars.length ? (
              <div className="mc-card">
                <Constellation nodes={stars} onOpen={(id) => onOpen(id, projects.find((p) => p.id === id)?.name ?? id)} />
                <div className="sr-only">{stars.map((p) => <button key={p.id} onClick={() => onOpen(p.id, p.name)}>Open {p.name}</button>)}</div>
              </div>
            ) : <p className="home-empty">Your projects show up here as a map once you add one with the plus beside Projects.</p>}
          </section>
          </W>
          <W id="rhythm" size="half">
          <section className="home-block">
            <div className="section-title">Your rhythm</div>
            <div className="mc-panel"><Rhythm usage={usage} /></div>
          </section>
          </W>
          <W id="shipped" size="half">
          <section className="home-block">
            <div className="section-title">Just shipped</div>
            <div className="mc-panel"><Shipped stats={stats} onOpen={onOpen} /></div>
          </section>
          </W>

          <W id="limits" size="half">
            <section className="home-block">
              <div className="section-title">Plan limits</div>
              {accounts.filter((a) => limits[a.id]).slice(0, 3).map((a) => { const e = effectiveLimits(limits[a.id]!); return <div key={a.id} className="home-limit"><Meter label={`${doc.accounts[a.id]?.label ?? a.id} · five hours`} pct={e.five} reset={e.fiveReset} /><Meter label="Week" pct={e.week} reset={e.weekReset} /></div>; })}
              {!accounts.some((a) => limits[a.id]) && <p className="home-empty">Shows once a session has run.</p>}
            </section>
          </W>
          <W id="costs" size="half">
            <section className="home-block">
              <div className="section-title">This month</div>
              <div className="home-cost"><strong>{costTotal == null ? '…' : `$${costTotal.toFixed(2)}`}</strong><span>across hosting, databases and your other costs</span></div>
            </section>
          </W>
          <W id="checks" size="half">
            <section className="home-block">
              <div className="section-title">PC check-ups</div>
              {CHECKS.slice(0, 4).map((c) => <button key={c.id} className="recent-row" onClick={() => window.dispatchEvent(new CustomEvent('ep:run-check', { detail: c.id }))}><c.icon size={15} /><span className="recent-name">{c.title}</span><span className="recent-when">{c.blurb}</span></button>)}
            </section>
          </W>
        </div>

        <div className="home-customize">
          {editing && hiddenWidgets.length > 0 && (
            <div className="widget-tray">
              <span className="muted small">Add:</span>
              {hiddenWidgets.map((w) => <button key={w.id} className="cost-preset" onClick={() => setWidgets([...widgets, w.id])}><Plus size={12} />{w.name}</button>)}
            </div>
          )}
          <button className="link-btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Customize Home'}</button>
        </div>

      </div>
    </div>
    </HomeCtx.Provider>
  );
}
