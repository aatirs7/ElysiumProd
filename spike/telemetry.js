// Phase 0 steps 3, 4 and 5 in one session: status line payloads, hook stdin for
// every event, and OTLP over HTTP to a local receiver. Main account, sandbox cwd,
// cheap model, permission mode default so a permission prompt fires Notification.
const { app } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { OUT, write, log, spawnPty, sleep } = require('./lib');

function scrubbedEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDE|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OTEL_)/i.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

function hookEvents() {
  try { return fs.readFileSync(path.join(OUT, 'hooks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).event); } catch { return []; }
}
async function waitHook(name, ms, after) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (hookEvents().slice(after).includes(name)) return true; await sleep(500); }
  return false;
}

app.whenReady().then(async () => {
  for (const f of ['hooks.jsonl', 'statusline.jsonl', 'otlp.jsonl']) try { fs.unlinkSync(path.join(OUT, f)); } catch {}
  const otlp = [];
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      otlp.push({ at: new Date().toISOString(), path: req.url, type: req.headers['content-type'], body: b });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const r = { port, steps: {} };
  const env = scrubbedEnv({
    CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'otlp', OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json', OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
    OTEL_METRIC_EXPORT_INTERVAL: '5000', OTEL_LOGS_EXPORT_INTERVAL: '5000',
  });
  const pty = require('node-pty');
  const t0 = Date.now();
  const s = spawnPty(pty, process.env.CLAUDE_EXE, ['--settings', path.join(__dirname, 'settings.spike.json'), '--model', 'claude-haiku-5-5', '--permission-mode', 'default', '-n', 'Spike Telemetry'], { cwd: path.join(__dirname, 'sandbox'), env });
  r.steps.sessionStart = await waitHook('SessionStart', 30000, 0); r.msToSessionStart = Date.now() - t0;
  await sleep(4000);
  let n = hookEvents().length;
  s.p.write('Reply with only the word pong.'); await sleep(300); s.p.write('\r');
  r.steps.stop1 = await waitHook('Stop', 90000, n); r.msFirstTurn = Date.now() - t0;
  await sleep(2000);
  n = hookEvents().length;
  s.p.write('Use the Bash tool to run exactly this command: echo notify-test'); await sleep(300); s.p.write('\r');
  r.steps.notification = await waitHook('Notification', 60000, n);
  await sleep(1500); write('screen-permission.txt', s.text().slice(-3000));
  s.p.write('\x1b'); await sleep(3000);
  n = hookEvents().length;
  s.p.write('/model claude-sonnet-5-5'); await sleep(300); s.p.write('\r');
  r.steps.preModelSwitch = await waitHook('PreModelSwitch', 20000, n);
  r.steps.postModelSwitch = await waitHook('PostModelSwitch', 5000, n);
  await sleep(2000);
  n = hookEvents().length;
  s.p.write('/compact'); await sleep(300); s.p.write('\r');
  r.steps.preCompact = await waitHook('PreCompact', 60000, n);
  r.steps.postCompact = await waitHook('PostCompact', 120000, n);
  await sleep(12000); // let OTel flush
  write('screen-final.txt', s.text().slice(-3000));
  n = hookEvents().length;
  s.p.write('/exit'); await sleep(300); s.p.write('\r');
  r.steps.sessionEnd = await waitHook('SessionEnd', 20000, n);
  await sleep(3000);
  r.exit = s.exited();
  try { s.p.kill(); } catch {}
  await sleep(2000);
  server.close();
  fs.writeFileSync(path.join(OUT, 'otlp.jsonl'), otlp.map((o) => JSON.stringify(o)).join('\n'));
  r.otlpPosts = otlp.length; r.hookEvents = hookEvents();
  write('telemetry.json', r);
  log('telemetry done');
  app.exit(0);
});
