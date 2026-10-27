import { useCallback, useEffect, useRef, useState } from 'react';
import type { DockviewApi } from 'dockview-react';
import { Ellipsis, LayoutTemplate, RotateCcw, FolderTree, FoldVertical, LayoutGrid, Lightbulb, Moon, Pin, PinOff, ShieldAlert, Sparkles, Workflow, X, type LucideIcon } from 'lucide-react';
import { Sidebar, type Page } from './Sidebar';
import { Home } from './Home';
import { Settings } from './Settings';
import { Help } from './Help';
import { Stats } from './Stats';
import { Costs } from './Costs';
import { Usage } from './Usage';
import { Palette } from './Palette';
import { Onboarding } from './Onboarding';
import { ProjectLogo } from './ProjectLogo';
import { useAppearance } from './theme';
import { LiveProvider, useLive, useMachine } from './workspace/live';
import { WorkspaceProvider, useWorkspace, type OpenRequest } from './workspace/store';
import { Workspace, addPanel, builderTerminal, ensureProjectSessions, openChat, shortModel } from './workspace/Workspace';
import { NewProject, type Start as NewStart } from './NewProject';
import { Tour } from './Tour';
import { ThemeBuilder } from './ThemeBuilder';
import { Playbook } from './Playbook';
import { CHECKS, TOOL_INFO } from './tools';
import { MachineWidget } from './workspace/widgets';
import { overlayClosed, overlayOpened } from './workspace/ClaudePanel';
import { AccountUsage, ChatWatchSwitch, NoticeStack, ThemeToggle, useNotices, type Notice } from './TopBarExtras';

interface Confirm { title: string; body: string; yes: string; run(): void; /** A second choice beside the main one. */ alt?: { label: string; run(): void } }

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
    // Sessions just open: no resume question. A pair opens Meridian below Prime.
    const pair = req.pairTemplateId ? templatesRef.current.find((x) => x.id === req.pairTemplateId) : undefined;
    addPanel(api, { ...req, pairTemplateId: undefined });
    if (pair) addPanel(api, { kind: 'terminal', templateId: pair.id, title: pair.title });
  }, []);

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  return (
    <WorkspaceProvider onOpen={onOpen}>
      <Shell confirm={confirm} setConfirm={setConfirm} />
    </WorkspaceProvider>
  );
}

const PAGE_TITLES: Record<Page, string> = { home: 'Home', workspace: '', settings: 'Settings', help: 'Help', stats: 'Your stats', costs: 'Costs', usage: 'Usage', memory: 'Memory', playbook: 'Playbook' };

