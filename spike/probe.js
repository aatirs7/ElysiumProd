// Dry run: launch claude through node-pty under Electron in the sandbox, wait,
// save the visible text, exit. Used to learn what the TUI looks like over a PTY.
const { app } = require('electron');
const path = require('path');
const { write, spawnPty, sleep } = require('./lib');

app.whenReady().then(async () => {
  const pty = require('node-pty');
  const env = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN']) delete env[k];
  const t0 = Date.now();
  const s = spawnPty(pty, process.env.CLAUDE_EXE, ['--settings', path.join(__dirname, 'settings.spike.json'), '--model', 'claude-haiku-5-5', '-n', 'Spike Probe'], { cwd: path.join(__dirname, 'sandbox'), env });
  const marks = [];
  for (let i = 0; i < 12; i++) { await sleep(2500); marks.push({ ms: Date.now() - t0, len: s.text().length }); }
  write('probe-screen.txt', s.text().slice(-6000));
  write('probe-marks.json', marks);
  s.p.write('/exit\r');
  await sleep(4000);
  write('probe-exit.json', { exited: s.exited() });
  try { s.p.kill(); } catch {}
  app.exit(0);
});
