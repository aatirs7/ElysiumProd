// New project: clone a repository, start one from scratch, or add a folder that
// is already on disk. Picks one Claude session or a Prime and Meridian pair, and
// the Claude account. Once made, the project is pinned and opened.
import { useEffect, useState } from 'react';
import { FolderOpen, FolderPlus, GitBranch, Loader2, X } from 'lucide-react';
import type { NewProjectRequest } from '@shared/ipc';
import { useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';

type Mode = NewProjectRequest['mode'];

const MODES: { id: Mode; label: string; icon: typeof GitBranch; blurb: string }[] = [
  { id: 'clone', label: 'Clone', icon: GitBranch, blurb: 'From GitHub or any git address' },
  { id: 'new', label: 'From scratch', icon: FolderPlus, blurb: 'A new folder with git set up' },
  { id: 'existing', label: 'Existing folder', icon: FolderOpen, blurb: 'Something already on this PC' },
];


/** The repository's own name from an address or owner/repo, made readable. */
function nameFromUrl(url: string): string {
  const last = url.trim().replace(/\.git$/, '').replace(/\/$/, '').split(/[/:]/).pop() ?? '';
  return last.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export function NewProject({ onClose, onCreated }: { onClose(): void; onCreated(projectId: string, name: string): void }) {
  const { accounts } = useLive();
  const { doc, togglePin, setProjectAccount } = useWorkspace();
  const [mode, setMode] = useState<Mode>('clone');
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
    const r = await window.elysium.createProject({ mode, name: name.trim(), url, parent, folder, sessions, github: mode === 'new' ? github : 'none' });
    setBusy(false);
    if (!r.ok || !r.projectId) { setError(r.reason ?? 'Something went wrong.'); return; }
    if (account !== 'main') setProjectAccount(r.projectId, account);
    if (!doc.pinned.includes(r.projectId)) togglePin(r.projectId);
    onCreated(r.projectId, name.trim());
  };

  const where = mode === 'existing' ? folder : `${parent}\\${(mode === 'clone' ? (url.trim().replace(/\.git$/, '').split(/[/:]/).pop() ?? '') : name.trim().replace(/[^\w.-]+/g, '-')) || '…'}`;

  return (
    <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="np-title" onClick={() => { if (!busy) onClose(); }}>
      <div className="dialog np" onClick={(e) => e.stopPropagation()}>
        <button className="ghost-icon np-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={16} /></button>
        <h3 id="np-title">New project</h3>
        <p className="np-sub">It joins your sidebar and opens with its Claude sessions ready.</p>

        <div className="np-modes">
          {MODES.map((m) => (
            <button key={m.id} className={`np-mode ${mode === m.id ? 'on' : ''}`} onClick={() => { setMode(m.id); setError(null); }} disabled={busy}>
              <m.icon size={18} />
              <span className="np-mode-label">{m.label}</span>
              <span className="np-mode-blurb">{m.blurb}</span>
            </button>
          ))}
        </div>

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
            {busy ? <><Loader2 size={15} className="spin" />{mode === 'clone' ? 'Cloning' : 'Setting up'}</> : mode === 'clone' ? 'Clone and open' : mode === 'new' ? 'Create and open' : 'Add and open'}
          </button>
        </div>
      </div>
    </div>
  );
}
