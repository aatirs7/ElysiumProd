import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Check, Cloud, CreditCard, Database, Flame, Globe, GitBranch, GitPullRequest, Keyboard, Layers, Loader2, Plus, RefreshCw, Sparkles, Triangle, Wand2, Workflow, Zap } from 'lucide-react';
import type { ConnectStatus, RepoCandidate } from '@shared/ipc';
import { Logo } from './Logo';
import { ProjectLogo } from './ProjectLogo';
import { useLive } from './workspace/live';
import { ACCENTS, THEMES, useWorkspace } from './workspace/store';

const STEPS = ['Welcome', 'Make it yours', 'Connect', 'Projects', 'How you work', 'Ready'];

const BENEFITS = [
  { icon: Layers, title: 'One window', text: 'Every project with its sessions, terminals, dashboard and browser.' },
  { icon: Zap, title: 'Hand off, hear back', text: 'Give any project a task and get a tap when it is done.' },
  { icon: Workflow, title: 'See every agent', text: 'Status, context, steps, usage and costs at a glance.' },
  { icon: Wand2, title: 'It changes itself', text: 'Ask for a theme, a button or a fix, and it builds it.' },
];

/** First run: what Elysium is for, a look of your own, your tools, your projects, and how you like to work. */
export function Onboarding({ name }: { name: string }) {
  const { projects, accounts } = useLive();
  const { doc, setSettings, setAccountLabel, togglePin, finishOnboarding } = useWorkspace();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(Math.max(0, Math.min(STEPS.length - 1, n))); };
  const s = doc.settings;
  const shown = s.displayName || name || 'there';
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => { void window.elysium.shortcut().then(setShortcut); }, []);
  const keys = (shortcut ?? 'Control+Alt+Space').replace('Control', 'Ctrl').split('+');

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label="Welcome to Elysium">
      <div className={`ob-bg step-${step}`} aria-hidden="true"><i className="ob-horizon" /><i className="ob-arc" /><i className="ob-grid" /></div>
      <header className="ob-top">
        <div className="ob-brand"><Logo />Elysium</div>
        <ol className="ob-rail" aria-label="Setup steps">
          {STEPS.map((t, i) => (
            <li key={t} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <button onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}><span className="ob-rail-dot">{i < step ? <Check size={11} /> : i + 1}</span><span className="ob-rail-label">{t}</span></button>
            </li>
          ))}
        </ol>
        <button className="link-btn ob-skip" onClick={finishOnboarding}>Skip setup</button>
      </header>

      <main className={`ob-stage ${dir > 0 ? 'fwd' : 'back'}`} key={step}>
        {step === 0 && (
          <section className="ob-welcome">
            <div className="ob-mark"><Logo /></div>
            <h1 className="ob-hero">Hi {shown}. Meet Elysium.</h1>
            <p className="ob-lede">One calm place to run all your projects with Claude. Built for people who keep several agents busy at once.</p>
            <div className="ob-colors" role="radiogroup" aria-label="Colour">
              {ACCENTS.filter((x) => x.value).map((x) => (
                <button key={x.name} role="radio" aria-checked={s.accent === x.value} aria-label={x.name} title={x.name}
                  className={s.accent === x.value ? 'ob-color on' : 'ob-color'} style={{ background: x.value }} onClick={() => setSettings({ accent: x.value })} />
              ))}
            </div>
            <div className="ob-benefits">
              {BENEFITS.map((b, i) => (
                <div key={b.title} className="ob-benefit" style={{ animationDelay: `${180 + i * 90}ms` }}>
                  <span className="ob-benefit-num">{String(i + 1).padStart(2, '0')}</span>
                  <strong>{b.title}</strong>
                  <p>{b.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="ob-section">
            <h1>Make it yours</h1>
            <p className="ob-lede">Pick a look. It changes as you click, and you can change it any time from the top bar.</p>
            <label className="ob-field">
              <span>What should Elysium call you?</span>
              <input className="text-input" placeholder={name || 'Your name'} defaultValue={s.displayName} onChange={(e) => setSettings({ displayName: e.target.value.slice(0, 40) })} />
            </label>
            <div className="ob-themes">
              {THEMES.map((t, i) => (
                <button key={t.id} className={`ob-theme ${s.theme === t.id ? 'on' : ''}`} style={{ animationDelay: `${i * 30}ms` }} onClick={() => setSettings({ theme: t.id })} aria-pressed={s.theme === t.id}>
                  <span className="ob-theme-preview" style={{ background: t.swatch[0] }}>
                    <span style={{ background: t.swatch[1] }} />
                    <span style={{ background: t.swatch[2] }} />
                  </span>
                  <span className="ob-theme-name">{t.name}</span>
                  <span className="ob-theme-blurb">{t.blurb}</span>
                  {s.theme === t.id && <span className="ob-tick"><Check size={12} /></span>}
                </button>
              ))}
            </div>
            <div className="ob-row">
              <span className="ob-row-label">Accent</span>
              <div className="ob-accents">
                {ACCENTS.map((a) => (
                  <button key={a.name} className={`ob-accent ${s.accent === a.value ? 'on' : ''}`} title={a.name} aria-label={a.name} onClick={() => setSettings({ accent: a.value })}
                    style={{ background: a.value || 'conic-gradient(from 0deg, var(--accent-default), color-mix(in srgb, var(--accent-default) 40%, var(--surface)), var(--accent-default))' }} />
                ))}
              </div>
            </div>
            <div className="ob-row">
              <span className="ob-row-label">Spacing</span>
              <div className="seg">
                {(['comfortable', 'compact'] as const).map((d) => <button key={d} className={s.density === d ? 'on' : ''} onClick={() => setSettings({ density: d })}>{d === 'comfortable' ? 'Roomy' : 'Compact'}</button>)}
              </div>
            </div>
          </section>
        )}

        {step === 2 && <ConnectStep accounts={accounts} setAccountLabel={setAccountLabel} accountLabels={doc.accounts} />}

        {step === 3 && <ProjectsStep projects={projects} pinned={doc.pinned} togglePin={togglePin} />}

        {step === 4 && (
          <section className="ob-section">
            <h1>How you like to work</h1>
            <p className="ob-lede">Sensible defaults, all of them switchable later in Settings.</p>
            <div className="ob-toggles">
              <Toggle icon={Bell} title="Tell me when an agent replies" text="A card in the app, and a Windows notification when Elysium is in the background." on={s.notifyReplies} set={(v) => setSettings({ notifyReplies: v })} />
              <Toggle icon={RefreshCw} title="Compact long sessions for me" text={`When a session's context passes ${s.autoCompact.percent}%, it saves its notes, compacts and carries on.`} on={s.autoCompact.enabled} set={(v) => setSettings({ autoCompact: { ...s.autoCompact, enabled: v } })} />
              <Toggle icon={Workflow} title="Summarize what each agent is doing" text="A short summary on the Flow pane, at most every five minutes, only while it shows. Uses a little of your Claude usage." on={s.flowSummaries} set={(v) => setSettings({ flowSummaries: v })} />
            </div>
          </section>
        )}

        {step === 5 && (
          <section className="ob-section ob-ready">
            <div className="ob-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${(i / 14) * 360}deg`, animationDelay: `${i * 18}ms` }} />)}<span><Logo /></span></div>
            <h1>You are set, {shown}.</h1>
            <p className="ob-lede">Three shortcuts worth knowing. Everything else is in Help.</p>
            <div className="ob-keys">
              <div className="ob-key"><kbd>Ctrl</kbd><kbd>K</kbd><span>Search and run anything: projects, sessions, panes, settings.</span></div>
              <div className="ob-key">{keys.map((k) => <kbd key={k}>{k}</kbd>)}<span>From anywhere in Windows, hand a project a task.</span></div>
              <div className="ob-key"><Keyboard size={16} /><span>Right click any project in the sidebar to start, compact or end its sessions.</span></div>
            </div>
            <div className="ob-customize">
              <Wand2 size={18} />
              <span><strong>Want it different?</strong> Open <em>Customize Elysium</em> under Tools and ask, in plain words: "add a button that…", "make the sidebar narrower", "fix…". It changes the app for you.</span>
            </div>
          </section>
        )}
      </main>

      <footer className="ob-foot">
        {step > 0 ? <button className="btn" onClick={() => go(step - 1)}><ArrowLeft size={15} />Back</button> : <span />}
        {step < STEPS.length - 1
          ? <button className="btn primary ob-next" onClick={() => go(step + 1)}>{step === 0 ? 'Get started' : 'Continue'}<ArrowRight size={15} /></button>
          : <button className="btn primary ob-next" onClick={finishOnboarding}>Open Elysium<ArrowRight size={15} /></button>}
      </footer>
    </div>
  );
}

function Toggle({ icon: Icon, title, text, on, set }: { icon: typeof Bell; title: string; text: string; on: boolean; set(v: boolean): void }) {
  return (
    <button className={`ob-toggle ${on ? 'on' : ''}`} onClick={() => set(!on)} role="switch" aria-checked={on}>
      <span className="ob-toggle-icon"><Icon size={18} /></span>
      <span className="ob-toggle-text"><strong>{title}</strong><span>{text}</span></span>
      <span className="ob-switch"><i /></span>
    </button>
  );
}

const SERVICE_ICON: Record<string, typeof Bell> = { claude: Sparkles, git: GitBranch, github: GitPullRequest, vercel: Triangle, neon: Zap, aws: Cloud, supabase: Database, stripe: CreditCard, cloudflare: Cloud, netlify: Globe, firebase: Flame };

function ConnectStep({ accounts, setAccountLabel, accountLabels }: { accounts: { id: string; isDefault: boolean }[]; setAccountLabel(id: string, label: string): void; accountLabels: Record<string, { label: string }> }) {
  const [list, setList] = useState<ConnectStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [addingTool, setAddingTool] = useState(false);
  const [tool, setTool] = useState({ name: '', check: '', signin: '' });
  const { doc: wdoc, setSettings } = useWorkspace();
  const customs = wdoc.settings.customTools ?? [];
  const check = useCallback(async () => { setList(await window.elysium.connections()); }, []);
  // Sign ins happen in their own window; keep checking so a finished one turns green here.
  useEffect(() => { void check(); const t = setInterval(() => void check(), 5000); return () => clearInterval(t); }, [check]);
  const act = async (id: ConnectStatus['id'], action: 'install' | 'signin', accountId?: string) => {
    setBusy(`${id}:${accountId ?? ''}`);
    const r = await window.elysium.connect(id, action, accountId);
    setNote(r.ok ? 'A window opened for that. Finish there; this page notices on its own.' : r.reason);
    setTimeout(() => setBusy(null), 1500);
  };
  const addAccount = async () => {
    const r = await window.elysium.addClaudeAccount(adding);
    if (r.ok && r.accountId) { setAccountLabel(r.accountId, adding.trim()); setAdding(''); setNote('A window opened to sign the new account in. Type /login there.'); void check(); } else setNote(r.reason);
  };

  return (
    <section className="ob-section">
      <h1>Connect your tools</h1>
      <p className="ob-lede">Elysium uses the tools you already have. Each sign in happens in that tool's own login; Elysium never sees a password.</p>
      <div className="ob-services">
        {list && <div className="ob-services-label">Essentials</div>}
        {!list && Array.from({ length: 5 }, (_, i) => <div key={i} className="ob-service skeleton"><span /></div>)}
        {list?.filter((c) => (c.group ?? 'core') === 'core' || (more && c.group !== 'core')).map((c, i, all) => {
          const firstMore = c.group === 'more' && all[i - 1]?.group !== 'more';
          const firstCustom = c.group === 'custom' && all[i - 1]?.group !== 'custom';
          const Icon = SERVICE_ICON[c.id] ?? Sparkles;
          const ok = c.installed && c.signedIn;
          return (
            <div key={c.id} className="ob-service-wrap">
            {firstMore && <div className="ob-services-label">More integrations</div>}
            {firstCustom && <div className="ob-services-label">Your own</div>}
            <div className={`ob-service ${ok ? 'ok' : ''}`} style={{ animationDelay: `${i * 45}ms` }}>
              <div className="ob-service-head">
                <span className="ob-service-icon"><Icon size={18} /></span>
                <span className="ob-service-name"><span className="ob-service-title"><strong>{c.name}</strong>{c.required && <em>Required</em>}</span><span className="ob-service-what">{c.what}</span></span>
                {ok ? <span className="ob-state ok"><Check size={13} />{c.who ? c.who : 'Connected'}</span>
                  : !c.installed ? <button className="btn small" disabled={busy === `${c.id}:`} onClick={() => void act(c.id, 'install')}>{busy === `${c.id}:` ? <Loader2 size={13} className="spin" /> : null}Install</button>
                    : <button className="btn small primary" disabled={busy === `${c.id}:`} onClick={() => void act(c.id, 'signin')}>{busy === `${c.id}:` ? <Loader2 size={13} className="spin" /> : null}Sign in</button>}
              </div>
              {c.id === 'claude' && c.installed && (
                <div className="ob-accounts">
                  {c.accounts?.map((a) => (
                    <div key={a.id} className="ob-account">
                      <span className={`dot ${a.signedIn ? 'idle' : ''}`} />
                      <input className="ob-account-name" defaultValue={accountLabels[a.id]?.label ?? (a.id === 'main' ? 'Main account' : a.id)} onBlur={(e) => setAccountLabel(a.id, e.target.value)} aria-label="Account name" />
                      {a.signedIn ? <span className="muted small">Signed in</span> : <button className="link-btn" onClick={() => void act('claude', 'signin', a.id)}>Sign in</button>}
                    </div>
                  ))}
                  <form className="ob-account add" onSubmit={(e) => { e.preventDefault(); if (adding.trim()) void addAccount(); }}>
                    <Plus size={14} />
                    <input className="ob-account-name" placeholder="Add another account, like Work" value={adding} onChange={(e) => setAdding(e.target.value)} />
                    {adding.trim() && <button className="link-btn" type="submit">Add</button>}
                  </form>
                </div>
              )}
            </div>
            </div>
          );
        })}
        {list && (
          <div className="ob-more-row">
            <button className="link-btn" onClick={() => setMore((m) => !m)}>{more ? 'Show fewer' : `Show more: AWS, Supabase, Stripe, Cloudflare, Netlify, Firebase${customs.length ? ', your own' : ''}`}</button>
            {more && !addingTool && <button className="link-btn" onClick={() => setAddingTool(true)}><Plus size={13} />Add your own</button>}
          </div>
        )}
        {addingTool && (
          <form className="ob-custom" onSubmit={(e) => { e.preventDefault(); if (!tool.name.trim()) return; setSettings({ customTools: [...customs, { id: Date.now().toString(36), name: tool.name.trim(), check: tool.check.trim(), signin: tool.signin.trim() }] }); setTool({ name: '', check: '', signin: '' }); setAddingTool(false); setTimeout(() => void check(), 300); }}>
            <input className="text-input" placeholder="Name, like Railway" value={tool.name} onChange={(e) => setTool({ ...tool, name: e.target.value })} autoFocus />
            <input className="text-input" placeholder="Sign in command, like railway login" value={tool.signin} onChange={(e) => setTool({ ...tool, signin: e.target.value })} />
            <input className="text-input" placeholder="Check command that works once signed in, like railway whoami" value={tool.check} onChange={(e) => setTool({ ...tool, check: e.target.value })} />
            <div className="ob-custom-actions"><button type="button" className="btn" onClick={() => setAddingTool(false)}>Cancel</button><button type="submit" className="btn primary" disabled={!tool.name.trim()}>Add</button></div>
          </form>
        )}
      </div>
      {note && <p className="ob-note" role="status">{note}</p>}
      {accounts.length > 1 && <p className="muted small">Each account keeps its own limits, so more accounts means more sessions at once. Pick an account per project in Settings.</p>}
    </section>
  );
}

/** A steady colour per name, for the project monogram. */
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const shortPath = (f: string) => f.replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');
function ago(iso: string): string {
  const d = (Date.now() - Date.parse(iso)) / 86400000;
  return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 30 ? `${Math.round(d)} days ago` : d < 365 ? `${Math.round(d / 30)} months ago` : 'over a year ago';
}

function ProjectsStep({ projects, pinned, togglePin }: { projects: { id: string; name: string; folder: string; builtin: boolean }[]; pinned: string[]; togglePin(id: string): void }) {
  const [found, setFound] = useState<RepoCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => { void window.elysium.scanRepos().then(setFound); }, []);
  const mine = useMemo(() => projects.filter((p) => !p.builtin), [projects]);
  const add = async () => {
    setAdding(true);
    const done: string[] = [];
    for (const r of found ?? []) {
      if (!picked.has(r.folder)) continue;
      const res = await window.elysium.createProject({ mode: 'existing', name: r.name.replace(/[^\w .()&+-]/g, ' ').trim().slice(0, 60) || 'Project', folder: r.folder, sessions: 'solo' });
      if (res.ok && res.projectId) { done.push(r.folder); if (!pinned.includes(res.projectId)) togglePin(res.projectId); }
    }
    setAdded((a) => [...a, ...done]);
    setPicked(new Set());
    setAdding(false);
  };
  const left = (found ?? []).filter((r) => !added.includes(r.folder));

  return (
    <section className="ob-section">
      <h1>Bring in your projects</h1>
      <p className="ob-lede">These Git folders were found on this PC. Pick the ones you work on; each gets its own Claude session. You can clone or start new ones later with the plus in the sidebar.</p>
      {mine.length > 0 && (
        <div className="ob-have">
          {mine.map((p) => (
            <button key={p.id} className={`ob-chip ${pinned.includes(p.id) ? 'on' : ''}`} onClick={() => togglePin(p.id)} title={p.folder}>
              <ProjectLogo projectId={p.id} />{p.name}{pinned.includes(p.id) && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
      <div className="ob-repos">
        {!found && <div className="ob-scanning"><Loader2 size={16} className="spin" />Looking for projects…</div>}
        {found && !left.length && <div className="ob-scanning">{added.length ? `Added ${added.length}. Nice.` : 'No other Git folders found in the usual places.'}</div>}
        {left.map((r, i) => {
          const on = picked.has(r.folder);
          return (
            <button key={r.folder} className={`ob-repo ${on ? 'on' : ''}`} style={{ animationDelay: `${i * 25}ms` }} onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(r.folder)) n.delete(r.folder); else n.add(r.folder); return n; })} aria-pressed={on}>
              <span className="ob-repo-mono" style={{ ['--h' as string]: String(hue(r.name)) }}>{r.name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '#'}</span>
              <span className="ob-repo-text"><strong>{r.name}</strong><span>{shortPath(r.folder)} · {ago(r.touchedAt)}</span></span>
              <span className="ob-check">{on && <Check size={12} />}</span>
            </button>
          );
        })}
      </div>
      {picked.size > 0 && <button className="btn primary" onClick={() => void add()} disabled={adding}>{adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}Add {picked.size} project{picked.size > 1 ? 's' : ''}</button>}
    </section>
  );
}
