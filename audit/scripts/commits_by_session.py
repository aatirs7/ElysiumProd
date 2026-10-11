"""Count Bash tool calls that run `git commit` per session and per local day. Counts only; command text is not emitted.
Usage: python -I commits_by_session.py <transcript.jsonl>..."""
import json, sys, os, collections, re
from datetime import datetime
pat = re.compile(r'\bgit\b[^|;&\n]*\bcommit\b')
for f in sys.argv[1:]:
    days = collections.Counter(); total = 0
    for line in open(f, encoding='utf-8', errors='replace'):
        if 'commit' not in line: continue
        try: o = json.loads(line)
        except Exception: continue
        if o.get('type') != 'assistant' or o.get('isSidechain'): continue
        for b in (o.get('message') or {}).get('content') or []:
            if isinstance(b, dict) and b.get('type') == 'tool_use' and b.get('name') in ('Bash', 'PowerShell'):
                cmd = str((b.get('input') or {}).get('command', ''))
                n = len(pat.findall(cmd))
                if n and o.get('timestamp', '') >= '2026-09-21':
                    total += n; days[datetime.fromisoformat(o['timestamp'].replace('Z', '+00:00')).astimezone().date().isoformat()] += n
    print(os.path.basename(f)[:8], total, dict(sorted(days.items())))
