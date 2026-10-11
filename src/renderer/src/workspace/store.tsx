// Workspace state: appearance, accounts and which project uses which, named views
// with their Dockview layouts, presets, watchers, notes, and onboarding.
// Saved to %APPDATA%\elysiumprod\workspace.json through the main process on every
// change (main debounces the disk write).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DockviewApi, SerializedDockview } from 'dockview-react';
import type { WatcherConfig } from '@shared/ipc';

export type ThemeId = 'system' | 'claude-dark' | 'claude-light' | 'midnight' | 'graphite' | 'paper' | 'forest';
export type Density = 'comfortable' | 'compact';

export const THEMES: { id: ThemeId; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: 'system', name: 'System', blurb: 'Follows Windows light or dark', swatch: ['#262624', '#FAF9F5', '#D97757'] },
  { id: 'claude-dark', name: 'Warm dark', blurb: 'Soft charcoal, like Claude', swatch: ['#262624', '#30302E', '#D97757'] },
  { id: 'claude-light', name: 'Warm light', blurb: 'Ivory paper, like Claude', swatch: ['#FAF9F5', '#EFEDE6', '#C96442'] },
  { id: 'midnight', name: 'Midnight', blurb: 'Deep blue black, cool', swatch: ['#0F1420', '#182033', '#6E9BFF'] },
  { id: 'graphite', name: 'Graphite', blurb: 'Neutral grey, like ChatGPT', swatch: ['#212121', '#2F2F2F', '#ECECEC'] },
  { id: 'paper', name: 'Paper', blurb: 'Bright and crisp', swatch: ['#F7F8FA', '#FFFFFE', '#2F6FDB'] },
  { id: 'forest', name: 'Forest', blurb: 'Muted green dark', swatch: ['#16201B', '#1F2B25', '#6CC59A'] },
];

export interface Settings {
  theme: ThemeId;
  /** Empty means the theme's own accent. */
  accent: string;
  density: Density;
  /** Base text size for the whole app, in px. */
  textSize: number;
  termFontSize: number;
  gap: number;
  /** Opt in. Above the threshold, ElysiumProd ends only the programs listed here. */
  autoEnd: { enabled: boolean; thresholdPercent: number; programs: string[] };
}

export interface AccountPrefs { label: string }

export interface View {
  id: string;
  name: string;
  layout: SerializedDockview | null;
  /** A project view belongs to one project; its panes default to that project and its account. */
  projectId?: string;
  /** Bumped to rebuild the view from scratch. */
  rev?: number;
}

export interface Preset {
  id: string;
  name: string;
  savedAt: string;
  settings: Settings;
  layout: SerializedDockview | null;
}

export interface WorkspaceDoc {
  version: 1;
  settings: Settings;
  views: View[];
  activeViewId: string | null;
  notes: Record<string, string>;
  presets: Preset[];
  /** Account id (config directory) to display name, for example main to "Aatir". */
  accounts: Record<string, AccountPrefs>;
  /** Which Claude account each project uses, for its terminals and its Claude pane. */
  projectAccounts: Record<string, string>;
  watchers: Record<string, WatcherConfig>;
  onboarded: boolean;
  lastProjectId: string | null;
  /** Projects shown in the sidebar and on Home; the rest stay one search away. */
  pinned: string[];
}

/**
 * A preset never carries live session ids. Terminal panes are saved as
 * "not started", so applying a preset can never resume a Claude session by itself.
 */
export function stripSessions(layout: SerializedDockview | null): SerializedDockview | null {
  if (!layout) return layout;
  const copy = JSON.parse(JSON.stringify(layout)) as SerializedDockview & { panels: Record<string, { params?: Record<string, unknown> }> };
  for (const p of Object.values(copy.panels ?? {})) {
    if (p.params && 'sessionId' in p.params) { delete p.params.sessionId; p.params.pending = true; }
  }
  return copy;
}

export const ACCENTS: { name: string; value: string }[] = [
  { name: 'Theme default', value: '' },
  { name: 'Clay', value: '#D97757' },
  { name: 'Ocean', value: '#5B8DEF' },
  { name: 'Jade', value: '#4FA97A' },
  { name: 'Iris', value: '#9B7BE0' },
  { name: 'Rose', value: '#E06C8C' },
  { name: 'Amber', value: '#D9A043' },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: '',
  density: 'comfortable',
  textSize: 15,
  termFontSize: 14,
  gap: 8,
  autoEnd: { enabled: false, thresholdPercent: 90, programs: [] },
};

const uid = () => Math.random().toString(36).slice(2, 10);

function fresh(): WorkspaceDoc {
  return {
    version: 1, settings: DEFAULT_SETTINGS, views: [], activeViewId: null, notes: {}, presets: [],
    accounts: { main: { label: 'Main account' } }, projectAccounts: {}, watchers: {}, onboarded: false, lastProjectId: null,
    pinned: ['posture', 'intern', 'attestia', 'gulf', 'builds'],
  };
}

