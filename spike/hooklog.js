// Logs a hook event's raw stdin to spike/out/hooks.jsonl and exits 0.
const fs = require('fs'), path = require('path');
let d = ''; process.stdin.on('data', (c) => (d += c)).on('end', () => {
  let j; try { j = JSON.parse(d); } catch { j = { unparsed: d.slice(0, 2000) }; }
  fs.appendFileSync(path.join(__dirname, 'out', 'hooks.jsonl'), JSON.stringify({ at: new Date().toISOString(), event: process.argv[2], stdin: j }) + '\n');
  process.exit(0);
});
