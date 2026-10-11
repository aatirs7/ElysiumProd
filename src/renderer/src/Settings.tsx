import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { ACCENTS, DEFAULT_SETTINGS, useWorkspace, type Density, type ThemeChoice } from './workspace/store';

export function Settings() {
  const { doc, setSettings, resetView, savePreset, applyPreset, deletePreset } = useWorkspace();
  const [presetName, setPresetName] = useState('');
  const s = doc.settings;
  const active = doc.views.find((v) => v.id === doc.activeViewId);
  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Saved automatically to %APPDATA%\elysiumprod\workspace.json</p>

        <section className="settings-card">
          <h2>Presets</h2>
          <div className="setting-row">
            <div><div className="setting-label">Save this setup</div><div className="setting-hint">The current view's panes and sizes, plus every appearance setting. Like a car's seat memory.</div></div>
            <div className="setting-control preset-save">
              <input className="rename" placeholder="Name, for example Deep work" value={presetName} onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { savePreset(presetName); setPresetName(''); } }} />
              <button className="btn primary" onClick={() => { savePreset(presetName); setPresetName(''); }}>Save</button>
            </div>
          </div>
          {doc.presets.map((p) => (
            <div key={p.id} className="setting-row">
              <div><div className="setting-label">{p.name}</div><div className="setting-hint">Saved {new Date(p.savedAt).toLocaleString()}. Applying rebuilds the current view and stops its terminals.</div></div>
              <div className="setting-control" style={{ gap: 6 }}>
                <span className="swatch small-swatch" style={{ background: p.settings.accent }} aria-hidden="true" />
                <button className="btn" onClick={() => applyPreset(p.id)}>Apply</button>
                <button className="ghost-icon" onClick={() => deletePreset(p.id)} title="Delete preset" aria-label={`Delete ${p.name}`}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {!doc.presets.length && <div className="setting-row"><div className="setting-hint">No presets yet.</div></div>}
        </section>

        <section className="settings-card">
          <h2>Appearance</h2>
          <Row label="Theme" hint="System follows Windows">
            <Seg value={s.theme} options={[['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]} onChange={(v) => setSettings({ theme: v as ThemeChoice })} />
          </Row>
          <Row label="Accent" hint="Buttons, focus and highlights">
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button key={a.value} className="swatch" style={{ background: a.value }} title={a.name} aria-label={a.name} onClick={() => setSettings({ accent: a.value })}>
                  {s.accent === a.value && <Check size={14} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Density" hint="Tab height and spacing">
            <Seg value={s.density} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']]} onChange={(v) => setSettings({ density: v as Density })} />
          </Row>
          <Row label="Gap between panes" hint={`${s.gap} px`}>
            <input type="range" min={0} max={16} step={1} value={s.gap} onChange={(e) => setSettings({ gap: Number(e.target.value) })} />
          </Row>
        </section>

        <section className="settings-card">
          <h2>Terminal</h2>
          <Row label="Font size" hint={`${s.termFontSize} px, Cascadia Mono`}>
            <input type="range" min={11} max={20} step={0.5} value={s.termFontSize} onChange={(e) => setSettings({ termFontSize: Number(e.target.value) })} />
          </Row>
        </section>

        <section className="settings-card">
          <h2>Sidebar</h2>
          <Row label="Machine line" hint="Memory and free disk at the bottom">
            <Seg value={s.showMachineLine ? 'on' : 'off'} options={[['on', 'Show'], ['off', 'Hide']]} onChange={(v) => setSettings({ showMachineLine: v === 'on' })} />
          </Row>
        </section>

        <section className="settings-card">
          <h2>Layout</h2>
          <Row label="Reset this view" hint={active ? `Rebuilds "${active.name}" with the starter layout and stops its terminals` : 'No view selected'}>
            <button className="btn" disabled={!active} onClick={() => { if (active) resetView(active.id); }}>Reset view</button>
          </Row>
          <Row label="Reset appearance" hint="Back to the defaults">
            <button className="btn" onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset</button>
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
  return (
    <div className="seg">
      {options.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