function Shell({ confirm, setConfirm }: { confirm: Confirm | null; setConfirm(c: Confirm | null): void }) {
  const [name, setName] = useState('');
  const [page, setPage] = useState<Page>('home');
  const [palette, setPalette] = useState(false);
  /** The New project dialog, open on what to start with. */
  const [newProject, setNewProjectOn] = useState<NewStart | null>(null);
  const setNewProject = (on: boolean | NewStart) => setNewProjectOn(on === true ? 'ios' : on || null);
  const [memory, setMemory] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  const [builder, setBuilder] = useState(false);
  useEffect(() => { const on = () => setBuilder(true); window.addEventListener('ep:theme-builder', on); return () => window.removeEventListener('ep:theme-builder', on); }, []);
  const tourHome = useCallback(() => setPage('home'), []);
  useEffect(() => { const on = () => setTour(true); window.addEventListener('ep:tour', on); return () => window.removeEventListener('ep:tour', on); }, []);
  const { templates, sessions, telemetry, compacting } = useLive();
  const { res } = useMachine();
  const [wrapping, setWrapping] = useState<string[]>([]);
  const { doc, ready, activeView, open, apiFor, setActiveView, deleteView, openProject, restartOnboarding, setSettings, addView, saveProjectLayout, forgetProjectLayout } = useWorkspace();

  useAppearance(doc.settings);
  useEffect(() => { void window.elysium.info().then((i) => setName(i.userName)); }, []);

  // Native web views draw above everything, so they hide while an overlay or another page shows.
  const overlayUp = palette || memory || Boolean(newProject) || Boolean(confirm) || page !== 'workspace' || !doc.onboarded;
  useEffect(() => { if (!overlayUp) return; overlayOpened(); return () => overlayClosed(); }, [overlayUp]);

  const go = useCallback((p: Page) => setPage(p), []);
  // Opening a project shows its Claude pane and its sessions, starting any that are not running.
  const docRef = useRef(doc);
  docRef.current = doc;
  const goProject = useCallback((id: string, projectName: string) => {
    const existed = docRef.current.views.some((v) => v.projectId === id);
    openProject(id, projectName);
    setPage('workspace');
    // A new view is laid out with its sessions already, unless it came from a saved layout.
    if (!existed && !docRef.current.projectLayouts?.[id]) return;
    setTimeout(() => {
      const v = docRef.current.views.find((x) => x.projectId === id);
      const api = v ? apiFor(v.id) : undefined;
      if (api) ensureProjectSessions(api, id, templatesRef2.current, builderTerminal(id, docRef.current.settings));
    }, 60);
  }, [openProject, apiFor]);
  const templatesRef2 = useRef(templates);
  templatesRef2.current = templates;
  // A project's sessions go into another view, beside whatever is there.
  const addToView = useCallback((projectId: string, viewId: string) => {
    setActiveView(viewId);
    setPage('workspace');
    setTimeout(() => { const api = apiFor(viewId); if (api) ensureProjectSessions(api, projectId, templatesRef2.current); }, 80);
  }, [apiFor, setActiveView]);
  // A quick check: open the PC Helper and hand it the job.
  const runCheck = useCallback(async (checkId: string) => {
    const c = CHECKS.find((x) => x.id === checkId);
    if (!c) return;
    goProject('laptop', 'PC Helper');
    const r = await window.elysium.chatSend('tool:laptop', c.prompt);
    setToast(r.ok ? `${c.title} started. The PC Helper reports back here.` : r.reason ?? 'Could not start it.');
  }, [goProject]);
  const dashboardFor = useCallback((projectId: string, projectName: string) => {
    goProject(projectId, projectName);
    setTimeout(() => {
      const v = docRef.current.views.find((x) => x.projectId === projectId);
      const api = v ? apiFor(v.id) : undefined;
      const dash = api?.panels.find((p) => p.id.startsWith('dashboard-'));
      if (dash) dash.api.setActive();
      else if (api) api.addPanel({ id: `dashboard-${Date.now().toString(36)}`, component: 'dashboard', title: 'Dashboard', params: { projectId } });
    }, 160);
  }, [goProject, apiFor]);

  // New project: once main has added it, open it as soon as its sessions are listed here.
  const [toOpen, setToOpen] = useState<{ id: string; name: string; window?: boolean; kickoff?: string } | null>(null);
  // Opens a project's view, then moves its terminal into a window of its own.
  const openInWindow = useCallback((id: string, projectName: string) => {
    goProject(id, projectName);
    const tries = { n: 0 };
    const tick = () => {
      const v = docRef.current.views.find((x) => x.projectId === id);
      const api = v ? apiFor(v.id) : undefined;
      const term = api?.panels.find((p) => p.id.startsWith('terminal-'));
      if (api && term) { void api.addPopoutGroup(term.group).catch(() => setToast('Could not open a new window. It is open here instead.')); return; }
      if ((tries.n += 1) < 20) setTimeout(tick, 150);
    };
    setTimeout(tick, 150);
  }, [goProject, apiFor]);
  useEffect(() => {
    if (!toOpen || !templates.some((t) => t.project === toOpen.id)) return;
    setToOpen(null);
    if (toOpen.window) openInWindow(toOpen.id, toOpen.name); else goProject(toOpen.id, toOpen.name);
    if (toOpen.kickoff) setKickoff({ id: toOpen.id, text: toOpen.kickoff, at: Date.now() });
  }, [toOpen, templates, goProject, openInWindow]);
  // A new iOS or web app: its first message waits until the pane has Claude running (a second start
  // would be refused while the first is still starting), then goes in once Claude is ready.
  const [kickoff, setKickoff] = useState<{ id: string; text: string; at: number } | null>(null);
  useEffect(() => {
    if (!kickoff) return;
    const lead = templates.find((t) => t.project === kickoff.id && (t.role === 'prime' || t.role === 'solo'));
    const up = lead && sessions.some((x) => x.templateId === lead.id && x.status === 'running');
    const send = () => { setKickoff(null); void window.elysium.quickRun(kickoff.id, kickoff.text).then((r) => { if (!r.ok) setToast(r.reason ?? 'Could not hand Claude its first message.'); }); };
    if (up) { send(); return; }
    // The pane did not start it (say memory was low): the task path starts it instead.
    const t = setTimeout(send, Math.max(0, 30000 - (Date.now() - kickoff.at)));
    return () => clearTimeout(t);
  }, [kickoff, templates, sessions]);
  // A Claude session tied to no project: made, kept under Sessions in the sidebar, and opened.
  const newFreeSession = useCallback(async (inWindow = false) => {
    const r = await window.elysium.createFreeSession();
    if (!r.ok || !r.projectId) { setToast(r.reason ?? 'Could not start a session.'); return; }
    setToOpen({ id: r.projectId, name: '', window: inWindow });
  }, []);

  const launch = useCallback((templateId: string) => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return false;
    if (t.project) openProject(t.project, t.projectName ?? t.project, { bare: t.kind === 'agent' });
    setTimeout(() => open({ kind: 'terminal', templateId: t.id, title: t.title }), 0);
    setPage('workspace');
    return true;
  }, [templates, open, openProject]);

  // A new empty view, from anywhere (the Layouts plus, Ctrl K, the smoke test).
  useEffect(() => { const on = () => { addView(); setPage('workspace'); }; window.addEventListener('ep:new-view', on); return () => window.removeEventListener('ep:new-view', on); }, [addView]);

  // The sidebar's "Start Codex" and the like: open the project and that session's pane.
  useEffect(() => { const on = (e: Event) => void launch((e as CustomEvent<string>).detail); window.addEventListener('ep:launch', on); return () => window.removeEventListener('ep:launch', on); }, [launch]);

  // A notification click: show that session, opening its pane if it has none.
  const focusSession = useCallback((sessionId: string, templateId: string) => {
    for (const v of doc.views) {
      const p = apiFor(v.id)?.panels.find((x) => (x.params as { sessionId?: string } | undefined)?.sessionId === sessionId);
      if (p) { setActiveView(v.id); setPage('workspace'); p.api.setActive(); return; }
    }
    const t = templates.find((x) => x.id === templateId);
    if (t?.project) openProject(t.project, t.projectName ?? t.project);
    setPage('workspace');
    setTimeout(() => open({ kind: 'terminal', templateId, title: t?.title, params: { sessionId } }), 50);
  }, [doc.views, apiFor, setActiveView, templates, openProject, open]);
  useEffect(() => window.elysium.onFocusSession(focusSession), [focusSession]);
  // Help and others can open a tool by id.
  useEffect(() => { const on = (e: Event) => { const id = (e as CustomEvent<string>).detail; goProject(id, TOOL_INFO[id]?.title ?? id); }; window.addEventListener('ep:open-tool', on); return () => window.removeEventListener('ep:open-tool', on); }, [goProject]);
  useEffect(() => { const on = (e: Event) => void runCheck((e as CustomEvent<string>).detail); window.addEventListener('ep:run-check', on); return () => window.removeEventListener('ep:run-check', on); }, [runCheck]);
  useEffect(() => {
    const np = () => setNewProject(true);
    const goTo = (e: Event) => setPage((e as CustomEvent<Page>).detail);
    window.addEventListener('ep:new-project', np); window.addEventListener('ep:go', goTo);
    return () => { window.removeEventListener('ep:new-project', np); window.removeEventListener('ep:go', goTo); };
  }, []);

  // Whether you can see a session right now: its pane is showing in the open view of a focused window.
  const pageRef = useRef(page);
  pageRef.current = page;
  const isVisible = useCallback((sessionId: string) => {
    if (pageRef.current !== 'workspace' || !activeView || !document.hasFocus()) return false;
    const p = apiFor(activeView.id)?.panels.find((x) => (x.params as { sessionId?: string } | undefined)?.sessionId === sessionId);
    return Boolean(p?.api.isVisible);
  }, [activeView, apiFor]);
  const { notices, push, dismiss } = useNotices(isVisible, doc.settings.notifyReplies !== false);
  const openNotice = useCallback((n: Notice) => focusSession(n.sessionId, n.templateId), [focusSession]);

  // Say when a session starts compacting by itself, so the pause is not a surprise.
  const seenCompact = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of Object.values(compacting)) {
      if (!c.auto || seenCompact.current.has(c.sessionId)) continue;
      seenCompact.current.add(c.sessionId);
      const sInfo = sessions.find((x) => x.id === c.sessionId);
      const t = templates.find((x) => x.id === sInfo?.templateId);
      if (sInfo) push({ sessionId: c.sessionId, templateId: sInfo.templateId, projectId: t?.project ?? null, title: `Compacting ${t?.title ?? 'a session'}`, body: `Its context passed ${doc.settings.autoCompact.percent}%. It is saving its notes first, then it carries on.`, kind: 'info' });
    }
    for (const id of [...seenCompact.current]) if (!compacting[id]) seenCompact.current.delete(id);
  }, [compacting, sessions, templates, push, doc.settings.autoCompact.percent]);

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
      else if (e.shiftKey && k === 's') { e.preventDefault(); go('settings'); }
      else if (e.shiftKey && k === 't') { e.preventDefault(); launch('local.shell'); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, launch]);

  // Lets the smoke test start a template the same way a click does.
  useEffect(() => {
    const prev = window.__smoke;
    window.__smoke = { type: prev?.type ?? (() => {}), screen: prev?.screen ?? (() => ''), launch: async (id: string) => launch(id), open: (req: OpenRequest) => { setPage('workspace'); open(req); }, popout: async () => { const api = activeView ? apiFor(activeView.id) : undefined; const g = api?.activeGroup ?? api?.groups[0]; if (!api || !g) return 'no group'; try { return String(await api.addPopoutGroup(g)); } catch (e) { return String(e); } }, closeProjectView: (pid: string) => { const v = docRef.current.views.find((x) => x.projectId === pid); if (v) deleteView(v.id); return Boolean(v); }, viewPanels: () => (apiFor(docRef.current.activeViewId ?? '')?.panels ?? []).map((p) => p.title ?? p.id) };
  }, [launch, open]);

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
      body: `${n === 1 ? 'Its session' : `All ${n} sessions`} will finish the current step at a clean point, note where they are, then close. If one needs your answer first, you will get a notification.`,
      yes: 'Wrap up',
      run: () => void window.elysium.wrapUp(projectId).then((ids) => setWrapping((w) => [...new Set([...w, ...ids])])),
    });
  };
  const wrappingHere = projectRunning.filter((x) => wrapping.includes(x.id));
  const claudeHere = projectRunning.filter((x) => templates.find((t) => t.id === x.templateId)?.kind === 'claude');
  const compactingHere = claudeHere.filter((x) => compacting[x.id]);
  const compactNow = () => {
    if (!claudeHere.length) return;
    const names = claudeHere.map((x) => templates.find((t) => t.id === x.templateId)?.title ?? x.title);
    setConfirm({
      title: `Compact ${names.length === 1 ? names[0] : names.join(' and ')}?`,
      body: `${names.length === 1 ? 'It' : 'Each'} first finishes its current step and notes where it is, then compacts and carries on. Nothing is typed into a session while it is in the middle of a turn.`,
      yes: 'Compact',
      run: () => void window.elysium.compact(claudeHere.map((x) => x.id)),
    });
  };
  const compactStage = (() => {
    const st = compactingHere.map((x) => compacting[x.id].stage);
    return st.includes('compacting') ? 'compacting' : st.includes('stopping') ? 'saving notes' : st.includes('resuming') ? 'carrying on' : 'waiting for a pause';
  })();

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
    return { st, label: st === 'busy' ? 'working' : st === 'waiting' ? 'needs you' : st === 'starting' ? 'starting' : 'idle', model: telemetry[s.id]?.model ?? null };
  };
  const openDashboard = () => {
    const api = activeView ? apiFor(activeView.id) : undefined;
    const p = api?.panels.find((x) => x.id.startsWith('dashboard-'));
    if (p) p.api.setActive(); else open({ kind: 'dashboard', params: { projectId } });
  };
  // One click: the project's lead session writes up what it is working on as a Claude artifact and replies with the link.
  const makeArtifact = async () => {
    if (!projectId) return;
    const r = await window.elysium.quickRun(projectId, 'Make a Claude artifact page about what we are working on in this project right now: the goal, what is done, what is in progress, what is next, and anything blocked or waiting on me. Make it glanceable, with real numbers and links where you have them, and no filler. Publish it with your Artifact tool, then reply with the link and one line on what it shows.');
    setToast(r.ok ? 'Asked for an artifact. The link comes back as a notification when it is published.' : r.reason ?? 'Could not ask for it.');
  };
  const toggleFiles = () => {
    const api = activeView ? apiFor(activeView.id) : undefined;
    if (!api || !projectId) return;
    const have = api.panels.find((p) => p.id.startsWith('files-'));
    if (have) { have.api.close(); return; }
    addPanel(api, { kind: 'files', title: 'Files', params: { projectId } });
  };
  const openPlan = () => {
    const api = activeView ? apiFor(activeView.id) : undefined;
    if (api && projectId) openChat(api, `plan:${projectId}`, projectId, 'Plan');
  };
  const openFlow = () => {
    const api = activeView ? apiFor(activeView.id) : undefined;
    const p = api?.panels.find((x) => x.id.startsWith('flow-'));
    if (p) { p.api.setActive(); return; }
    // Beside the terminals: in the group to the right of the first terminal.
    const term = api?.panels.find((x) => x.id.startsWith('terminal-'));
    if (api && term) api.addPanel({ id: `flow-${Math.random().toString(36).slice(2, 10)}`, component: 'flow', title: 'Live flow', params: { projectId }, position: { referenceGroup: term.group.id, direction: 'right' } });
    else open({ kind: 'flow', params: { projectId } });
  };
  const openRelay = () => {
    const api = activeView ? apiFor(activeView.id) : undefined;
    const p = api?.panels.find((x) => x.id.startsWith('relay-'));
    if (p) p.api.setActive(); else open({ kind: 'relay', params: { projectId } });
  };

  // Running sessions come back either way; Restart and resume also tells the ones mid task to carry on.
  const restart = useCallback((carryOn = false) => {
    const mid = sessions.filter((x) => x.status === 'running' && ['busy', 'waiting'].includes(telemetry[x.id]?.state ?? '')).length;
    if (!mid || carryOn) { window.elysium.restartApp(carryOn); return; }
    setConfirm({
      title: 'Restart Elysium?',
      body: `${mid} session${mid > 1 ? 's are' : ' is'} in the middle of something. Running sessions come back after the restart. Restart and resume also tells ${mid > 1 ? 'them' : 'it'} to carry on where ${mid > 1 ? 'they' : 'it'} left off.`,
      yes: 'Restart and resume',
      run: () => window.elysium.restartApp(true),
      alt: { label: 'Just restart', run: () => window.elysium.restartApp() },
    });
  }, [sessions, telemetry, setConfirm]);

  // The top bar keeps only what matters at a glance; the rest waits in More, and any of it can be pinned back.
  const pins = doc.settings.topbarPins ?? [];
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { if (!moreOpen) return; overlayOpened(); return () => overlayClosed(); }, [moreOpen]);
  const togglePin = (id: string) => setSettings({ topbarPins: pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id] });
  const toggleAutoCompact = () => setSettings({ autoCompact: { ...doc.settings.autoCompact, enabled: !doc.settings.autoCompact.enabled } });
  const topItems: { id: string; label: string; hint: string; icon: LucideIcon; run(): void }[] = projectId && !TOOL_INFO[projectId] ? [
    { id: 'dashboard', label: 'Dashboard', hint: "Tasks, numbers, links and requests", icon: LayoutGrid, run: openDashboard },
    { id: 'files', label: 'Files', hint: "The project's files, like VS Code's explorer", icon: FolderTree, run: toggleFiles },
    { id: 'plan', label: 'Plan', hint: 'A planning chat that knows this project', icon: Lightbulb, run: openPlan },
    { id: 'flow', label: 'Flow', hint: 'What each session is doing, drawn live', icon: Workflow, run: openFlow },
    { id: 'artifact', label: 'Artifact', hint: 'Publish a Claude artifact of the current work', icon: Sparkles, run: () => void makeArtifact() },
  ] : [];

  const crumb = page === 'workspace'
    ? (activeView?.projectId
      ? <span className="crumb"><ProjectLogo projectId={activeView.projectId} /><strong>{activeView.name}</strong></span>
      : <span className="crumb"><strong>{activeView?.name ?? 'Workspace'}</strong></span>)
    : <span className="crumb"><strong>{PAGE_TITLES[page]}</strong></span>;

  return (
    <div className="shell">
      <Sidebar page={page} go={go} onPalette={() => setPalette(true)} onMemory={() => setMemory(true)} onDeleteView={removeView} onNewProject={() => setNewProject(true)} onProject={goProject} onAddToView={addToView} onDashboard={dashboardFor} onNote={setToast} onFocus={focusSession} onRunCheck={runCheck} onNewSession={(w) => void newFreeSession(w)} onOpenInWindow={openInWindow} />
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
                <span className={`dot ${a?.st ?? ''}`} />{role === 'prime' ? 'Prime' : 'Meridian'}{a?.model && <span className="model-chip" title={`Model: ${a.model}`}>{shortModel(a.model)}</span>} <span className="muted">{a ? a.label : 'off'}</span>
              </button>
            );
          })}
          {projectId && topItems.filter((x) => pins.includes(x.id)).map((x) => <button key={x.id} className="glance-btn" onClick={x.run} title={x.hint}><x.icon size={14} />{x.label}</button>)}
          {projectId && pins.includes('watch') && <ChatWatchSwitch projectId={projectId} onNote={setToast} />}
          {projectId && pins.includes('compact') && claudeHere.length > 0 && !compactingHere.length && !wrappingHere.length && (
            <span className="pill-group">
              <button className={`pill auto-compact ${doc.settings.autoCompact.enabled ? 'on' : ''}`} role="switch" aria-checked={doc.settings.autoCompact.enabled} onClick={toggleAutoCompact}
                title={doc.settings.autoCompact.enabled ? `Auto compact is on: a session past ${doc.settings.autoCompact.percent}% context saves its notes, compacts and carries on. Click to turn it off.` : 'Auto compact is off. Click to turn it on.'}>
                <FoldVertical size={14} />Auto compact <span className="mini-switch"><i /></span>
              </button>
              <button className="pill ghost" onClick={compactNow} title="Compact every session in this project now">Now</button>
            </span>
          )}
          <span className="spacer" />
          <AccountUsage />
          <ThemeToggle />
          {glance?.awsTotal != null && <span className="glance" title="AWS and Bedrock spend this month, from the plugin's daily check">AWS ${glance.awsTotal.toFixed(2)} of ${glance.awsCap}</span>}
          {glance?.waiting ? <button className="pill warn" onClick={openRelay} title="Open the relay">{glance.waiting} waiting</button> : null}
          {projectId && claudeHere.length > 0 && compactingHere.length > 0 && !wrappingHere.length && <span className="pill" title="Each session saves its notes, compacts, then carries on"><span className="dot busy" />Compacting, {compactStage}</span>}
          {projectId && wrappingHere.length > 0 && <span className="pill" title="Each session closes once it reaches a stopping point"><span className="dot busy" />Wrapping up {wrappingHere.length}{wrappingHere.some((x) => telemetry[x.id]?.state === 'waiting') ? ', one needs you' : ''}</span>}
          {projectId && pins.includes('wrap') && projectRunning.length > 0 && !wrappingHere.length && <button className="pill" onClick={wrapUp} title="Bring every session in this project to a stopping point and close them"><Moon size={14} />Wrap up</button>}
          {projectId && (
            <div className="top-more">
              <button className={`glance-btn icon ${moreOpen ? 'open' : ''}`} onClick={() => setMoreOpen((o) => !o)} title="More for this project" aria-label="More for this project" aria-expanded={moreOpen}><Ellipsis size={16} /></button>
              {moreOpen && (
                <>
                  <div className="menu-scrim" onClick={() => setMoreOpen(false)} />
                  <div className="menu top-menu" role="menu">
                    {topItems.length > 0 && <div className="menu-label">This project</div>}
                    {topItems.map((x) => (
                      <div key={x.id} className="top-menu-row">
                        <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); x.run(); }}><x.icon size={16} /><span className="grow"><span>{x.label}</span><span className="menu-sub">{x.hint}</span></span></button>
                        <PinToggle id={x.id} pins={pins} onToggle={togglePin} />
                      </div>
                    ))}
                    {claudeHere.length > 0 && (
                      <>
                        <div className="menu-label">Sessions</div>
                        <div className="top-menu-row">
                          <button className="menu-item" role="menuitemcheckbox" aria-checked={doc.settings.autoCompact.enabled} onClick={toggleAutoCompact}>
                            <FoldVertical size={16} /><span className="grow"><span>Auto compact</span><span className="menu-sub">{doc.settings.autoCompact.enabled ? `On, at ${doc.settings.autoCompact.percent}% context` : 'Off'}</span></span><span className={`mini-switch ${doc.settings.autoCompact.enabled ? 'on' : ''}`}><i /></span>
                          </button>
                          <PinToggle id="compact" pins={pins} onToggle={togglePin} />
                        </div>
                        <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); compactNow(); }}><FoldVertical size={16} /><span className="grow">Compact every session now</span></button>
                      </>
                    )}
                    {projectRunning.length > 0 && !wrappingHere.length && (
                      <div className="top-menu-row">
                        <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); wrapUp(); }}><Moon size={16} /><span className="grow"><span>Wrap up</span><span className="menu-sub">Bring every session to a stopping point and close them</span></span></button>
                        <PinToggle id="wrap" pins={pins} onToggle={togglePin} />
                      </div>
                    )}
                    <div className="menu-label">Layout</div>
                    <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); if (saveProjectLayout(projectId)) setToast(`Saved. ${activeView?.name ?? 'This project'} opens this way next time.`); }}>
                      <LayoutTemplate size={16} /><span className="grow"><span>Save this layout</span><span className="menu-sub">{doc.projectLayouts?.[projectId] ? 'Replaces the saved one' : 'Opens this way next time'}</span></span>
                    </button>
                    {doc.projectLayouts?.[projectId] && (
                      <button className="menu-item" role="menuitem" onClick={() => { setMoreOpen(false); forgetProjectLayout(projectId); setToast('Forgotten. It opens with the usual layout next time.'); }}>
                        <RotateCcw size={16} /><span className="grow"><span>Forget the saved layout</span><span className="menu-sub">Back to the usual arrangement</span></span>
                      </button>
                    )}
                    {!TOOL_INFO[projectId] && !pins.includes('watch') && <div className="top-menu-watch"><ChatWatchSwitch projectId={projectId} onNote={setToast} /></div>}
                    {!TOOL_INFO[projectId] && <div className="top-menu-row foot">
                      <span className="menu-sub">Pin an item to keep it on the bar.</span>
                      <PinToggle id="watch" pins={pins} onToggle={togglePin} label="Chat watcher" />
                    </div>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {page === 'home' && <Home name={doc.settings.displayName || name || 'there'} onOpen={goProject} onFocus={focusSession} onNewProject={() => setNewProject(true)} />}
        {page === 'settings' && <Settings onOnboarding={restartOnboarding} onRestart={() => restart()} onRestartResume={() => restart(true)} />}
        {page === 'help' && <Help />}
        {page === 'stats' && <Stats />}
        {page === 'usage' && <Usage />}
        {page === 'playbook' && <Playbook />}
        {page === 'memory' && <div className="page page-enter"><div className="page-inner mem-page"><h1 className="page-title">Memory and disk</h1><p className="page-sub">What this PC is busy with, and what would help.</p><MachineWidget full /></div></div>}
        {page === 'costs' && <Costs />}
        {ready && <Workspace visible={page === 'workspace'} />}
      </div>

      {palette && <Palette onClose={() => setPalette(false)} go={go} onProject={goProject} onRestart={() => restart()} onRestartResume={() => restart(true)} onNewProject={(start) => setNewProject(start ?? true)} onNewSession={() => void newFreeSession()} />}
      {newProject && <NewProject start={newProject} onClose={() => setNewProject(false)} onCreated={(id, n, kickoff, note) => { setNewProject(false); setToOpen({ id, name: n, kickoff }); if (note) setToast(note); }} />}
      {toast && <div className="toast over-native" role="status">{toast}</div>}
      <NoticeStack notices={notices} onOpen={openNotice} onDismiss={dismiss} />

      {memory && (
        <div className="backdrop" onClick={() => setMemory(false)}>
          <div className="dialog" style={{ maxWidth: '36rem', textAlign: 'left', padding: 0, maxHeight: '86vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Memory">
            <div className="bar" style={{ justifyContent: 'space-between' }}><strong>Memory</strong><button className="ghost-icon" onClick={() => setMemory(false)} aria-label="Close"><X size={16} /></button></div>
            <MachineWidget onFull={() => { setMemory(false); setPage('memory'); }} />
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
              {confirm.alt && <button className="btn" onClick={() => { const a = confirm.alt; setConfirm(null); a?.run(); }}>{confirm.alt.label}</button>}
              <button className="btn primary" autoFocus onClick={() => { const c = confirm; setConfirm(null); c.run(); }}>{confirm.yes}</button>
            </div>
          </div>
        </div>
      )}

      {ready && !doc.onboarded && <Onboarding name={name} />}
      {tour && <Tour onClose={() => setTour(false)} goHome={tourHome} />}
      {builder && <ThemeBuilder onClose={() => setBuilder(false)} />}
    </div>
  );
}

function PinToggle({ id, pins, onToggle, label }: { id: string; pins: string[]; onToggle(id: string): void; label?: string }) {
  const on = pins.includes(id);
  return (
    <button className={`pin-toggle ${on ? 'on' : ''}`} onClick={() => onToggle(id)} title={on ? 'Unpin from the bar' : 'Pin to the bar'} aria-label={on ? `Unpin ${label ?? id} from the bar` : `Pin ${label ?? id} to the bar`} aria-pressed={on}>
      {on ? <Pin size={13} /> : <PinOff size={13} />}{label && <span>{label}</span>}
    </button>
  );
}
