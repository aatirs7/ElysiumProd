// Run: node --experimental-strip-types test/scrollback.test.mts
import { mkdtempSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { Scrollback, enforceCaps, ROTATE_BYTES, TOTAL_CAP_BYTES } from '../src/main/scrollback.ts';

const dir = mkdtempSync(join(tmpdir(), 'ep-scrollback-'));

// Rotation: past 10 MB a new numbered segment starts; only the newest two stay.
const sb = new Scrollback(dir, 'rot');
const chunk = 'x'.repeat(1024 * 1024);
for (let i = 0; i < 31; i++) sb.write(chunk);
await sb.close();
await new Promise((r) => setTimeout(r, 300));
const files = readdirSync(dir).sort();
assert.deepEqual(files, ['rot.002.log', 'rot.003.log']);
for (const f of files) assert.ok(statSync(join(dir, f)).size <= ROTATE_BYTES);

// Age: a log older than 30 days is removed.
const old = join(dir, 'old.log');
writeFileSync(old, 'old');
const past = (Date.now() - 31 * 24 * 3600 * 1000) / 1000;
utimesSync(old, past, past);
let r = enforceCaps(dir);
assert.ok(!readdirSync(dir).includes('old.log'));

// Total cap, checked with a clock and sizes scaled by sparse accounting:
// pretend "now" and give two files whose sizes sum past the cap.
const big1 = join(dir, 'a.log'); const big2 = join(dir, 'b.log');
writeFileSync(big1, ''); writeFileSync(big2, '');
const fd1 = (await import('node:fs')).openSync(big1, 'r+'); (await import('node:fs')).ftruncateSync(fd1, TOTAL_CAP_BYTES / 2 + 1); (await import('node:fs')).closeSync(fd1);
const fd2 = (await import('node:fs')).openSync(big2, 'r+'); (await import('node:fs')).ftruncateSync(fd2, TOTAL_CAP_BYTES / 2 + 1); (await import('node:fs')).closeSync(fd2);
const t1 = (Date.now() - 3600 * 1000) / 1000; utimesSync(big1, t1, t1);
r = enforceCaps(dir);
assert.ok(!readdirSync(dir).includes('a.log'), 'oldest removed first');
assert.ok(readdirSync(dir).includes('b.log'));
assert.ok(r.totalBytes <= TOTAL_CAP_BYTES);
(await import('node:fs')).rmSync(dir, { recursive: true, force: true });
console.log('scrollback tests passed', r);
