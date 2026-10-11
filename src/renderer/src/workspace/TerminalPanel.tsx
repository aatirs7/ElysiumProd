import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { IDockviewPanelProps } from 'dockview-react';
import { RotateCcw } from 'lucide-react';
import { useWorkspace } from './store';
import { useLive } from './live';

export interface TerminalParams {
  templateId: string;
  sessionId?: string;
  /** Restored from a preset: waits for the owner to press Start, never starts itself. */
  pending?: boolean;
}

const MONO = '"Cascadia Mono", "Cascadia Code", Consolas, monospace';

// Lets the smoke test type into, and read, the most recent terminal.
const registry = new Map<string, Terminal>();
let lastSession: string | null = null;
let focusedSession: string | null = null;
/** The terminal the owner last typed in or clicked into, for Send to terminal. */
export const lastFocusedSession = () => focusedSession ?? lastSession;
if (typeof window !== 'undefined') {
  const prev = window.__smoke;
  window.__smoke = {
    launch: prev?.launch ?? (async () => null),
    type: (d: string) => { if (lastSession) window.elysium.write(lastSession, d); },
    screen: () => {
      const t = lastSession ? registry.get(lastSession) : undefined;
      if (!t) return '';
      const b = t.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '');
      return lines.join('\n');
    },
  };
}

export function TerminalPanel(props: IDockviewPanelProps<TerminalParams>) {
  const { doc } = useWorkspace();
  const { sessions, templates } = useLive();
  const template = templates.find((t) => t.id === props.params.templateId);
  const [pending, setPending] = useState(Boolean(props.params.pending));
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sessionId = props.params.sessionId;
  const session = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    if (termRef.current) termRef.current.options.fontSize = doc.settings.termFontSize;
  }, [doc.settings.termFontSize]);

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    let sid: string | null = props.params.sessionId ?? null;
    let seen = 0; // characters of this session already written
    const cleanups: Array<() => void> = [];

    // DOM renderer on purpose: xterm's WebGL renderer drew a blank pane on this
    // Surface's GPU during Phase 1 testing.
    const term = new Terminal({
      fontFamily: MONO,
      fontSize: doc.settings.termFontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      theme: {
        background: '#1C1B1A', foreground: '#ECEAE3', cursor: '#D97757', cursorAccent: '#1C1B1A',
        selectionBackground: 'rgba(217,119,87,0.30)',
        scrollbarSliderBackground: 'rgba(222,220,209,0.14)', scrollbarSliderHoverBackground: 'rgba(222,220,209,0.24)', scrollbarSliderActiveBackground: 'rgba(222,220,209,0.32)',
        black: '#2A2927', red: '#E5776F', green: '#7DBE8F', yellow: '#E0AE5E', blue: '#7FA8E0', magenta: '#C49AD9', cyan: '#71BFC9', white: '#D9D7CF',
        brightBlack: '#6E6C67', brightRed: '#EE968F', brightGreen: '#9BD0AA', brightYellow: '#E9C483', brightBlue: '#A0BFEA', brightMagenta: '#D5B6E5', brightCyan: '#97D1D8', brightWhite: '#F2F1EC',
      },
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    cleanups.push(() => term.dispose());
    const refit = () => {
      if (!el.offsetWidth || !el.offsetHeight) return;
      try { fit.fit(); } catch { return; }
      if (sid) window.elysium.resize(sid, term.cols, term.rows);
    };
    refit();

    cleanups.push(window.elysium.onData((id, data, end) => {
      if (id !== sid || end <= seen) return;
      const fresh = end - seen;
      term.write(fresh >= data.length ? data : data.slice(data.length - fresh));
      seen = end;
    }));
    const input = term.onData((d) => { if (sid) { focusedSession = sid; window.elysium.write(sid, d); } });
    const onFocus = () => { if (sid) focusedSession = sid; };
    term.textarea?.addEventListener('focus', onFocus);
    cleanups.push(() => term.textarea?.removeEventListener('focus', onFocus));
    cleanups.push(() => input.dispose());
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    cleanups.push(() => ro.disconnect());
    cleanups.push(() => { if (sid) registry.delete(sid); });

    const attach = (id: string) => {
      sid = id;
      registry.set(id, term);
      lastSession = id;
      refit();
    };

    void (async () => {
      if (props.params.pending && !sid) return;
      if (sid) {
        const r = await window.elysium.replay(sid);
        if (disposed) return;
        if (!r) { setGone(true); return; }
        term.write(r.data);
        seen = r.endOffset;
        attach(sid);
        return;
      }
      const r = await window.elysium.create(props.params.templateId, term.cols, term.rows);
      if (disposed) { if (r.ok) void window.elysium.kill(r.session.id); return; }
      if (!r.ok) { setError(r.reason); return; }
      attach(r.session.id);
      props.api.updateParameters({ ...props.params, sessionId: r.session.id });
      term.focus();
    })();

    const focusSub = props.api.onDidActiveChange((e) => { if (e.isActive) term.focus(); });
    cleanups.push(() => focusSub.dispose());

    return () => {
      disposed = true;
      for (const c of cleanups.reverse()) c();
      termRef.current = null;
    };
    // Re-run only for a new attempt; parameter updates from our own attach must not rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const startAgain = () => {
    setGone(false);
    setError(null);
    setPending(false);
    props.api.updateParameters({ templateId: props.params.templateId });
    setAttempt((a) => a + 1);
  };
  const isClaude = template?.kind === 'claude';
  const verb = isClaude ? `Resume ${template?.title ?? 'session'}` : `Start ${template?.title ?? 'shell'}`;

  const exited = session?.status === 'exited';
  return (
    <div className="term-panel">
      <div className="term" ref={host} />
      {(gone || error || pending) && (
        <div className="term-overlay">
          <div className="overlay-card">
            <strong>{error ? 'Could not start' : pending ? (template?.title ?? 'Terminal') : 'This session has ended'}</strong>
            <p>{error ?? (pending ? 'Saved in this layout, not started yet.' : 'It stopped when ElysiumProd last closed. Its scrollback is kept on disk.')}</p>
            {isClaude && !error && <p className="warn-text">{template?.confirm}</p>}
            <button className="btn primary" onClick={startAgain}><RotateCcw size={14} />{verb}</button>
          </div>
        </div>
      )}
      {exited && !gone && (
        <div className="term-exit">
          <span>Exited with code {session?.exitCode ?? '?'}</span>
          <button className="link-btn" onClick={startAgain}>Restart</button>
        </div>
      )}
    </div>
  );
}
