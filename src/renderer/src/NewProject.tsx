// New project: start an iOS app, a web app or an empty project, clone a
// repository, or add a folder that is already on disk. An iOS or web app gets its
// working rules and a first message for Claude, which sets it up with you. Picks one Claude session or a Prime and Meridian pair, and
// the Claude account. Once made, the project is pinned and opened.
import { useEffect, useState } from 'react';
import { FolderOpen, FolderPlus, GitBranch, Globe, Loader2, Smartphone, X } from 'lucide-react';
import type { NewProjectRequest, ProjectKind } from '@shared/ipc';
import { useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';

type Mode = NewProjectRequest['mode'];
/** What you pick first: a kind of new app, or a project you already have. */
export type Pick = 'ios' | 'web' | 'new' | 'clone' | 'existing';

const STARTS: { id: Pick; label: string; icon: typeof GitBranch; blurb: string }[] = [
  { id: 'ios', label: 'iOS app', icon: Smartphone, blurb: 'Expo and EAS, ready to build' },
  { id: 'web', label: 'Web app', icon: Globe, blurb: 'Next.js on Vercel' },
  { id: 'new', label: 'Empty', icon: FolderPlus, blurb: 'A folder with git set up' },
];
const BRING: { id: Pick; label: string; icon: typeof GitBranch; blurb: string }[] = [
  { id: 'clone', label: 'Clone', icon: GitBranch, blurb: 'From GitHub or any git address' },
  { id: 'existing', label: 'Existing folder', icon: FolderOpen, blurb: 'Something already on this PC' },
];
const modeOf = (p: Pick): Mode => (p === 'clone' || p === 'existing' ? p : 'new');
const kindOf = (p: Pick): ProjectKind => (p === 'ios' || p === 'web' ? p : 'blank');


/** The repository's own name from an address or owner/repo, made readable. */
function nameFromUrl(url: string): string {
  const last = url.trim().replace(/\.git$/, '').replace(/\/$/, '').split(/[/:]/).pop() ?? '';
  return last.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export function NewProject({ onClose, onCreated, start = 'ios' }: { onClose(): void; onCreated(projectId: string, name: string, kickoff?: string): void; start?: Pick }) {
  const { accounts } = useLive();
  const { doc, togglePin, setProjectAccount } = useWorkspace();
  const [what, setWhat] = useState<Pick>(start);
  const mode = modeOf(what);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [parent, setParent] = useState('');
  useEffect(() => { void window.elysium.homeDir().then((h) => setParent((p) => p || `${h}\\Projects`)); }, []);
  const [folder, setFolder] = useState('');
  const [sessions, setSessions] = useState<'pair' | 'solo'>('solo');
  const [github, setGithub] = useState<'none' | 'private' | 'public'>('none');
  const [account, setAccount] = useState('main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The name follows the repository or folder until you type your own.
  useEffect(() => { if (!nameTouched && mode === 'clone') setName(nameFromUrl(url)); }, [url, mode, nameTouched]);
  useEffect(() => { if (!nameTouched && mode === 'existing' && folder) setName(nameFromUrl(folder.replace(/\\/g, '/'))); }, [folder, mode, nameTouched]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [busy, onClose]);

  const label = (id: string) => doc.accounts[id]?.label ?? (id === 'main' ? 'Main account' : id);
  const pick = async (set: (v: string) => void) => { const f = await window.elysium.pickFolder(); if (f) set(f); };
  const ready = name.trim() && (mode !== 'clone' || url.trim()) && (mode !== 'existing' || folder);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    const r = await window.elysium.createProject({ mode, kind: kindOf(what), name: name.trim(), url, parent, folder, sessions, github: mode === 'new' ? github : 'none' });
    setBusy(false);
    if (!r.ok || !r.projectId) { setError(r.reason ?? 'Something went wrong.'); return; }
    if (account !== 'main') setProjectAccount(r.projectId, account);
    if (!doc.pinned.includes(r.projectId)) togglePin(r.projectId);
    onCreated(r.projectId, name.trim(), r.kickoff);
  };

  const where = mode === 'existing' ? folder : `${parent}\\${(mode === 'clone' ? (url.trim().replace(/\.git$/, '').split(/[/:]/).pop() ?? '') : name.trim().replace(/[^\w.-]+/g, '-')) || '…'}`;

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="np-title" onClick={() => { if (!busy) onClose(); }}>
      <div className="dialog np" onClick={(e) => e.stopPropagation()}>
        <button className="ghost-icon np-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={16} /></button>
        <h3 id="np-title">What are you making?</h3>
        <p className="np-sub">{what === 'ios' || what === 'web' ? 'It opens with its terminal and Claude side by side, and Claude starts by asking what the app is.' : 'It joins your sidebar and opens with its Claude sessions ready.'}</p>

        {[{ label: 'Start something new', items: STARTS }, { label: 'Bring in one you have', items: BRING }].map((row) => (
          <div key={row.label} className="np-start">
            <div className="np-start-label">{row.label}</div>
            <div className={`np-modes n${row.items.length}`}>
              {row.items.map((m) => (
                <button key={m.id} className={`np-mode ${what === m.id ? 'on' : ''}`} onClick={() => { setWhat(m.id); setError(null); }} disabled={busy}>
                  <m.icon size={18} />
                  <span className="np-mode-label">{m.label}</span>
                  <span className="np-mode-blurb">{m.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="np-fields">
          {mode === 'clone' && (
            <label className="np-field">
              <span>Repository</span>
              <input className="text-input" autoFocus placeholder="https://github.com/owner/repo or owner/repo" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
            </label>
          )}
          {mode === 'existing' && (
            <div className="np-field">
              <span>Folder</span>
              <button className="btn np-folder" onClick={() => void pick(setFolder)} disabled={busy}><FolderOpen size={15} />{folder || 'Choose a folder'}</button>
            </div>
          )}
          <label className="np-field">
            <span>Name</span>
            <input className="text-input" autoFocus={mode === 'new'} placeholder="What you call it" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
          </label>
          {mode !== 'existing' && (
            <div className="np-field">
              <span>Goes in</span>
              <button className="btn np-folder" onClick={() => void pick(setParent)} disabled={busy} title="Choose where the project folder is made"><FolderOpen size={15} />{where}</button>
            </div>
          )}
          <div className="np-field">
            <span>Sessions</span>
            <div className="seg">
              <button className={sessions === 'solo' ? 'on' : ''} onClick={() => setSessions('solo')}>One Claude session</button>
              <button className={sessions === 'pair' ? 'on' : ''} onClick={() => setSessions('pair')} title="Two sessions in the same folder. They do not coordinate on their own; give each its own part of the work.">Two sessions</button>
            </div>
          </div>
          {accounts.length > 1 && (
            <div className="np-field">
              <span>Account</span>
              <select className="picker" value={account} onChange={(e) => setAccount(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{label(a.id)}</option>)}
              </select>
            </div>
          )}
          {mode === 'new' && (
            <div className="np-field">
              <span>On GitHub</span>
              <div className="seg">
                <button className={github === 'none' ? 'on' : ''} onClick={() => setGithub('none')}>Not yet</button>
                <button className={github === 'private' ? 'on' : ''} onClick={() => setGithub('private')}>Private repo</button>
                <button className={github === 'public' ? 'on' : ''} onClick={() => setGithub('public')}>Public repo</button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="np-error" role="alert">{error}</p>}
        <div className="dialog-row">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void submit()} disabled={!ready || busy}>
            {busy ? <><Loader2 size={15} className="spin" />{mode === 'clone' ? 'Cloning' : 'Setting up'}</> : mode === 'clone' ? 'Clone and open' : what === 'ios' ? 'Create the iOS app' : what === 'web' ? 'Create the web app' : mode === 'new' ? 'Create and open' : 'Add and open'}
          </button>
        </div>
      </div>
    </div>
  );
}
