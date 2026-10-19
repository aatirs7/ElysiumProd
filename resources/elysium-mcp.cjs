// The Elysium tool a session sees: list the other sessions, hand one a task, wait
// for its answer. A tiny MCP server over stdio with no dependencies; each call is
// passed to the running Elysium (src/main/bridge.ts) over 127.0.0.1.
const { readFileSync } = require('node:fs');
const http = require('node:http');

const TOOLS = [
  {
    name: 'elysium_sessions',
    description: 'List every session in Elysium (Claude sessions and other agents like Codex, across all projects) and what each is doing. Call this first to find who to delegate to.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'elysium_send',
    description: 'Hand another session a task. It starts the session if it is not running, and it types the task in once that session is free. `to` is a session id from elysium_sessions, a project name (its lead Claude session), or "codex in <project>". Write the task so it stands on its own: the other session cannot see your conversation.',
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, message: { type: 'string' }, agent: { type: 'string', description: 'Optional: claude, codex or gemini, to pick that agent in the project.' } }, required: ['to', 'message'], additionalProperties: false },
  },
  {
    name: 'elysium_wait',
    description: 'Wait for a session you sent a task to, and get its answer. Returns when it finishes, needs the owner, or the time runs out (then call again).',
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, timeout_seconds: { type: 'number', description: 'Up to 600. Default 300.' } }, required: ['to'], additionalProperties: false },
  },
  {
    name: 'elysium_read',
    description: 'Read what a session said last (or its screen, for Codex and other terminal agents) without waiting.',
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, count: { type: 'number', description: 'How many of its last messages. Default 1.' } }, required: ['to'], additionalProperties: false },
  },
  {
    name: 'elysium_playbook_search',
    description: 'Search the owner\'s shared playbook, the archive of their best work across every project: how features were built, the strategy behind plans, things worth copying, and lessons learned. Search it before building or planning something non-trivial, for direction and inspiration, and follow a match.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'elysium_playbook_read',
    description: 'Read one playbook entry in full, by the name elysium_playbook_search gave.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
  },
  {
    name: 'elysium_playbook_add',
    description: 'Add to the shared playbook so any project can learn from it. kind "howto" (default): how you built something, with what it is for, the steps in order, the files, commands and settings, and the pitfalls. "strategy": a plan or approach and why it was chosen. "showcase": something that turned out well and is worth copying, and what makes it good. "lesson": a decision or mistake and what to do next time. Markdown, no secrets. The same title updates the entry.',
    inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'What it builds, like "Stripe checkout with webhooks".' }, summary: { type: 'string', description: 'One sentence.' }, body: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, kind: { type: 'string', enum: ['howto', 'strategy', 'showcase', 'lesson'] } }, required: ['title', 'summary', 'body'], additionalProperties: false },
  },
];
const TOOL_OF = { elysium_sessions: 'list', elysium_send: 'send', elysium_wait: 'wait', elysium_read: 'read', elysium_playbook_search: 'playbook_search', elysium_playbook_read: 'playbook_read', elysium_playbook_add: 'playbook_add' };

function bridge(tool, args) {
  return new Promise((resolve) => {
    let conf;
    try { conf = JSON.parse(readFileSync(process.env.ELYSIUM_BRIDGE, 'utf8')); } catch { return resolve({ text: 'Elysium is not running, so other sessions cannot be reached right now.', error: true }); }
    const body = JSON.stringify({ tool, args, from: process.env.ELYSIUM_FROM });
    const req = http.request({ host: '127.0.0.1', port: conf.port, method: 'POST', path: '/', headers: { authorization: `Bearer ${conf.token}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ text: 'Elysium gave an answer that could not be read.', error: true }); } });
    });
    req.on('error', () => resolve({ text: 'Could not reach Elysium. It may be restarting; try again in a moment.', error: true }));
    req.end(body);
  });
}

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // a notification
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'elysium', version: '1.0.0' } } });
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  if (method === 'tools/call') {
    const tool = TOOL_OF[params?.name];
    if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
    const r = await bridge(tool, params?.arguments ?? {});
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: r.text }], isError: Boolean(r.error) } });
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `No method ${method}` } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { void handle(JSON.parse(line)); } catch { /* not JSON: ignore */ }
  }
});
process.stdin.on('end', () => process.exit(0));
