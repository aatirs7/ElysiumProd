// A Claude Code session shown as a chat: messages, the tools it used, live text as
// it types, and a composer. It is a real session underneath (see main/chat.ts).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowUp, ArrowUpRight, ChevronRight, Image as ImageIcon, Lightbulb, Loader2, Paperclip, RotateCcw, SendHorizontal, Square, TriangleAlert, X } from 'lucide-react';
import type { ChatMessage, ChatState } from '@shared/ipc';
import { md, onLinkClick } from './project-widgets';
import { useLive } from './live';
import { CHECKS, TOOL_INFO } from '../tools';
import { MicButton, withPhrase } from '../Mic';

/** Pictures from a paste, a drop or the file picker, as data: URLs. */
export function readPictures(files: Iterable<File>): Promise<string[]> {
  const pics = [...files].filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type) && f.size < 10_000_000).slice(0, 8);
  return Promise.all(pics.map((f) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ok(''); r.readAsDataURL(f); }))).then((x) => x.filter(Boolean));
}

const PLAN_STARTERS = ['What should we build next, and why?', 'How should we price this?', 'Write a launch plan for the next month', 'What is the riskiest thing right now?'];
const TASK_MARK = /Task for the builder:\s*([\s\S]+)$/i;

export function ChatPanel(props: IDockviewPanelProps<{ chatId: string; projectId: string }>) {
  const { chatId, projectId } = props.params;
  const { projects } = useLive();
  const [state, setState] = useState<ChatState | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [pics, setPics] = useState<string[]>([]);
  const stick = useRef(true);
  const addPics = async (files: Iterable<File>) => { const p = await readPictures(files); if (p.length) setPics((x) => [...x, ...p].slice(0, 8)); };
  const tool = chatId.startsWith('tool:') ? TOOL_INFO[projectId] : undefined;
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    let on = true;
    void window.elysium.chatGet(chatId).then((s) => { if (on) setState(s); });
    const off = window.elysium.onChat((e) => { if (e.chatId === chatId) setState(e.state); });
    // Others (a quick check in the sidebar, a dashboard request) can hand this chat a message.
    const ask = (e: Event) => { const d = (e as CustomEvent<{ chatId: string; text: string }>).detail; if (d.chatId === chatId) void send(d.text); };
    window.addEventListener('ep:chat-send', ask);
    return () => { on = false; off(); window.removeEventListener('ep:chat-send', ask); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useLayoutEffect(() => { const el = list.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [state]);

  const send = async (t: string, withPics = false) => {
    const v = t.trim();
    const p = withPics ? pics : [];
    if (!v && !p.length) return;
    stick.current = true;
    const r = await window.elysium.chatSend(chatId, v, p);
    if (r.ok) { setText(''); if (withPics) setPics([]); setNote(null); if (box.current) box.current.style.height = 'auto'; } else setNote(r.reason);
  };
  const running = Boolean(state?.running);
  const messages = state?.messages ?? [];
  const lastClaude = messages.map((m) => m.role).lastIndexOf('claude');
  const title = tool ? tool.title : `Plan ${project?.name ?? ''}`.trim();

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-title">{tool ? <tool.icon size={15} /> : <Lightbulb size={15} />}{title}</span>
        {running && <span className="chat-live"><span className="dot working" />Working</span>}
        <span className="spacer" />
        {messages.length > 0 && <button className="ghost-icon" title="Start a new conversation" aria-label="New conversation" onClick={() => void window.elysium.chatReset(chatId)}><RotateCcw size={14} /></button>}
      </div>

      <div className="chat-list" ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} onClick={onLinkClick}>
        {!messages.length && (
          <div className="chat-empty">
            <span className="chat-empty-icon">{tool ? <tool.icon size={26} /> : <Lightbulb size={26} />}</span>
            <h2>{tool ? tool.title : `Plan ${project?.name ?? 'this project'}`}</h2>
            <p className="chat-empty-lede">{tool ? tool.tagline : 'Think it through here; the coding sessions do the building.'}</p>
            <p className="chat-empty-about">{tool ? tool.about : 'This chat reads the project, its recent commits, open tasks and what the coding sessions said lately, fresh with every message. It never edits code. When you settle on something, it writes a task you can send to the builder in one click.'}</p>
            <div className="chat-starters">
              {(tool ? tool.examples : PLAN_STARTERS).map((x) => <button key={x} className="tool-example" onClick={() => void send(x)}>{x}<ArrowUpRight size={13} /></button>)}
            </div>
            {projectId === 'laptop' && (
              <div className="tool-checks" style={{ marginTop: '1.4rem' }}>
                {CHECKS.map((c, i) => (
                  <button key={c.id} className="tool-check" style={{ animationDelay: `${i * 40}ms` }} onClick={() => void send(c.prompt)}>
                    <span className="tool-check-icon"><c.icon size={17} /></span>
                    <span className="tool-check-text"><strong>{c.title}</strong><span>{c.blurb}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => <Message key={m.id} m={m} live={running && i === lastClaude} projectId={projectId} plan={chatId.startsWith('plan:')} onNote={setNote} />)}
        {state?.error && (state.error.startsWith('LOGIN:')
          ? <div className="chat-error"><TriangleAlert size={14} />{state.error.slice(6).trim()} <button className="btn small primary" onClick={() => void window.elysium.connect('claude', 'signin')}>Sign in</button></div>
          : <div className="chat-error"><TriangleAlert size={14} />{state.error}</div>)}
      </div>

      <form className={`chat-compose ${pics.length ? 'has-pics' : ''}`} onSubmit={(e) => { e.preventDefault(); void send(text, true); }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void addPics(e.dataTransfer.files); } }}>
        {pics.length > 0 && (
          <div className="compose-pics">
            {pics.map((p, i) => (
              <span key={i} className="compose-pic"><img src={p} alt={`Picture ${i + 1}`} />
                <button type="button" onClick={() => setPics((x) => x.filter((_, j) => j !== i))} aria-label="Remove picture"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="compose-row">
          <button type="button" className="mic-btn" onClick={() => picker.current?.click()} title="Attach a picture (or paste one)" aria-label="Attach a picture"><Paperclip size={17} /></button>
          <input ref={picker} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { if (e.target.files) void addPics(e.target.files); e.target.value = ''; }} />
          <textarea ref={box} rows={1} value={text} placeholder={running ? 'Send another. It waits its turn.' : tool ? `Ask ${tool.title}…` : 'Think out loud…'} aria-label="Message"
            onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.some((x) => x.type.startsWith('image/'))) { e.preventDefault(); void addPics(f); } }}
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(220, e.target.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text, true); } }} />
          <MicButton onText={(t) => { setText((x) => withPhrase(x, t)); box.current?.focus(); }} />
          {running && !text.trim() && !pics.length
            ? <button type="button" className="chat-send stop" onClick={() => window.elysium.chatStop(chatId)} aria-label="Stop"><Square size={13} /></button>
            : <button type="submit" className="chat-send" disabled={!text.trim() && !pics.length} aria-label="Send"><ArrowUp size={17} /></button>}
        </div>
      </form>
      {note && <div className="chat-note" role="status">{note}</div>}
    </div>
  );
}

function Message({ m, live, projectId, plan, onNote }: { m: ChatMessage; live: boolean; projectId: string; plan: boolean; onNote(t: string): void }) {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => (m.role === 'claude' && m.text ? md(m.text) : ''), [m.role, m.text]);
  if (m.role === 'you') return <div className={`msg you ${m.queued ? 'queued' : ''}`}><div className="msg-bubble">{m.images?.length ? <span className="msg-pics"><ImageIcon size={13} />{m.images.length === 1 ? 'A picture' : `${m.images.length} pictures`}</span> : null}{m.text}{m.queued && <span className="msg-queued">Waiting its turn</span>}</div></div>;
  const task = plan && !live ? m.text.match(TASK_MARK)?.[1]?.trim() : undefined;
  return (
    <div className="msg claude">
      {m.steps.length > 0 && (
        <div className="msg-steps">
          <button className="msg-steps-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : undefined }} />
            {live ? m.steps[m.steps.length - 1].label : `Used ${m.steps.length} tool${m.steps.length > 1 ? 's' : ''}`}
          </button>
          {open && <ol>{m.steps.map((s, i) => <li key={i}>{s.label}</li>)}</ol>}
        </div>
      )}
      {html ? <div className={`msg-text md ${live ? 'typing' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
        : live ? <div className="msg-thinking"><Loader2 size={14} className="spin" />Thinking</div> : null}
      {task && (
        <button className="msg-task" onClick={async () => { const r = await window.elysium.quickRun(projectId, task); onNote(r.ok ? 'Sent to the builder. You get a notification when it is done.' : r.reason ?? 'Could not send it.'); }}>
          <SendHorizontal size={14} />Send this task to the builder
        </button>
      )}
    </div>
  );
}
