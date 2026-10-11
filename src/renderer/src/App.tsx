import { useCallback, useEffect, useRef, useState } from 'react';
import type { DockviewApi } from 'dockview-react';
import { Moon, ShieldAlert, X } from 'lucide-react';
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
  const { templates, sessions } = useLive();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const templatesRef = useRef(templates);
  templatesRef.current = templates;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Every panel open passes through here, so a resume always asks first. Attaching
  // to a session that is already running (a notification click) does not.
  const onOpen = useCallback((_viewId: string, req: OpenRequest, api: DockviewApi) => {
    const t = req.kind === 'terminal' ? templatesRef.current.find((x) => x.id === req.templateId) : undefined;
    // Already running here (its pane was closed, or it started from the quick bar): show that
    // session again instead of starting a second copy, and do not ask about resuming.
    const runningId = (id?: string) => sessionsRef.current.find((x) => x.templateId === id && x.status === 'running')?.id;
    if (t && !(req.params && 'sessionId' in req.params)) {
      const sid = runningId(t.id);
      if (sid) {
        const existing = api.panels.find((p) => (p.params as { sessionId?: string } | undefined)?.sessionId === sid);
        if (existing) existing.api.setActive();
        else addPanel(api, { ...req, pairTemplateId: undefined, params: { ...(req.params ?? {}), sessionId: sid } });
        if (req.pairTemplateId) onOpenRef.current(_viewId, { kind: 'terminal', templateId: req.pairTemplateId, title: templatesRef.current.find((x) => x.id === req.pairTemplateId)?.title }, api);
        return;
      }
    }
    const attaching = Boolean(req.params && 'sessionId' in req.params);
    const pair = req.pairTemplateId ? templatesRef.current.find((x) => x.id === req.pairTemplateId) : undefined;
    if (t && pair) {
      // One question for the pair; Meridian then opens below Prime.
      setConfirm({
        title: `Resume ${t.title} and ${pair.title}?`,
        body: `This resumes both sessions, exactly as cs does. If either is open in another terminal, close it there first so two copies do not run at once.`,
        yes: 'Resume both',
        run: () => { addPanel(api, { ...req, pairTemplateId: undefined }); addPanel(api, { kind: 'terminal', templateId: pair.id, title: pair.title }); },
      });
      return;
    }
    if (t?.confirm && !attaching) setConfirm({ title: `Resume ${t.title}?`, body: t.confirm, yes: 'Resume it', run: () => addPanel(api, req) });
    else addPanel(api, req);
  }, []);

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
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
  const { templates, sessions, telemetry } = useLive();
  const { res } = useMachine();
  const [wrapping, setWrapping] = useState<string[]>([]);
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

  // Wrap up: once a wrapped session exits, close its pane.
  useEffect(() => {
    if (!wrapping.length) return;
    const done = wrapping.filter((id) => sessions.find((x) => x.id === id)?.status !== 'running');
    if (!done.length) return;
    for (const v of doc.views) for (const p of apiFor(v.id)?.panels ?? []) {
      if (done.includes((p.params as { sessionId?: string } | undefined)?.sessionId ?? '')) p.api.close();
    }
    setWrapping((w) => w.filter((id) => !done.includes(id)));
  }, [sessions, wrapping, doc.views, apiFor]);

  const projectId = page === 'workspace' ? activeView?.projectId : undefined;
  const projectRunning = projectId ? sessions.filter((x) => x.status === 'running' && x.templateId.startsWith(`${projectId}.`)) : [];
  const wrapUp = () => {
    if (!projectId) return;
    const n = projectRunning.length;
    setConfirm({
      title: `Wrap up ${activeView?.name}?`,
      body: `${n === 1 ? 'Its session' : `All ${n} sessions`} will finish the current step at a clean point, save their state and relay line, then close. If one needs your answer first, you will get a notification.`,
      yes: 'Wrap up',
      run: () => void window.elysium.wrapUp(projectId).then((ids) => setWrapping((w) => [...new Set([...w, ...ids])])),
    });
  };
  const wrappingHere = projectRunning.filter((x) => wrapping.includes(x.id));

  // The project at a glance, in place of the plugin's line in each terminal.
  const [glance, setGlance] = useState<{ awsTotal: number | null; awsCap: number | null; waiting: number | null } | null>(null);
  useEffect(() => {
    setGlance(null);
    if (!projectId) return;
    let live = true;
    const load = () => void window.elysium.glance(projectId).then((g) => { if (live) setGlance(g); });
    load();
    const t = setInterval(load, 120000);
    return () => { live = false; clearInterval(t); };
  }, [projectId]);
  const agentState = (role: 'prime' | 'meridian') => {
    const s = projectRunning.find((x) => x.templateId === `${projectId}.${role}`);
    if (!s) return null;
    const st = telemetry[s.id]?.state ?? 'running';
    return { st, label: st === 'busy' ? 'working' : st === 'waiting' ? 'needs you' : st === 'starting' ? 'starting' : 'idle' };
  };
  const openRelay = () => {
    const api = activeView ? apiFor(activeView.id) : undefined;
    const p = api?.panels.find((x) => x.id.startsWith('relay-'));
    if (p) p.api.setActive(); else open({ kind: 'relay', params: { projectId } });
  };

  const restart = useCallback(() => {
    const n = sessions.filter((x) => x.status === 'running').length;
    if (!n) { window.elysium.restartApp(); return; }
    setConfirm({
      title: 'Restart ElysiumProd?',
      body: `${n} session${n > 1 ? 's are' : ' is'} running and will stop. Claude sessions can be resumed afterwards from the project's top bar. Use Wrap up first if one is in the middle of something.`,
      yes: 'Restart',
      run: () => window.elysium.restartApp(),
    });
  }, [sessions, setConfirm]);

  const crumb = page === 'workspace'
    ? (activeView?.projectId
      ? <span className="crumb"><ProjectLogo projectId={activeView.projectId} /><strong>{activeView.name}</strong></span>
      : <span className="crumb"><strong>{activeView?.name ?? 'Workspace'}</strong></span>)
    : <span className="crumb"><strong>{PAGE_TITLES[page]}</strong></span>;

  return (
    <div className="shell">
      <Sidebar page={page} go={go} onPalette={() => setPalette(true)} onMemory={() => setMemory(true)} onDeleteView={removeView} />
      <div className="stage">
        <div className="topbar">
          {crumb}
          {projectId && (['prime', 'meridian'] as const).map((role) => {
            const t = templates.find((x) => x.id === `${projectId}.${role}`);
            if (!t) return null;
            const a = agentState(role);
            // Always one click away: shows the session if it runs, offers to start it if not.
            return (
              <button key={role} className="glance-btn" onClick={() => open({ kind: 'terminal', templateId: t.id, title: t.title })} title={a ? `Show ${t.title}` : `Start ${t.title}`}>
                <span className={`dot ${a?.st ?? ''}`} />{role === 'prime' ? 'Prime' : 'Meridian'} <span className="muted">{a ? a.label : 'off'}</span>
              </button>
            );
          })}
          <span className="spacer" />
          {glance?.awsTotal != null && <span className="glance" title="AWS and Bedrock spend this month, from the plugin's daily check">AWS ${glance.awsTotal.toFixed(2)} of ${glance.awsCap}</span>}
          {glance?.waiting ? <button className="pill warn" onClick={openRelay} title="Open the relay">{glance.waiting} waiting on you</button> : null}
          {projectId && projectRunning.length > 0 && (
            wrappingHere.length
              ? <span className="pill" title="Each session closes once it reaches a stopping point"><span className="dot busy" />Wrapping up {wrappingHere.length}{wrappingHere.some((x) => telemetry[x.id]?.state === 'waiting') ? ', one needs you' : ''}</span>
              : <button className="pill" onClick={wrapUp} title="Bring every session in this project to a stopping point and close them"><Moon size={14} />Wrap up</button>
          )}
        </div>
        {page === 'home' && <Home name={name || 'there'} onOpen={goProject} />}
        {page === 'settings' && <Settings onOnboarding={restartOnboarding} onRestart={restart} />}
        {page === 'help' && <Help />}
        {page === 'stats' && <Stats />}
        {ready && <Workspace visible={page === 'workspace'} />}
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={go} onProject={goProject} onRestart={restart} />}
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
