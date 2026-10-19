// Playful extras: the ninja on the empty view's floor, and now and then a little
// visitor: Mochi peeking over a tab, the ninja peeking out from behind a project,
// sitting on the Projects label, cartwheeling over Home, cheering a finished
// session, or Bolt rolling by when the app sits idle. All of it is small, never
// takes a click it should not (only the characters themselves are clickable, for a
// trick), stays off Claude panes, and does no work while the window is hidden.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLive } from '../workspace/live';
import { useWorkspace } from '../workspace/store';
import { Actor, type Cast, type Step, type TrickRef } from './actor';
import { Critter, Ninja } from './figures';
import './mascots.css';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** True when the setting is on and the person has not asked for less motion. */
export function usePlayful(): boolean {
  const { doc } = useWorkspace();
  return doc.settings.playful !== false && !reduced();
}

type Visit =
  | { kind: 'tab-peek'; id: number; x: number; y: number; cast: Cast }
  | { kind: 'side-peek'; id: number; x: number; y: number }
  | { kind: 'side-sit'; id: number; x: number; y: number }
  | { kind: 'home'; id: number; x: number; y: number; w: number }
  | { kind: 'wander'; id: number; cast: Cast; w: number; h: number }
  | { kind: 'cheer'; id: number; x: number; y: number };

type NoId<T> = T extends unknown ? Omit<T, 'id'> : never;
const overlaps = (r: DOMRect, x: number, y: number, w: number, h: number) => !(x + w < r.left || x > r.right || y + h < r.top || y > r.bottom);
/** Native Claude pages draw above the page, so a visitor there would only be cut in half. */
function clearOfWeb(x: number, y: number, w: number, h: number): boolean {
  for (const el of document.querySelectorAll<HTMLElement>('.web-host')) {
    if (el.offsetParent && overlaps(el.getBoundingClientRect(), x, y, w, h)) return false;
  }
  return true;
}
const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight ? r : null; };