function parse(json: string | null): WorkspaceDoc {
  const f = fresh();
  if (!json) return f;
  try {
    const d = JSON.parse(json) as Partial<WorkspaceDoc> & { settings?: Partial<Settings> & { theme?: string } };
    const views = Array.isArray(d.views) ? d.views : [];
    const theme = THEMES.some((t) => t.id === d.settings?.theme) ? (d.settings!.theme as ThemeId) : 'system';
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), theme, autoEnd: { ...DEFAULT_SETTINGS.autoEnd, ...(d.settings?.autoEnd ?? {}) } },
      views,
      activeViewId: views.some((v) => v.id === d.activeViewId) ? d.activeViewId! : views[0]?.id ?? null,
      notes: d.notes ?? {},
      presets: Array.isArray(d.presets) ? d.presets : [],
      accounts: { ...f.accounts, ...(d.accounts ?? {}) },
      projectAccounts: d.projectAccounts ?? {},
      watchers: d.watchers ?? {},
      onboarded: Boolean(d.onboarded),
      lastProjectId: d.lastProjectId ?? null,
      pinned: Array.isArray(d.pinned) ? d.pinned : f.pinned,
    };
  } catch {
    return f;
  }
}

export type PanelKind = 'terminal' | 'machine' | 'sessions' | 'notes' | 'launcher' | 'relay' | 'tasks' | 'git' | 'document' | 'claude' | 'watcher';

export interface OpenRequest {
  kind: PanelKind;
  templateId?: string;
  title?: string;
  /** Group to add beside; omitted means the view's active group. */
  referenceGroupId?: string;
  /** Extra panel params, for example a projectId for project widgets. */
  params?: Record<string, unknown>;
  /** Terminals opened from a launcher go into the terminal area, not into the launcher's group. */
  besideLauncher?: boolean;
}

interface Ctx {
  doc: WorkspaceDoc;
  ready: boolean;
  activeView: View | null;
  setSettings(p: Partial<Settings>): void;
  addView(name?: string, projectId?: string): string;
  renameView(id: string, name: string): void;
  deleteView(id: string): void;
  setActiveView(id: string): void;
  setLayout(id: string, layout: SerializedDockview): void;
  setNote(panelId: string, text: string): void;
  resetView(id: string): void;
  savePreset(name: string): void;
  applyPreset(id: string): void;
  deletePreset(id: string): void;
  setAccountLabel(id: string, label: string): void;
  setProjectAccount(projectId: string, accountId: string): void;
  accountFor(projectId: string | null | undefined): string;
  setWatcher(projectId: string, cfg: WatcherConfig): void;
  togglePin(projectId: string): void;
  finishOnboarding(): void;
  restartOnboarding(): void;
  /** Opens (or switches to) the project's own view. */
  openProject(projectId: string, name: string): void;
  registerApi(viewId: string, api: DockviewApi | null): void;
  apiFor(viewId: string): DockviewApi | undefined;
  /** Opens a panel in the active view, creating a view if there is none. */
  open(req: OpenRequest): void;
  /** Requests waiting for a view's Dockview to become ready. */
  takeQueued(viewId: string): OpenRequest[];
}

const WorkspaceContext = createContext<Ctx | null>(null);

export function useWorkspace(): Ctx {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error('useWorkspace outside WorkspaceProvider');
  return c;
}

