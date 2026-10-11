"""Sanitised schema summary of Phase 0 captures: key names and enum-like values only."""
import json, collections
out = ['# Phase 0 captured schemas', '', 'Key names only, from Claude Code 2.1.296. Values are omitted except enum-like fields.', '']
ENUM = {'hook_event_name', 'source', 'reason', 'notification_type', 'trigger', 'permission_mode', 'effort', 'stop_hook_active', 'from_model', 'to_model', 'prompt_cache_warm', 'cache_ttl'}
ev = collections.OrderedDict()
for f in ('out/hooks-run1.jsonl', 'out/hooks.jsonl'):
    try:
        for l in open(f, encoding='utf-8'):
            o = json.loads(l); e = ev.setdefault(o['event'], {'keys': set(), 'enums': collections.defaultdict(set)})
            for k, v in o['stdin'].items():
                e['keys'].add(k)
                if k in ENUM and not isinstance(v, (dict, list)): e['enums'][k].add(str(v))
    except FileNotFoundError: pass
for f in ('out/compact-hooks.jsonl',):
    pass
out.append('## Hook stdin')
for name, e in ev.items():
    out.append(f'- **{name}**: ' + ', '.join(f'`{k}`' for k in sorted(e['keys'])))
    for k, vs in sorted(e['enums'].items()): out.append(f'  - `{k}` seen: ' + ', '.join(sorted(vs)))
out += ['', '## Status line stdin']
keys = set()
def walk(d, p=''):
    for k, v in d.items():
        if isinstance(v, dict): walk(v, p + k + '.')
        else: keys.add(p + k)
for f in ('out/statusline-run1.jsonl', 'out/statusline.jsonl'):
    for l in open(f, encoding='utf-8'): walk(json.loads(json.loads(l)['raw']))
out.append(', '.join(f'`{k}`' for k in sorted(keys)))
open('out/SCHEMAS.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('\n'.join(out)[:3000])
