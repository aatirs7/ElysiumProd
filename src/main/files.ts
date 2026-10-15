// Documents for the viewer pane: Markdown, text and PDF. The owner picks a
// file in the system dialog; a pane remembers its path and reads it again on restore.
// Also the project explorer, like VS Code's: read only, and never outside the project's folder.
import { dialog, shell, type BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import type { DocFile, FileEntry, FileText } from '@shared/ipc';
import { PROJECT_FOLDERS } from './templates';

const MAX_BYTES = 60 * 1024 * 1024;
export const DOC_EXTENSIONS = ['md', 'markdown', 'txt', 'pdf', 'json', 'log'];

export async function pickDocument(win: BrowserWindow | null): Promise<string | null> {
  const opts = { properties: ['openFile' as const], filters: [{ name: 'Documents', extensions: DOC_EXTENSIONS }] };
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  return r.canceled ? null : r.filePaths[0] ?? null;
}

export async function readDocument(path: string): Promise<DocFile> {
  const ext = extname(path).slice(1).toLowerCase();
  if (!DOC_EXTENSIONS.includes(ext)) return { ok: false, error: `Files of type .${ext} are not supported`, path, kind: 'text', text: null, bytes: null };
  try {
    const st = await stat(path);
    if (st.size > MAX_BYTES) return { ok: false, error: 'File is larger than 60 MB', path, kind: 'text', text: null, bytes: null };
    if (ext === 'pdf') {
      const buf = await readFile(path);
      return { ok: true, error: null, path, kind: 'pdf', text: null, bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
    }
    const text = await readFile(path, 'utf8');
    return { ok: true, error: null, path, kind: ext === 'md' || ext === 'markdown' ? 'markdown' : 'text', text, bytes: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), path, kind: 'text', text: null, bytes: null };
  }
}

/** Folders VS Code also tucks away by default. */
const HIDDEN = new Set(['.git', 'node_modules', '.next', 'dist', 'out', 'build', '.turbo', '.cache', '__pycache__', '.venv', 'venv', '.vercel', '.DS_Store']);

/** A path inside a project, or null if it would leave the project's folder. */
function inside(projectId: string, rel: string): string | null {
  const root = PROJECT_FOLDERS[projectId]?.folder;
  if (!root || isAbsolute(rel)) return null;
  const full = resolve(root, rel || '.');
  const r = relative(root, full);
  if (r.startsWith('..') || isAbsolute(r)) return null;
  return full;
}

export async function listDir(projectId: string, rel: string, showHidden: boolean): Promise<FileEntry[]> {
  const dir = inside(projectId, rel);
  if (!dir) return [];
  let names: import('node:fs').Dirent[] = [];
  try { names = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  return names
    .filter((d) => showHidden || !HIDDEN.has(d.name))
    .map((d) => ({ name: d.name, path: rel ? `${rel}/${d.name}` : d.name, dir: d.isDirectory(), dim: HIDDEN.has(d.name) || d.name.startsWith('.') }))
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : a.dir ? -1 : 1));
}

const MAX = 1024 * 1024;

export async function readProjectFile(projectId: string, rel: string): Promise<FileText> {
  const full = inside(projectId, rel);
  if (!full) return { ok: false, error: 'That file is outside the project.', text: '', size: 0, binary: false };
  try {
    const st = await stat(full);
    if (st.size > MAX) return { ok: false, error: `Too large to preview here (${Math.round(st.size / 1024)} KB). Open it in your editor.`, text: '', size: st.size, binary: false };
    const buf = await readFile(full);
    // A NUL byte in the first part means it is not text.
    if (buf.subarray(0, 8000).includes(0)) return { ok: true, error: null, text: '', size: st.size, binary: true };
    return { ok: true, error: null, text: buf.toString('utf8'), size: st.size, binary: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), text: '', size: 0, binary: false };
  }
}

/** Show it in Explorer, or open it in VS Code when that is installed. */
export function revealProjectFile(projectId: string, rel: string, how: 'explorer' | 'vscode'): void {
  const full = inside(projectId, rel);
  if (!full || !existsSync(full)) return;
  if (how === 'explorer') { shell.showItemInFolder(full); return; }
  const root = PROJECT_FOLDERS[projectId]!.folder;
  execFile(process.platform === 'win32' ? 'cmd.exe' : 'code', process.platform === 'win32' ? ['/d', '/c', 'code', root, '--goto', full] : [root, '--goto', full], { windowsHide: true }, () => { /* VS Code may not be installed */ });
}
