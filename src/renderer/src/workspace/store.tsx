// Workspace state: appearance, accounts and which project uses which, named views
// with their Dockview layouts, presets, watchers, notes, and onboarding.
// Saved to %APPDATA%\elysiumprod\workspace.json through the main process on every
// change (main debounces the disk write).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DockviewApi, SerializedDockview } from 'dockview-react';
import type { WatcherConfig } from '@shared/ipc';

/** Projects added after the first run that should show up pinned once. */
const LATER_PINS = ['laptop'];

export type ThemeId = 'system' | 'claude-dark' | 'claude-light' | 'midnight' | 'graphite' | 'paper' | 'forest' | 'ocean' | 'ember' | 'nord' | 'rose' | 'sand' | 'mint' | 'aurora';
export type Density = 'comfortable' | 'compact';

export const THEMES: { id: ThemeId; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: 'system', name: 'System', blurb: 'Follows Windows light or dark', swatch: ['#262624', '#FAF9F5', '#D97757'] },
  { id: 'claude-dark', name: 'Warm dark', blurb: 'Soft charcoal, like Claude', swatch: ['#262624', '#30302E', '#D97757'] },
  { id: 'claude-light', name: 'Warm light', blurb: 'Ivory paper, like Claude', swatch: ['#FAF9F5', '#EFEDE6', '#C96442'] },
  { id: 'midnight', name: 'Midnight', blurb: 'Deep blue black, cool', swatch: ['#0F1420', '#182033', '#6E9BFF'] },
  { id: 'graphite', name: 'Graphite', blurb: 'Neutral grey, like ChatGPT', swatch: ['#212121', '#2F2F2F', '#ECECEC'] },
  { id: 'paper', name: 'Paper', blurb: 'Bright and crisp', swatch: ['#F7F8FA', '#FFFFFE', '#2F6FDB'] },
  { id: 'forest', name: 'Forest', blurb: 'Muted green dark', swatch: ['#16201B', '#1F2B25', '#6CC59A'] },
  { id: 'ocean', name: 'Ocean', blurb: 'Deep teal, calm', swatch: ['#0E1A1F', '#15252C', '#3CC6C0'] },
  { id: 'ember', name: 'Ember', blurb: 'Near black with a warm glow', swatch: ['#16120F', '#211A15', '#FF8A3D'] },
  { id: 'nord', name: 'Nord', blurb: 'Cool slate, arctic blue', swatch: ['#242933', '#2E3440', '#88C0D0'] },
  { id: 'rose', name: 'Rose', blurb: 'Dark plum with rose', swatch: ['#1C1519', '#271D23', '#F07AA6'] },
  { id: 'aurora', name: 'Aurora', blurb: 'Ink blue with northern greens', swatch: ['#0D1117', '#151B24', '#7EE0B5'] },
  { id: 'sand', name: 'Sand', blurb: 'Warm beige, soft light', swatch: ['#F4EFE6', '#FBF8F2', '#B4652F'] },
  { id: 'mint', name: 'Mint', blurb: 'Fresh light green', swatch: ['#F2F7F4', '#FBFDFC', '#1F9D6B'] },
];

export interface Settings {
  theme: ThemeId;
  /** Empty means the theme's own accent. */
  accent: string;
  density: Density;
  /** Base text size for the whole app, in px. */
  textSize: number;
  termFontSize: number;
  /** Terminal colours: a softer dark, a light Notion-like paper, or the app theme's own. */
  termStyle: 'soft' | 'paper' | 'theme';
  gap: number;
  /** Opt in. Above the threshold, ElysiumProd ends only the programs listed here. */
  autoEnd: { enabled: boolean; thresholdPercent: number; programs: string[] };
  /** Main reads this from workspace.json: past the percent, a session saves its notes and compacts. */
  autoCompact: { enabled: boolean; percent: number };
  /** A notice when Claude replies in a session you are not looking at. */
  notifyReplies: boolean;
  /** Live flow: a short Sonnet summary per session, at most every five minutes. */
  flowSummaries: boolean;
  /** What the app calls you; empty means your Windows name. */
  displayName: string;
  /** Saver mode: fewer extra tokens (no Flow summaries or Sonnet fallback, chats on Sonnet). */
  saver: boolean;
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
  onboardVersion?: number;
  lastProjectId: string | null;
  /** Projects shown in the sidebar and on Home; the rest stay one search away. */
  pinned: string[];
  /** New default pins already offered once, so unpinning them sticks. */
  pinsOffered: string[];
  /** The claude.ai chat (or Claude Project) each project's Claude pane opens to. */
  projectChats: Record<string, { url: string; title: string }>;
  /** Costs: a provider item linked to a project by hand (key to project id, or 'none'). */
  costLinks: Record<string, string>;
  /** Costs: subscriptions and other fixed monthly amounts. */
  fixedCosts: FixedCost[];
  /** Each project's dashboard: its links, in order. */
  dashboards: Record<string, { links?: DashLink[]; people?: string[] }>;
  /** What was asked for from a dashboard, newest first. */
  featureRequests: FeatureRequest[];
}

export interface DashLink { id: string; label: string; url: string }
export interface FeatureRequest { id: string; projectId: string; text: string; at: string; sent: boolean; note: string | null }

