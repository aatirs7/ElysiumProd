// Documents for the viewer pane: Markdown, text and PDF. The owner picks a
// file in the system dialog; a pane remembers its path and reads it again on restore.
import { dialog, type BrowserWindow } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { DocFile } from '@shared/ipc';

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
