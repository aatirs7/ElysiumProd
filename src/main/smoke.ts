// `electron . --smoke`: drives the real app end to end and writes screenshots and
// smoke-out/result.json, then quits. It starts only a PowerShell session; it
// never starts or resumes a Claude session.
import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Resources } from './resources';
import type { SessionManager } from './sessions';
import { captureWeb, webStates } from './webviews';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs resources/elysium-mcp.cjs as a session would, and makes three calls through it. */
async function mcpCheck(fromSessionId: string, codexTo?: string): Promise<Record<string, unknown>> {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [join(app.getAppPath(), 'resources', 'elysium-mcp.cjs')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELYSIUM_BRIDGE: join(app.getPath('userData'), 'bridge.json'), ELYSIUM_FROM: fromSessionId }, stdio: ['pipe', 'pipe', 'ignore'],
  });
  let buf = '';
  const waiting = new Map<number, (v: unknown) => void>();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c: string) => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line); waiting.get(m.id)?.(m); } catch { /* skip */ } } });
  let n = 0;
  const rpc = (method: string, params: unknown) => new Promise<{ result?: { tools?: { name: string }[]; content?: { text: string }[] } }>((res) => { const id = ++n; waiting.set(id, res as (v: unknown) => void); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); setTimeout(() => res({}), 150000); });
  try {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
    const tools = (await rpc('tools/list', {})).result?.tools?.map((t) => t.name);
    const list = (await rpc('tools/call', { name: 'elysium_sessions', arguments: {} })).result?.content?.[0]?.text ?? '';
    if (codexTo) {
      const sentC = (await rpc('tools/call', { name: 'elysium_send', arguments: { to: codexTo, message: 'Reply with only the word ready. Do not run any commands or read any files.' } })).result?.content?.[0]?.text ?? '';
      const waitedC = (await rpc('tools/call', { name: 'elysium_wait', arguments: { to: codexTo, timeout_seconds: 120 } })).result?.content?.[0]?.text ?? '';
      return { sent: sentC.slice(0, 120), answer: waitedC.slice(0, 300) };
    }
    const sent = (await rpc('tools/call', { name: 'elysium_send', arguments: { to: 'local.shell', message: 'echo delegated-$((6*7))' } })).result?.content?.[0]?.text ?? '';
    const waited = (await rpc('tools/call', { name: 'elysium_wait', arguments: { to: 'local.shell', timeout_seconds: 40 } })).result?.content?.[0]?.text ?? '';
    // The playbook, only when this run has its own folder for it.
    let playbook: unknown = 'skipped: no ELYSIUM_PLAYBOOK_DIR';
    if (process.env.ELYSIUM_PLAYBOOK_DIR) {
      const body = '## What it is for\n\nLets one session hand another a task and wait for the answer.\n\n## Steps\n\n1. Start a local server on 127.0.0.1 with a token in bridge.json.\n2. Give each session an MCP server that forwards calls to it.\n3. Type the task into the target once it is idle; wait for its next reply.\n\n## Pitfalls\n\n- A session must not send to itself.';
      const added = (await rpc('tools/call', { name: 'elysium_playbook_add', arguments: { title: 'Session delegation', summary: 'How sessions hand each other tasks.', body, tags: ['elysium', 'mcp'] } })).result?.content?.[0]?.text ?? '';
      const found = (await rpc('tools/call', { name: 'elysium_playbook_search', arguments: { query: 'delegation' } })).result?.content?.[0]?.text ?? '';
      playbook = { added: added.slice(0, 80), found: found.includes('session-delegation') };
    }
    return { tools, listed: list.split('\n').length - 1, sent, sawAnswer: waited.includes('delegated-42'), playbook };
  } finally { child.kill(); }
}

