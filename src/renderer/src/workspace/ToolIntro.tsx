// A tool's front page: what it is for, what to ask, and (for the PC Helper) one click checks.
import { useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowUpRight, SendHorizontal } from 'lucide-react';
import { CHECKS, TOOL_INFO } from '../tools';

export function ToolIntro(props: IDockviewPanelProps<{ projectId: string }>) {
  const id = props.params.projectId;
  const info = TOOL_INFO[id];
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  if (!info) return null;
  const send = async (t: string) => {
    const r = await window.elysium.chatSend(`tool:${id}`, t);
    setNote(r.ok ? 'Sent. The reply shows in the session beside this and as a notification.' : r.reason ?? 'Could not send it.');
    if (r.ok) setText('');
  };
  return (
    <div className="tool-intro">
      <div className="tool-hero">
        <span className="tool-hero-icon"><info.icon size={26} /></span>
        <h2>{info.title}</h2>
        <p className="tool-tagline">{info.tagline}</p>
        <p className="tool-about">{info.about}</p>
      </div>
      <form className="tool-ask" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(text.trim()); }}>
        <input className="text-input" placeholder={`Ask ${info.title}…`} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!text.trim()} aria-label="Send"><SendHorizontal size={15} /></button>
      </form>
      <div className="tool-examples">
        {info.examples.map((x) => <button key={x} className="tool-example" onClick={() => void send(x)}>{x}<ArrowUpRight size={13} /></button>)}
      </div>
      {id === 'laptop' && (
        <>
          <div className="section-title" style={{ marginTop: '1.4rem' }}>One click checks</div>
          <div className="tool-checks">
            {CHECKS.map((c, i) => (
              <button key={c.id} className="tool-check" style={{ animationDelay: `${i * 40}ms` }} onClick={() => void send(c.prompt)}>
                <span className="tool-check-icon"><c.icon size={17} /></span>
                <span className="tool-check-text"><strong>{c.title}</strong><span>{c.blurb}</span></span>
              </button>
            ))}
          </div>
        </>
      )}
      {note && <p className="tool-note" role="status">{note}</p>}
    </div>
  );
}
