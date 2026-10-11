import { useEffect, useState } from 'react';
import type { ResourceSample, TemplateInfo } from '@shared/ipc';
import { TerminalPane } from './TerminalPane';
import { BottomBar, ResourceBanner } from './BottomBar';

export function App() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [active, setActive] = useState<TemplateInfo | null>(null);
  const [launchKey, setLaunchKey] = useState(0);
  const [confirming, setConfirming] = useState<TemplateInfo | null>(null);
  const [res, setRes] = useState<ResourceSample | null>(null);

  useEffect(() => {
    void window.elysium.templates().then(setTemplates);
    void window.elysium.resources().then(setRes);
    return window.elysium.onResources(setRes);
  }, []);

  const launch = (t: TemplateInfo) => {
    setActive(t);
    setLaunchKey((k) => k + 1);
  };
  const request = (t: TemplateInfo) => (t.confirm ? setConfirming(t) : launch(t));

  // Lets the smoke test start a template the same way a click does.
  useEffect(() => {
    const prev = window.__smoke;
    window.__smoke = {
      ...(prev ?? { type: () => {}, screen: () => '' }),
      launch: async (id: string) => {
        const t = templates.find((x) => x.id === id);
        if (t) launch(t);
        return Boolean(t);
      },
    };
  }, [templates]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>ElysiumProd</h1>
        <p>Phase 1: one terminal</p>
      </header>
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
        <ResourceBanner r={res} />
        <main className="main">
          {active ? (
            <TerminalPane
              key={`${active.id}-${launchKey}`}
              template={active}
              launchKey={launchKey}
              onRestart={() => setLaunchKey((k) => k + 1)}
              onClose={() => setActive(null)}
            />
          ) : (
            <div className="start">
              <h2>Start a session</h2>
              <p>One pane for now. Projects, layouts and the dashboard arrive in later phases.</p>
              <div className="cards">
                {templates.map((t) => (
                  <div className="card" key={t.id}>
                    <h3>{t.title}</h3>
                    <div className="meta">{t.cwd}</div>
                    <button className="btn primary" disabled={Boolean(res?.refuseReason)} onClick={() => request(t)}>
                      {t.kind === 'claude' ? 'Resume' : 'Open'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
      <BottomBar r={res} />
      {confirming && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="modal">
            <h3 id="confirm-title">{confirming.title}</h3>
            <p>{confirming.confirm}</p>
            <div className="row">
              <button className="btn" onClick={() => setConfirming(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { const t = confirming; setConfirming(null); launch(t); }}>Resume it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
