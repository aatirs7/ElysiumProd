import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** Types the text in, one letter at a time, after a short wait. */
function Typed({ text, delay = 0 }: { text: string; delay?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let t: ReturnType<typeof setTimeout>;
    const step = (i: number) => { setN(i); if (i < text.length) t = setTimeout(() => step(i + 1), 70 + Math.random() * 60); };
    t = setTimeout(() => step(1), delay);
    return () => clearTimeout(t);
  }, [text, delay]);
  return <span className={n >= text.length ? 'ob-typed done' : 'ob-typed'}>{text.slice(0, n)}<i className="ob-caret" /></span>;
}

/**
 * The sky above the horizon: still stars that twinkle, a faint band of the galaxy, curtains of
 * aurora that fade in and out, and now and then a shooting star. The arc below is the earth's edge.
 */
function Sky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const accent = toRgb(css.getPropertyValue('--accent').trim()) ?? [217, 119, 87];
    const ok = toRgb(css.getPropertyValue('--ok').trim()) ?? [120, 190, 140];
    const ink = toRgb(css.getPropertyValue('--text').trim()) ?? [240, 236, 228];
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    let w = 0, h = 0, raf = 0, last = 0;
    type Star = { x: number; y: number; s: number; a: number; tw: number; sp: number; warm: boolean };
    let stars: Star[] = [];
    const band = document.createElement('canvas');
    const aur = document.createElement('canvas');
    const actx = aur.getContext('2d')!;

    const size = () => {
      const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
      w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      // Stars thin out toward the horizon.
      stars = Array.from({ length: Math.round((w * h) / 2400) }, () => {
        const y = Math.pow(Math.random(), 1.4) * h * 0.8;
        return { x: Math.random() * w, y, s: Math.random() < 0.06 ? 1.8 : 0.6 + Math.random() * 0.9, a: (0.25 + Math.random() * 0.6) * (1 - y / (h * 0.85)), tw: Math.random() * 6.28, sp: 0.4 + Math.random() * 1.4, warm: Math.random() < 0.25 };
      });
      // The galaxy band: drawn once, a soft diagonal haze dusted with tiny stars.
      band.width = w; band.height = h;
      const b = band.getContext('2d')!;
      b.save(); b.translate(w * 0.5, h * 0.3); b.rotate(-0.32);
      for (let i = 0; i < 26; i++) {
        const x = (i / 25 - 0.5) * w * 1.3, y = Math.sin(i * 1.7) * h * 0.03, r = h * (0.08 + Math.random() * 0.1);
        const g = b.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(i % 3 ? ink : accent, 0.05)); g.addColorStop(1, rgba(ink, 0));
        b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 900; i++) {
        const x = (Math.random() - 0.5) * w * 1.3, y = (Math.random() + Math.random() + Math.random() - 1.5) * h * 0.09;
        b.fillStyle = rgba(ink, 0.12 + Math.random() * 0.3); b.fillRect(x, y, 0.8, 0.8);
      }
      b.restore();
      // Aurora is drawn small and scaled up, which blurs it for free.
      aur.width = Math.max(1, Math.round(w / 6)); aur.height = Math.max(1, Math.round(h / 6));
    };
    size(); window.addEventListener('resize', size);

    const curtains = [
      { c: ok, base: 0.36, amp: 0.06, f: 1.6, sp: 0.05, len: 0.22, cycle: 19, off: 0 },
      { c: accent, base: 0.28, amp: 0.05, f: 2.3, sp: -0.035, len: 0.18, cycle: 23, off: 8 },
      { c: ok, base: 0.46, amp: 0.04, f: 3.1, sp: 0.06, len: 0.14, cycle: 17, off: 13 },
    ];
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    let nextShoot = 4;

    const frame = (now: number) => {
      if (!still) raf = requestAnimationFrame(frame);
      if (now - last < 33 && !still) return; // about 30 frames a second is plenty for a sky
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      const t = still ? 6 : now / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.15);
      ctx.drawImage(band, 0, 0, w, h);
      ctx.globalAlpha = 1;

      // Aurora: each curtain breathes in and out on its own slow cycle.
      const aw = aur.width, ah = aur.height;
      actx.clearRect(0, 0, aw, ah);
      actx.globalCompositeOperation = 'lighter';
      for (const k of curtains) {
        const phase = ((t + k.off) % k.cycle) / k.cycle;
        const life = Math.pow(Math.sin(phase * Math.PI), 2);
        if (life < 0.01) continue;
        for (let x = 0; x < aw; x++) {
          const u = x / aw;
          const y = (k.base + k.amp * Math.sin(u * k.f * 6.28 + t * k.sp * 6.28) + k.amp * 0.5 * Math.sin(u * k.f * 13 - t * 0.4)) * ah;
          const len = k.len * ah * (0.6 + 0.4 * Math.sin(u * 9 + t * 0.7));
          const edge = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
          const a = 0.3 * life * edge * (0.6 + 0.4 * Math.sin(u * 23 + t * 1.3));
          const g = actx.createLinearGradient(0, y - len, 0, y + len * 0.15);
          g.addColorStop(0, rgba(k.c, 0)); g.addColorStop(0.75, rgba(k.c, a)); g.addColorStop(1, rgba(k.c, 0));
          actx.fillStyle = g; actx.fillRect(x, y - len, 1, len * 1.15);
        }
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(aur, 0, 0, w, h);

      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.tw);
        ctx.fillStyle = rgba(s.warm ? accent : ink, s.a * tw);
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }

      // Now and then a shooting star crosses the upper sky.
      if (!still) {
        nextShoot -= dt;
        if (!shoot && nextShoot <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          shoot = { x: w * (0.2 + Math.random() * 0.6), y: h * (0.05 + Math.random() * 0.25), vx: dir * w * 0.55, vy: h * 0.18, life: 1 };
          nextShoot = 7 + Math.random() * 9;
        }
        if (shoot) {
          shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.life -= dt * 1.2;
          const tail = 0.12, g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * tail, shoot.y - shoot.vy * tail);
          g.addColorStop(0, rgba(ink, 0.8 * Math.max(0, shoot.life))); g.addColorStop(1, rgba(ink, 0));
          ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * tail, shoot.y - shoot.vy * tail); ctx.stroke();
          if (shoot.life <= 0) shoot = null;
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} className="ob-sky" aria-hidden="true" />;
}

