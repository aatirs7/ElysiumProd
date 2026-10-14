// Live data shared by the whole app: machine resources, sessions and their
// telemetry, accounts, watchers, and projects with this week's activity.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AccountInfo, AccountLimits, CompactState, ProjectInfo, ProjectStats, ResourceSample, SessionInfo, Telemetry, TemplateInfo, WatcherState } from '@shared/ipc';
import { setProjectExtras } from './Dashboard';

const HISTORY = 90; // samples, two seconds apart: three minutes

interface Machine { res: ResourceSample | null; history: ResourceSample[] }
const MachineContext = createContext<Machine>({ res: null, history: [] });
/** Machine resources update every two seconds, so they live apart: only what shows them re-renders. */
export const useMachine = () => useContext(MachineContext);

interface Live {
  sessions: SessionInfo[];
  templates: TemplateInfo[];
  telemetry: Record<string, Telemetry>;
  accounts: AccountInfo[];
  watchers: Record<string, WatcherState>;
  projects: ProjectInfo[];
  stats: ProjectStats[];
  /** Last known plan limits per account id. */
  limits: Record<string, AccountLimits>;
  /** Sessions being compacted, by session id, until they finish. */
  compacting: Record<string, CompactState>;
  refreshStats(): void;
}

const LiveContext = createContext<Live>({ sessions: [], templates: [], telemetry: {}, accounts: [], watchers: {}, projects: [], stats: [], limits: {}, compacting: {}, refreshStats: () => {} });
export const useLive = () => useContext(LiveContext);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<ResourceSample[]>([]);
  const [sessions, setSessions] = useState<Map<string, SessionInfo>>(new Map());
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, Telemetry>>({});
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [watchers, setWatchers] = useState<Record<string, WatcherState>>({});
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [stats, setStats] = useState<ProjectStats[]>([]);
  const [statsTick, setStatsTick] = useState(0);
  const [limits, setLimits] = useState<Record<string, AccountLimits>>({});
  const [compacting, setCompacting] = useState<Record<string, CompactState>>({});

  useEffect(() => {
    void window.elysium.templates().then(setTemplates);
    void window.elysium.accounts().then(setAccounts);
    void window.elysium.projects().then((p) => { setProjectExtras(p); setProjects(p); });
    void window.elysium.resources().then((r) => { if (r) setHistory([r]); });
    void window.elysium.sessions().then((list) => setSessions(new Map(list.map((s) => [s.id, s]))));
    void window.elysium.telemetry().then((list) => setTelemetry(Object.fromEntries(list.map((t) => [t.sessionId, t]))));
    void window.elysium.limits().then((list) => setLimits(Object.fromEntries(list.map((l) => [l.accountId, l]))));
    void window.elysium.watchers().then((list) => setWatchers(Object.fromEntries(list.map((w) => [w.projectId, w]))));
    const offs = [
      window.elysium.onResources((r) => setHistory((h) => [...h.slice(-(HISTORY - 1)), r])),
      window.elysium.onSession((s) => setSessions((m) => new Map(m).set(s.id, s))),
      window.elysium.onTelemetry((t) => setTelemetry((m) => ({ ...m, [t.sessionId]: t }))),
      window.elysium.onWatcher((w) => setWatchers((m) => ({ ...m, [w.projectId]: w }))),
      // A project made or removed in the app: its sessions and its card appear at once.
      window.elysium.onProjectsChanged(() => {
        void window.elysium.templates().then(setTemplates);
        void window.elysium.projects().then((p) => { setProjectExtras(p); setProjects(p); });
        setStatsTick((x) => x + 1);
      }),
      window.elysium.onLimits((l) => setLimits((m) => ({ ...m, [l.accountId]: l }))),
      window.elysium.onCompact((c) => setCompacting((m) => {
        const next = { ...m, [c.sessionId]: c };
        if (c.stage === 'done' || c.stage === 'failed') delete next[c.sessionId];
        return next;
      })),
    ];
    return () => { for (const o of offs) o(); };
  }, []);

  useEffect(() => {
    void window.elysium.projectStats().then(setStats);
    const t = setInterval(() => void window.elysium.projectStats().then(setStats), 120000);
    return () => clearInterval(t);
  }, [statsTick]);

  const machine = useMemo<Machine>(() => ({ res: history[history.length - 1] ?? null, history }), [history]);
  const value = useMemo<Live>(() => ({
    sessions: [...sessions.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    templates, telemetry, accounts, watchers, projects, stats, limits, compacting,
    refreshStats: () => setStatsTick((x) => x + 1),
  }), [sessions, templates, telemetry, accounts, watchers, projects, stats, limits, compacting]);
  return <MachineContext.Provider value={machine}><LiveContext.Provider value={value}>{children}</LiveContext.Provider></MachineContext.Provider>;
}

/** Relative time in plain words: "just now", "12 min ago", "3 days ago". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
