// Shared helpers for the Phase 0 spike. Results go to spike/out as files,
// because Electron on Windows is a GUI process and its console output is unreliable.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

function write(name, data) {
  fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

function log(...a) {
  fs.appendFileSync(path.join(OUT, 'harness.log'), `[${new Date().toISOString()}] ${a.join(' ')}\n`);
}

// Strip ANSI escape sequences so output can be searched.
function strip(s) {
  return s
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f]/g, '');
}

// Spawn a PTY and collect its output; returns helpers to wait for text.
function spawnPty(pty, file, args, opts) {
  const p = pty.spawn(file, args, { name: 'xterm-256color', cols: 160, rows: 48, ...opts });
  let buf = '';
  const waiters = [];
  p.onData((d) => {
    buf += d;
    for (const w of [...waiters]) {
      if (w.re.test(strip(buf).slice(w.from))) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.t); w.resolve(true); }
    }
  });
  let exited = null;
  p.onExit((e) => { exited = e; });
  return {
    p,
    text: () => strip(buf),
    raw: () => buf,
    mark: () => strip(buf).length,
    exited: () => exited,
    waitFor(re, ms, from = 0) {
      return new Promise((resolve) => {
        if (re.test(strip(buf).slice(from))) return resolve(true);
        const w = { re, from, resolve };
        w.t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); resolve(false); }, ms);
        waiters.push(w);
      });
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { OUT, write, log, strip, spawnPty, sleep };
