import { useLive } from './workspace/live';

/** The project's own mark from its repository, or its initial when it has none. */
export function ProjectLogo({ projectId, size = 'sm' }: { projectId: string; size?: 'sm' | 'lg' }) {
  const { stats, projects } = useLive();
  const logo = stats.find((s) => s.id === projectId)?.logo;
  const name = projects.find((p) => p.id === projectId)?.name ?? stats.find((s) => s.id === projectId)?.name ?? projectId;
  if (logo) return <img className={`plogo ${size === 'lg' ? 'lg' : ''}`} src={logo} alt="" draggable={false} />;
  return <span className={`plogo ${size === 'lg' ? 'lg' : ''}`} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}
