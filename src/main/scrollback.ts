// Scrollback on disk (spec 15): one log per session, rotated at 10 MB,
// pruned after 30 days, and a 1 GB cap across all sessions, oldest first.
// The cap exists from Phase 1 because the disk was 98 percent full at audit time.
//
// Rotation never renames an open file: Windows refuses that, and the failure
// would be silent. Each session writes numbered segments instead,
// <id>.000.log, <id>.001.log, and keeps the newest two. A segment is deleted
// only once it is two rotations old, long after its stream closed.
import { createWriteStream, readdirSync, rmSync, statSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

export const ROTATE_BYTES = 10 * 1024 * 1024;
export const TOTAL_CAP_BYTES = 1024 * 1024 * 1024;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const KEEP_SEGMENTS = 2;

export class Scrollback {
  private stream: WriteStream;
  private bytes = 0;
  private segment = 0;
  private dir: string;
  private sessionId: string;
  /** Path of the first segment; later segments sit beside it. */
  readonly path: string;

  constructor(dir: string, sessionId: string) {
    this.dir = dir;
    this.sessionId = sessionId;
    this.path = this.segmentPath(0);
    this.stream = createWriteStream(this.path, { flags: 'a' });
  }

  segmentPath(n: number): string {
    return join(this.dir, `${this.sessionId}.${String(n).padStart(3, '0')}.log`);
  }

  currentPath(): string {
    return this.segmentPath(this.segment);
  }

  write(data: string): void {
    const n = Buffer.byteLength(data);
    if (this.bytes > 0 && this.bytes + n > ROTATE_BYTES) this.rotate();
    this.bytes += n;
    this.stream.write(data);
  }

  private closed = new Set<number>();

  private rotate(): void {
    const old = this.stream;
    const oldIndex = this.segment;
    old.once('close', () => {
      this.closed.add(oldIndex);
      this.prune();
    });
    old.end();
    this.segment += 1;
    this.stream = createWriteStream(this.currentPath(), { flags: 'a' });
    this.bytes = 0;
  }

  /** Delete closed segments older than the newest KEEP_SEGMENTS. */
  private prune(): void {
    const keepFrom = this.segment - KEEP_SEGMENTS + 1;
    for (const k of [...this.closed]) {
      if (k < keepFrom) {
        rmSync(this.segmentPath(k), { force: true });
        this.closed.delete(k);
      }
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.stream.end(resolve));
  }
}

/** Delete logs older than 30 days, then the oldest until under the total cap. */
export function enforceCaps(dir: string, now = Date.now()): { removed: number; totalBytes: number } {
  let files = readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => {
      const p = join(dir, f);
      const st = statSync(p);
      return { p, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);
  let removed = 0;
  for (const f of files) {
    if (now - f.mtime > MAX_AGE_MS) { rmSync(f.p, { force: true }); removed++; }
  }
  files = files.filter((f) => now - f.mtime <= MAX_AGE_MS);
  let total = files.reduce((s, f) => s + f.size, 0);
  while (total > TOTAL_CAP_BYTES && files.length) {
    const f = files.shift()!;
    rmSync(f.p, { force: true });
    total -= f.size;
    removed++;
  }
  return { removed, totalBytes: total };
}
