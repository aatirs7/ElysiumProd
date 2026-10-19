// Mission control: every project as a star on a dark chart, sized by the agent time
// it had this month and lit by this week's commits. Running sessions orbit their
// project: working ones pulse in the accent, ones that need you blink amber. A slow
// radar sweep brightens what it passes. Drawn on a canvas so nothing re-renders per
// frame; it stops when the window is hidden and holds still for reduced motion.
import { useEffect, useRef } from 'react';

export interface StarNode {
  id: string;
  name: string;
  /** Agent minutes this month. */
  minutes: number;
  commits: number;
  sessions: { id: string; state: string }[];
}

interface Placed extends StarNode { x: number; y: number; r: number }

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function rgba(c: string, a: number): string {
  const h = /^#([0-9a-f]{6})$/i.exec(c);
  if (h) { const n = parseInt(h[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  const m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(c);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : c;
}

/** A stable pseudo random number for a seed, so the sky and the layout never jump. */
function rand(seed: number): number { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }
function hash(s: string): number { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

/** Golden angle spiral, stretched to the box, then pushed apart until labels have room. */
function place(nodes: StarNode[], w: number, h: number): Placed[] {
  const sorted = [...nodes].sort((a, b) => b.minutes - a.minutes || b.commits - a.commits);
  const n = Math.max(1, sorted.length);
  const cx = w * 0.5, cy = h * 0.52;
  const rx = w * 0.4, ry = h * 0.36;
  const out: Placed[] = sorted.map((p, i) => {
    const a = i * 2.399963 + (hash(p.id) % 100) / 400;
    const k = n === 1 ? 0 : Math.sqrt((i + 0.6) / n);
    return { ...p, x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k, r: Math.min(13, 3.2 + Math.sqrt(p.minutes / 60) * 1.7) };
  });
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const A = out[i], B = out[j];
      const dx = B.x - A.x, dy = (B.y - A.y) * 1.8, d = Math.hypot(dx, dy) || 1;
      const want = 118;
      if (d < want) { const push = (want - d) / 2 / d; A.x -= dx * push; B.x += dx * push; A.y -= (dy / 1.8) * push; B.y += (dy / 1.8) * push; }
    }
    for (const p of out) { p.x = Math.min(w - 90, Math.max(40, p.x)); p.y = Math.min(h - 34, Math.max(30, p.y)); }
  }
  return out;
}

/** Each star joins its nearest neighbour, and the brightest few join in a chain: a constellation. */
function edges(ps: Placed[]): [Placed, Placed][] {
  const out: [Placed, Placed][] = [];
  const seen = new Set<string>();
  const add = (a: Placed, b: Placed) => { const k = [a.id, b.id].sort().join('|'); if (a !== b && !seen.has(k)) { seen.add(k); out.push([a, b]); } };
  for (const a of ps) {
    const near = ps.filter((b) => b !== a).sort((b, c) => Math.hypot(b.x - a.x, b.y - a.y) - Math.hypot(c.x - a.x, c.y - a.y))[0];
    if (near) add(a, near);
  }
  for (let i = 1; i < Math.min(5, ps.length); i++) add(ps[i - 1], ps[i]);
  return out;
}

export function Constellation({ nodes, onOpen }: { nodes: StarNode[]; onOpen(id: string): void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const key = nodes.map((n) => `${n.id}:${Math.round(n.minutes / 30)}:${n.commits}:${n.sessions.map((s) => s.state).join('')}`).join(',');

  useEffect(() => {
    const el = cv.current!, box = wrap.current!;
    const g = el.getContext('2d')!;
    let w = 0, h = 0, dpr = 1;
    let placed: Placed[] = [];
    let links: [Placed, Placed][] = [];
    let sky: HTMLCanvasElement | null = null;
    let hover: Placed | null = null;
    let raf = 0, last = 0, t0 = performance.now();
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let col = { text: '', text2: '', text3: '', line: '', accent: '', warn: '', idle: '', bg: '' };
    const readColors = () => {
      col = { text: css('--text', '#F2F1EC'), text2: css('--text-2', '#C3C1B8'), text3: css('--text-3', '#94928B'), line: css('--line-strong', 'rgba(222,220,209,.16)'), accent: css('--accent', '#D97757'), warn: css('--warn', '#E0AE5E'), idle: css('--idle', '#6E6C67'), bg: css('--surface', '#30302E') };
      sky = null;
    };

    // The sky: faint stars and range rings, drawn once per size or theme.
    const drawSky = () => {
      const s = document.createElement('canvas');
      s.width = w * dpr; s.height = h * dpr;
      const c = s.getContext('2d')!;
      c.scale(dpr, dpr);
      const cx = w * 0.5, cy = h * 0.52;
      c.strokeStyle = rgba(col.text3, 0.12);
      c.lineWidth = 1;
      for (let i = 1; i <= 4; i++) { c.beginPath(); c.ellipse(cx, cy, w * 0.12 * i, h * 0.12 * i * 1.05, 0, 0, Math.PI * 2); c.setLineDash(i % 2 ? [2, 5] : []); c.stroke(); }
      c.setLineDash([]);
      c.strokeStyle = rgba(col.text3, 0.08);
      c.beginPath(); c.moveTo(cx - w * 0.5, cy); c.lineTo(cx + w * 0.5, cy); c.moveTo(cx, 0); c.lineTo(cx, h); c.stroke();
      for (let i = 0; i < Math.round((w * h) / 2600); i++) {
        const x = rand(i * 3.1) * w, y = rand(i * 7.7 + 1) * h, big = rand(i * 1.3 + 5) > 0.93;
        c.fillStyle = rgba(col.text, big ? 0.38 : 0.12 + rand(i) * 0.14);
        c.beginPath(); c.arc(x, y, big ? 1.1 : 0.6, 0, Math.PI * 2); c.fill();
      }
      sky = s;
    };

    const layout = () => {
      const r = box.getBoundingClientRect();
      w = Math.max(320, Math.round(r.width)); h = Math.max(220, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = w * dpr; el.height = h * dpr; el.style.width = `${w}px`; el.style.height = `${h}px`;
      placed = place(nodesRef.current, w, h);
      links = edges(placed);
      sky = null;
    };

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      if (!sky) drawSky();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.drawImage(sky!, 0, 0, w, h);
      const cx = w * 0.5, cy = h * 0.52;
      // The sweep: a soft wedge turning once every twelve seconds.
      const sweep = still ? -Math.PI / 4 : (t / 12) * Math.PI * 2;
      if (!still) {
        const grad = g.createConicGradient(sweep - 0.55, cx, cy);
        grad.addColorStop(0, rgba(col.accent, 0));
        grad.addColorStop(0.085, rgba(col.accent, 0.11));
        grad.addColorStop(0.088, rgba(col.accent, 0));
        grad.addColorStop(1, rgba(col.accent, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }
      // Constellation lines.
      g.lineWidth = 1;
      for (const [a, b] of links) {
        const lit = hover && (a === hover || b === hover);
        g.strokeStyle = rgba(lit ? col.accent : col.text3, lit ? 0.55 : 0.2);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      for (const p of placed) {
        // How freshly the sweep passed over this star.
        const ang = Math.atan2(p.y - cy, p.x - cx);
        const since = ((sweep - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const ping = still ? 0 : Math.max(0, 1 - since / 1.6);
        const heat = Math.min(1, p.commits / 25);
        const on = p === hover;
        const halo = p.r * (3.2 + heat * 2.4 + ping * 1.4) + (on ? 6 : 0);
        const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
        rg.addColorStop(0, rgba(col.accent, 0.22 + heat * 0.25 + ping * 0.2));
        rg.addColorStop(1, rgba(col.accent, 0));
        g.fillStyle = rg; g.beginPath(); g.arc(p.x, p.y, halo, 0, Math.PI * 2); g.fill();
        g.fillStyle = p.minutes || p.commits ? col.text : col.text3;
        g.beginPath(); g.arc(p.x, p.y, p.r * (on ? 1.15 : 1), 0, Math.PI * 2); g.fill();
        g.fillStyle = rgba(col.accent, 0.9);
        g.beginPath(); g.arc(p.x, p.y, Math.max(1.4, p.r * 0.42), 0, Math.PI * 2); g.fill();
        // Sessions in orbit.
        p.sessions.forEach((s, i) => {
          const orbit = p.r + 9 + i * 6;
          const speed = s.state === 'busy' ? 0.9 : s.state === 'waiting' ? 0.25 : 0.12;
          const a = (still ? 0 : t * speed) + i * 2.1 + (hash(s.id) % 628) / 100;
          g.strokeStyle = rgba(col.text3, 0.18);
          g.beginPath(); g.ellipse(p.x, p.y, orbit, orbit * 0.62, 0, 0, Math.PI * 2); g.stroke();
          const sx = p.x + Math.cos(a) * orbit, sy = p.y + Math.sin(a) * orbit * 0.62;
          const c = s.state === 'busy' ? col.accent : s.state === 'waiting' ? col.warn : col.idle;
          if (s.state === 'busy' && !still) {
            const pr = 3 + ((t * 1.4 + i * 0.3) % 1) * 7;
            g.strokeStyle = rgba(c, 0.5 * (1 - ((t * 1.4 + i * 0.3) % 1)));
            g.beginPath(); g.arc(sx, sy, pr, 0, Math.PI * 2); g.stroke();
          }
          const blink = s.state === 'waiting' && !still ? 0.45 + 0.55 * Math.abs(Math.sin(t * 3)) : 1;
          g.fillStyle = rgba(c, blink);
          g.beginPath(); g.arc(sx, sy, s.state === 'idle' ? 2 : 2.8, 0, Math.PI * 2); g.fill();
        });
        // Label to the right, or the left near the edge.
        const right = p.x < w - 170;
        const lx = right ? p.x + p.r + 12 + (p.sessions.length ? p.sessions.length * 6 + 6 : 0) : p.x - p.r - 12 - (p.sessions.length ? p.sessions.length * 6 + 6 : 0);
        g.textAlign = right ? 'left' : 'right';
        g.font = `600 ${on ? 13.5 : 13}px ${getComputedStyle(document.body).fontFamily}`;
        g.fillStyle = rgba(col.text, on ? 1 : 0.92);
        g.fillText(p.name, lx, p.y + 1);
        g.font = `500 11px ${getComputedStyle(document.body).fontFamily}`;
        g.fillStyle = col.text3;
        const sub = [p.minutes ? `${p.minutes >= 60 ? `${Math.round(p.minutes / 60)} h` : `${p.minutes} min`} this month` : 'quiet', p.commits ? `${p.commits} commit${p.commits === 1 ? '' : 's'}` : ''].filter(Boolean).join('  ·  ');
        g.fillText(sub, lx, p.y + 16);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.visibilityState !== 'visible' || !box.offsetParent) return;
      if (now - last < 33) return; // about 30 frames a second is plenty for a slow sky
      last = now;
      frame(now);
    };

    readColors();
    layout();
    if (still) frame(performance.now()); else raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => { layout(); if (still) frame(performance.now()); });
    ro.observe(box);
    const mo = new MutationObserver(() => requestAnimationFrame(() => { readColors(); if (still) frame(performance.now()); }));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });

    const at = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      return placed.find((p) => Math.hypot(p.x - x, p.y - y) < Math.max(18, p.r + 10)) ?? null;
    };
    const move = (e: MouseEvent) => {
      hover = at(e);
      el.style.cursor = hover ? 'pointer' : 'default';
      const tp = tip.current;
      if (tp) {
        if (hover) {
          const working = hover.sessions.filter((s) => s.state === 'busy').length, needs = hover.sessions.filter((s) => s.state === 'waiting').length;
          tp.textContent = `Open ${hover.name}${hover.sessions.length ? `: ${hover.sessions.length} session${hover.sessions.length > 1 ? 's' : ''}${working ? `, ${working} working` : ''}${needs ? `, ${needs} need${needs > 1 ? '' : 's'} you` : ''}` : ''}`;
          tp.style.transform = `translate(${Math.min(w - 260, hover.x + 14)}px, ${hover.y - 44}px)`;
          tp.style.opacity = '1';
        } else tp.style.opacity = '0';
      }
      if (still) frame(performance.now());
    };
    const leave = () => { hover = null; if (tip.current) tip.current.style.opacity = '0'; if (still) frame(performance.now()); };
    const click = (e: MouseEvent) => { const p = at(e); if (p) openRef.current(p.id); };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    el.addEventListener('click', click);
    // The smoke test reads how long a frame takes to draw.
    (window as unknown as { __mapProbe?: () => number[] }).__mapProbe = () => { const d: number[] = []; for (let i = 0; i < 40; i++) { const s = performance.now(); frame(s + i * 33); d.push(performance.now() - s); } return d.sort((a, b) => a - b); };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave); el.removeEventListener('click', click); };
    // Rebuild only when what is drawn changes; the sessions' states are in the key.
  }, [key]);

  return (
    <div className="mc-map" ref={wrap}>
      <canvas ref={cv} aria-label={`A map of ${nodes.length} projects. Click a star to open its project.`} role="img" />
      <div className="mc-tip" ref={tip} aria-hidden="true" />
    </div>
  );
}