function toRgb(v: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) { const n = parseInt(hex[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

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
  // Welcome lights up one benefit at a time.
  const [lit, setLit] = useState(0);
  useEffect(() => { if (step !== 0) return; const t = setInterval(() => setLit((n) => (n + 1) % BENEFITS.length), 3200); return () => clearInterval(t); }, [step]);

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label="Welcome to Elysium">
      <div className={`ob-bg step-${step}`} aria-hidden="true"><Sky /><i className="ob-horizon" /><i className="ob-arc" /><i className="ob-grid" /></div>
      <header className="ob-top">
        <div className="ob-brand"><Logo />Elysium Development</div>
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
            <h1 className="ob-hero">Welcome to Elysium Development, <Typed text={`${shown}.`} delay={650} /></h1>
            <p className="ob-lede">One calm place to run all your projects with AI agents. Built for people who keep several busy at once.</p>
            <div className="ob-benefits">
              {BENEFITS.map((b, i) => (
                <div key={b.title} className={i === lit ? 'ob-benefit lit' : 'ob-benefit'} style={{ animationDelay: `${180 + i * 90}ms` }} onMouseEnter={() => setLit(i)}>
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
          : <button className="btn primary ob-next" onClick={() => { finishOnboarding(); setTimeout(() => window.dispatchEvent(new Event('ep:tour')), 700); }}>Open Elysium Development<ArrowRight size={15} /></button>}
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

const SERVICE_ICON: Record<string, typeof Bell> = { claude: Sparkles, git: GitBranch, github: GitPullRequest, vercel: Triangle, neon: Zap, aws: Cloud, supabase: Database, stripe: CreditCard, cloudflare: Cloud, netlify: Globe, azure: Cloud, firebase: Flame };

function ConnectStep({ accounts, setAccountLabel, accountLabels }: { accounts: { id: string; isDefault: boolean }[]; setAccountLabel(id: string, label: string): void; accountLabels: Record<string, { label: string }> }) {
  // The last answer shows at once; a fresh one replaces it a moment later.
  const [list, setList] = useState<ConnectStatus[] | null>(() => { try { const v = localStorage.getItem('ep-connect'); return v ? JSON.parse(v) as ConnectStatus[] : null; } catch { return null; } });
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [addingTool, setAddingTool] = useState(false);
  const [tool, setTool] = useState({ name: '', check: '', signin: '' });
  const { doc: wdoc, setSettings } = useWorkspace();
  const customs = wdoc.settings.customTools ?? [];
  const check = useCallback(async () => {
    const v = await window.elysium.connections();
    setList(v);
    try { localStorage.setItem('ep-connect', JSON.stringify(v)); } catch { /* only a head start */ }
  }, []);
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
            <button className="link-btn" onClick={() => setMore((m) => !m)}>{more ? 'Show fewer' : `Show more: AWS, Azure, Supabase, Stripe, Cloudflare, Netlify, Firebase${customs.length ? ', your own' : ''}`}</button>
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
