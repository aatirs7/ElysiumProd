// Dictate: a calm box to speak into. Windows voice typing writes the words here,
// you check them, and Enter types them into a session as if you had typed them.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowUp, Mic } from 'lucide-react';
import { useLive } from './live';
import { useWorkspace } from './store';
import { lastFocusedSession } from './TerminalPanel';

/** Types text into a session. Claude and other agents get it as one paste, so new lines do not send early. */
export function typeInto(sessionId: string, text: string, kind: string | undefined): void {
  if (kind === 'claude') window.elysium.readerAsk(sessionId, text);
  if (kind === 'shell') window.elysium.write(sessionId, text.replace(/\r?\n/g, ' '));
  else window.elysium.write(sessionId, `\x1b[200~${text}\x1b[201~`);
  setTimeout(() => window.elysium.write(sessionId, '\r'), 120);
}

export function DictatePanel(props: IDockviewPanelProps<{ target?: string; projectId?: string }>) {
  const { sessions, templates } = useLive();
  const { activeView, open } = useWorkspace();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const projectId = props.params.projectId ?? activeView?.projectId;

  // Running sessions, this project's first, then the one you last typed in.
  const running = useMemo(() => {
    const rows = sessions.filter((s) => s.status === 'running').map((s) => ({ s, t: templates.find((x) => x.id === s.templateId) }));
    const rank = (r: (typeof rows)[number]) => (r.t?.project === projectId ? (r.t?.kind === 'claude' ? 0 : 1) : r.s.id === lastFocusedSession() ? 2 : 3);
    return rows.sort((a, b) => rank(a) - rank(b));
  }, [sessions, templates, projectId]);
  const target = props.params.target ?? running[0]?.s.templateId ?? (projectId ? templates.find((t) => t.project === projectId && t.kind === 'claude')?.id : undefined);
  const targetTpl = templates.find((t) => t.id === target);
  const live = running.find((r) => r.s.templateId === target)?.s;

  // The helper that presses Win+H starts in the background, so the first press is quick too.
  useEffect(() => { window.elysium.dictate(true); }, []);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 3500); return () => clearTimeout(t); }, [note]);

  const listen = () => { box.current?.focus(); window.elysium.dictate(); };
  const send = () => {
    const v = text.trim();
    if (!v || !targetTpl) return;
    if (!live) {
      open({ kind: 'terminal', templateId: targetTpl.id, title: targetTpl.title });
      setNote(`Starting ${targetTpl.title}. Send again once it is ready.`);
      return;
    }
    typeInto(live.id, v, targetTpl.kind);
    setText('');
    if (box.current) box.current.style.height = 'auto';
    setNote(`Sent to ${targetTpl.title}`);
    box.current?.focus();
  };
  const choose = (id: string) => props.api.updateParameters({ ...props.params, target: id });
  const choices = [...running.map((r) => r.t).filter((t): t is NonNullable<typeof t> => Boolean(t)), ...(targetTpl && !live ? [targetTpl] : [])];

  return (
    <div className="dictate">
      <div className="dictate-inner">
        <div className="dictate-head">
          <span>Speak to</span>
          {choices.length ? (
            <select className="dictate-target" value={target} onChange={(e) => choose(e.target.value)} aria-label="Session to type into">
              {choices.map((t) => <option key={t.id} value={t.id}>{t.title}{t.projectName && t.project !== projectId ? `, ${t.projectName}` : ''}</option>)}
            </select>
          ) : <span className="dictate-none">no session is running</span>}
        </div>
        <div className="dictate-box">
          <button className="dictate-mic" onMouseDown={(e) => e.preventDefault()} onClick={listen} title="Speak (Windows voice typing, Win+H)" aria-label="Speak"><Mic size={18} /></button>
          <textarea ref={box} rows={2} value={text} aria-label="What to send"
            placeholder="Press the mic and talk. Check the words, then press Enter."
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(240, e.target.scrollHeight)}px`; }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              else if (e.key === 'Escape') { setText(''); }
            }} />
          <button className="chat-send" onClick={send} disabled={!text.trim() || !targetTpl} aria-label="Send"><ArrowUp size={17} /></button>
        </div>
        <div className="dictate-foot" role="status">{note ?? 'Shift+Enter for a new line. Esc clears.'}</div>
      </div>
    </div>
  );
}
