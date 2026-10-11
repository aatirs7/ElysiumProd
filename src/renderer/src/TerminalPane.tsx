import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import type { SessionInfo, TemplateInfo } from '@shared/ipc';

interface Props {
  template: TemplateInfo;
  /** Changes on every launch, so a restart builds a fresh terminal. */
  launchKey: number;
  onRestart(): void;
  onClose(): void;
}

export function TerminalPane({ template, launchKey, onRestart, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current!;
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
      theme: { background: '#0E1116', foreground: '#D6DAE1', cursor: '#6EA8FE', selectionBackground: '#2A3A55' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try {
      const gl = new WebglAddon();
      gl.onContextLoss(() => gl.dispose());
      term.loadAddon(gl);
    } catch {
      // Falls back to the DOM renderer; nothing else to do.
    }
    fit.fit();

    let sessionId: string | null = null;
    let disposed = false;
    const offData = window.elysium.onData((id, data) => { if (id === sessionId) term.write(data); });
    const offSession = window.elysium.onSession((s) => { if (s.id === sessionId) setSession(s); });
    const input = term.onData((d) => { if (sessionId) window.elysium.write(sessionId, d); });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { return; }
      if (sessionId) window.elysium.resize(sessionId, term.cols, term.rows);
    });
    ro.observe(el);

    window.__smoke = {
      launch: async () => sessionId,
      type: (d: string) => { if (sessionId) window.elysium.write(sessionId, d); },
      screen: () => {
        const b = term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '');
        return lines.join('\n');
      },
    };

    void window.elysium.create(template.id, term.cols, term.rows).then((r) => {
      if (disposed) { if (r.ok) void window.elysium.kill(r.session.id); return; }
      if (!r.ok) { setError(r.reason); return; }
      sessionId = r.session.id;
      setSession(r.session);
      term.focus();
    });

    return () => {
      disposed = true;
      ro.disconnect();
      input.dispose();
      offData();
      offSession();
      if (sessionId) void window.elysium.kill(sessionId);
      term.dispose();
    };
  }, [template.id, launchKey]);

  const status = error ? 'error' : session?.status ?? 'starting';
  const label = error ? 'could not start' : status === 'exited' ? `exited, code ${session?.exitCode ?? '?'}` : status;

  return (
    <section className="pane" aria-label={template.title}>
      <header className="pane-header">
        <div className="pane-title">
          <span className={`dot ${status}`} aria-hidden="true" />
          <span>{template.title}</span>
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>{label}</span>
        </div>
        <div className="pane-actions">
          <button className="btn small" onClick={onRestart} title="Restart this session">Restart</button>
          <button className="btn small" onClick={onClose} title="Stop this session and go back">Close</button>
        </div>
      </header>
      <div className="term" ref={host}>
        {error && <div className="error-line" style={{ textAlign: 'center' }}>{error}</div>}
      </div>
    </section>
  );
}
