"""Per-session work volume and input origin, metadata only. Usage: python -I origins.py <transcript.jsonl>..."""
import json, sys, collections, os
for f in sys.argv[1:]:
    c = collections.Counter(); org = collections.Counter(); q = collections.Counter(); daywork = collections.Counter()
    for line in open(f, encoding='utf-8', errors='replace'):
        try: o = json.loads(line)
        except Exception: continue
        if not isinstance(o, dict) or o.get('isSidechain'): continue
        t = o.get('type')
        if t == 'assistant':
            c['assistant'] += 1
            cont = (o.get('message') or {}).get('content') or []
            n = sum(1 for b in cont if isinstance(b, dict) and b.get('type') == 'tool_use') if isinstance(cont, list) else 0
            c['tool_uses'] += n
            if o.get('timestamp'): daywork[o['timestamp'][:10]] += n
        elif t == 'user' and not o.get('toolUseResult') and not o.get('isMeta'):
            org[str(o.get('origin') or o.get('promptSource') or o.get('turnOrigin') or 'none')[:60]] += 1
        elif t == 'queue-operation':
            q[str(o.get('operation'))] += 1
    print(os.path.basename(f)[:8], dict(c), 'origins', dict(org.most_common(6)), 'queue', dict(q))
    print('    tool_uses by UTC day', dict(sorted(daywork.items())))
