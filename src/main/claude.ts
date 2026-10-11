// Find the real claude.exe. On this machine `claude` is an npm shim
// (claude.cmd), which node-pty cannot spawn directly (Phase 0, step 6).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

let cached: string | null | undefined;

export function resolveClaude(): string | null {
  if (cached !== undefined) return cached;
  cached = find();
  return cached;
}

function find(): string | null {
  let hits: string[] = [];
  try {
    hits = execFileSync('where.exe', ['claude'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).filter(Boolean);
  } catch {
    hits = [];
  }
  for (const h of hits) {
    if (/\.exe$/i.test(h) && existsSync(h)) return h;
  }
  for (const h of hits) {
    if (!/\.cmd$/i.test(h)) continue;
    // The npm shim ends with a line like: "%dp0%\node_modules\...\claude.exe" %*
    const m = readFileSync(h, 'utf8').match(/"%dp0%\\([^"]+\.exe)"/i);
    if (m) {
      const exe = join(dirname(h), m[1]);
      if (existsSync(exe)) return exe;
    }
  }
  const fallback = join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return existsSync(fallback) ? fallback : null;
}
