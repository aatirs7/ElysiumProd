// Live machine and session data shared by the sidebar and every widget.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ResourceSample, SessionInfo, TemplateInfo } from '@shared/ipc';

const HISTORY = 90; // samples, two seconds apart: three minutes

interface Live {
  res: ResourceSample | null;
  history: ResourceSample[];
  sessions: SessionInfo[];
  templates: TemplateInfo[];
}

const LiveContext = createContext<Live>({ res: null, history: [], sessions: [], templates: [] });
export const useLive = () => useContext(LiveContext);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<ResourceSample[]>([]);
  const [sessions, setSessions] = useState<Map<string, SessionInfo>>(new Map());
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);

  useEffect(() => {
    void window.elysium.templates().then(setTemplates);
    void window.elysium.resources().then((r) => { if (r) setHistory([r]); });
    void window.elysium.sessions().then((list) => setSessions(new Map(list.map((s) => [s.id, s]))));
    const offRes = window.elysium.onResources((r) => setHistory((h) => [...h.slice(-(HISTORY - 1)), r]));
    const offSes = window.elysium.onSession((s) => setSessions((m) => new Map(m).set(s.id, s)));
    return () => { offRes(); offSes(); };
  }, []);

  const value = useMemo<Live>(() => ({
    res: history[history.length - 1] ?? null,
    history,
    sessions: [...sessions.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    templates,
  }), [history, sessions, templates]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
