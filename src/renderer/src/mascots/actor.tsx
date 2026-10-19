// An actor follows a list of steps: a pose, how long, and where to move. Moving is
// a CSS transform transition and the pose is CSS keyframes, so the browser does
// the animating; this only flips state at each step. It waits while the window is hidden.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Critter, Ninja, Puff, Robot, type Pose } from './figures';

export type Cast = 'ninja' | 'critter' | 'robot';
export interface Step {
  pose: Pose;
  ms: number;
  /** Move by this much (px) during the step; at moves straight to a spot without travelling. */
  dx?: number; dy?: number; at?: { x: number; y?: number };
  /** Jump height for flips and hops. */
  jump?: number;
  ease?: string;
  face?: 1 | -1;
  /** Vanish in a puff of smoke, or appear from one. */
  vanish?: boolean; appear?: boolean;
}

/** A trick to play next; kick() cuts the current step short so it starts right away. */
export type TrickRef = { current: Step[] | null; kick?: () => void };

const sleep = (ms: number, alive: () => boolean, wake: { fn: (() => void) | null }) => new Promise<void>((done) => {
  let t: ReturnType<typeof setTimeout> | undefined;
  const finish = () => { if (t) clearTimeout(t); wake.fn = null; done(); };
  wake.fn = finish;
  const go = () => {
    if (!alive()) return finish();
    if (document.visibilityState === 'hidden') { document.addEventListener('visibilitychange', go, { once: true }); return; }
    t = setTimeout(finish, ms);
  };
  go();
});

export function Figure({ cast, pose, dur, size }: { cast: Cast; pose: Pose; dur: number; size?: number }) {
  if (cast === 'critter') return <Critter pose={pose} dur={dur} size={size} />;
  if (cast === 'robot') return <Robot pose={pose} dur={dur} size={size} />;
  return <Ninja pose={pose} dur={dur} size={size} />;
}

/**
 * Plays steps once (or forever with loop), then calls onDone. start is the first spot.
 * trick: a ref the owner can set to steps that play next, between two steps.
 */
export function Actor({ cast, steps, start, size, loop = false, onDone, trick, onClick, children }: {
  cast: Cast; steps: Step[] | (() => Step[]); start: { x: number; y: number }; size?: number; loop?: boolean; onDone?(): void;
  trick?: TrickRef; onClick?(): void; children?: ReactNode;
}) {
  const [s, setS] = useState({ x: start.x, y: start.y, pose: 'idle' as Pose, ms: 0, ease: 'linear', face: 1 as 1 | -1, jump: 0, shown: true, puff: 0 });
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let alive = true;
    const live = () => alive;
    let pos = { x: start.x, y: start.y };
    let face: 1 | -1 = 1;
    let puff = 0;
    const wake: { fn: (() => void) | null } = { fn: null };
    if (trick) trick.kick = () => wake.fn?.();
    void (async () => {
      do {
        const list = [...(typeof stepsRef.current === 'function' ? stepsRef.current() : stepsRef.current)];
        for (let i = 0; i < list.length && alive; i++) {
          const extra = trick?.current;
          if (extra?.length) { if (trick) trick.current = null; list.splice(i, 0, ...extra); }
          const st = list[i];
          if (st.face) face = st.face;
          const jumpTo = st.at ? { x: st.at.x, y: st.at.y ?? pos.y } : null;
          if (jumpTo) pos = jumpTo;
          else pos = { x: pos.x + (st.dx ?? 0), y: pos.y + (st.dy ?? 0) };
          if (st.vanish || st.appear) puff += 1;
          setS({ x: pos.x, y: pos.y, pose: st.pose, ms: jumpTo ? 0 : st.ms, ease: st.ease ?? 'linear', face, jump: st.jump ?? 0, shown: !st.vanish, puff });
          await sleep(st.ms, live, wake);
        }
        if (!alive) return;
      } while (loop);
      doneRef.current?.();
    })();
    return () => { alive = false; };
    // Starts once; steps are read fresh at each loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mc-actor" style={{ transform: `translate3d(${s.x}px, ${s.y}px, 0)`, transition: `transform ${s.ms}ms ${s.ease}` }}>
      <div className={`mc-face ${s.shown ? '' : 'gone'}`} style={{ transform: `scaleX(${s.face})` }}>
        <div key={`${s.pose}-${s.x}`} className={`mc-hop ${s.jump ? 'jump' : ''}`} style={{ ['--jump' as string]: `${-s.jump}px`, ['--dur' as string]: `${s.ms}ms` }}
          onClick={onClick} data-click={onClick ? '1' : undefined}>
          <Figure cast={cast} pose={s.pose} dur={s.ms || 800} size={size} />
        </div>
      </div>
      {s.puff > 0 && <Puff key={s.puff} />}
      {children}
    </div>
  );
}
