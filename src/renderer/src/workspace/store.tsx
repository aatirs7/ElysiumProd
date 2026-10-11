// Workspace state: appearance settings, named views with their Dockview layouts,
// and widget data such as notes. Saved to %APPDATA%\elysiumprod\workspace.json
// through the main process on every change (main debounces the disk write).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DockviewApi, SerializedDockview } from 'dockview-react';

export type ThemeChoice = 'system' | 'dark' | 'light';
export type Density = 'comfortable' | 'compact';

export interface Settings {
  theme: ThemeChoice;
  accent: string;
  density: Density;
  termFontSize: number;
  gap: number;
  showMachineLine: boolean;
  /** Opt in. Above the threshold, ElysiumProd ends only the programs listed here. */
  autoEnd: { enabled: boolean; thresholdPercent: number; programs: string[] };
}

export interface View {
  id: string;
  name: string;
  layout: SerializedDockview | null;
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
  { name: 'Clay', value: '#D97757' },
  { name: 'Ocean', value: '#5B8DEF' },
  { name: 'Jade', value: '#4FA97A' },
  { name: 'Iris', value: '#9B7BE0' },
  { name: 'Rose', value: '#E06C8C' },
  { name: 'Amber', value: '#D9A043' },
  { name: 'Graphite', value: '#A3A19A' },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: ACCENTS[0].value,
  density: 'comfortable',
  termFontSize: 13.5,
  gap: 8,
  showMachineLine: true,
  autoEnd: { enabled: false, thresholdPercent: 90, programs: [] },
};

const uid = () => Math.random().toString(36).slice(2, 10);

function fresh(): WorkspaceDoc {
  const id = uid();
  return { version: 1, settings: DEFAULT_SETTINGS, views: [{ id, name: 'Workspace', layout: null }], activeViewId: id, notes: {}, presets: [] };
}

function parse(json: string | null): WorkspaceDoc {
  if (!json) return fresh();
  try {
    const d = JSON.parse(json) as Partial<WorkspaceDoc>;
    const views = Array.isArray(d.views) && d.views.length ? d.views : fresh().views;
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), autoEnd: { ...DEFAULT_SETTINGS.autoEnd, ...(d.settings?.autoEnd ?? {}) } },
      views,
      activeViewId: views.some((v) => v.id === d.activeViewId) ? d.activeViewId! : views[0].id,
      notes: d.notes ?? {},
      presets: Array.isArray(d.presets) ? d.presets : [],
    };
  } catch {
    return fresh();
  }
}

export type PanelKind = 'terminal' | 'machine' | 'sessions' | 'notes' | 'launcher' | 'relay' | 'tasks' | 'git' | 'document' | 'claude';

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
  setSettings(p: Partial<Settings>): void;
  addView(name?: string): string;
  renameView(id: string, name: string): void;
  deleteView(id: string): void;
  setActiveView(id: string): void;
  setLayout(id: string, layout: SerializedDockview): void;
  setNote(panelId: string, text: string): void;
  resetView(id: string): void;
  savePreset(name: string): void;
  applyPreset(id: string): void;
  deletePreset(id: string): void;
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

  const setSettings = useCallback((p: Partial<Settings>) => setDoc((d) => ({ ...d, settings: { ...d.settings, ...p } })), []);
  const addView = useCallback((name?: string) => {
    const id = uid();
    setDoc((d) => ({ ...d, views: [...d.views, { id, name: name ?? `View ${d.views.length + 1}`, layout: null }], activeViewId: id }));
    return id;
  }, []);
  const renameView = useCallback((id: string, name: string) => setDoc((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, name: name.trim() || v.name } : v)) })), []);
  const deleteView = useCallback((id: string) => setDoc((d) => {
    const views = d.views.filter((v) => v.id !== id);
    return { ...d, views, activeViewId: d.activeViewId === id ? views[0]?.id ?? null : d.activeViewId };
  }), []);
  const setActiveView = useCallback((id: string) => setDoc((d) => ({ ...d, activeViewId: id })), []);
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

  const value = useMemo<Ctx>(() => ({ doc, ready, setSettings, addView, renameView, deleteView, setActiveView, setLayout, setNote, resetView, savePreset, applyPreset, deletePreset, registerApi, apiFor, open, takeQueued }),
    [doc, ready, setSettings, addView, renameView, deleteView, setActiveView, setLayout, setNote, resetView, savePreset, applyPreset, deletePreset, registerApi, apiFor, open, takeQueued]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
