// A web page inside a project: its admin page, team board, App Store Connect.
// Each project has one saved sign in shared by all its site panes, kept across
// restarts. Same native view as the Claude pane, with an address bar.
import { useEffect, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowLeft, ArrowRight, ExternalLink, House, RefreshCw } from 'lucide-react';
import type { WebState } from '@shared/ipc';
import { clearOfFloats } from './ClaudePanel';
import { useWorkspace } from './store';

export interface SiteParams { url: string; projectId?: string; title?: string }

export function SitePanel(props: IDockviewPanelProps<SiteParams>) {
  const { activeView } = useWorkspace();
  const host = useRef<HTMLDivElement>(null);
  const id = props.api.id;
  const site = props.params.projectId ?? activeView?.projectId ?? 'shared';
  const [state, setState] = useState<WebState | null>(null);
  const [address, setAddress] = useState(props.params.url);
  const [editing, setEditing] = useState(false);

  useEffect(() => window.elysium.onWebState((s) => {
    if (s.id !== id) return;
    setState(s);
    if (!editing) setAddress(s.url);
    // The tab follows the page's own title.
    if (s.title && !s.loading) props.api.setTitle(s.title.length > 32 ? `${s.title.slice(0, 31)}…` : s.title);
  }), [id, editing, props.api]);

  useEffect(() => {
    window.elysium.webAttach(id, 'main', props.params.url, site);
    let last = '';
    let raf = 0;
    const tick = () => {
      const el = host.current;
      if (el) {
        const r = clearOfFloats(el);
        const visible = el.offsetParent !== null && r.width > 0 && r.height > 0;
        const key = `${r.x}|${r.y}|${r.width}|${r.height}|${visible}`;
        if (key !== last) { last = key; window.elysium.webBounds(id, { x: r.x, y: r.y, width: r.width, height: r.height }, visible); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.elysium.webBounds(id, { x: 0, y: 0, width: 0, height: 0 }, false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, site]);

  useEffect(() => {
    const d = props.containerApi.onDidRemovePanel((p) => { if (p.id === id) window.elysium.webDetach(id); });
    return () => d.dispose();
  }, [props.containerApi, id]);

  const host_ = (() => { try { return new URL(state?.url ?? props.params.url).hostname; } catch { return ''; } })();
  return (
    <div className="web-panel">
      <div className="glass-toolbar">
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'back')} title="Back" aria-label="Back"><ArrowLeft size={15} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'forward')} title="Forward" aria-label="Forward"><ArrowRight size={15} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'reload')} title="Reload" aria-label="Reload"><RefreshCw size={15} className={state?.loading ? 'spin' : ''} /></button>
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'home')} title="Back to where this pane started" aria-label="Start page"><House size={15} /></button>
        <input className="address" value={editing ? address : (editing ? address : host_ ? address : props.params.url)} spellCheck={false}
          onFocus={(e) => { setEditing(true); e.target.select(); }} onBlur={() => setEditing(false)}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { window.elysium.webGo(id, address.trim()); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
          aria-label="Address" />
        <button className="ghost-icon" onClick={() => window.elysium.webNav(id, 'external')} title="Open in your browser" aria-label="Open in your browser"><ExternalLink size={15} /></button>
      </div>
      <div className="web-host" ref={host}>
        <div className="empty-state">
          {state?.error ? <>Could not load {host_}: {state.error}<button className="btn" onClick={() => window.elysium.webNav(id, 'reload')}>Try again</button></> : `Loading ${host_}`}
        </div>
      </div>
    </div>
  );
}
