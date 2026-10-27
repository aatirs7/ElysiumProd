// The Elysium board connector: one small server (resources/connector) that lets
// the planning chat on claude.ai read every project with the chat bridge on and
// file tasks for its Prime session. Elysium deploys it to the owner's own Vercel
// account with their Vercel and GitHub sign ins, once; the owner then adds its
// address in claude.ai once, and every project after that works without setup.
// The GitHub token goes from gh straight into Vercel and is never shown or saved
// here; the passphrase for the claude.ai sign in is kept in connector.json.
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { ConnectorState } from '@shared/ipc';
import { childEnv } from './env';
import { dataDir } from './paths';

const PROJECT = 'elysium-board';
const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const FILE = () => join(dataDir(), 'connector.json');
const SOURCE = () => join(app.getAppPath(), 'resources', 'connector');

interface Saved { url: string | null; deployedAt: string | null; passphrase: string | null }

function saved(): Saved {
  try { return { url: null, deployedAt: null, passphrase: null, ...(JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<Saved>) }; } catch { return { url: null, deployedAt: null, passphrase: null }; }
}

let busy: string | null = null;
let lastError: string | null = null;

export function connectorState(): ConnectorState {
  const s = saved();
  return { url: s.url, deployedAt: s.deployedAt, passphrase: s.passphrase, step: busy, error: lastError };
}

/** Runs the Vercel CLI (a .cmd on Windows, so through the shell; every argument here is fixed text). */
function vercel(args: string[], cwd: string, stdin?: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const p = spawn('vercel', [...args, '--non-interactive', '--no-color'], { cwd, shell: true, windowsHide: true, env: childEnv() });
    let out = '';
    p.stdout.on('data', (d: Buffer) => { out += d.toString('utf8'); });
    p.stderr.on('data', (d: Buffer) => { out += d.toString('utf8'); });
    p.on('error', () => resolve({ ok: false, out: 'The Vercel CLI was not found. Install it with npm i -g vercel, then sign in with vercel login.' }));
    p.on('close', (code) => resolve({ ok: code === 0, out }));
    if (stdin !== undefined) p.stdin.end(stdin); else p.stdin.end();
  });
}

function ghToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(existsSync(GH) ? GH : 'gh', ['auth', 'token'], { windowsHide: true, timeout: 15000 }, (e, out) => resolve(e ? null : String(out).trim() || null));
  });
}

/** Deploys (or redeploys) the connector. `progress` gets each step's plain description. */
export async function setupConnector(progress: (s: ConnectorState) => void): Promise<{ ok: boolean; reason: string | null }> {
  if (busy) return { ok: false, reason: 'Setup is already running.' };
  const step = (s: string | null) => { busy = s; progress(connectorState()); };
  const fail = (reason: string) => { lastError = reason; step(null); return { ok: false, reason }; };
  lastError = null;
  try {
    step('Checking your Vercel and GitHub sign ins');
    const dir = join(dataDir(), 'connector');
    mkdirSync(dir, { recursive: true });
    cpSync(SOURCE(), dir, { recursive: true, filter: (src) => !/[\\/](node_modules|\.vercel)([\\/]|$)/.test(src) });
    const who = await vercel(['whoami'], dir);
    if (!who.ok) return fail('Vercel is not signed in here. Run vercel login in a terminal, then try again.');
    const token = await ghToken();
    if (!token) return fail('GitHub is not signed in here. Run gh auth login in a terminal, then try again.');

    step('Making the Vercel project');
    if (!existsSync(join(dir, '.vercel', 'project.json'))) {
      await vercel(['project', 'add', PROJECT], dir); // already there is fine
      const link = await vercel(['link', '--yes', '--project', PROJECT], dir);
      if (!link.ok) return fail(`Vercel would not link the project: ${link.out.trim().split('\n').pop()?.slice(0, 200) ?? ''}`);
    }

    step('Setting its keys');
    const prev = saved();
    const passphrase = prev.passphrase ?? `${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}`;
    const vars: [string, string][] = [['MCP_SIGNING_SECRET', randomBytes(32).toString('hex')], ['MCP_OWNER_PASSPHRASE', passphrase], ['GITHUB_BOARD_TOKEN', token]];
    // Keep the signing secret across redeploys so claude.ai stays connected.
    if (prev.url) vars.shift();
    for (const [name, value] of vars) {
      const r = await vercel(['env', 'add', name, 'production', '--force', '--yes'], dir, value);
      if (!r.ok) return fail(`Vercel would not save ${name}.`);
    }

    step('Deploying');
    const d = await vercel(['deploy', '--prod', '--yes'], dir);
    if (!d.ok) return fail(`The deploy failed: ${d.out.trim().split('\n').slice(-2).join(' ').slice(0, 240)}`);
    // The stable production address, not the one for this deploy only.
    const alias = d.out.match(/Aliased:?\s+(https:\/\/[^\s[\]]+)/i)?.[1] ?? d.out.match(/https:\/\/[\w.-]+\.vercel\.app/g)?.pop() ?? null;
    if (!alias) return fail('The deploy finished but did not say its address.');

    step('Checking it answers');
    const meta = await fetch(`${alias}/.well-known/oauth-authorization-server`).catch(() => null);
    if (!meta?.ok) return fail(meta?.status === 401 || meta?.status === 403
      ? 'It deployed, but Vercel asks for a sign in before anyone can reach it. In Vercel, open elysium-board, Settings, Deployment Protection, and turn Vercel Authentication off for production, then set it up again.'
      : `It deployed, but ${alias} did not answer yet. Try again in a minute.`);

    writeFileSync(FILE(), JSON.stringify({ url: `${alias}/api/mcp`, deployedAt: new Date().toISOString(), passphrase }, null, 2));
    step(null);
    return { ok: true, reason: null };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
