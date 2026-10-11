// Phase 0 step 6: launch like `cs prime posture` but fresh and under a spike
// name: SP_SESSION_NAME, --plugin-dir, --model, --advisor, -n. Never --resume.
// Checks the flags are accepted and the securitposture-mods line and peers row render.
const { app } = require('electron');
const path = require('path');
const { write, spawnPty, sleep } = require('./lib');

const MODS = 'C:\\Users\\aatir\\securitposture_2026\\plugins\\securitposture-mods';

app.whenReady().then(async () => {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(CLAUDE|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OTEL_)/i.test(k)) env[k] = v;
  env.SP_SESSION_NAME = 'Spike';
  const pty = require('node-pty');
  const t0 = Date.now();
  const s = spawnPty(pty, process.env.CLAUDE_EXE, ['--dangerously-skip-permissions', '--plugin-dir', MODS, '--model', 'claude-opus-5-5', '--advisor', 'claude-fable-5-1', '-n', 'Spike Posture'], { cwd: path.join(__dirname, 'sandbox', 'a'), env });
  const r = {};
  r.ready = await s.waitFor(/Opus 5\.5/, 30000); r.msReady = Date.now() - t0;
  await sleep(20000); // let the plugin's line render and its peers refresh
  const flat = s.text().replace(/\s+/g, '');
  r.flagErrorShown = /unknownoption|error:|Invalidmodel|cannotuse/i.test(flat);
  r.badgeShown = /Spike/.test(flat);
  r.peersMentioned = /Prime|Meridian/.test(flat);
  r.contextMeter = /\d+%/.test(flat);
  r.advisorOn = /Advisor/i.test(flat);
  write('step6-screen.txt', s.text().slice(-4000));
  s.p.write('/exit'); await sleep(300); s.p.write('\r');
  await sleep(5000);
  r.exit = s.exited();
  try { s.p.kill(); } catch {}
  write('step6.json', r);
  app.exit(0);
});
