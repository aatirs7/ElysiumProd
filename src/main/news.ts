// News for Home: what is new from Anthropic, OpenAI and Claude Code, plus what
// people are talking about on Hacker News. Plain feeds fetched here (no tokens),
// cached for an hour, and shown as headlines that open in the browser.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NewsItem } from '@shared/ipc';
import { dataDir } from './paths';

const CACHE = () => join(dataDir(), 'news-cache.json');
const TTL = 60 * 60 * 1000;

const unescape = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();

async function get(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Elysium/1.0 (+desktop app)' }, signal: AbortSignal.timeout(10000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

/** RSS items or Atom entries: title, link and date. */
function parseFeed(xml: string, source: string, limit: number): NewsItem[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? [];
  return blocks.slice(0, limit).map((b) => {
    const title = unescape(b.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const link = b.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? unescape(b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    const date = unescape(b.match(/<(pubDate|updated|published)>([\s\S]*?)<\/\1>/)?.[2] ?? '');
    const at = Date.parse(date);
    return { title, url: link, source, at: Number.isNaN(at) ? null : new Date(at).toISOString() };
  }).filter((x) => x.title && /^https:\/\//.test(x.url));
}

/** Anthropic has no feed; its news page lists each post as a link with its date and title. */
const CATEGORIES = new Set(['Announcements', 'Policy', 'Science', 'Product', 'Research', 'Societal Impacts', 'Interpretability', 'Alignment', 'Economic Research', 'Case Study', 'Customer Stories', 'Events', 'News']);

function anthropicNews(html: string): NewsItem[] {
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]*href="(\/news\/[a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 6) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const parts = m[2].replace(/<[^>]+>/g, '|').split('|').map((x) => unescape(x)).filter((x) => x.length > 3);
    const date = parts.find((x) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(x));
    // Each card also carries its category (Announcements, Policy...); the title is the first part that is neither.
    const title = parts.find((x) => x !== date && !CATEGORIES.has(x) && x.includes(' ') && x.length > 8);
    if (!title) continue;
    const at = date ? Date.parse(date) : NaN;
    out.push({ title, url: `https://www.anthropic.com${m[1]}`, source: 'Anthropic', at: Number.isNaN(at) ? null : new Date(at).toISOString() });
  }
  return out;
}

async function hackerNews(): Promise<NewsItem[]> {
  const since = Math.floor((Date.now() - 4 * 86400000) / 1000);
  const body = await get(`https://hn.algolia.com/api/v1/search?query=claude%20OR%20anthropic%20OR%20openai&tags=story&numericFilters=points%3E80,created_at_i%3E${since}&hitsPerPage=8`);
  if (!body) return [];
  try {
    const j = JSON.parse(body) as { hits?: { title?: string; url?: string; objectID: string; created_at?: string; points?: number }[] };
    return (j.hits ?? []).filter((h) => h.title).map((h) => ({
      title: h.title!, url: h.url && /^https:\/\//.test(h.url) ? h.url : `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: 'Hacker News', at: h.created_at ?? null, points: h.points,
    }));
  } catch { return []; }
}

export async function news(force = false): Promise<{ items: NewsItem[]; at: string }> {
  if (!force && existsSync(CACHE())) {
    try { const c = JSON.parse(readFileSync(CACHE(), 'utf8')) as { items: NewsItem[]; at: string }; if (Date.now() - Date.parse(c.at) < TTL) return c; } catch { /* refetch */ }
  }
  const [anthropic, openai, claudeCode, hn] = await Promise.all([
    get('https://www.anthropic.com/news').then((x) => (x ? anthropicNews(x) : [])),
    get('https://openai.com/news/rss.xml').then((x) => (x ? parseFeed(x, 'OpenAI', 6) : [])),
    get('https://github.com/anthropics/claude-code/releases.atom').then((x) => (x ? parseFeed(x, 'Claude Code', 3).map((i) => ({ ...i, title: `Claude Code ${i.title}` })) : [])),
    hackerNews(),
  ]);
  const items = [...anthropic, ...openai, ...claudeCode, ...hn]
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    .slice(0, 14);
  const out = { items, at: new Date().toISOString() };
  if (items.length) { try { writeFileSync(CACHE(), JSON.stringify(out)); } catch { /* cache is optional */ } }
  return out;
}
