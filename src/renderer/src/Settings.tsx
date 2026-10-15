import { useEffect, useState } from 'react';
import { Check, Pin, PinOff, Trash2 } from 'lucide-react';
import { ProjectLogo } from './ProjectLogo';
import { useLive } from './workspace/live';
import { ACCENTS, DEFAULT_SETTINGS, THEMES, useWorkspace, type Density } from './workspace/store';

export function Settings({ onOnboarding, onRestart }: { onOnboarding(): void; onRestart(): void }) {
  const { doc, activeView, setSettings, resetView, savePreset, applyPreset, deletePreset, setAccountLabel, setProjectAccount, togglePin, setWatcher } = useWorkspace();
  const { projects, accounts, watchers } = useLive();
  const s = doc.settings;
  const [presetName, setPresetName] = useState('');
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, boolean>>({});
  useEffect(() => { void window.elysium.shortcut().then(setShortcut); }, []);

  // Whether each project's chosen account already has its session history.
  useEffect(() => {
    void Promise.all(projects.map(async (p) => [p.id, await window.elysium.hasHistory(doc.projectAccounts[p.id] || 'main', p.folder)] as const))
      .then((rows) => setHistory(Object.fromEntries(rows)));
  }, [projects, doc.projectAccounts]);

  const label = (id: string) => doc.accounts[id]?.label ?? (id === 'main' ? 'Main account' : id);
  const mainProjects = projects.filter((p) => p.tier === 'main');

  return (
    <div className="page page-enter">
      <div className="page-inner">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Saved as you change them.</p>

        <section className="settings-card">
          <h2>Theme</h2>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-card ${s.theme === t.id ? 'on' : ''}`} onClick={() => setSettings({ theme: t.id })}>
                <div className="theme-swatch" style={{ background: t.swatch[0] }}>
                  <span />
                  <span style={{ background: t.swatch[1] }}><i style={{ background: t.swatch[2] }} /></span>
                </div>
                <div className="theme-name">{t.name}</div>
                <div className="theme-blurb">{t.blurb}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card">
          <h2>Appearance</h2>
          <Row label="Accent" hint="Buttons, focus and highlights">
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button key={a.name} className="swatch" style={{ background: a.value || 'conic-gradient(var(--accent-default) 0 50%, var(--surface-2) 0)' }} title={a.name} aria-label={a.name} onClick={() => setSettings({ accent: a.value })}>
                  {s.accent === a.value && <Check size={13} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Text size" hint={`${s.textSize} px`}>
            <input type="range" min={13} max={19} step={0.5} value={s.textSize} onChange={(e) => setSettings({ textSize: Number(e.target.value) })} />
          </Row>
          <Row label="Terminal text" hint={`${s.termFontSize} px, Cascadia Mono`}>
            <input type="range" min={11} max={20} step={0.5} value={s.termFontSize} onChange={(e) => setSettings({ termFontSize: Number(e.target.value) })} />
          </Row>
          <Row label="Terminal style" hint={s.termStyle === 'paper' ? 'Dark ink on warm paper, like Notion' : s.termStyle === 'theme' ? 'Matches the app theme' : 'A softer, warmer dark'}>
            <Seg value={s.termStyle ?? 'theme'} options={[['theme', 'App theme'], ['soft', 'Soft dark'], ['paper', 'Paper']]} onChange={(v) => setSettings({ termStyle: v as 'soft' | 'paper' | 'theme', termStyleSet: true })} />
          </Row>
          <Row label="Density" hint="Tab height and spacing">
            <Seg value={s.density} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} onChange={(v) => setSettings({ density: v as Density })} />
          </Row>
          <Row label="Space between panes" hint={`${s.gap} px`}>
            <input type="range" min={0} max={16} step={1} value={s.gap} onChange={(e) => setSettings({ gap: Number(e.target.value) })} />
          </Row>
        </section>

        <section className="settings-card">
          <h2>Sessions</h2>
          <Row label="Tell me when Claude replies" hint="A card in the corner when a session you are not looking at replies or needs you. With the window in the background, a Windows notification instead.">
            <Seg value={s.notifyReplies === false ? 'off' : 'on'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => setSettings({ notifyReplies: v === 'on' })} />
          </Row>
          <Row label="Customize Elysium" hint={s.builderTerminal === false ? 'Opens as a chat only' : 'Opens with the Elysium Builder terminal and Dictate, with the chat beside them'}>
            <Seg value={s.builderTerminal === false ? 'chat' : 'terminal'} options={[['terminal', 'Terminal'], ['chat', 'Chat only']]} onChange={(v) => setSettings({ builderTerminal: v === 'terminal' })} />
          </Row>
          <Row label="Compact automatically" hint={s.autoCompact.enabled ? `At ${s.autoCompact.percent}% context, a session saves its notes at a clean stopping point, compacts, then carries on` : 'Off. Use Compact in the top bar, or right-click a tab.'}>
            <Seg value={s.autoCompact.enabled ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => setSettings({ autoCompact: { ...s.autoCompact, enabled: v === 'on' } })} />
          </Row>
          {s.autoCompact.enabled && (
            <Row label="Compact at" hint={`${s.autoCompact.percent}% of the context window. Sessions with their own compaction rules keep them too.; this runs first when it is lower.`}>
              <input type="range" min={60} max={90} step={5} value={s.autoCompact.percent} onChange={(e) => setSettings({ autoCompact: { ...s.autoCompact, percent: Number(e.target.value) } })} />
            </Row>
          )}
        </section>

        <section className="settings-card">
          <h2>Projects</h2>
          <p className="setting-hint" style={{ margin: '-.2rem 0 .6rem' }}>The pin puts a project in the sidebar and on Home. You can also use the plus beside Projects in the sidebar.</p>
          {projects.map((p) => {
            const acc = doc.projectAccounts[p.id] || 'main';
            const pinned = doc.pinned.includes(p.id);
            return (
              <div key={p.id} className="setting-row">
                <div>
                  <div className="setting-label"><ProjectLogo projectId={p.id} />{p.name}</div>
                  <div className="setting-hint">
                    {history[p.id] === false ? `No session history on ${label(acc)}, so sessions here start fresh.` : p.tier === 'main' ? 'Prime and Meridian' : 'One Claude session'}
                  </div>
                </div>
                <div className="setting-control">
                  <select className="picker" value={acc} onChange={(e) => setProjectAccount(p.id, e.target.value)} title="Claude account for this project">
                    {accounts.map((a) => <option key={a.id} value={a.id}>{label(a.id)}</option>)}
                  </select>
                  <button className={`ghost-icon ${pinned ? '' : 'muted'}`} onClick={() => togglePin(p.id)} title={pinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'} aria-label={pinned ? `Unpin ${p.name}` : `Pin ${p.name}`}>
                    {pinned ? <Pin size={15} /> : <PinOff size={15} />}
                  </button>
                  {p.custom && (
                    <button className="ghost-icon" title="Remove from Elysium. The folder and its history stay on disk." aria-label={`Remove ${p.name}`}
                      onClick={() => void window.elysium.removeProject(p.id).then((ok) => { if (ok && pinned) togglePin(p.id); })}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="settings-card">
          <h2>Claude accounts</h2>
          {accounts.map((a) => (
            <div key={a.id} className="setting-row">
              <div>
                <div className="setting-label">{label(a.id)}{a.isDefault ? <span className="muted small">default</span> : null}</div>
                <div className="setting-hint">{a.loggedIn ? 'Signed in' : 'Not signed in'} · {a.configDir}</div>
              </div>
              <div className="setting-control">
                <input className="text-input" style={{ width: '10rem' }} defaultValue={label(a.id)} onBlur={(e) => setAccountLabel(a.id, e.target.value)} aria-label="Account name" />
              </div>
            </div>
          ))}
          <div className="setting-row"><div className="setting-hint">Each account keeps its own sign in, for terminals and for the Claude pane, so you never log out to switch.</div></div>
        </section>

        <section className="settings-card">
          <h2>In the background</h2>
          <Row label="Quick task shortcut" hint={shortcut ? `Press ${shortcut.replace('Control', 'Ctrl')} anywhere to hand a project a task` : 'No shortcut is free right now'}>
            <select className="picker" value={shortcut ?? ''} onChange={(e) => void window.elysium.setShortcut(e.target.value).then(setShortcut)}>
              {['Alt+Space', 'Control+Alt+Space', 'Control+Shift+Space'].map((k) => <option key={k} value={k}>{k.replace('Control', 'Ctrl')}</option>)}
            </select>
          </Row>
          {mainProjects.map((p) => {
            const cfg = doc.watchers[p.id] ?? { enabled: false, delivery: 'notify' as const };
            const w = watchers[p.id];
            if (w?.status === 'unconfigured') return null;
            return (
              <Row key={p.id} label={`${p.name} watcher`} hint={cfg.enabled ? `${w?.status ?? 'starting'}. Turn off the watcher inside Prime so tasks are not announced twice.` : 'Watches the board for new tasks'}>
                <Seg value={cfg.enabled ? (cfg.delivery === 'prime-when-idle' ? 'hand' : 'show') : 'off'} options={[['off', 'Off'], ['show', 'Show'], ['hand', 'Hand to Prime']]}
                  onChange={(v) => setWatcher(p.id, { enabled: v !== 'off', delivery: v === 'hand' ? 'prime-when-idle' : 'notify' })} />
              </Row>
            );
          })}
        </section>

        <section className="settings-card">
          <h2>Presets</h2>
          <Row label="Save this setup" hint="This view's panes and sizes, plus your appearance. Like a car's seat memory.">
            <input className="text-input" style={{ width: '12rem' }} placeholder="Name it" value={presetName} onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { savePreset(presetName); setPresetName(''); } }} />
            <button className="btn primary" onClick={() => { savePreset(presetName); setPresetName(''); }}>Save</button>
          </Row>
          {doc.presets.map((p) => (
            <Row key={p.id} label={p.name} hint={`Saved ${new Date(p.savedAt).toLocaleDateString()}. Applying rebuilds the current view.`}>
              <button className="btn" onClick={() => applyPreset(p.id)}>Apply</button>
              <button className="ghost-icon" onClick={() => deletePreset(p.id)} title="Delete preset" aria-label={`Delete ${p.name}`}><Trash2 size={15} /></button>
            </Row>
          ))}
        </section>

        <section className="settings-card">
          <h2>Start over</h2>
          <Row label="Reset this view" hint={activeView ? `Rebuilds "${activeView.name}" and stops its terminals` : 'Open a view first'}>
            <button className="btn" disabled={!activeView} onClick={() => activeView && resetView(activeView.id)}>Reset view</button>
          </Row>
          <Row label="Reset appearance" hint="Theme, text size and spacing back to defaults">
            <button className="btn" onClick={() => setSettings({ ...DEFAULT_SETTINGS, autoEnd: s.autoEnd })}>Reset</button>
          </Row>
          <UpdatesRow onRestart={onRestart} />
          <Row label="Restart Elysium" hint="Loads the newest build. Running sessions come back on their own.">
            <button className="btn" onClick={onRestart}>Restart</button>
          </Row>
          <Row label="Run the welcome again" hint="Accounts, projects and a quick tour">
            <button className="btn" onClick={onOnboarding}>Show setup again</button>
          </Row>
        </section>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div><div className="setting-label">{label}</div>{hint && <div className="setting-hint">{hint}</div>}</div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Seg({ value, options, onChange }: { value: string; options: [string, string][]; onChange(v: string): void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/** Get updates: only for an installed copy, which keeps the owner's own changes on top. */
function UpdatesRow({ onRestart }: { onRestart(): void }) {
  const [info, setInfo] = useState<import('@shared/ipc').UpdateInfo | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [done, setDone] = useState<{ ok: boolean; reason: string | null } | null>(null);
  useEffect(() => { void window.elysium.checkUpdates().then(setInfo); return window.elysium.onUpdateProgress(setStep); }, []);
  if (!info?.managed) return null;
  const get = async () => { setDone(null); setStep('Starting'); const r = await window.elysium.applyUpdate(); setStep(null); setDone(r); if (r.ok) setInfo({ ...info, behind: 0, changes: [] }); };
  return (
    <Row label="Updates" hint={info.error ?? (done?.ok ? 'Updated. Restart to load it.' : done ? done.reason ?? '' : step ? `${step}…` : info.behind ? `${info.behind} new change${info.behind > 1 ? 's' : ''}: ${info.changes.slice(0, 3).join('; ')}${info.mine ? `. Your ${info.mine} change${info.mine > 1 ? 's are' : ' is'} kept.` : ''}` : 'You have the latest version.')}>
      {done?.ok ? <button className="btn primary" onClick={() => window.elysium.finishUpdate()}>Restart now</button>
        : info.behind ? <button className="btn primary" disabled={Boolean(step)} onClick={() => void get()}>{step ? 'Updating…' : 'Get updates'}</button>
          : <button className="btn" onClick={() => void window.elysium.checkUpdates().then(setInfo)}>Check again</button>}
    </Row>
  );
}