/** A cost no provider reports: a subscription, a domain, a one off purchase. `monthly` is the amount per cycle. */
export interface FixedCost { id: string; name: string; monthly: number; projectId: string | null; cycle?: 'monthly' | 'yearly' | 'once'; category?: string; date?: string }
export const COST_CATEGORIES = ['AI', 'Hosting', 'Software', 'Domain', 'Design', 'Hardware', 'Other'];
/** What a cost adds to this month: monthly as is, yearly spread over twelve, a one off only in its month. */
export function monthlyOf(f: FixedCost, now = new Date()): number {
  if (f.cycle === 'yearly') return f.monthly / 12;
  if (f.cycle === 'once') { const d = f.date ? new Date(f.date) : null; return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? f.monthly : 0; }
  return f.monthly;
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
  termStyle: 'soft',
  gap: 8,
  autoEnd: { enabled: false, thresholdPercent: 90, programs: [] },
  autoCompact: { enabled: true, percent: 80 },
  notifyReplies: true,
  flowSummaries: true,
  displayName: '',
  saver: false,
};

const uid = () => Math.random().toString(36).slice(2, 10);

function fresh(): WorkspaceDoc {
  return {
    version: 1, settings: DEFAULT_SETTINGS, views: [], activeViewId: null, notes: {}, presets: [],
    accounts: { main: { label: 'Main account' } }, projectAccounts: {}, watchers: {}, onboarded: false, lastProjectId: null,
    pinned: ['elysiumprod', 'laptop'],
    pinsOffered: [...LATER_PINS],
    projectChats: {},
    costLinks: {},
    fixedCosts: [],
    dashboards: {},
    featureRequests: [],
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
      settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), theme, autoEnd: { ...DEFAULT_SETTINGS.autoEnd, ...(d.settings?.autoEnd ?? {}) }, autoCompact: { ...DEFAULT_SETTINGS.autoCompact, ...(d.settings?.autoCompact ?? {}) } },
      views,
      activeViewId: views.some((v) => v.id === d.activeViewId) ? d.activeViewId! : views[0]?.id ?? null,
      notes: d.notes ?? {},
      presets: Array.isArray(d.presets) ? d.presets : [],
      accounts: { ...f.accounts, ...(d.accounts ?? {}) },
      projectAccounts: d.projectAccounts ?? {},
      watchers: d.watchers ?? {},
      // The setup was rebuilt in version 2; everyone sees the new one once.
      onboarded: Boolean(d.onboarded) && (d as { onboardVersion?: number }).onboardVersion === 2,
      lastProjectId: d.lastProjectId ?? null,
      pinned: Array.isArray(d.pinned) ? [...d.pinned, ...LATER_PINS.filter((x) => !d.pinned!.includes(x) && !(d.pinsOffered ?? []).includes(x))] : f.pinned,
      pinsOffered: [...new Set([...(Array.isArray(d.pinsOffered) ? d.pinsOffered : []), ...LATER_PINS])],
      projectChats: d.projectChats ?? {},
      costLinks: d.costLinks ?? {},
      fixedCosts: Array.isArray(d.fixedCosts) ? d.fixedCosts : [],
      dashboards: d.dashboards ?? {},
      featureRequests: Array.isArray(d.featureRequests) ? d.featureRequests : [],
    };
  } catch {
    return f;
  }
}

export type PanelKind = 'web' | 'dashboard' | 'flow' | 'terminal' | 'machine' | 'sessions' | 'notes' | 'launcher' | 'relay' | 'tasks' | 'git' | 'document' | 'claude' | 'watcher';

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
  /** Start a second template with this one, asked about once (Prime with Meridian). */
  pairTemplateId?: string;
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
  patchDoc(p: Partial<Pick<WorkspaceDoc, 'costLinks' | 'fixedCosts' | 'dashboards' | 'featureRequests'>>): void;
  setProjectChat(projectId: string, chat: { url: string; title: string } | null): void;
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
  const setProjectChat = useCallback((projectId: string, chat: { url: string; title: string } | null) => setDoc((d) => {
    const projectChats = { ...d.projectChats };
    if (chat) projectChats[projectId] = chat; else delete projectChats[projectId];
    return { ...d, projectChats };
  }), []);
  const patchDoc = useCallback((p: Partial<Pick<WorkspaceDoc, 'costLinks' | 'fixedCosts' | 'dashboards' | 'featureRequests'>>) => setDoc((d) => ({ ...d, ...p })), []);
  const finishOnboarding = useCallback(() => setDoc((d) => ({ ...d, onboarded: true, onboardVersion: 2 })), []);
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
    setAccountLabel, setProjectAccount, accountFor, setWatcher, togglePin, patchDoc, setProjectChat, finishOnboarding, restartOnboarding, openProject, registerApi, apiFor, open, takeQueued,
  }), [doc, ready, activeView, setSettings, addView, renameView, deleteView, setActiveView, setLayout, setNote, resetView, savePreset, applyPreset, deletePreset,
    setAccountLabel, setProjectAccount, accountFor, setWatcher, togglePin, patchDoc, setProjectChat, finishOnboarding, restartOnboarding, openProject, registerApi, apiFor, open, takeQueued]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
