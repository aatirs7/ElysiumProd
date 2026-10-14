// Home's command box: one line to run every project. "Tell Elysium Intern to fix
// the login", "start Gulf and Attestia", "wrap up SecurITPosture", "compact Prime
// Posture". The mic opens Windows voice typing, which types into the box.
import { useRef, useState } from 'react';
import { ArrowUp, Check, Loader2, Mic, TriangleAlert } from 'lucide-react';
import type { CommandResult } from '@shared/ipc';

const EXAMPLES = ['Tell Elysium Intern to check the failing deploy', 'Start Gulf', 'Wrap up Attestia', 'Compact Prime Posture'];

export function CommandBox({ onOpenProject }: { onOpenProject(id: string): void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [hint] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  const input = useRef<HTMLTextAreaElement>(null);

  const run = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setResult(null);
    const r = await window.elysium.runCommand(t);
    setBusy(false);
    setResult(r);
    if (r.ok) setText('');
    if (r.open) onOpenProject(r.open);
  };
  const dictate = () => { input.current?.focus(); setTimeout(() => window.elysium.dictate(), 120); };

  return (
    <div className="cmd">
      <div className={`cmd-box ${busy ? 'busy' : ''}`}>
        <textarea ref={input} className="cmd-input" rows={1} value={text} placeholder="Tell any project what to do"
          onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void run(); } }} aria-label="Tell a project what to do" />
        <button className="cmd-icon" onClick={dictate} title="Dictate with Windows voice typing (Win+H)" aria-label="Dictate"><Mic size={17} /></button>
        <button className="cmd-send" onClick={() => void run()} disabled={!text.trim() || busy} aria-label="Run">
          {busy ? <Loader2 size={17} className="spin" /> : <ArrowUp size={17} />}
        </button>
      </div>
      {!result && !text && <div className="cmd-hint">For example: {hint}</div>}
      {result && (
        <div className={`cmd-result ${result.ok ? 'ok' : 'bad'}`} role="status">
          {result.say && <div className="cmd-say">{result.say}</div>}
          {result.steps.map((s, i) => (
            <div key={i} className="cmd-step">{s.ok ? <Check size={14} /> : <TriangleAlert size={14} />}<span>{s.label}{s.reason && !s.ok ? `: ${s.reason}` : ''}</span></div>
          ))}
          {!result.steps.length && !result.say && <div className="cmd-say">Nothing happened.</div>}
          {result.via === 'sonnet' && <div className="cmd-via">Read by Sonnet 5.5</div>}
        </div>
      )}
    </div>
  );
}
