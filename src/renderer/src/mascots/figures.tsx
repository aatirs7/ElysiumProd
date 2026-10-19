// The cast: a stick ninja, Mochi (a round critter) and Bolt (a little robot).
// Plain SVG. Every joint is a group that turns around its own origin, so a pose
// is only CSS keyframes on those groups (see mascots.css). Colours are theme tokens.
import type { CSSProperties } from 'react';

export type Pose = 'idle' | 'walk' | 'run' | 'flip' | 'backflip' | 'cartwheel' | 'wave' | 'slash' | 'sit' | 'crouch' | 'peek' | 'hop' | 'roll';

/** A limb: a segment from its joint, with the next segment hanging off its end. */
function Limb({ cls, len, children }: { cls: string; len: number; children?: React.ReactNode }) {
  return (
    <g className={cls}>
      <line x1={0} y1={0} x2={0} y2={len} />
      {children && <g transform={`translate(0 ${len})`}>{children}</g>}
    </g>
  );
}

export function Ninja({ pose, dur = 800, size = 56, style }: { pose: Pose; dur?: number; size?: number; style?: CSSProperties }) {
  return (
    <svg className={`mc-ninja pose-${pose}`} viewBox="-30 -46 60 72" width={size * 0.83} height={size} style={{ ['--dur' as string]: `${dur}ms`, ...style }} aria-hidden="true">
      <g transform="translate(0 -10)"><g className="nj-spin"><g transform="translate(0 10)">
        {/* back limbs, a touch dimmer */}
        <g className="nj-back">
          <g transform="translate(0 -21)"><Limb cls="nj-ua b" len={9}><Limb cls="nj-fa b" len={8} /></Limb></g>
          <Limb cls="nj-th b" len={11}><Limb cls="nj-sh b" len={11}><line x1={0} y1={11} x2={3.5} y2={11} /></Limb></Limb>
        </g>
        {/* the katana on the back */}
        <g className="nj-sheath"><line x1={-7} y1={-12} x2={8} y2={-31} className="nj-blade" /><line x1={5.6} y1={-28} x2={9.6} y2={-33} className="nj-hilt" /></g>
        <line className="nj-torso" x1={0} y1={-25} x2={0} y2={0} />
        <line className="nj-belt" x1={-2.6} y1={-3} x2={2.6} y2={-3} />
        <g className="nj-headg">
          <circle className="nj-head" cx={0} cy={-31.5} r={5.8} />
          <rect className="nj-eyes" x={-0.5} y={-33.6} width={6.2} height={2.3} rx={1.1} />
          <rect className="nj-band" x={-6} y={-37.4} width={12} height={2.6} rx={1.2} />
          <g transform="translate(-5.4 -36.2)"><g className="nj-tails">
            <path d="M0 0 C -4 -1.5 -7 1 -11 -0.5" />
            <path d="M0 0.6 C -3.5 2 -6 4.5 -10 4" />
          </g></g>
        </g>
        {/* front limbs */}
        <Limb cls="nj-th f" len={11}><Limb cls="nj-sh f" len={11}><line x1={0} y1={11} x2={3.5} y2={11} /></Limb></Limb>
        <g transform="translate(0 -21)"><Limb cls="nj-ua f" len={9}><Limb cls="nj-fa f" len={8}>
          <g className="nj-sword"><line x1={0} y1={8} x2={0} y2={-12} className="nj-blade" /><line x1={-2.2} y1={8} x2={2.2} y2={8} className="nj-hilt" /></g>
        </Limb></Limb></g>
        <path className="nj-arc" d="M 4 -46 A 26 26 0 0 1 25 -6" />
      </g></g></g>
    </svg>
  );
}

export function Critter({ pose, dur = 900, size = 30, style }: { pose: Pose; dur?: number; size?: number; style?: CSSProperties }) {
  return (
    <svg className={`mc-critter pose-${pose}`} viewBox="-16 -26 32 28" width={size * 1.14} height={size} style={{ ['--dur' as string]: `${dur}ms`, ...style }} aria-hidden="true">
      <g className="cr-body">
        <path className="cr-tail" d="M-10 -6 C -16 -8 -16 -15 -11 -15 C -8 -15 -9 -11 -11 -11" />
        <path className="cr-ear l" d="M-8 -15 L-9.5 -24 L-3 -18 Z" />
        <path className="cr-ear r" d="M8 -15 L9.5 -24 L3 -18 Z" />
        <ellipse className="cr-blob" cx={0} cy={-9} rx={11.5} ry={9.5} />
        <ellipse className="cr-belly" cx={0} cy={-6} rx={6.5} ry={4.5} />
        <g className="cr-eyes"><circle cx={-4.2} cy={-11} r={1.8} /><circle cx={4.2} cy={-11} r={1.8} /></g>
        <circle className="cr-cheek" cx={-7.4} cy={-7.6} r={1.6} /><circle className="cr-cheek" cx={7.4} cy={-7.6} r={1.6} />
        <path className="cr-mouth" d="M-1.4 -8.2 Q0 -6.9 1.4 -8.2" />
        <ellipse className="cr-foot l" cx={-5} cy={0} rx={3} ry={1.6} /><ellipse className="cr-foot r" cx={5} cy={0} rx={3} ry={1.6} />
      </g>
    </svg>
  );
}

export function Robot({ pose, dur = 900, size = 34, style }: { pose: Pose; dur?: number; size?: number; style?: CSSProperties }) {
  return (
    <svg className={`mc-robot pose-${pose}`} viewBox="-16 -38 32 40" width={size * 0.8} height={size} style={{ ['--dur' as string]: `${dur}ms`, ...style }} aria-hidden="true">
      <g className="rb-bob">
        <line className="rb-stem" x1={0} y1={-30} x2={0} y2={-35} />
        <circle className="rb-light" cx={0} cy={-35.5} r={2} />
        <rect className="rb-head" x={-10} y={-30} width={20} height={14} rx={5} />
        <rect className="rb-visor" x={-7} y={-26.5} width={14} height={7} rx={3.5} />
        <g className="rb-eyes"><circle cx={-3} cy={-23} r={1.5} /><circle cx={3} cy={-23} r={1.5} /></g>
        <rect className="rb-chest" x={-7} y={-14.5} width={14} height={8} rx={3} />
        <g transform="translate(-8 -12)"><line className="rb-arm l" x1={0} y1={0} x2={-4} y2={5} /></g>
        <g transform="translate(8 -12)"><g className="rb-wave"><line className="rb-arm r" x1={0} y1={0} x2={4} y2={5} /></g></g>
      </g>
      <g transform="translate(0 -3)"><g className="rb-wheel">
        <circle cx={0} cy={0} r={4.6} />
        <line x1={-4.6} y1={0} x2={4.6} y2={0} /><line x1={0} y1={-4.6} x2={0} y2={4.6} />
      </g></g>
    </svg>
  );
}

/** A ninja vanish: a ring of smoke that bursts and fades. */
export function Puff({ style }: { style?: CSSProperties }) {
  return (
    <span className="mc-puff" style={style} aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ ['--a' as string]: `${i * (360 / 7)}deg` }} />)}
    </span>
  );
}
