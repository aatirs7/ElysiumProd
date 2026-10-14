// Theme builder: start from any theme and repaint each part of the app (background,
// sidebar, cards, text, accent, terminal), choose its texture and corners, and see
// it live. Saved as your own theme, which the theme menu lists as "Yours".
import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { THEMES, useWorkspace, type CustomTheme } from './workspace/store';

const PARTS: { key: keyof CustomTheme['vars']; label: string; hint: string }[] = [
  { key: '--bg', label: 'Background', hint: 'Pages and the space between panes' },
  { key: '--chrome', label: 'Sidebar and bars', hint: 'The sidebar, tab bars and the file explorer' },
  { key: '--surface', label: 'Cards', hint: 'Cards, menus and panels' },
  { key: '--surface-2', label: 'Raised parts', hint: 'Inputs, chips and hovered rows' },
  { key: '--text', label: 'Text', hint: 'Headings and body text' },
  { key: '--text-2', label: 'Quiet text', hint: 'Descriptions and labels' },
  { key: '--accent-default', label: 'Accent', hint: 'Buttons, highlights and the glow' },
  { key: '--term', label: 'Terminal', hint: 'Behind terminals and the file view' },
];

const read = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const asHex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#808080');

export function ThemeBuilder({ onClose }: { onClose(): void }) {
  const { doc, setSettings } = useWorkspace();
  const saved = doc.settings.customTheme;
  const [base, setBase] = useState(saved?.base ?? (doc.settings.theme === 'custom' ? 'claude-dark' : doc.settings.theme === 'system' ? 'claude-dark' : doc.settings.theme));
  const [vars, setVars] = useState<CustomTheme['vars']>(saved?.vars ?? {});
  const [grain, setGrain] = useState(saved?.grain ?? 1);
  const [grid, setGrid] = useState(saved?.grid ?? true);
  const [radius, setRadius] = useState(saved?.radius ?? 14);
  const [name, setName] = useState(saved?.name ?? 'My theme');
  const [baseVals, setBaseVals] = useState<Record<string, string>>({});

  const committed = useMemo(() => ({ current: false }), []);
  // Preview live: the app wears the draft while the builder is open.
  const draft: CustomTheme = useMemo(() => ({ name, base, vars, grain, grid, radius }), [name, base, vars, grain, grid, radius]);
  useEffect(() => {
    const prev = { theme: doc.settings.theme, custom: doc.settings.customTheme };
    return () => { if (!committed.current) setSettings({ theme: prev.theme, customTheme: prev.custom }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setSettings({ theme: 'custom', customTheme: draft }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [draft]);
  // The base theme's own colours, to show what each part starts as.
  useEffect(() => {
    const root = document.documentElement;
    const keep = root.dataset.theme;
    const inline = PARTS.map((p) => [p.key, root.style.getPropertyValue(p.key)] as const);
    for (const p of PARTS) root.style.removeProperty(p.key);
    root.dataset.theme = base;
    setBaseVals(Object.fromEntries(PARTS.map((p) => [p.key, asHex(read(p.key))])));
    root.dataset.theme = keep;
    for (const [k, v] of inline) if (v) root.style.setProperty(k, v);
  }, [base]);

  const save = () => { committed.current = true; setSettings({ theme: 'custom', customTheme: draft }); onClose(); };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dialog tb" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Theme builder">
        <div className="bar" style={{ justifyContent: 'space-between' }}>
          <strong>Build your own theme</strong>
          <button className="ghost-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="tb-body">
          <div className="tb-controls">
            <label className="tb-row"><span>Name</span><input className="text-input" value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} /></label>
            <label className="tb-row"><span>Start from</span>
              <select className="picker" value={base} onChange={(e) => { setBase(e.target.value as typeof base); setVars({}); }}>
                {THEMES.filter((t) => t.id !== 'system' && t.id !== 'custom').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div className="tb-parts">
              {PARTS.map((p) => (
                <label key={p.key} className="tb-part" title={p.hint}>
                  <input type="color" value={vars[p.key] ?? baseVals[p.key] ?? '#808080'} onChange={(e) => setVars({ ...vars, [p.key]: e.target.value })} />
                  <span className="tb-part-text"><strong>{p.label}</strong><em>{p.hint}</em></span>
                  {vars[p.key] && <button className="ghost-icon tiny" onClick={(e) => { e.preventDefault(); const n = { ...vars }; delete n[p.key]; setVars(n); }} aria-label={`Reset ${p.label}`}><RotateCcw size={12} /></button>}
                </label>
              ))}
            </div>
            <label className="tb-row"><span>Grain</span><input type="range" min={0} max={3} step={1} value={grain} onChange={(e) => setGrain(Number(e.target.value))} /><em>{['None', 'Fine', 'Soft', 'Strong'][grain]}</em></label>
            <label className="tb-row"><span>Dot grid behind panes</span><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /></label>
            <label className="tb-row"><span>Corners</span><input type="range" min={4} max={22} value={radius} onChange={(e) => setRadius(Number(e.target.value))} /><em>{radius}px</em></label>
          </div>
          <div className="tb-preview" aria-hidden="true">
            <div className="tbp-window">
              <div className="tbp-side"><i /><i /><i className="on" /><i /></div>
              <div className="tbp-main">
                <div className="tbp-title">Good evening</div>
                <div className="tbp-input"><span>Tell any project what to do</span><b /></div>
                <div className="tbp-cards"><div className="tbp-card"><strong>59 h</strong><span>with agents</span></div><div className="tbp-card"><strong>$46</strong><span>this month</span></div></div>
                <div className="tbp-term"><span>$ claude</span><span className="tbp-acc">ready</span></div>
              </div>
            </div>
            <p className="muted small">The whole app shows your theme while this is open.</p>
          </div>
        </div>
        <div className="tb-foot">
          <button className="btn" onClick={() => { setVars({}); setGrain(1); setGrid(true); setRadius(14); }}>Reset</button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save theme</button>
        </div>
      </div>
    </div>
  );
}