export function Mascots() {
  const on = usePlayful();
  const { telemetry, sessions } = useLive();
  const [visits, setVisits] = useState<Visit[]>([]);
  const n = useRef(0);
  const lastInput = useRef(Date.now());
  const wandered = useRef(false);
  const homeAt = useRef(0);
  const add = useCallback((v: NoId<Visit>) => setVisits((xs) => [...xs, { ...v, id: ++n.current } as Visit]), []);
  const drop = useCallback((id: number) => setVisits((xs) => xs.filter((x) => x.id !== id)), []);

  const play = useCallback((what: string): boolean => {
    if (what === 'tab-peek') {
      const tabs = [...document.querySelectorAll('.dv-tab')].map((t) => shown(t)).filter((r): r is DOMRect => Boolean(r) && r!.width > 50);
      for (const r of tabs.sort(() => Math.random() - 0.5)) {
        const x = r.left + rand(14, r.width - 18), y = r.top + 3;
        if (y < 40 || !clearOfWeb(x - 16, y - 30, 32, 30)) continue;
        add({ kind: 'tab-peek', x, y, cast: pick<Cast>(['critter', 'critter', 'robot']) });
        return true;
      }
      return false;
    }
    if (what === 'side-peek') {
      const side = document.querySelector('.sidebar');
      const rows = [...document.querySelectorAll('.side-project .nav, .side-scroll .nav')].map((t) => shown(t)).filter((r): r is DOMRect => Boolean(r));
      const sr = side && shown(side);
      if (!sr || !rows.length) return false;
      const r = pick(rows);
      if (!clearOfWeb(sr.right, r.top, 40, r.height)) return false;
      add({ kind: 'side-peek', x: sr.right, y: r.top + r.height / 2 });
      return true;
    }
    if (what === 'side-sit') {
      const label = [...document.querySelectorAll('.side-label')].find((l) => /projects/i.test(l.textContent ?? ''));
      const r = label && shown(label);
      if (!r) return false;
      add({ kind: 'side-sit', x: r.left + 78, y: r.bottom - 8 });
      return true;
    }
    if (what === 'home') {
      const g = document.querySelector('.greeting');
      const r = g && shown(g);
      if (!r) return false;
      add({ kind: 'home', x: r.left, y: r.top + 4, w: r.width });
      return true;
    }
    if (what === 'wander') { add({ kind: 'wander', cast: pick<Cast>(['robot', 'critter']), w: innerWidth, h: innerHeight }); return true; }
    if (what === 'cheer') {
      const t = document.querySelector('.dv-active-tab') ?? document.querySelector('.dv-tab');
      const r = t && shown(t);
      if (!r) return false;
      add({ kind: 'cheer', x: r.left + r.width / 2, y: r.top + 4 });
      return true;
    }
    if (what.startsWith('ninja-')) { window.dispatchEvent(new CustomEvent('ep:ninja-trick', { detail: what.slice(6) })); return true; }
    return false;
  }, [add]);

  // The smoke test, and anyone curious, can call a visitor: window.__mascots.play('tab-peek').
  useEffect(() => { (window as unknown as { __mascots: unknown }).__mascots = { play }; }, [play]);

  // One timer for everything: every few seconds, maybe a visitor.
  useEffect(() => {
    if (!on) return;
    const seen = () => { lastInput.current = Date.now(); wandered.current = false; };
    window.addEventListener('pointerdown', seen, { passive: true });
    window.addEventListener('keydown', seen, { passive: true });
    let nextTab = Date.now() + rand(45, 90) * 1000;
    let nextSide = Date.now() + rand(70, 140) * 1000;
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now > nextTab) { nextTab = now + rand(45, 90) * 1000; play('tab-peek'); }
      if (now > nextSide) { nextSide = now + rand(70, 140) * 1000; play(Math.random() < 0.6 ? 'side-peek' : 'side-sit'); }
      if (!wandered.current && now - lastInput.current > 120000) { wandered.current = true; play('wander'); }
    }, 5000);
    const home = () => { if (Date.now() - homeAt.current > 180000) { homeAt.current = Date.now(); setTimeout(() => play('home'), 700); } };
    window.addEventListener('ep:home-shown', home);
    return () => { clearInterval(t); window.removeEventListener('pointerdown', seen); window.removeEventListener('keydown', seen); window.removeEventListener('ep:home-shown', home); };
  }, [on, play]);

  // A session that just finished gets a little cheer above the tabs.
  const prev = useRef<Record<string, string>>({});
  const cheerAt = useRef(0);
  useEffect(() => {
    if (!on) return;
    for (const s of sessions) {
      const st = telemetry[s.id]?.state;
      if (!st) continue;
      if (prev.current[s.id] === 'busy' && st === 'idle' && Date.now() - cheerAt.current > 20000) { cheerAt.current = Date.now(); play('cheer'); }
      prev.current[s.id] = st;
    }
  }, [telemetry, sessions, on, play]);

  if (!on) return null;
  return createPortal(<div className="mc-layer" aria-hidden="true">{visits.map((v) => <VisitView key={v.id} v={v} done={() => drop(v.id)} />)}</div>, document.body);
}

