// Small visuals an answer can ask for with a fenced block, so a reply reads as a
// picture instead of a wall of text. Claude writes plain lines; this draws them.
//
//   ```stats                     ```bars                    ```status
//   Memory free: 4.4 GB of 15.6  Chrome: 2.5 GB             ok: Defender is on
//   CPU: 41%                     Elysium: 3.3 GB            warn: Disk is nearly full
//   ```                          ```                        bad: Two updates failed
//                                                           ```
//   ```actions: one "Label | the request it sends" per line, drawn as buttons.
// Anything that does not parse falls back to an ordinary code block.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const lines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const num = (s: string) => { const m = /-?\d+(?:[.,]\d+)?/.exec(s.replace(/,(?=\d{3}\b)/g, '')); return m ? Number(m[0].replace(',', '.')) : NaN; };
const split = (l: string) => { const i = l.search(/[:|]/); return i < 0 ? null : [l.slice(0, i).trim(), l.slice(i + 1).replace(/^\|/, '').trim()] as const; };

function stats(text: string): string | null {
  const rows = lines(text).map(split).filter((x): x is readonly [string, string] => Boolean(x && x[0] && x[1]));
  if (!rows.length) return null;
  const tiles = rows.map(([label, value]) => {
    // "4.4 GB of 15.6 GB" or "41%" also gets a meter.
    const of = /^(.*?)\s+(?:of|\/)\s+(.*)$/i.exec(value);
    const pct = of ? (num(of[1]) / num(of[2])) * 100 : /%\s*$/.test(value) ? num(value) : NaN;
    const meter = Number.isFinite(pct) ? `<span class="vz-meter"><i style="width:${Math.max(2, Math.min(100, pct)).toFixed(1)}%"></i></span>` : '';
    return `<div class="vz-stat"><span class="vz-stat-label">${esc(label)}</span><strong>${esc(of ? of[1] : value)}</strong>${of ? `<span class="vz-stat-sub">of ${esc(of[2])}</span>` : ''}${meter}</div>`;
  });
  return `<div class="vz-stats">${tiles.join('')}</div>`;
}

function bars(text: string): string | null {
  const rows = lines(text).map(split).filter((x): x is readonly [string, string] => Boolean(x && x[0] && Number.isFinite(num(x[1]))));
  if (!rows.length) return null;
  const max = Math.max(...rows.map(([, v]) => num(v)));
  return `<div class="vz-bars">${rows.map(([label, value]) => `<div class="vz-bar"><span class="vz-bar-label">${esc(label)}</span><span class="vz-bar-track"><i style="width:${max > 0 ? Math.max(2, (num(value) / max) * 100).toFixed(1) : 0}%"></i></span><span class="vz-bar-value">${esc(value)}</span></div>`).join('')}</div>`;
}

const STATUS: Record<string, { cls: string; icon: string; word: string }> = {
  ok: { cls: 'ok', icon: '<path d="M4 8.5l2.5 2.5L12 5.5"/>', word: 'Fine' },
  warn: { cls: 'warn', icon: '<path d="M8 4.5v4"/><path d="M8 11.2v.1"/>', word: 'Worth a look' },
  bad: { cls: 'bad', icon: '<path d="M5 5l6 6M11 5l-6 6"/>', word: 'Needs fixing' },
  info: { cls: 'info', icon: '<path d="M8 7.5v4"/><path d="M8 4.8v.1"/>', word: 'Note' },
};

function status(text: string): string | null {
  const rows = lines(text).map(split).filter((x): x is readonly [string, string] => Boolean(x && STATUS[x[0].toLowerCase()]));
  if (!rows.length) return null;
  return `<ul class="vz-status">${rows.map(([k, v]) => {
    const s = STATUS[k.toLowerCase()];
    return `<li class="vz-${s.cls}"><span class="vz-badge" title="${s.word}"><svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg></span><span>${esc(v)}</span></li>`;
  }).join('')}</ul>`;
}

/** Follow up actions as buttons; the pane that shows them sends data-prompt when one is clicked. */
function actions(text: string): string | null {
  const rows = lines(text).map((l) => { const i = l.indexOf('|'); return i < 0 ? null : [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const; })
    .filter((x): x is readonly [string, string] => Boolean(x && x[0] && x[1])).slice(0, 5);
  if (!rows.length) return null;
  return `<div class="vz-actions">${rows.map(([label, prompt]) => `<button type="button" class="vz-action" data-prompt="${esc(prompt)}">${esc(label)}</button>`).join('')}</div>`;
}

const KINDS: Record<string, (t: string) => string | null> = { stats, bars, status, actions };

/** The visual for a fenced block, or null to draw it as code. */
export function visual(lang: string | undefined, text: string): string | null {
  const k = KINDS[(lang ?? '').trim().toLowerCase()];
  return k ? k(text) : null;
}
