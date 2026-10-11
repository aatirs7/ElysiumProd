// The workspace file: views, layouts, widget state and appearance settings.
// The renderer owns its shape; main only stores it, atomically, with a size cap.
// Phase 2 of the spec moves this into SQLite; a JSON file keeps it hand editable until then.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths';

const MAX_BYTES = 2 * 1024 * 1024;
const file = () => join(dataDir(), 'workspace.json');

export function loadWorkspace(): string | null {
  try {
    return existsSync(file()) ? readFileSync(file(), 'utf8') : null;
  } catch {
    return null;
  }
}

let timer: NodeJS.Timeout | null = null;
let pending: string | null = null;

/** Debounced so dragging a sash does not write the disk on every frame. */
export function saveWorkspace(json: string): void {
  if (json.length > MAX_BYTES) return;
  try { JSON.parse(json); } catch { return; }
  pending = json;
  if (timer) return;
  timer = setTimeout(flushWorkspace, 400);
}

export function flushWorkspace(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (pending === null) return;
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, pending);
  renameSync(tmp, file());
  pending = null;
}
