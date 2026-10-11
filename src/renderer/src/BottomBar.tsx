import type { ResourceSample } from '@shared/ipc';

const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;

export function BottomBar({ r }: { r: ResourceSample | null }) {
  if (!r) return <footer className="bottombar">Reading machine resources</footer>;
  return (
    <footer className="bottombar" aria-label="Machine resources">
      <span className="metric">CPU <b>{r.cpuPercent === null ? 'unknown' : `${r.cpuPercent.toFixed(0)}%`}</b></span>
      <span className={`metric ${r.ramLevel}`}>RAM <b>{r.ramUsedPercent.toFixed(0)}%</b> of {gb(r.ramTotalBytes)}</span>
      <span className={`metric ${r.diskLevel}`}>Free on {r.diskPath.replace(/\\$/, '')} <b>{r.diskFreeBytes === null ? 'unknown' : gb(r.diskFreeBytes)}</b></span>
    </footer>
  );
}

export function ResourceBanner({ r }: { r: ResourceSample | null }) {
  if (!r) return null;
  if (r.refuseReason) return <div className="banner refuse" role="alert">{r.refuseReason}</div>;
  const msgs: string[] = [];
  if (r.ramLevel === 'warn') msgs.push(`Memory is ${r.ramUsedPercent.toFixed(0)} percent used.`);
  if (r.diskLevel === 'warn' && r.diskFreeBytes !== null) msgs.push(`Only ${gb(r.diskFreeBytes)} free on ${r.diskPath.replace(/\\$/, '')}. Sessions stop starting below 8 GB.`);
  if (!msgs.length) return null;
  return <div className="banner warn" role="status">{msgs.join(' ')}</div>;
}
