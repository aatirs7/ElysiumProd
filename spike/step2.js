// Phase 0 step 2, load-bearing: two accounts at the same time.
// Session A: main account, CLAUDE_CONFIG_DIR unset (as today). cwd sandbox/a.
// Session B: CLAUDE_CONFIG_DIR = .claude-account2. cwd sandbox/b.
// Pass needs: distinct account identity (hashed OTel account uuid), distinct
// rate_limits, no forced re-login in either, and B leaves no trace in the main
// .claude.json or the main credentials file.
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { OUT, write, spawnPty, sleep } = require('./lib');

const HOME = os.homedir();
const MAIN_JSON = path.join(HOME, '.claude.json');
const MAIN_CRED = path.join(HOME, '.claude', '.credentials.json');
const ACC2 = path.join(HOME, '.claude-account2');
const ACC2_JSON = path.join(ACC2, '.claude.json');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
const fileSha = (f) => { try { return sha(fs.readFileSync(f)); } catch { return null; } };
const projectsHas = (f, dir) => { try { const p = JSON.parse(fs.readFileSync(f, 'utf8')).projects || {}; const k = dir.split(path.sep).join('/'); return Object.keys(p).some((x) => x.toLowerCase() === k.toLowerCase()); } catch (e) { return 'unreadable'; } };

function scrubbedEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OTEL_)/i.test(k)) env[k] = v;
  return { ...env, ...extra };
}

async function receiver() {
  const ids = new Set();
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      try {
        const j = JSON.parse(b);
        const walk = (o) => { if (Array.isArray(o)) return o.forEach(walk); if (o && typeof o === 'object') { if (o.key === 'user.account_uuid' && o.value) ids.add(sha(Object.values(o.value)[0])); Object.values(o).forEach(walk); } };
        walk(j);
      } catch {}
      res.writeHead(200); res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, ids, port: server.address().port };
}

