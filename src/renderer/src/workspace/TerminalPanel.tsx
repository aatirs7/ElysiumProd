import { useEffect, useRef, useState } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { IDockviewPanelProps } from 'dockview-react';
import { BookOpenText, RotateCcw, SendHorizontal, SquareTerminal } from 'lucide-react';
import type { ReaderEntry } from '@shared/ipc';
import { useWorkspace } from './store';
import { useLive } from './live';
import { md, onLinkClick } from './project-widgets';

export interface TerminalParams {
  templateId: string;
  sessionId?: string;
  /** Restored from a preset: waits for the owner to press Start, never starts itself. */
  pending?: boolean;
  /** Show the Reader page instead of the raw terminal. */
  reader?: boolean;
}

const MONO = '"Cascadia Mono", "Cascadia Code", Consolas, monospace';
const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * Terminal colours. Soft is a warm dark with less contrast than white on black.
 * Paper is light and calm, like a Notion page: ink on warm paper, with ANSI
 * colours darkened so they read on a light background.
 */
function termTheme(style: 'soft' | 'paper' | 'theme'): ITheme & { panel: string } {
  if (style === 'paper') return {
    panel: '#FBFAF7', background: '#FBFAF7', foreground: '#37352F', cursor: '#37352F', cursorAccent: '#FBFAF7', selectionBackground: 'rgba(35,131,226,0.18)',
    scrollbarSliderBackground: 'rgba(55,53,47,0.16)', scrollbarSliderHoverBackground: 'rgba(55,53,47,0.26)', scrollbarSliderActiveBackground: 'rgba(55,53,47,0.34)',
    black: '#37352F', red: '#C4554D', green: '#448361', yellow: '#9F6B12', blue: '#337EA9', magenta: '#9065B0', cyan: '#2C7A7B', white: '#787774',
    brightBlack: '#9B9A97', brightRed: '#D44C47', brightGreen: '#4E9A6A', brightYellow: '#B07A10', brightBlue: '#2383E2', brightMagenta: '#A35CB8', brightCyan: '#2A8C8C', brightWhite: '#37352F',
  };
  if (style === 'theme') {
    const bg = cssVar('--term', '#1C1B1A');
    return {
      panel: bg, background: bg, foreground: cssVar('--term-fg', '#ECEAE3'), cursor: cssVar('--accent', '#D97757'), cursorAccent: bg, selectionBackground: 'rgba(217,119,87,0.30)',
      scrollbarSliderBackground: 'rgba(222,220,209,0.14)', scrollbarSliderHoverBackground: 'rgba(222,220,209,0.24)', scrollbarSliderActiveBackground: 'rgba(222,220,209,0.32)',
      black: '#2A2927', red: '#E5776F', green: '#7DBE8F', yellow: '#E0AE5E', blue: '#7FA8E0', magenta: '#C49AD9', cyan: '#71BFC9', white: '#D9D7CF',
      brightBlack: '#6E6C67', brightRed: '#EE968F', brightGreen: '#9BD0AA', brightYellow: '#E9C483', brightBlue: '#A0BFEA', brightMagenta: '#D5B6E5', brightCyan: '#97D1D8', brightWhite: '#F2F1EC',
    };
  }
  return {
    panel: '#262523', background: '#262523', foreground: '#D3CFC6', cursor: '#D97757', cursorAccent: '#262523', selectionBackground: 'rgba(217,119,87,0.26)',
    scrollbarSliderBackground: 'rgba(222,220,209,0.12)', scrollbarSliderHoverBackground: 'rgba(222,220,209,0.22)', scrollbarSliderActiveBackground: 'rgba(222,220,209,0.3)',
    black: '#3A3936', red: '#D98A82', green: '#94BFA0', yellow: '#D6B37A', blue: '#93AFD6', magenta: '#BFA2D1', cyan: '#8EBFC4', white: '#BDB9B0',
    brightBlack: '#86837C', brightRed: '#E2A099', brightGreen: '#A9CDB3', brightYellow: '#DEC292', brightBlue: '#A9C0E0', brightMagenta: '#CDB5DB', brightCyan: '#A4CCD0', brightWhite: '#E6E2D9',
  };
}

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
  const { doc, accountFor } = useWorkspace();
  const { sessions, templates } = useLive();
  const template = templates.find((t) => t.id === props.params.templateId);
  const [pending, setPending] = useState(Boolean(props.params.pending));
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowRes, setLowRes] = useState(false);
  const overrideRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const sessionId = props.params.sessionId;
  const session = sessions.find((s) => s.id === sessionId);
  const isClaude = template?.kind === 'claude';
  const isClaudeRef = useRef(isClaude);
  isClaudeRef.current = isClaude;
  const reader = Boolean(props.params.reader) && isClaude;
  const theme = termTheme(doc.settings.termStyle ?? 'soft');

  useEffect(() => {
    const t = termRef.current;
    if (!t) return;
    t.options.fontSize = doc.settings.termFontSize;
    t.options.theme = termTheme(doc.settings.termStyle ?? 'soft');
  }, [doc.settings.termFontSize, doc.settings.termStyle, doc.settings.theme]);

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
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      theme: termTheme(doc.settings.termStyle ?? 'soft'),
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
    // Ctrl+V: a picture on the clipboard goes to Claude Code as its own image paste (Alt+V);
    // text pastes as usual, through xterm so bracketed paste is kept.
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown' || !ev.ctrlKey || ev.altKey || ev.shiftKey || ev.metaKey || ev.key.toLowerCase() !== 'v') return true;
      if (!isClaudeRef.current) return true;
      ev.preventDefault();
      void (async () => {
        if (!sid) return;
        if (await window.elysium.clipboardHasImage()) { focusedSession = sid; window.elysium.write(sid, '\x1bv'); return; }
        const text = await window.elysium.readClipboard();
        if (text) term.paste(text);
      })();
      return false;
    });
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
        if (!r) {
          // After a restart the same session may be running again under a new id: connect to it.
          const again = (await window.elysium.sessions()).find((x) => x.templateId === props.params.templateId && x.status === 'running');
          if (disposed) return;
          if (again && templates.find((x) => x.id === props.params.templateId)?.kind === 'claude') {
            props.api.updateParameters({ ...props.params, sessionId: again.id });
            setAttempt((a) => a + 1);
            return;
          }
          setGone(true);
          return;
        }
        term.write(r.data);
        seen = r.endOffset;
        attach(sid);
        return;
      }
      // The project's account: terminals and the Claude pane of a project always share it.
      const tpl = templates.find((x) => x.id === props.params.templateId);
      const override = overrideRef.current;
      overrideRef.current = false;
      const r = await window.elysium.create(props.params.templateId, term.cols, term.rows, { accountId: accountFor(tpl?.project), override });
      if (disposed) { if (r.ok) void window.elysium.kill(r.session.id); return; }
      if (!r.ok) {
        // Already running (a pane from before, or the quick bar started it): connect to it instead.
        const running = (await window.elysium.sessions()).find((x) => x.templateId === props.params.templateId && x.status === 'running');
        if (running && /already running/i.test(r.reason ?? '')) {
          props.api.updateParameters({ templateId: props.params.templateId, sessionId: running.id });
          setAttempt((a) => a + 1);
          return;
        }
        setError(r.reason);
        setLowRes(Boolean(r.lowResources));
        return;
      }
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

  // Back from the Reader, the terminal needs to measure itself again.
  useEffect(() => { if (!reader) setTimeout(() => { termRef.current?.focus(); window.dispatchEvent(new Event('resize')); }, 30); }, [reader]);

  const startAgain = () => {
    setGone(false);
    setError(null);
    setLowRes(false);
    setPending(false);
    const keep = props.params as { tint?: string; reader?: boolean };
    props.api.updateParameters({ templateId: props.params.templateId, ...(keep.tint ? { tint: keep.tint } : {}), ...(keep.reader ? { reader: true } : {}) });
    setAttempt((a) => a + 1);
  };

  // Opening a project asks its sessions to be running: a pane that has ended or was never started starts now.
  const startRef = useRef(startAgain);
  startRef.current = startAgain;
  const idleRef = useRef(false);
  idleRef.current = gone || pending || Boolean(error) || session?.status === 'exited';
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === props.params.templateId && idleRef.current) startRef.current(); };
    window.addEventListener('ep:ensure-session', on);
    return () => window.removeEventListener('ep:ensure-session', on);
  }, [props.params.templateId]);
  const setReader = (on: boolean) => props.api.updateParameters({ ...props.params, reader: on });
  const verb = `Start ${template?.title ?? (isClaude ? 'session' : 'shell')}`;

  const exited = session?.status === 'exited';
  return (
    <div className={`term-panel ${doc.settings.termStyle === 'paper' ? 'paper' : ''}`} style={{ background: theme.panel }}>
      {isClaude && (
        <div className="term-mode">
          <div className="seg">
            <button className={!reader ? 'on' : ''} onClick={() => setReader(false)} title="The live terminal"><SquareTerminal size={13} /> Terminal</button>
            <button className={reader ? 'on' : ''} onClick={() => setReader(true)} title="The conversation as a readable page"><BookOpenText size={13} /> Reader</button>
          </div>
        </div>
      )}
      <div className="term" ref={host} style={{ display: reader ? 'none' : 'block' }} />
      {reader && sessionId && <ReaderView sessionId={sessionId} title={template?.title ?? 'Claude'} />}
      {reader && !sessionId && <div className="empty-state">Start the session to read it here.</div>}
      {(gone || error || pending) && (
        <div className="term-overlay">
          <div className="overlay-card">
            <strong>{error ? 'Could not start' : pending ? (template?.title ?? 'Terminal') : 'This session has ended'}</strong>
            <p>{error ?? (pending ? 'Saved in this layout, not started yet.' : 'It stopped when ElysiumProd last closed. Its scrollback is kept on disk.')}</p>
            <div className="row-gap">
              {lowRes ? <button className="btn primary" onClick={() => { overrideRef.current = true; startAgain(); }}><RotateCcw size={14} />Start anyway</button>
                : <button className="btn primary" onClick={startAgain}><RotateCcw size={14} />{verb}</button>}
            </div>
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

/**
 * The Reader: the conversation as a calm page, like Notion. Your prompts as quiet
 * quotes, Claude's replies as formatted text, and a reply box. Built from what
 * Claude Code reports at the end of each turn; kept in memory only.
 */
function ReaderView({ sessionId, title }: { sessionId: string; title: string }) {
  const { telemetry } = useLive();
  const [entries, setEntries] = useState<ReaderEntry[]>([]);
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const state = telemetry[sessionId]?.state;

  useEffect(() => {
    let live = true;
    void window.elysium.reader(sessionId).then((e) => { if (live) setEntries(e); });
    const off = window.elysium.onReader((id, e) => { if (id === sessionId) setEntries((x) => [...x, e].slice(-60)); });
    return () => { live = false; off(); };
  }, [sessionId]);

  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [entries.length, state]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    window.elysium.write(sessionId, `\x1b[200~${text}\x1b[201~`);
    setTimeout(() => window.elysium.write(sessionId, '\r'), 120);
    setDraft('');
  };

  return (
    <div className="reader">
      <div className="reader-scroll" ref={scroller} onClick={onLinkClick}>
        <div className="reader-page">
          <h1 className="reader-title">{title}</h1>
          {!entries.length && <p className="reader-empty">Replies appear here as the session works. Anything from before ElysiumProd opened it is in the Terminal view.</p>}
          {entries.map((e, i) => e.role === 'you'
            ? <blockquote key={i} className="reader-you">{e.text}</blockquote>
            : <article key={i} className="reader-claude" dangerouslySetInnerHTML={{ __html: md(e.text) }} />)}
          {state === 'busy' && <div className="reader-working"><span className="dot busy" /> Working</div>}
          {state === 'waiting' && <div className="reader-working warn"><span className="dot waiting" /> Waiting for you in the Terminal view</div>}
        </div>
      </div>
      <div className="reader-compose">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Reply to ${title}`} rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="send-btn" onClick={send} disabled={!draft.trim()} aria-label="Send"><SendHorizontal size={16} /></button>
      </div>
    </div>
  );
}
