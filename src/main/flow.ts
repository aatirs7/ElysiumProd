// One or two plain lines on what a session is doing, from Sonnet. Cheap by design:
// the input is only the latest ask's first line and the last steps' short labels,
// a one line system prompt, no tools and no MCP servers, nothing saved to disk
// (--no-session-persistence), run from a scratch folder in the app's data folder.
// At most one call per session every five minutes, and only when new steps arrived.
// It runs on the main account, so it counts toward that account's plan limits.
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FlowEvent, ReaderEntry } from '@shared/ipc';
import { resolveClaude } from './claude';
import { childEnv } from './env';
import { dataDir } from './paths';

const EVERY_MS = 5 * 60 * 1000;
const SYSTEM = "You watch a coding agent's recent steps and say, in at most two short plain lines with no markdown, what it is doing now and what is likely next.";

interface Kept { text: string; at: string; eventsSeen: number; running: boolean; lastTry: number }
const kept = new Map<string, Kept>();

export function lastSummary(sessionId: string): { text: string; at: string } | null {
  const k = kept.get(sessionId);
  return k?.text ? { text: k.text, at: k.at } : null;
}

export async function summarize(sessionId: string, title: string, reader: ReaderEntry[], events: FlowEvent[]): Promise<{ text: string | null; at: string | null; reason: string | null }> {
  const k = kept.get(sessionId) ?? { text: '', at: '', eventsSeen: 0, running: false, lastTry: 0 };
  kept.set(sessionId, k);
  const reply = () => ({ text: k.text || null, at: k.at || null, reason: null });
  if (k.running || Date.now() - k.lastTry < EVERY_MS || events.length === k.eventsSeen || !events.length) return reply();
  const command = resolveClaude();
  if (!command) return { ...reply(), reason: 'Claude Code was not found.' };
  k.running = true; k.lastTry = Date.now();
  const ask = [...reader].reverse().find((e) => e.role === 'you')?.text.split('\n').find((l) => l.trim())?.slice(0, 200) ?? 'not known';
  const steps = events.slice(-30).map((e) => `- ${e.label}`).join('\n');
  const input = `Session: ${title}. Latest ask: ${ask}\nRecent steps, oldest first:\n${steps}`;
  const cwd = join(dataDir(), 'flow-scratch');
  mkdirSync(cwd, { recursive: true });
  const out = await new Promise<string | null>((resolve) => {
    const child = execFile(command, ['-p', '--model', 'claude-sonnet-5-5', '--no-session-persistence', '--strict-mcp-config', '--tools', '', '--system-prompt', SYSTEM, '--output-format', 'json'],
      { cwd, timeout: 90000, windowsHide: true, maxBuffer: 1024 * 1024, env: childEnv({}) },
      (e, stdout) => { if (e) return resolve(null); try { const j = JSON.parse(String(stdout)) as { result?: string; is_error?: boolean }; resolve(j.is_error ? null : (j.result ?? '').trim() || null); } catch { resolve(null); } });
    child.stdin?.end(input);
  });
  k.running = false;
  if (!out) return { ...reply(), reason: 'The summary did not come back. It tries again in a few minutes.' };
  k.text = out.split('\n').filter((l) => l.trim()).slice(0, 2).join('\n');
  k.at = new Date().toISOString();
  k.eventsSeen = events.length;
  return reply();
}
