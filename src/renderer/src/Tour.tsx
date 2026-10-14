// A short guided tour: each step lights up one part of the app and says what it is for.
import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

const STEPS: { sel: string; title: string; text: string; home?: boolean }[] = [
  { sel: '[data-tour="command"]', home: true, title: 'Tell any project what to do', text: 'Type a task in plain words, like "tell Website to fix the footer". It runs in the background and you get a notification when it is done.' },
  { sel: '[data-tour="projects"]', title: 'Your projects', text: 'Add one with the plus. Click a project to open it with its Claude session; right click it to start, compact, rename, colour or group it.' },
  { sel: '[data-tour="tools"]', title: 'Tools', text: 'PC Helper audits and fixes this computer. Customize Elysium changes the app itself when you ask.' },
  { sel: '[data-tour="usage"]', title: 'Usage and costs', text: 'How close you are to your plan\'s limits, where your tokens go, and what you spend each month.' },
  { sel: '[data-tour="theme"]', title: 'Make it yours', text: 'Fifteen themes and your own colours. Home widgets can be moved or removed with Customize Home.' },
  { sel: '[data-tour="memory"]', title: 'Memory and disk', text: 'What this PC is busy with, and plain advice on what would help.' },
  { sel: '[data-tour="help"]', title: 'Help is always here', text: 'Search any question, or take this tour again from Getting started.' },
];

export function Tour({ onClose, goHome }: { onClose(): void; goHome(): void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const step = STEPS[i];

  useEffect(() => { if (step.home) goHome(); }, [step, goHome]);
  useLayoutEffect(() => {
    let raf = 0;
    const find = () => { const el = document.querySelector(step.sel); setBox(el ? el.getBoundingClientRect() : null); };
    const t = setTimeout(find, step.home ? 250 : 30);
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(find); };
    window.addEventListener('resize', on);
    return () => { clearTimeout(t); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [step]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const pad = 8;
  const hole = box ? { left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 } : null;
  // The card sits beside the highlight, on whichever side has room.
  const card = hole
    ? (hole.left + hole.width + 360 < window.innerWidth
      ? { left: hole.left + hole.width + 18, top: Math.max(16, Math.min(window.innerHeight - 220, hole.top)) }
      : { left: Math.max(16, Math.min(window.innerWidth - 360, hole.left)), top: Math.min(window.innerHeight - 220, hole.top + hole.height + 18) })
    : { left: window.innerWidth / 2 - 170, top: window.innerHeight / 2 - 90 };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tour">
      <div className="tour-hole" style={hole ?? { left: '50%', top: '50%', width: 0, height: 0 }} />
      <div className="tour-card" key={i} style={card}>
        <div className="tour-top"><span className="tour-n">{i + 1} of {STEPS.length}</span><button className="ghost-icon tiny" onClick={onClose} aria-label="End the tour"><X size={14} /></button></div>
        <strong>{step.title}</strong>
        <p>{step.text}</p>
        <div className="tour-actions">
          <div className="tour-dots">{STEPS.map((_, n) => <i key={n} className={n === i ? 'on' : n < i ? 'done' : ''} />)}</div>
          {i > 0 && <button className="btn small" onClick={() => setI(i - 1)}><ArrowLeft size={13} /></button>}
          {i < STEPS.length - 1
            ? <button className="btn small primary" onClick={() => setI(i + 1)}>Next<ArrowRight size={13} /></button>
            : <button className="btn small primary" onClick={onClose}>Done</button>}
        </div>
      </div>
    </div>
  );
}
