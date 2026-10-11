// Status line shim for the spike: append raw stdin JSON, print a short line.
const fs = require('fs'), path = require('path');
let d = ''; process.stdin.on('data', (c) => (d += c)).on('end', () => {
  fs.appendFileSync(path.join(__dirname, 'out', 'statusline.jsonl'), JSON.stringify({ at: new Date().toISOString(), raw: d }) + '\n');
  process.stdout.write('spike-statusline');
});