function VisitView({ v, done }: { v: Visit; done(): void }) {
  // Peeks are pure CSS; they end on their own clock.
  useEffect(() => {
    if (v.kind !== 'tab-peek' && v.kind !== 'side-peek') return;
    const t = setTimeout(done, v.kind === 'tab-peek' ? 4200 : 3600);
    return () => clearTimeout(t);
  }, [v.kind, done]);

  if (v.kind === 'tab-peek') {
    return (
      <div className="mc-peek-box tab" style={{ left: v.x - 18, top: v.y - 34 }}>
        <div className="mc-peek-up">{v.cast === 'robot' ? <RobotFace /> : <Critter pose="peek" dur={4200} size={30} />}</div>
      </div>
    );
  }
  if (v.kind === 'side-peek') {
    return (
      <div className="mc-peek-box side" style={{ left: v.x, top: v.y - 26 }}>
        <div className="mc-peek-side"><Ninja pose="peek" dur={3600} size={52} /></div>
      </div>
    );
  }
  if (v.kind === 'side-sit') {
    return (
      <div className="mc-stage" style={{ left: 0, top: 0 }}>
        <Actor cast="ninja" size={30} start={{ x: v.x, y: v.y }} onDone={done} steps={[
          { pose: 'idle', ms: 10, appear: true },
          { pose: 'sit', ms: 5200 },
          { pose: 'wave', ms: 1300 },
          { pose: 'idle', ms: 500, vanish: true },
          { pose: 'idle', ms: 600 },
        ]} />
      </div>
    );
  }
  if (v.kind === 'home') {
    const y = v.y;
    return (
      <div className="mc-stage" style={{ left: 0, top: 0 }}>
        <Actor cast="ninja" size={40} start={{ x: v.x - 160, y }} onDone={done} steps={[
          { pose: 'run', ms: 900, dx: 170, face: 1 },
          { pose: 'flip', ms: 760, dx: 90, jump: 46, ease: 'cubic-bezier(.3,.6,.5,1)' },
          { pose: 'run', ms: 700, dx: 120 },
          { pose: 'cartwheel', ms: 900, dx: 120 },
          { pose: 'run', ms: Math.max(300, (v.w - 360) * 4), dx: Math.max(60, v.w - 360) },
          { pose: 'backflip', ms: 820, dx: -30, jump: 50, ease: 'cubic-bezier(.3,.6,.5,1)' },
          { pose: 'wave', ms: 1400 },
          { pose: 'idle', ms: 500, vanish: true },
          { pose: 'idle', ms: 600 },
        ]} />
      </div>
    );
  }
  if (v.kind === 'cheer') {
    return (
      <div className="mc-stage" style={{ left: 0, top: 0 }}>
        <Actor cast="ninja" size={26} start={{ x: v.x, y: v.y }} onDone={done} steps={[
          { pose: 'idle', ms: 10, appear: true },
          { pose: 'flip', ms: 700, jump: 26, ease: 'cubic-bezier(.3,.6,.5,1)' },
          { pose: 'wave', ms: 900 },
          { pose: 'idle', ms: 400, vanish: true },
          { pose: 'idle', ms: 500 },
        ]} />
      </div>
    );
  }
  return <Wanderer v={v} done={done} />;
}

/** Bolt rolls along the bottom edge, stops to look around, and rolls off. Click for a hop. */
function Wanderer({ v, done }: { v: Extract<Visit, { kind: 'wander' }>; done(): void }) {
  const trick = useRef<Step[] | null>(null) as TrickRef;
  const cast = v.cast;
  const move: Step['pose'] = cast === 'robot' ? 'roll' : 'hop';
  const third = v.w / 3;
  const steps = useMemo<Step[]>(() => [
    { pose: move, ms: 5200, dx: third + 40, face: 1 },
    { pose: 'idle', ms: 1400 },
    { pose: 'wave', ms: 1300 },
    { pose: move, ms: 5200, dx: third },
    { pose: 'idle', ms: 900 },
    { pose: move, ms: 5200, dx: third + 60 },
  ], [move, third]);
  return (
    <div className="mc-stage" style={{ left: 0, top: 0 }}>
      <Actor cast={cast} size={cast === 'robot' ? 36 : 30} start={{ x: -40, y: v.h - 6 }} steps={steps} onDone={done} trick={trick}
        onClick={() => { trick.current = [{ pose: 'hop', ms: 520, jump: 30, ease: 'cubic-bezier(.3,.6,.5,1)' }]; trick.kick?.(); }} />
    </div>
  );
}

/** Bolt's head and antenna only, for peeking over a tab. */
function RobotFace() {
  return (
    <svg className="mc-robot pose-peek" viewBox="-12 -22 24 22" width={28} height={26}>
      <line className="rb-stem" x1={0} y1={-15} x2={0} y2={-19} />
      <circle className="rb-light" cx={0} cy={-19.5} r={2} />
      <rect className="rb-head" x={-10} y={-15} width={20} height={15} rx={5} />
      <rect className="rb-visor" x={-7} y={-11.5} width={14} height={7} rx={3.5} />
      <g className="rb-eyes"><circle cx={-3} cy={-8} r={1.5} /><circle cx={3} cy={-8} r={1.5} /></g>
    </svg>
  );
}

