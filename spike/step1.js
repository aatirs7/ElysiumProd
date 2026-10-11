// Phase 0 step 1: node-pty loads inside Electron on win32-arm64 and a
// PowerShell session round-trips through ConPTY.
const { app } = require('electron');
const { write, spawnPty, sleep } = require('./lib');

app.whenReady().then(async () => {
  const r = { electron: process.versions.electron, node: process.versions.node, arch: process.arch, platform: process.platform };
  try {
    const pty = require('node-pty');
    r.ptyLoaded = true;
    const t0 = Date.now();
    const s = spawnPty(pty, 'powershell.exe', ['-NoLogo', '-NoProfile'], { cwd: __dirname, env: process.env });
    r.promptSeen = await s.waitFor(/PS .*>/, 15000);
    r.msToPrompt = Date.now() - t0;
    const m = s.mark();
    s.p.write('echo spike-ok-$((6*7))\r');
    r.echoRoundTrip = await s.waitFor(/spike-ok-42/, 10000, m);
    s.p.resize(120, 40);
    const m2 = s.mark();
    s.p.write('$Host.UI.RawUI.WindowSize.Width\r');
    r.resizeSeen = await s.waitFor(/\b120\b/, 10000, m2);
    s.p.write('exit\r');
    await sleep(1500);
    r.exit = s.exited();
    r.pid = s.p.pid;
  } catch (e) {
    r.ptyLoaded = r.ptyLoaded || false;
    r.error = String(e && e.stack || e);
  }
  write('step1.json', r);
  app.exit(0);
});
