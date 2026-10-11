import { useCallback, useEffect, useRef, useState } from 'react';
import type { DockviewApi } from 'dockview-react';
import { ShieldAlert, X } from 'lucide-react';
import { Sidebar, type Page } from './Sidebar';
import { Home } from './Home';
import { Settings } from './Settings';
import { Help } from './Help';
import { Stats } from './Stats';
import { Palette } from './Palette';
import { Onboarding } from './Onboarding';
import { ProjectLogo } from './ProjectLogo';
import { useAppearance } from './theme';
import { LiveProvider, useLive, useMachine } from './workspace/live';
import { WorkspaceProvider, useWorkspace, type OpenRequest } from './workspace/store';
import { Workspace, addPanel } from './workspace/Workspace';
import { MachineWidget } from './workspace/widgets';
import { overlayClosed, overlayOpened } from './workspace/ClaudePanel';

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

  // Every panel open passes through here, so a resume always asks first. Attaching
  // to a session that is already running (a notification click) does not.
  const onOpen = useCallback((_viewId: string, req: OpenRequest, api: DockviewApi) => {
    const t = req.kind === 'terminal' ? templatesRef.current.find((x) => x.id === req.templateId) : undefined;
    const attaching = Boolean(req.params && 'sessionId' in req.params);
    if (t?.confirm && !attaching) setConfirm({ title: `Resume ${t.title}?`, body: t.confirm, yes: 'Resume it', run: () => addPanel(api, req) });
    else addPanel(api, req);
  }, []);

  return (
    <WorkspaceProvider onOpen={onOpen}>
      <Shell confirm={confirm} setConfirm={setConfirm} />
    </WorkspaceProvider>
  );
}

const PAGE_TITLES: Record<Page, string> = { home: 'Home', workspace: '', settings: 'Settings', help: 'Help', stats: 'Your stats' };

function Shell({ confirm, setConfirm }: { confirm: Confirm | null; setConfirm(c: Confirm | null): void }) {
  const [name, setName] = useState('');
  const [page, setPage] = useState<Page>('home');
  const [palette, setPalette] = useState(false);
  const [memory, setMemory] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { templates } = useLive();
  const { res } = useMachine();
  const { doc, ready, activeView, open, apiFor, setActiveView, deleteView, openProject, restartOnboarding } = useWorkspace();

  useAppearance(doc.settings);
  useEffect(() => { void window.elysium.info().then((i) => setName(i.userName)); }, []);

  // Native web views draw above everything, so they hide while an overlay or another page shows.
  const overlayUp = palette || memory || Boolean(confirm) || page !== 'workspace' || !doc.onboarded;
  useEffect(() => { if (!overlayUp) return; overlayOpened(); return () => overlayClosed(); }, [overlayUp]);

  const go = useCallback((p: Page) => setPage(p), []);
  const goProject = useCallback((id: string, projectName: string) => { openProject(id, projectName); setPage('workspace'); }, [openProject]);

  const launch = useCallback((templateId: string) => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return false;
    if (t.project) openProject(t.project, t.projectName ?? t.project);
    setTimeout(() => open({ kind: 'terminal', templateId: t.id, title: t.title }), 0);
    setPage('workspace');
    return true;
  }, [templates, open, openProject]);

  // A notification click: show that session, opening its pane if it has none.
  useEffect(() => window.elysium.onFocusSession((sessionId, templateId) => {
    for (const v of doc.views) {
      const p = apiFor(v.id)?.panels.find((x) => (x.params as { sessionId?: string } | undefined)?.sessionId === sessionId);
      if (p) { setActiveView(v.id); setPage('workspace'); p.api.setActive(); return; }
    }
    const t = templates.find((x) => x.id === templateId);
    if (t?.project) openProject(t.project, t.projectName ?? t.project);
    setPage('workspace');
    setTimeout(() => open({ kind: 'terminal', templateId, title: t?.title, params: { sessionId } }), 50);
  }), [doc.views, apiFor, setActiveView, templates, openProject, open]);

  const removeView = useCallback((id: string) => {
    const v = doc.views.find((x) => x.id === id);
    const sids = (apiFor(id)?.panels ?? []).map((p) => (p.params as { sessionId?: string } | undefined)?.sessionId).filter(Boolean) as string[];
    const doIt = () => { for (const s of sids) void window.elysium.kill(s); deleteView(id); };
    if (sids.length) setConfirm({ title: `Delete ${v?.name ?? 'this view'}?`, body: `It has ${sids.length} running terminal${sids.length > 1 ? 's' : ''}. Deleting the view stops them.`, yes: 'Delete and stop', run: doIt });
    else doIt();
  }, [doc.views, apiFor, deleteView, setConfirm]);

  // Auto free memory (opt in): above the threshold, end only programs marked Auto, at most once a minute.
  const lastAuto = useRef(0);
  useEffect(() => {
    const a = doc.settings.autoEnd;
    if (!res || !a.enabled || !a.programs.length || res.ramUsedPercent < a.thresholdPercent || Date.now() - lastAuto.current < 60000) return;
    lastAuto.current = Date.now();
    void (async () => {
      const ended: string[] = [];
      for (const p of a.programs) { const r = await window.elysium.endProgram(p); if (r.ok && r.ended) ended.push(p); }
      if (ended.length) setToast(`Memory passed ${a.thresholdPercent}%. Ended ${ended.join(', ')}.`);
    })();
  }, [res, doc.settings.autoEnd]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  // Spec 9.1 shortcuts: Ctrl+K palette, Ctrl+0 home, Ctrl+, settings, Ctrl+Shift+T new shell.
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

  const crumb = page === 'workspace'
    ? (activeView?.projectId
      ? <span className="crumb"><ProjectLogo projectId={activeView.projectId} /><strong>{activeView.name}</strong></span>
      : <span className="crumb"><strong>{activeView?.name ?? 'Workspace'}</strong></span>)
    : <span className="crumb"><strong>{PAGE_TITLES[page]}</strong></span>;

  return (
    <div className="shell">
      <Sidebar page={page} go={go} onPalette={() => setPalette(true)} onMemory={() => setMemory(true)} onDeleteView={removeView} />
      <div className="stage">
        <div className="topbar">{crumb}</div>
        {page === 'home' && <Home name={name || 'there'} onOpen={goProject} />}
        {page === 'settings' && <Settings onOnboarding={restartOnboarding} />}
        {page === 'help' && <Help />}
        {page === 'stats' && <Stats />}
        {ready && <Workspace visible={page === 'workspace'} />}
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={go} onProject={goProject} />}
      {toast && <div className="toast" role="status">{toast}</div>}

      {memory && (
        <div className="backdrop" onClick={() => setMemory(false)}>
          <div className="dialog" style={{ maxWidth: '36rem', textAlign: 'left', padding: 0, maxHeight: '86vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Memory">
            <div className="bar" style={{ justifyContent: 'space-between' }}><strong>Memory</strong><button className="ghost-icon" onClick={() => setMemory(false)} aria-label="Close"><X size={16} /></button></div>
            <MachineWidget />
          </div>
        </div>
      )}

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

      {ready && !doc.onboarded && <Onboarding name={name} />}
    </div>
  );
}