/**
 * The empty view's ninja: a loop across the floor. Walks in, waves, runs, front
 * flips, cartwheels, draws the sword, backflips, sits a moment, then vanishes in
 * smoke and comes round again. Click him for a flip.
 */
export function FloorNinja() {
  const on = usePlayful();
  const host = useRef<HTMLDivElement>(null);
  const trick = useRef<Step[] | null>(null) as TrickRef;
  const [w, setW] = useState(0);
  useEffect(() => { const el = host.current; if (el) setW(el.offsetWidth); }, []);
  useEffect(() => {
    const t = (e: Event) => {
      const k = (e as CustomEvent<string>).detail;
      const map: Record<string, Step[]> = {
        flip: [{ pose: 'flip', ms: 760, dx: 60, jump: 50, ease: 'cubic-bezier(.3,.6,.5,1)' }],
        backflip: [{ pose: 'backflip', ms: 820, dx: -40, jump: 54, ease: 'cubic-bezier(.3,.6,.5,1)' }],
        cartwheel: [{ pose: 'cartwheel', ms: 1000, dx: 110 }],
        slash: [{ pose: 'slash', ms: 900 }],
        wave: [{ pose: 'wave', ms: 1400 }],
      };
      trick.current = map[k] ?? map.flip;
      trick.kick?.();
    };
    window.addEventListener('ep:ninja-trick', t);
    return () => window.removeEventListener('ep:ninja-trick', t);
  }, []);
  // The whole loop, sized to the floor each time round.
  const steps = useCallback((): Step[] => {
    const W = host.current?.offsetWidth || w || 900;
    const at = (f: number) => W * f;
    const walk = (to: number, from: number) => ({ pose: 'walk' as const, ms: Math.abs(to - from) / 55 * 1000, dx: to - from });
    const run = (to: number, from: number) => ({ pose: 'run' as const, ms: Math.abs(to - from) / 170 * 1000, dx: to - from });
    const a = at(0.16), b = at(0.3), c = at(0.44), d = at(0.6), e = at(0.82);
    return [
      { pose: 'idle', ms: 20, at: { x: -50, y: 0 }, face: 1 },
      walk(a, -50),
      { pose: 'idle', ms: 500 },
      { pose: 'wave', ms: 1500 },
      walk(b, a),
      run(c - 70, b),
      { pose: 'flip', ms: 760, dx: 70, jump: 52, ease: 'cubic-bezier(.3,.6,.5,1)' },
      { pose: 'crouch', ms: 220 },
      run(d - 220, c),
      { pose: 'cartwheel', ms: 1000, dx: 110 },
      { pose: 'cartwheel', ms: 1000, dx: 110 },
      { pose: 'idle', ms: 300 },
      { pose: 'slash', ms: 900 },
      { pose: 'idle', ms: 400 },
      { pose: 'backflip', ms: 820, dx: -40, jump: 56, ease: 'cubic-bezier(.3,.6,.5,1)' },
      { pose: 'crouch', ms: 220 },
      walk(e, d - 40),
      { pose: 'sit', ms: 2600 },
      { pose: 'idle', ms: 500, vanish: true },
      { pose: 'idle', ms: 1600 },
    ];
  }, [w]);
  return (
    <div className="wm-ninja" ref={host}>
      {w > 0 && (on
        ? <Actor cast="ninja" size={50} start={{ x: -50, y: 0 }} steps={steps} loop trick={trick}
            onClick={() => { trick.current = [{ pose: 'flip', ms: 760, dx: 50, jump: 52, ease: 'cubic-bezier(.3,.6,.5,1)' }]; trick.kick?.(); }}><span className="wm-shadow mc-shadow" /></Actor>
        : <div className="mc-actor" style={{ transform: `translate3d(${w * 0.2}px, 0, 0)` }}><div className="mc-face"><Ninja pose="idle" size={50} /></div></div>)}
    </div>
  );
}
