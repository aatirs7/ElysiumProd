import { useCallback, useEffect, useRef, useState } from 'react';
import type { DockviewApi } from 'dockview-react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { ResourceSample } from '@shared/ipc';
import { Sidebar, type Page } from './Sidebar';
import { Home } from './Home';
import { Settings } from './Settings';
import { Palette } from './Palette';
import { LiveProvider, useLive } from './workspace/live';
import { WorkspaceProvider, useWorkspace, type OpenRequest } from './workspace/store';
import { Workspace, addPanel } from './workspace/Workspace';
import { overlayClosed, overlayOpened } from './workspace/ClaudePanel';

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

interface Confirm { title: string; body: string; yes: string; run(): void }

export function App() {
  return (
    <LiveProvider>
      <WithWorkspace />
    </LiveProvider>
  );
}

function WithWorkspace() {
  const { templates } = useLive();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  // Every panel open passes through here, so a resume always asks first.
  const onOpen = useCallback((_viewId: string, req: OpenRequest, api: DockviewApi) => {
    const t = req.kind === 'terminal' ? templatesRef.current.find((x) => x.id === req.templateId) : undefined;
    if (t?.confirm) setConfirm({ title: `Resume ${t.title}?`, body: t.confirm, yes: 'Resume it', run: () => addPanel(api, req) });
    else addPanel(api, req);
  }, []);

  return (
    <WorkspaceProvider onOpen={onOpen}>
      <Shell confirm={confirm} setConfirm={setConfirm} />
    </WorkspaceProvider>
  );
}

function Shell({ confirm, setConfirm }: { confirm: Confirm | null; setConfirm(c: Confirm | null): void }) {
  const [name, setName] = useState('');
  const [page, setPage] = useState<Page>('workspace');
  const [palette, setPalette] = useState(false);
  const { templates, res } = useLive();
  const { doc, ready, open, apiFor, setActiveView, deleteView } = useWorkspace();
  const composer = useRef<HTMLInputElement>(null);
  // Native web views draw above everything, so they hide while an overlay or another page shows.
  const overlayUp = palette || Boolean(confirm) || page !== 'workspace';
  useEffect(() => { if (!overlayUp) return; overlayOpened(); return () => overlayClosed(); }, [overlayUp]);

  useEffect(() => { void window.elysium.info().then((i) => setName(i.userName)); }, []);

  // Auto free memory (opt in): above the threshold, end only the programs the
  // owner marked Auto, at most once a minute, and say so.
  const [toast, setToast] = useState<string | null>(null);
  const lastAuto = useRef(0);
  useEffect(() => {
    const a = doc.settings.autoEnd;
    if (!res || !a.enabled || !a.programs.length || res.ramUsedPercent < a.thresholdPercent) return;
    if (Date.now() - lastAuto.current < 60000) return;
    lastAuto.current = Date.now();
    void (async () => {
      const ended: string[] = [];
      for (const name of a.programs) {
        const r = await window.elysium.endProgram(name);
        if (r.ok && r.ended > 0) ended.push(name);
      }
      if (ended.length) setToast(`Memory passed ${a.thresholdPercent}%. Ended ${ended.join(', ')}.`);
    })();
  }, [res, doc.settings.autoEnd]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  // Appearance settings live on the root element so every surface follows them.
  useEffect(() => {
    const root = document.documentElement;
    const s = doc.settings;
    if (s.theme === 'system') delete root.dataset.theme; else root.dataset.theme = s.theme;
    root.dataset.density = s.density;
    root.style.setProperty('--accent', s.accent);
  }, [doc.settings]);

  const go = useCallback((p: Page) => {
    setPage(p);
    if (p === 'home') setTimeout(() => composer.current?.focus(), 0);
  }, []);

  const launch = useCallback((templateId: string) => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return false;
    open({ kind: 'terminal', templateId: t.id, title: t.title });
    setPage('workspace');
    return true;
  }, [templates, open]);

  const focusSession = useCallback((sessionId: string) => {
    for (const v of doc.views) {
      const p = apiFor(v.id)?.panels.find((x) => (x.params as { sessionId?: string } | undefined)?.sessionId === sessionId);
      if (p) { setActiveView(v.id); setPage('workspace'); p.api.setActive(); return; }
    }
  }, [doc.views, apiFor, setActiveView]);

  const removeView = useCallback((id: string) => {
    const v = doc.views.find((x) => x.id === id);
    const sids = (apiFor(id)?.panels ?? []).map((p) => (p.params as { sessionId?: string } | undefined)?.sessionId).filter(Boolean) as string[];
    const doIt = () => { for (const s of sids) void window.elysium.kill(s); deleteView(id); };
    if (sids.length) setConfirm({ title: `Delete ${v?.name ?? 'this view'}?`, body: `It has ${sids.length} running terminal${sids.length > 1 ? 's' : ''}. Deleting the view stops them.`, yes: 'Delete and stop', run: doIt });
    else doIt();
  }, [doc.views, apiFor, deleteView, setConfirm]);

  // Spec 9.1: Ctrl+K palette, Ctrl+0 home, Ctrl+Shift+T new shell, Ctrl+, settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!e.shiftKey && k === 'k') { e.preventDefault(); setPalette((p) => !p); }
      else if (!e.shiftKey && k === '0') { e.preventDefault(); go('home'); }
      else if (!e.shiftKey && k === ',') { e.preventDefault(); go('settings'); }
      else if (e.shiftKey && k === 't') { e.preventDefault(); launch('local.shell'); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, launch]);

  // Lets the smoke test start a template the same way a click does.
  useEffect(() => {
    const prev = window.__smoke;
    window.__smoke = { type: prev?.type ?? (() => {}), screen: prev?.screen ?? (() => ''), launch: async (id: string) => launch(id) };
  }, [launch]);

  return (
    <div className="shell">
      <Sidebar page={page} go={go} onPalette={() => setPalette(true)} onFocusSession={focusSession} onDeleteView={removeView} />
      <div className="stage">
        <Notice r={res} />
        {page === 'home' && (
          <Home ref={composer} name={name || 'there'} templates={templates} disabledReason={res?.refuseReason ?? null} onLaunch={(t) => launch(t.id)} />
        )}
        {page === 'settings' && <Settings />}
        {ready && <Workspace visible={page === 'workspace'} />}
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={go} />}
      {toast && <div className="toast" role="status">{toast}</div>}

      {confirm && (
        <div className="backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={() => setConfirm(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-icon"><ShieldAlert size={20} /></div>
            <h3 id="confirm-title">{confirm.title}</h3>
            <p>{confirm.body}</p>
            <div className="dialog-row">
              <button className="btn" onClick={() => setConfirm(null)}>Not now</button>
              <button className="btn primary" autoFocus onClick={() => { const c = confirm; setConfirm(null); c.run(); }}>{confirm.yes}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ r }: { r: ResourceSample | null }) {
  if (!r) return null;
  if (r.refuseReason) return <div className="notice refuse" role="alert"><ShieldAlert size={14} />{r.refuseReason}</div>;
  const msgs: string[] = [];
  if (r.ramLevel === 'warn') msgs.push(`Memory is ${r.ramUsedPercent.toFixed(0)} percent used.`);
  if (r.diskLevel === 'warn' && r.diskFreeBytes !== null) msgs.push(`${gb(r.diskFreeBytes)} free on ${r.diskPath.replace(/\\$/, '')}. New sessions pause below 8 GB.`);
  if (!msgs.length) return null;
  return <div className="notice" role="status"><AlertTriangle size={14} />{msgs.join(' ')}</div>;
}
