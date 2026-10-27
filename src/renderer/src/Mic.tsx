// The mic button beside every send button. Windows speech recognition listens
// inside the app (no Windows panel); each finished phrase is handed to onText.
// One button listens at a time; pressing it again, or a long pause, stops it.
import { useEffect, useId, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import type { DictateEvent } from '@shared/ipc';

type Owner = { id: string; text(t: string): void; state(s: 'idle' | 'listening', err?: DictateEvent): void };
let owner: Owner | null = null;
let warmed = false;
let subscribed = false;

function listen() {
  if (subscribed) return;
  subscribed = true;
  window.elysium.onDictate((e) => {
    const o = owner;
    if (!o) return;
    if (e.t === 'listening') o.state('listening');
    else if (e.t === 'text' && e.text) o.text(e.text);
    else if (e.t === 'error') { o.state('idle', e); owner = null; }
    else if (e.t === 'idle') { o.state('idle'); owner = null; }
  });
}

/** Adds a spoken phrase to what is already typed, with a space between. */
export const withPhrase = (have: string, phrase: string) => (have && !/\s$/.test(have) ? `${have} ${phrase}` : `${have}${phrase}`);

export function MicButton({ onText, className = 'mic-btn', size = 17 }: { onText(text: string): void; className?: string; size?: number }) {
  const id = useId();
  const [state, setState] = useState<'idle' | 'starting' | 'listening'>('idle');
  const [err, setErr] = useState<DictateEvent | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    listen();
    if (!warmed) { warmed = true; window.elysium.dictate('warm'); }
    // Unmounted while listening: stop, so nothing types into a box that is gone.
    return () => { if (owner?.id === id) { owner = null; window.elysium.dictate('stop'); } };
  }, [id]);
  useEffect(() => { if (!err) return; const t = setTimeout(() => setErr(null), 12000); return () => clearTimeout(t); }, [err]);

  const toggle = () => {
    if (owner?.id === id) { window.elysium.dictate('stop'); return; }
    if (owner) { owner.state('idle'); window.elysium.dictate('stop'); }
    setErr(null);
    setState('starting');
    owner = { id, text: (t) => onTextRef.current(t), state: (s, e) => { setState(s); if (e) setErr(e); } };
    window.elysium.dictate('start');
  };

  const on = state !== 'idle';
  return (
    <span className="mic-wrap">
      <button type="button" className={`${className} ${on ? 'listening' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={toggle}
        title={on ? 'Listening. Click to stop' : 'Speak'} aria-label={on ? 'Stop listening' : 'Speak'} aria-pressed={on}>
        <Mic size={size} />
      </button>
      {err && (
        <span className="mic-note" role="status">
          {err.code === 'privacy' ? <>Windows needs online speech recognition turned on, once. <button type="button" className="link-btn" onClick={() => { window.elysium.openSpeechSettings(); setErr(null); }}>Open the setting</button></>
            : err.code === 'microphone' ? <>No microphone was found, or Windows blocks it for desktop apps. <button type="button" className="link-btn" onClick={() => { window.elysium.openSpeechSettings(); setErr(null); }}>Check settings</button></>
              : <>Listening is not available on this PC right now.</>}
        </span>
      )}
    </span>
  );
}
