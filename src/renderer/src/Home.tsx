import { forwardRef, useMemo, useState } from 'react';
import { ArrowUp, Sparkles, SquareTerminal } from 'lucide-react';
import type { TemplateInfo } from '@shared/ipc';
import { Logo } from './Logo';

interface Props {
  name: string;
  templates: TemplateInfo[];
  disabledReason: string | null;
  onLaunch(t: TemplateInfo): void;
}

function partOfDay(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const Home = forwardRef<HTMLInputElement, Props>(function Home({ name, templates, disabledReason, onLaunch }, inputRef) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? templates.filter((t) => t.title.toLowerCase().includes(s)) : templates;
  }, [q, templates]);
  const target = templates.find((t) => t.id === picked) ?? matches[0] ?? null;
  const go = () => { if (target && !disabledReason) onLaunch(target); };

  return (
    <div className="home">
      <div className="hero">
        <h1 className="greeting"><Logo />{partOfDay()}, {name}</h1>

        <div className="composer">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPicked(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
            placeholder="What do you want to start?"
            aria-label="Find a session to start"
            spellCheck={false}
            autoFocus
          />
          <div className="composer-bar">
            {matches.map((t) => (
              <button key={t.id} className={`chip ${target?.id === t.id ? 'selected' : ''}`} onClick={() => setPicked(t.id)} title={t.cwd}>
                {t.kind === 'claude' ? <Sparkles size={14} strokeWidth={1.75} /> : <SquareTerminal size={14} strokeWidth={1.75} />}
                {t.title}
              </button>
            ))}
            {!matches.length && <span className="chip" style={{ cursor: 'default' }}>No match</span>}
            <span className="spacer" />
            <button className="send" onClick={go} disabled={!target || Boolean(disabledReason)} aria-label={target ? `Start ${target.title}` : 'Start'} title={disabledReason ?? (target ? `Start ${target.title}` : '')}>
              <ArrowUp size={17} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="subtle">
          {target ? <>Starts in <code>{target.cwd}</code></> : 'Type to filter, Enter to start'}
        </div>
      </div>
    </div>
  );
});