export function WorkspaceProvider({ children, onOpen }: { children: ReactNode; onOpen(viewId: string, req: OpenRequest, api: DockviewApi): void }) {
  const [doc, setDoc] = useState<WorkspaceDoc>(fresh);
  const [ready, setReady] = useState(false);
  const apis = useRef(new Map<string, DockviewApi>());
  const queue = useRef(new Map<string, OpenRequest[]>());
  const docRef = useRef(doc);
  docRef.current = doc;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    void window.elysium.loadWorkspace().then((j) => { setDoc(parse(j)); setReady(true); });
  }, []);

  useEffect(() => {
    if (ready) window.elysium.saveWorkspace(JSON.stringify(doc));
  }, [doc, ready]);

  // Watchers live in the main process; tell it what the owner chose, on load and on change.
  useEffect(() => {
    if (!ready) return;
    for (const [pid, cfg] of Object.entries(doc.watchers)) window.elysium.setWatcher(pid, cfg);
  }, [doc.watchers, ready]);

  const setSettings = useCallback((p: Partial<Settings>) => setDoc((d) => ({ ...d, settings: { ...d.settings, ...p } })), []);
  const addView = useCallback((name?: string, projectId?: string) => {
    const id = uid();
    setDoc((d) => ({ ...d, views: [...d.views, { id, name: name ?? `View ${d.views.length + 1}`, layout: null, projectId }], activeViewId: id }));
    return id;
  }, []);
  const renameView = useCallback((id: string, name: string) => setDoc((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, name: name.trim() || v.name } : v)) })), []);
  const deleteView = useCallback((id: string) => setDoc((d) => {
    const views = d.views.filter((v) => v.id !== id);
    return { ...d, views, activeViewId: d.activeViewId === id ? views[0]?.id ?? null : d.activeViewId };
  }), []);
  const setActiveView = useCallback((id: string) => setDoc((d) => {
    const v = d.views.find((x) => x.id === id);
    return { ...d, activeViewId: id, lastProjectId: v?.projectId ?? d.lastProjectId };
  }), []);
  const setLayout = useCallback((id: string, layout: SerializedDockview) => setDoc((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, layout } : v)) })), []);
  const setNote = useCallback((panelId: string, text: string) => setDoc((d) => ({ ...d, notes: { ...d.notes, [panelId]: text } })), []);
  const resetView = useCallback((id: string) => setDoc((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, layout: null, rev: (v.rev ?? 0) + 1 } : v)) })), []);
  const savePreset = useCallback((name: string) => setDoc((d) => {
    const v = d.views.find((x) => x.id === d.activeViewId);
    const layout = v ? stripSessions(apis.current.get(v.id)?.toJSON() ?? v.layout) : null;
    const preset: Preset = { id: uid(), name: name.trim() || `Preset ${d.presets.length + 1}`, savedAt: new Date().toISOString(), settings: d.settings, layout };
    return { ...d, presets: [...d.presets, preset] };
  }), []);
  const applyPreset = useCallback((id: string) => setDoc((d) => {
    const p = d.presets.find((x) => x.id === id);
    if (!p) return d;
    // Applying rebuilds the active view; its running terminals are stopped by the remount.
    return {
      ...d,
      settings: { ...DEFAULT_SETTINGS, ...p.settings },
      views: d.views.map((v) => (v.id === d.activeViewId ? { ...v, layout: stripSessions(p.layout), rev: (v.rev ?? 0) + 1 } : v)),
    };
  }), []);
  const deletePreset = useCallback((id: string) => setDoc((d) => ({ ...d, presets: d.presets.filter((p) => p.id !== id) })), []);
  const setAccountLabel = useCallback((id: string, label: string) => setDoc((d) => ({ ...d, accounts: { ...d.accounts, [id]: { label: label.trim() || id } } })), []);
  const setProjectAccount = useCallback((projectId: string, accountId: string) => setDoc((d) => ({ ...d, projectAccounts: { ...d.projectAccounts, [projectId]: accountId } })), []);
  const accountFor = useCallback((projectId: string | null | undefined) => (projectId && docRef.current.projectAccounts[projectId]) || 'main', []);
  const setWatcher = useCallback((projectId: string, cfg: WatcherConfig) => setDoc((d) => ({ ...d, watchers: { ...d.watchers, [projectId]: cfg } })), []);
  const togglePin = useCallback((projectId: string) => setDoc((d) => ({ ...d, pinned: d.pinned.includes(projectId) ? d.pinned.filter((x) => x !== projectId) : [...d.pinned, projectId] })), []);
  const finishOnboarding = useCallback(() => setDoc((d) => ({ ...d, onboarded: true })), []);
  const restartOnboarding = useCallback(() => setDoc((d) => ({ ...d, onboarded: false })), []);
  const openProject = useCallback((projectId: string, name: string) => {
    const existing = docRef.current.views.find((v) => v.projectId === projectId);
    if (existing) setDoc((d) => ({ ...d, activeViewId: existing.id, lastProjectId: projectId }));
    else {
      const id = uid();
      setDoc((d) => ({ ...d, views: [...d.views, { id, name, layout: null, projectId }], activeViewId: id, lastProjectId: projectId }));
    }
  }, []);
  const registerApi = useCallback((viewId: string, api: DockviewApi | null) => {
    if (api) apis.current.set(viewId, api); else apis.current.delete(viewId);
  }, []);
  const apiFor = useCallback((viewId: string) => apis.current.get(viewId), []);
  const takeQueued = useCallback((viewId: string) => {
    const q = queue.current.get(viewId) ?? [];
    queue.current.delete(viewId);
    return q;
  }, []);
  const open = useCallback((req: OpenRequest) => {
    let viewId = docRef.current.activeViewId;
    if (!viewId) viewId = addView('Workspace');
    const api = apis.current.get(viewId);
    if (api) onOpenRef.current(viewId, req, api);
    else queue.current.set(viewId, [...(queue.current.get(viewId) ?? []), req]);
  }, [addView]);

  const activeView = doc.views.find((v) => v.id === doc.activeViewId) ?? null;
  const value = useMemo<Ctx>(() => ({
    doc, ready, activeView, setSettings, addView, renameView, deleteView, setActiveView, setLayout, setNote, resetView, savePreset, applyPreset, deletePreset,
    setAccountLabel, setProjectAccount, accountFor, setWatcher, togglePin, finishOnboarding, restartOnboarding, openProject, registerApi, apiFor, open, takeQueued,
  }), [doc, ready, activeView, setSettings, addView, renameView, deleteView, setActiveView, setLayout, setNote, resetView, savePreset, applyPreset, deletePreset,
    setAccountLabel, setProjectAccount, accountFor, setWatcher, togglePin, finishOnboarding, restartOnboarding, openProject, registerApi, apiFor, open, takeQueued]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