export async function runSmoke(ctx: { win: BrowserWindow; sessions: SessionManager; resources: Resources }): Promise<void> {
  const out = join(process.cwd(), 'smoke-out');
  mkdirSync(out, { recursive: true });
  const r: Record<string, unknown> = { startedAt: new Date().toISOString() };
  const js = (code: string) => ctx.win.webContents.executeJavaScript(code);
  const shot = async (name: string) => writeFileSync(join(out, `${name}.png`), (await ctx.win.webContents.capturePage()).toPNG());
  const click = (text: string) => js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (b) { b.click(); return true; } return false; })()`);
  const finish = async () => {
    // Every session this run started, to show no Claude session was among them.
    r.startedTemplates = ctx.sessions.list().map((s) => s.templateId);
    r.finishedAt = new Date().toISOString();
    writeFileSync(join(out, 'result.json'), JSON.stringify(r, null, 2));
    app.quit();
  };
  try {
    ctx.win.setSize(1440, 900);
    await new Promise<void>((res) => (ctx.win.webContents.isLoading() ? ctx.win.webContents.once('did-finish-load', () => res()) : res()));
    await sleep(2500);
    r.resources = ctx.resources.latest();
    r.onboardingShown = await js(`Boolean(document.querySelector('.ob'))`);
    if (r.onboardingShown) {
      await sleep(1200); await shot('ob-1-welcome');
      // How much each frame of the sky costs, and how quickly the next step paints.
      r.sky = await js(`new Promise((res) => { window.__skyProbe = []; setTimeout(() => { const p = window.__skyProbe.sort((a, b) => a - b); delete window.__skyProbe; res({ frames: p.length, medianMs: +p[p.length >> 1].toFixed(2), p95Ms: +p[Math.floor(p.length * 0.95)].toFixed(2) }); }, 3000); })`);
      const root = await js(`document.documentElement.dataset.theme`);
      await js(`document.documentElement.dataset.theme = 'claude-light'`); await sleep(900); await shot('ob-1-welcome-light');
      await js(`document.documentElement.dataset.theme = ${JSON.stringify(root)}`); await sleep(300);
      r.stepSwitch = await js(`new Promise((res) => { const lt = []; const o = new PerformanceObserver((l) => lt.push(...l.getEntries().map((e) => Math.round(e.duration)))); o.observe({ type: 'longtask' }); const t0 = performance.now(); [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Get started')).click(); requestAnimationFrame(() => requestAnimationFrame(() => { const ms = performance.now() - t0; setTimeout(() => { o.disconnect(); res({ paintMs: Math.round(ms), longTasks: lt }); }, 800); })); })`);
      await sleep(400); await shot('ob-2-yours');
      await click('Continue'); await sleep(6000); await shot('ob-3-connect');
      r.connections = await js(`window.elysium.connections()`);
      await click('Continue'); await sleep(2500); await shot('ob-4-projects');
      await click('Continue'); await sleep(1200); await shot('ob-5-work');
      await click('Continue'); await sleep(1500); await shot('ob-6-ready');
      await click('Open Elysium Development'); await sleep(1800);
      r.tourShown = await js(`Boolean(document.querySelector('.tour'))`);
      await shot('ob-7-tour');
      await js(`[...document.querySelectorAll('.tour button')].find((x) => x.textContent.includes('Next'))?.click()`);
      await sleep(900); await shot('ob-8-tour-2');
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
      await sleep(400);
    }
    await sleep(2500);
    await shot('3-home');
    // A tool opens as a chat; one tiny real message goes through Claude Code.
    await js(`[...document.querySelectorAll('.sidebar .view-item')].find((x) => x.textContent.includes('PC Helper'))?.click()`);
    await sleep(2500);
    await shot('3a-pc-helper');
    r.chatSend = await js(`window.elysium.chatSend('tool:laptop', 'Reply with only the word ready. Do not use any tools.')`);
    for (let i = 0; i < 60; i++) { await sleep(1500); const st = await js(`window.elysium.chatGet('tool:laptop')`) as { running: boolean; messages: { text: string }[]; error: string | null }; if (!st.running) { r.chatReply = st.messages[st.messages.length - 1]?.text; r.chatError = st.error; break; } }
    await sleep(800);
    await shot('3b-pc-helper-reply');
    // The planning chat on a real project, when this profile has one: one tiny message.
    const planFor = ((await js(`window.elysium.projects()`)) as { id: string; builtin?: boolean }[]).find((x) => !x.builtin)?.id;
    if (planFor) {
      r.planSend = await js(`window.elysium.chatSend('plan:${planFor}', 'Reply with only the word ready. Do not read any files.')`);
      for (let i = 0; i < 60; i++) { await sleep(1500); const st = await js(`window.elysium.chatGet('plan:${planFor}')`) as { running: boolean; messages: { text: string }[]; error: string | null }; if (!st.running) { r.planReply = st.messages[st.messages.length - 1]?.text; r.planError = st.error; break; } }
    }
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Home')?.click()`);
    await sleep(1000);
    r.launch = await js(`window.__smoke && window.__smoke.launch('local.shell')`);
    await sleep(4000);
    const s = ctx.sessions.list().find((x) => x.templateId === 'local.shell');
    r.session = s;
    if (s) {
      await js(`window.__smoke.type(${JSON.stringify('echo smoke-$((6*7))\r')})`);
      await sleep(2500);
      r.echoSeenInXterm = String(await js(`window.__smoke.screen()`)).includes('smoke-42');
      r.echoSeenInScrollback = existsSync(s.scrollbackPath) && readFileSync(s.scrollbackPath, 'utf8').includes('smoke-42');
    }
    // Delegation: the Elysium tool a session would load, driven by hand. It lists the
    // sessions, then hands the PowerShell session a command and waits for it.
    r.delegation = await mcpCheck('smoke');
    // The Playbook page, and one entry open.
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Playbook')?.click()`);
    await sleep(1200); await shot('24-playbook');
    await js(`[...document.querySelectorAll('.pb-card')].find((x) => x.textContent.includes('Stripe'))?.click()`);
    await sleep(800); await shot('24b-playbook-entry');
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Home')?.click()`);
    await sleep(600);
    // Codex, when it is installed: it starts in a project's folder and draws its screen. It is ended right away.
    r.agentTemplates = (await js(`window.elysium.templates()`) as { id: string; kind: string }[]).filter((t) => t.kind === 'agent').map((t) => t.id);
    const codexId = (r.agentTemplates as string[]).find((id) => id.endsWith('.codex'));
    if (codexId) {
      // Started here, not through the UI: opening a project in the UI starts its Claude sessions, which the smoke test never does.
      const made = ctx.sessions.create(codexId, 120, 30);
      r.codexLaunch = made.ok ? true : made.reason;
      await sleep(7000);
      const c = made.ok ? ctx.sessions.list().find((x) => x.id === made.session.id) : undefined;
      const text = c ? (ctx.sessions.replay(c.id)?.data ?? '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '') : '';
      r.codex = c ? { status: c.status, resumed: c.resumed, saw: text.replace(/\s+/g, ' ').trim().slice(0, 300) } : null;
      if (c) r.codexDelegation = await mcpCheck('smoke', codexId);
      if (c) ctx.sessions.kill(c.id);
      await sleep(800);
    }
    await sleep(6000); // let claude.ai load in the Claude pane
    await shot('4-workspace');
    r.web = webStates();
    const web = webStates()[0];
    // A hidden native view cannot be captured; that is a limit of the test, not the app.
    if (web) { try { const png = await captureWeb(web.id); if (png) writeFileSync(join(out, '5-claude-pane.png'), png); } catch (e) { r.webCapture = String(e); } }
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.includes('Your stats'))?.click()`);
    await sleep(5000);
    await shot('6-stats');
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.includes('Settings'))?.click()`);
    await sleep(1200);
    await shot('7-settings');
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.includes('Costs'))?.click()`);
    const costStart = Date.now();
    for (let k = 0; k < 90 && !(await js(`Boolean(document.querySelector('.cost-row'))`)); k += 1) await sleep(1000);
    r.costsSeconds = Math.round((Date.now() - costStart) / 1000);
    r.costRows = await js(`document.querySelectorAll('.cost-row').length`);
    r.costErrors = await js(`document.querySelector('.cost-errors')?.textContent ?? null`);
    await shot('9-costs');
    await js(`document.querySelector('.cost-row-head')?.click()`);
    await sleep(600);
    await shot('10-costs-open');
    // A project dashboard and a site pane, opened in this plain view so no Claude session starts.
    await js(`window.__smoke.open({ kind: 'dashboard', params: { projectId: 'elysiumprod' } })`);
    await sleep(6000);
    r.dashboard = await js(`({ tiles: document.querySelectorAll('.dash-tile').length, links: document.querySelectorAll('.dash-link-main').length, tasks: document.querySelectorAll('.dash-task').length })`);
    await shot('11-dashboard');
    await js(`window.__smoke.open({ kind: 'web', title: 'Example', params: { url: 'https://example.com/', projectId: 'smoke' } })`);
    await sleep(5000);
    r.sitePane = webStates().filter((w) => /example\.com/.test(w.url)).map((w) => ({ url: w.url, title: w.title }));
    // The Home command box, with commands that change nothing here.
    r.commands = {
      compact: await js(`window.elysium.runCommand('compact Gulf')`),
      stop: await js(`window.elysium.runCommand('wrap up Attestia and Gulf')`),
      vague: await js(`window.elysium.runCommand('how is the weather')`),
    };
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Home')?.click()`);
    await sleep(1500);
    await shot('12-home-command');
    r.themeBefore = await js(`document.documentElement.dataset.theme`);
    await js(`document.querySelector('.topbar .glance-btn.icon-only')?.click()`);
    await sleep(500);
    r.themeItems = await js(`document.querySelectorAll('.theme-item').length`);
    await shot('13a-theme-menu');
    await js(`[...document.querySelectorAll('.theme-item')].find((x) => x.textContent.includes('Midnight'))?.click()`);
    await sleep(800);
    r.themeAfter = await js(`document.documentElement.dataset.theme`);
    await shot('13-theme-toggle');
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Help')?.click()`);
    await sleep(1200); await shot('15-help');
    await js(`document.querySelector('.help-card')?.click()`);
    await sleep(800); await shot('15b-help-topic');
    await js(`window.dispatchEvent(new Event('ep:new-view'))`);
    await sleep(1200); await js(`document.querySelectorAll('.ep-tab-close').forEach((b) => b.click())`);
    await sleep(1800); await shot('22-empty-view');
    r.emptyView = await js(`Boolean(document.querySelector('.wm-walker'))`);
    await js(`document.querySelector('.usage-strip')?.click()`);
    await sleep(600); await shot('16-usage');
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Home')?.click()`);
    await sleep(1500);
    await js(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Customize Home')?.click()`);
    await sleep(700); await shot('19-home-customize');
    await js(`window.dispatchEvent(new Event('ep:theme-builder'))`);
    await sleep(800);
    await js(`(() => { const set = (i, v) => { const el = document.querySelectorAll('.tb-part input[type=color]')[i]; const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set(0, '#1d2421'); set(6, '#e2b48c'); })()`);
    await sleep(900); await shot('23-theme-builder');
    await js(`[...document.querySelectorAll('.tb-foot button')].find((x) => x.textContent.trim() === 'Save theme')?.click()`);
    await sleep(600);
    r.customTheme = await js(`({ theme: document.documentElement.dataset.theme, bg: document.documentElement.style.getPropertyValue('--bg') })`);
    await js(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Done')?.click()`);
    await js(`window.__smoke.open({ kind: 'files', title: 'Files', params: { projectId: 'elysiumprod' } })`);
    await sleep(1500);
    r.filesRows = await js(`document.querySelectorAll('.file-row').length`);
    await js(`[...document.querySelectorAll('.file-row')].find((x) => x.textContent.trim().endsWith('package.json'))?.click()`);
    await sleep(1500);
    r.codeLines = await js(`(document.querySelector('.code-gutter')?.textContent ?? '').split(String.fromCharCode(10)).length`);
    await shot('20-files');
    const logs: string[] = [];
    ctx.win.webContents.on('console-message', (e) => { const m = (e as unknown as { message?: string }).message; if (m) logs.push(m.slice(0, 300)); });
    const before = BrowserWindow.getAllWindows().length;
    await js(`(() => { const t = document.querySelector('.ep-tab'); const b = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: b.left + 10, clientY: b.top + 10 })); })()`);
    await sleep(400);
    r.popoutResult = await js(`(() => { const b = [...document.querySelectorAll('.tab-menu-item')].find((x) => x.textContent.includes('Open in new window')); if (b) { b.click(); return 'clicked'; } return 'no menu item'; })()`);
    await sleep(2500);
    r.popout = { before, after: BrowserWindow.getAllWindows().length, menu: await js(`[...document.querySelectorAll('.tab-menu-item')].map((x) => x.textContent)`), logs };
    const pop = BrowserWindow.getAllWindows().find((w) => w !== ctx.win && w.webContents.getURL().includes('popout'));
    if (pop) { const img = await pop.webContents.capturePage(); writeFileSync(join(out, '21-popout.png'), img.toPNG()); }
    await js(`document.querySelector('.usage-strip')?.click()`);
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim().startsWith('Usage'))?.click()`);
    await sleep(6000); await shot('17-usage-page');
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Costs')?.click()`);
    await sleep(1500);
    await js(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Quick add')?.click()`);
    await sleep(400);
    await js(`document.querySelector('.cost-quick button')?.click()`);
    await sleep(400);
    await js(`document.querySelector('.cost-item')?.scrollIntoView({ block: 'center' })`);
    await sleep(400); await shot('18-costs-other');
    await js(`[...document.querySelectorAll('.nav')].find((x) => x.textContent.trim() === 'Home')?.click()`);
    await sleep(600);
    r.sidebarProjects = await js(`[...document.querySelectorAll('.sidebar .view-item .grow')].map((x) => x.textContent)`);
    await js(`(() => { const el = [...document.querySelectorAll('.sidebar .view-item')].find(() => true); const b = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: b.left + 40, clientY: b.top + 10 })); })()`);
    await sleep(500);
    r.projectMenu = await js(`[...document.querySelectorAll('.tab-menu-item')].map((x) => x.textContent)`);
    await shot('14-project-menu');
    await js(`document.querySelector('.menu-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    // New project: the dialog, then a from scratch project made and removed through the same calls.
    await js(`document.querySelector('[aria-label="New or pin a project"]')?.click()`);
    await sleep(400);
    await js(`[...document.querySelectorAll('.pin-picker button')].find((b) => b.textContent.includes('New project'))?.click()`);
    await sleep(700);
    await shot('8-new-project');
    r.newProjectDialog = await js(`Boolean(document.querySelector('.dialog.np'))`);
    await js(`document.querySelector('.dialog.np .btn')?.click()`);
    const parent = join(process.env.ELYSIUM_DATA_DIR || out, 'np-parent');
    mkdirSync(parent, { recursive: true });
    const made = await js(`window.elysium.createProject({ mode: 'new', name: 'Smoke Project', parent: ${JSON.stringify(parent)}, sessions: 'pair' })`) as { ok: boolean; projectId?: string; reason: string | null };
    r.newProject = made;
    r.newProjectGit = existsSync(join(parent, 'Smoke-Project', '.git'));
    await sleep(500);
    r.newProjectTemplates = (await js(`window.elysium.templates()`) as { id: string }[]).filter((t) => t.id.startsWith(`${made.projectId}.`)).map((t) => t.id);
    if (made.projectId) r.newProjectRemoved = await js(`window.elysium.removeProject(${JSON.stringify(made.projectId)})`);
  } catch (e) {
    r.error = e instanceof Error ? e.stack : String(e);
  }
  await finish();
}
