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
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    // Colours follow the theme and accent: the aurora is the accent and two neighbours of its hue.
    // On a light theme light cannot add up, so everything is painted, darker and stronger.
    let accent: number[] = [217, 119, 87], ink: number[] = [240, 236, 228], pal: number[][] = [accent, accent, accent], light = false;
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      accent = toRgb(css.getPropertyValue('--accent').trim()) ?? accent;
      ink = toRgb(css.getPropertyValue('--text').trim()) ?? ink;
      const bg = toRgb(css.getPropertyValue('--bg').trim()) ?? [20, 20, 20];
      light = (bg[0] * 0.3 + bg[1] * 0.59 + bg[2] * 0.11) > 140;
      pal = light ? [shiftHue(accent, 38, 1.5), shiftHue(accent, 0, 1.4), shiftHue(accent, -46, 1.6)] : [shiftHue(accent, 38, 1.1), accent, shiftHue(accent, -46, 1.2)];
    };
    readColors();
    let w = 0, h = 0, raf = 0, last = 0, lastAurora = 0;
    // Stars are drawn once onto four layers; each layer twinkles as a whole, which costs four draws a frame.
    const layers = Array.from({ length: 4 }, () => document.createElement('canvas'));
    const band = document.createElement('canvas');
    const aur = document.createElement('canvas');
    const actx = aur.getContext('2d')!;
    type Glint = { x: number; y: number; r: number; age: number; life: number };
    const glints: Glint[] = [];

    const size = () => {
      const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
      w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      for (const c of layers) {
        c.width = Math.max(1, Math.round(w * d)); c.height = Math.max(1, Math.round(h * d));
        const x = c.getContext('2d')!; x.setTransform(d, 0, 0, d, 0, 0);
        const n = Math.round((w * h) / 1100 / layers.length);
        for (let i = 0; i < n; i++) {
          const y = Math.pow(Math.random(), 1.4) * h * 0.8;
          const s = Math.random() < 0.06 ? 1.8 : 0.6 + Math.random() * 0.9;
          const a = (0.25 + Math.random() * 0.6) * (1 - y / (h * 0.85)) * (light ? 0.55 : 1);
          x.fillStyle = rgba(Math.random() < 0.25 ? accent : ink, a);
          x.fillRect(Math.random() * w, y, s, s);
        }
      }
      // The galaxy band: drawn once, a soft diagonal haze dusted with tiny stars.
      band.width = w; band.height = h;
      const b = band.getContext('2d')!;
      b.save(); b.translate(w * 0.5, h * 0.3); b.rotate(-0.32);
      for (let i = 0; i < 26; i++) {
        const x = (i / 25 - 0.5) * w * 1.3, y = Math.sin(i * 1.7) * h * 0.03, r = h * (0.08 + Math.random() * 0.1);
        const g = b.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(i % 3 ? (light ? pal[1] : ink) : accent, light ? 0.07 : 0.05)); g.addColorStop(1, rgba(ink, 0));
        b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 900; i++) {
        const x = (Math.random() - 0.5) * w * 1.3, y = (Math.random() + Math.random() + Math.random() - 1.5) * h * 0.09;
        b.fillStyle = rgba(ink, (0.12 + Math.random() * 0.3) * (light ? 0.5 : 1)); b.fillRect(x, y, 0.8, 0.8);
      }
      b.restore();
      // Aurora is drawn small and scaled up, which blurs it for free.
      aur.width = Math.max(1, Math.round(w / 8)); aur.height = Math.max(1, Math.round(h / 8));
    };
    size(); window.addEventListener('resize', size);
    const watch = new MutationObserver(() => { readColors(); size(); lastAurora = 0; });
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });

    const curtains = [
      { c: 0, base: 0.36, amp: 0.06, f: 1.6, sp: 0.05, len: 0.22, cycle: 19, off: 0 },
      { c: 1, base: 0.28, amp: 0.05, f: 2.3, sp: -0.035, len: 0.18, cycle: 23, off: 8 },
      { c: 2, base: 0.46, amp: 0.04, f: 3.1, sp: 0.06, len: 0.14, cycle: 17, off: 13 },
    ];
    const drawAurora = (t: number) => {
      const aw = aur.width, ah = aur.height;
      actx.clearRect(0, 0, aw, ah);
      actx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      const strength = light ? 0.5 : 0.3;
      for (const k of curtains) {
        const phase = ((t + k.off) % k.cycle) / k.cycle;
        const life = Math.pow(Math.sin(phase * Math.PI), 2);
        if (life < 0.01) continue;
        const kc = pal[k.c];
        for (let x = 0; x < aw; x++) {
          const u = x / aw;
          const y = (k.base + k.amp * Math.sin(u * k.f * 6.28 + t * k.sp * 6.28) + k.amp * 0.5 * Math.sin(u * k.f * 13 - t * 0.4)) * ah;
          const len = k.len * ah * (0.6 + 0.4 * Math.sin(u * 9 + t * 0.7));
          const a = strength * life * Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(u * 23 + t * 1.3));
          const g = actx.createLinearGradient(0, y - len, 0, y + len * 0.15);
          g.addColorStop(0, rgba(kc, 0)); g.addColorStop(0.75, rgba(kc, a)); g.addColorStop(1, rgba(kc, 0));
          actx.fillStyle = g; actx.fillRect(x, y - len, 1, len * 1.15);
        }
      }
    };
    type Shoot = { x: number; y: number; vx: number; vy: number; life: number; c: number[] };
    const shoots: Shoot[] = [];
    let nextShoot = 1.5, nextGlint = 0.3;

    const frame = (now: number) => {
      if (!still) raf = requestAnimationFrame(frame);
      if (now - last < 33 && !still) return; // about 30 frames a second is plenty for a sky
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      const t = still ? 6 : now / 1000;
      const add = light ? 'source-over' : 'lighter';
      // The aurora moves slowly, so it is redrawn about eight times a second.
      if (now - lastAurora > 120 || still) { drawAurora(t); lastAurora = now; }
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = add;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.15);
      ctx.drawImage(band, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.drawImage(aur, 0, 0, w, h);
      for (const [i, c] of layers.entries()) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * (0.6 + i * 0.37) + i * 1.9);
        ctx.drawImage(c, 0, 0, w, h);
      }
      ctx.globalAlpha = 1;

      if (!still) {
        // Glitter: a star here and there flares into a four-point sparkle and fades.
        const spark = light ? pal[1] : ink;
        nextGlint -= dt;
        if (nextGlint <= 0 && glints.length < 7) {
          glints.push({ x: Math.random() * w, y: Math.pow(Math.random(), 1.3) * h * 0.7, r: 4 + Math.random() * 7, age: 0, life: 1.1 + Math.random() * 1.2 });
          nextGlint = 0.25 + Math.random() * 0.7;
        }
        for (let i = glints.length - 1; i >= 0; i--) {
          const g = glints[i]; g.age += dt;
          const p = g.age / g.life; if (p >= 1) { glints.splice(i, 1); continue; }
          const k = Math.sin(p * Math.PI), r = g.r * (0.4 + 0.6 * k);
          const c = i % 2 ? accent : spark;
          ctx.strokeStyle = rgba(c, 0.75 * k); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(g.x - r, g.y); ctx.lineTo(g.x + r, g.y); ctx.moveTo(g.x, g.y - r); ctx.lineTo(g.x, g.y + r); ctx.stroke();
          const halo = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r * 0.7);
          halo.addColorStop(0, rgba(spark, 0.9 * k)); halo.addColorStop(1, rgba(c, 0));
          ctx.fillStyle = halo; ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2);
        }
        // Shooting stars: every few seconds, now and then two together, in the theme's colours.
        nextShoot -= dt;
        if (nextShoot <= 0) {
          const n = Math.random() < 0.25 ? 2 : 1, dir = Math.random() < 0.5 ? 1 : -1;
          for (let j = 0; j < n; j++) {
            const speed = 0.45 + Math.random() * 0.35;
            shoots.push({ x: w * (0.15 + Math.random() * 0.7) + j * 60, y: h * (0.04 + Math.random() * 0.3) + j * 30, vx: dir * w * speed, vy: h * (0.12 + Math.random() * 0.14), life: 1, c: Math.random() < 0.5 ? spark : pal[Math.floor(Math.random() * 3)] });
          }
          nextShoot = 2.5 + Math.random() * 4;
        }
        for (let i = shoots.length - 1; i >= 0; i--) {
          const s = shoots[i];
          s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.1;
          if (s.life <= 0) { shoots.splice(i, 1); continue; }
          const a = Math.min(1, s.life * 2.2), tail = 0.16, tx = s.x - s.vx * tail, ty = s.y - s.vy * tail;
          const g = ctx.createLinearGradient(s.x, s.y, tx, ty);
          g.addColorStop(0, rgba(spark, 0.9 * a)); g.addColorStop(0.25, rgba(s.c, 0.5 * a)); g.addColorStop(1, rgba(s.c, 0));
          ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
          const head = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 6);
          head.addColorStop(0, rgba(spark, 0.9 * a)); head.addColorStop(1, rgba(s.c, 0));
          ctx.fillStyle = head; ctx.fillRect(s.x - 6, s.y - 6, 12, 12);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // The smoke test sets this to time each frame.
      const probe = (window as { __skyProbe?: number[] }).__skyProbe; if (probe) probe.push(performance.now() - now);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); watch.disconnect(); };
  }, []);
  return <canvas ref={ref} className="ob-sky" aria-hidden="true" />;
}

/** Turns a colour around the hue wheel by some degrees, and lifts its saturation a little. */
function shiftHue([r, g, b]: number[], deg: number, sat = 1): number[] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  }
  h = (((h * 60 + deg) % 360) + 360) % 360; s = Math.min(1, s * sat);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [a, bb, cc] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [a, bb, cc].map((v) => Math.round((v + m) * 255));
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
