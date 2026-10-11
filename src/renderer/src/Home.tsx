import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { UsageStats } from '@shared/ipc';
import { ProjectLogo } from './ProjectLogo';
import { ago, useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';

function partOfDay(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const hours = (min: number) => (min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1)} h` : `${min} min`);

export function Home({ name, onOpen }: { name: string; onOpen(projectId: string, projectName: string): void }) {
  const { projects, stats, sessions, telemetry } = useLive();
  const { doc } = useWorkspace();
  const [usage, setUsage] = useState<UsageStats | null>(null);
  useEffect(() => { void window.elysium.usage().then(setUsage); }, []);

  const statFor = (id: string) => stats.find((s) => s.id === id);
  const usageFor = (id: string) => usage?.projects.find((p) => p.id === id);
  const lastTouched = (id: string) => {
    const s = statFor(id);
    const t = [s?.lastSessionAt, s?.lastCommitAt, usageFor(id)?.lastAt].filter(Boolean).map((x) => Date.parse(x!));
    return t.length ? Math.max(...t) : 0;
  };
  const pinned = doc.pinned.map((id) => projects.find((p) => p.id === id)).filter(Boolean) as typeof projects;
  const ordered = [...pinned].sort((a, b) => lastTouched(b.id) - lastTouched(a.id));
  const lastId = doc.lastProjectId ?? ordered[0]?.id;
  const last = projects.find((p) => p.id === lastId);
  const commits = stats.reduce((n, s) => n + s.commitsThisWeek, 0);
  const running = sessions.filter((s) => s.status === 'running').length;
  const waiting = sessions.filter((s) => s.status === 'running' && telemetry[s.id]?.state === 'waiting').length;

  const subline = (id: string) => {
    const s = statFor(id);
    const u = usageFor(id);
    const live = sessions.filter((x) => x.status === 'running' && x.templateId.startsWith(`${id}.`)).length;
    if (live) return `${live} session${live > 1 ? 's' : ''} running`;
    const parts = [u?.minutesWeek ? `${hours(u.minutesWeek)} this week` : null, s?.commitsThisWeek ? `${s.commitsThisWeek} commits` : null].filter(Boolean);
    const t = lastTouched(id);
    return parts.length ? parts.join(' · ') : t ? `Last worked ${ago(new Date(t).toISOString())}` : 'No recent work';
  };

  return (
    <div className="home page-enter">
      <div className="home-inner">
        <h1 className="greeting">{partOfDay()}, {name}</h1>
        <p className="greeting-sub">{waiting ? `${waiting} session${waiting > 1 ? 's are' : ' is'} waiting on you.` : running ? `${running} session${running > 1 ? 's' : ''} running.` : 'Nothing running right now.'}</p>

        <div className="tiles">
          <div className="tile" style={{ animationDelay: '0ms' }}><div className="tile-num">{usage ? hours(usage.minutesWeek) : '...'}</div><div className="tile-label">with agents this week</div></div>
          <div className="tile" style={{ animationDelay: '50ms' }}><div className="tile-num">{commits}</div><div className="tile-label">commits this week</div></div>
          <div className="tile" style={{ animationDelay: '100ms' }}><div className="tile-num">{usage ? `${usage.streakDays} d` : '...'}</div><div className="tile-label">working streak</div></div>
        </div>

        {last && (
          <>
            <div className="section-title home-section">Continue</div>
            <button className="project-card last" onClick={() => onOpen(last.id, last.name)}>
              <ProjectLogo projectId={last.id} size="lg" />
              <span><div className="title">Jump back into {last.name}</div><div className="sub">{subline(last.id)}</div></span>
              <ArrowRight size={18} className="go" />
            </button>
          </>
        )}

        <div className="section-title home-section">Your projects</div>
        <div className="projects-grid">
          {ordered.filter((p) => p.id !== last?.id).map((p, i) => (
            <button key={p.id} className="project-card" style={{ animationDelay: `${60 + i * 40}ms` }} onClick={() => onOpen(p.id, p.name)}>
              <ProjectLogo projectId={p.id} size="lg" />
              <span><div className="title">{p.name}</div><div className="sub">{subline(p.id)}</div></span>
              <ArrowRight size={17} className="go" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
