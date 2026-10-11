import { useEffect, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowLeft, ArrowRight, House, RefreshCw, SendHorizontal } from 'lucide-react';
import { lastFocusedSession } from './TerminalPanel';

/** How many overlays (menus, dialogs, the palette) are open; native views hide while any is. */
let overlays = 0;
export function overlayOpened() { overlays += 1; window.elysium.webHideAll(true); }
export function overlayClosed() { overlays = Math.max(0, overlays - 1); if (!overlays) window.elysium.webHideAll(false); }

/**
 * Claude pane: claude.ai, your planning chat, beside the terminals. The page
 * itself is a native view owned by the main process; this component only
 * reserves its rectangle and keeps the view aligned with it every frame.
 */
export function ClaudePanel(props: IDockviewPanelProps) {
  const host = useRef<HTMLDivElement>(null);
  const id = props.api.id;
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    window.elysium.webAttach(id);
    let last = '';
    let raf = 0;
    const tick = () => {
      const el = host.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const visible = el.offsetParent !== null && r.width > 0 && r.height > 0;
        const key = `${r.x}|${r.y}|${r.width}|${r.height}|${visible}`;
        if (key !== last) { last = key; window.elysium.webBounds(id, { x: r.x, y: r.y, width: r.width, height: r.height }, visible); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.elysium.webBounds(id, { x: 0, y: 0, width: 0, height: 0 }, false); };
  }, [id]);

  // Closing the pane ends its page; moving it or switching views does not.
  useEffect(() => {
    const d = props.containerApi.onDidRemovePanel((p) => { if (p.id === id) window.elysium.webDetach(id); });
    return () => d.dispose();
  }, [props.containerApi, id]);

  const send = async () => {
    const text = (await window.elysium.readClipboard()).trim();
    const sid = lastFocusedSession();
    if (!text) { setSent('Copy something in the chat first'); return; }
    if (!sid) { setSent('Click into a terminal first, then send'); return; }
    // Bracketed paste: the terminal receives it as one pasted block, not keystrokes.
    window.elysium.write(sid, `\x1b[200~${text}\x1b[201~`);
    setSent(`Sent ${text.length} characters to the terminal`);
  };
  useEffect(() => { if (!sent) return; const t = setTimeout(() => setSent(null), 3500); return () => clearTimeout(t); }, [sent]);

  return (
    <div className="web-panel">
      <div className="glass-toolbar">
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'back')} title="Back" aria-label="Back"><ArrowLeft size={14} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'forward')} title="Forward" aria-label="Forward"><ArrowRight size={14} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'reload')} title="Reload" aria-label="Reload"><RefreshCw size={14} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'home')} title="New chat" aria-label="New chat"><House size={14} /></button>
        <span className="spacer" />
        {sent && <span className="muted small">{sent}</span>}
        <button className="ghost-btn" onClick={() => void send()} title="Paste what you copied into the last terminal you used, without pressing Enter">
          <SendHorizontal size={14} />Send to terminal
        </button>
      </div>
      <div className="web-host" ref={host}>
        <div className="empty-state">Loading claude.ai</div>
      </div>
    </div>
  );
}
