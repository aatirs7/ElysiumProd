import { useEffect, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowLeft, ArrowRight, ExternalLink, House, Pin, PinOff, RefreshCw, SendHorizontal } from 'lucide-react';
import type { WebState } from '@shared/ipc';
import { lastFocusedSession } from './TerminalPanel';
import { useWorkspace } from './store';

/** How many overlays (menus, dialogs, the palette) are open; native views hide while any is. */
let overlays = 0;
export function overlayOpened() { overlays += 1; window.elysium.webHideAll(true); }
export function overlayClosed() { overlays = Math.max(0, overlays - 1); if (!overlays) window.elysium.webHideAll(false); }

export interface ClaudeParams { accountId?: string; projectId?: string }

/**
 * Claude pane: claude.ai beside the terminals, signed in on the account this pane
 * uses. Each account keeps its own sign in, so switching accounts never logs you out.
 * The page itself is a native view in the main process; this component reserves
 * its rectangle and keeps the view aligned with it every frame.
 */
export function ClaudePanel(props: IDockviewPanelProps<ClaudeParams>) {
  const { doc, activeView, setProjectChat } = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const id = props.api.id;
  const accountId = props.params.accountId ?? 'main';
  const [state, setState] = useState<WebState | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const accounts = doc.accounts;
  const projectId = props.params.projectId ?? activeView?.projectId;
  const projectName = activeView?.name ?? 'this project';
  // The chat this project opens to, pinned by the owner from the toolbar.
  const pinned = projectId ? doc.projectChats[projectId] : undefined;
  const isChat = Boolean(state?.url && /^https:\/\/claude\.ai\/(chat|project)\//.test(state.url));
  const onPinned = Boolean(pinned && state?.url?.split('?')[0] === pinned.url.split('?')[0]);
  const togglePin = () => {
    if (!projectId) return;
    if (onPinned) { setProjectChat(projectId, null); return; }
    if (state?.url && isChat) setProjectChat(projectId, { url: state.url.split('?')[0], title: (state.title || 'Chat').replace(/\s*-\s*Claude\s*$/, '') });
  };

  useEffect(() => window.elysium.onWebState((s) => { if (s.id === id) setState(s); }), [id]);

  useEffect(() => {
    window.elysium.webAttach(id, accountId, pinned?.url ?? null);
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
  }, [id, accountId, pinned?.url]);

  // Closing the pane ends its page; moving it or switching views does not.
  useEffect(() => {
    const d = props.containerApi.onDidRemovePanel((p) => { if (p.id === id) window.elysium.webDetach(id); });
    return () => d.dispose();
  }, [props.containerApi, id]);

  const send = async () => {
    const text = (await window.elysium.readClipboard()).trim();
    const sid = lastFocusedSession();
    if (!text) { setSent('Copy something in the chat first'); return; }
    if (!sid) { setSent('Click into a terminal first'); return; }
    // Bracketed paste: the terminal receives it as one pasted block, not keystrokes.
    window.elysium.write(sid, `\x1b[200~${text}\x1b[201~`);
    setSent('Sent to the terminal');
  };
  useEffect(() => { if (!sent) return; const t = setTimeout(() => setSent(null), 3000); return () => clearTimeout(t); }, [sent]);

  const label = (aid: string) => accounts[aid]?.label ?? (aid === 'main' ? 'Main account' : aid);

  return (
    <div className="web-panel">
      <div className="glass-toolbar">
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'back')} title="Back" aria-label="Back"><ArrowLeft size={15} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'forward')} title="Forward" aria-label="Forward"><ArrowRight size={15} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'reload')} title="Reload" aria-label="Reload"><RefreshCw size={15} className={state?.loading ? 'spin' : ''} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'home')} title={pinned ? `Back to ${pinned.title}` : 'New chat'} aria-label={pinned ? 'Back to the pinned chat' : 'New chat'}><House size={15} /></button>
        {projectId && (
          <button className={`ghost-btn ${onPinned ? 'pinned' : ''}`} onClick={togglePin} disabled={!onPinned && !isChat}
            title={onPinned ? `${projectName} opens this chat. Click to unpin.` : isChat ? `Open this chat every time you open ${projectName}` : 'Open a chat first, then pin it'}>
            {onPinned ? <Pin size={14} /> : <PinOff size={14} />}{onPinned ? 'Pinned' : 'Pin chat'}
          </button>
        )}
        <select className="picker" value={accountId} onChange={(e) => props.api.updateParameters({ ...props.params, accountId: e.target.value })} title="Claude account for this pane">
          {Object.keys(accounts).map((a) => <option key={a} value={a}>{label(a)}</option>)}
        </select>
        <span className="spacer" />
        {sent && <span className="muted small">{sent}</span>}
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'external')} title="Open in your browser" aria-label="Open in your browser"><ExternalLink size={15} /></button>
        <button className="ghost-btn" onClick={() => void send()} title="Paste what you copied into the last terminal you used, without pressing Enter">
          <SendHorizontal size={14} />Send to terminal
        </button>
      </div>
      <div className="web-host" ref={host}>
        <div className="empty-state">
          {state?.error ? <>Could not load claude.ai: {state.error}<button className="btn" onClick={() => window.elysium.webNav(id, 'reload')}>Try again</button></> : 'Loading claude.ai'}
        </div>
      </div>
    </div>
  );
}