function slFor(sid) {
  try {
    return fs.readFileSync(path.join(OUT, 'statusline.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(JSON.parse(l).raw)).filter((o) => o.session_id === sid).pop() || null;
  } catch { return null; }
}
function sidFor(cwd) {
  try {
    const ev = fs.readFileSync(path.join(OUT, 'hooks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const m = ev.find((e) => e.event === 'SessionStart' && e.stdin.cwd && e.stdin.cwd.toLowerCase() === cwd.toLowerCase());
    return m ? m.stdin.session_id : null;
  } catch { return null; }
}

app.whenReady().then(async () => {
  for (const f of ['hooks.jsonl', 'statusline.jsonl']) try { fs.unlinkSync(path.join(OUT, f)); } catch {}
  const pty = require('node-pty');
  const r = { before: {}, after: {}, a: {}, b: {} };
  const dirA = path.join(__dirname, 'sandbox', 'a'); const dirB = path.join(__dirname, 'sandbox', 'b');
  fs.mkdirSync(dirA, { recursive: true }); fs.mkdirSync(dirB, { recursive: true });
  r.before = { mainCred: fileSha(MAIN_CRED), acc2Cred: fileSha(path.join(ACC2, '.credentials.json')), mainJsonHasB: projectsHas(MAIN_JSON, dirB), acc2JsonHasB: projectsHas(ACC2_JSON, dirB) };
  const recA = await receiver(); const recB = await receiver();
  const otel = (port) => ({ CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'otlp', OTEL_LOGS_EXPORTER: 'otlp', OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json', OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`, OTEL_METRIC_EXPORT_INTERVAL: '5000', OTEL_LOGS_EXPORT_INTERVAL: '5000' });
  const args = (title) => ['--settings', path.join(__dirname, 'settings.spike.json'), '--model', 'claude-haiku-5-5', '-n', title];
  const A = spawnPty(pty, process.env.CLAUDE_EXE, args('Spike Account Main'), { cwd: dirA, env: scrubbedEnv(otel(recA.port)) });
  const B = spawnPty(pty, process.env.CLAUDE_EXE, args('Spike Account Two'), { cwd: dirB, env: scrubbedEnv({ ...otel(recB.port), CLAUDE_CONFIG_DIR: ACC2 }) });
  await sleep(8000);
  for (const [name, s] of [['a', A], ['b', B]]) {
    const t = s.text();
    r[name].trustPrompt = /Itrustthisfolder/i.test(t.replace(/\s+/g, ''));
    r[name].loginPrompt = /Select login method|\/login|log in|Login|sign in/i.test(t) && !/Claude Max|Claude Pro/.test(t);
    r[name].onboarding = /Choose the text style|Let's get started|theme/i.test(t);
    r[name].banner = (t.match(/(Haiku|Sonnet|Opus)[^\n]{0,40}(Claude [A-Za-z]+|API Usage Billing)/) || [null])[0];
    if (r[name].trustPrompt) {
      s.p.write('\x1b[B'); await sleep(700); s.p.write('\r'); await sleep(8000);
      const t2 = s.text();
      r[name].bannerAfterTrust = (t2.match(/(Haiku|Sonnet|Opus)[^\n]{0,40}(Claude [A-Za-z]+|API Usage Billing)/) || [null])[0];
      r[name].loginAfterTrust = /Selectloginmethod|Logintocontinue|Pleaserun\/login|Invalidapikey|OAuthtokenhasexpired/i.test(t2.replace(/\s+/g, ''));
    }
  }
  write('step2-screen-b-start.txt', B.text().slice(-2500));
  for (const s of [A, B]) { s.p.write(''); await sleep(800); }
  await sleep(2000);
  const prompt = 'Reply with only the word pong.';
  A.p.write(prompt); B.p.write(prompt); await sleep(300); A.p.write('\r'); B.p.write('\r');
  r.a.replied = await A.waitFor(/pong/i, 90000, A.mark() - 5);
  r.b.replied = await B.waitFor(/pong/i, 90000, B.mark() - 5);
  await sleep(15000); // status line refresh and OTel flush
  // a second turn in each, to check neither forced the other to log in again
  A.p.write('Reply with only the word ping.'); B.p.write('Reply with only the word ping.'); await sleep(300); A.p.write('\r'); B.p.write('\r');
  r.a.secondTurn = await A.waitFor(/ping/i, 90000, A.mark() - 5);
  r.b.secondTurn = await B.waitFor(/ping/i, 90000, B.mark() - 5);
  await sleep(10000);
  write('step2-screen-a.txt', A.text().slice(-2500)); write('step2-screen-b.txt', B.text().slice(-2500));
  const sidA = sidFor(dirA); const sidB = sidFor(dirB);
  const slA = slFor(sidA); const slB = slFor(sidB);
  r.a.rateLimits = slA && slA.rate_limits; r.b.rateLimits = slB && slB.rate_limits;
  r.a.accountHashes = [...recA.ids]; r.b.accountHashes = [...recB.ids];
  for (const s of [A, B]) { s.p.write('/exit'); await sleep(200); s.p.write('\r'); }
  await sleep(6000);
  for (const s of [A, B]) try { s.p.kill(); } catch {}
  recA.server.close(); recB.server.close();
  r.after = { mainCred: fileSha(MAIN_CRED), acc2Cred: fileSha(path.join(ACC2, '.credentials.json')), mainJsonHasB: projectsHas(MAIN_JSON, dirB), acc2JsonHasB: projectsHas(ACC2_JSON, dirB), acc2HasProjectsDir: fs.existsSync(path.join(ACC2, 'projects')) };
  r.verdict = {
    distinctAccounts: r.a.accountHashes.length > 0 && r.b.accountHashes.length > 0 && !r.a.accountHashes.some((h) => r.b.accountHashes.includes(h)),
    bothReplied: !!(r.a.replied && r.b.replied && r.a.secondTurn && r.b.secondTurn),
    mainCredUnchanged: r.before.mainCred === r.after.mainCred,
    bLeftNoTraceInMainJson: r.after.mainJsonHasB === false,
    rateLimitsDiffer: JSON.stringify(r.a.rateLimits) !== JSON.stringify(r.b.rateLimits),
  };
  write('step2.json', r);
  app.exit(0);
});
