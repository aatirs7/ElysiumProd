"""Friction counts from history.jsonl and PowerShell history. Emits counts and short command names only, never prompt text.
Usage: python -I friction.py <history.jsonl> <ConsoleHost_history.txt> <since-epoch-ms>"""
import json, sys, collections, re
hist, psh, since = sys.argv[1], sys.argv[2], int(sys.argv[3])
slash = collections.Counter(); per_proj = collections.Counter(); pastes = 0; n = 0
first_slash = collections.Counter(); sess_first = {}; lens = []; kw = collections.Counter()
KEYS = {'restart': r'\brestart\b', 'meridian': r'\bmeridian\b', 'relay': r'\brelay\b', 'continue/go on': r'^(continue|go on|go ahead|keep going|proceed)\b',
        'deploy': r'\bdeploy', 'compact': r'\bcompact', 'check the board/chat': r'\b(board|chat)\b', 'vercel': r'\bvercel\b', 'neon': r'\bneon\b', 'screenshot/image': r'\[image|screenshot'}
for line in open(hist, encoding='utf-8', errors='replace'):
    try: o = json.loads(line)
    except Exception: continue
    if o.get('timestamp', 0) < since: continue
    n += 1; d = (o.get('display') or '').strip(); p = (o.get('project') or '').replace(chr(92), '/').split('/')[-1]; per_proj[p] += 1
    if o.get('pastedContents'): pastes += 1
    lens.append(len(d))
    if d.startswith('/'): slash[d.split()[0][:30]] += 1
    s = o.get('sessionId')
    if s and s not in sess_first: sess_first[s] = d.split()[0][:30] if d.startswith('/') else '(prose)'
    for k, r in KEYS.items():
        if re.search(r, d, re.I): kw[k] += 1
lens.sort()
print('prompts since window start:', n, 'with pasted content:', pastes, 'median length chars:', lens[len(lens)//2] if lens else 0)
print('by project:', dict(per_proj.most_common(15)))
print('slash commands:', dict(slash.most_common(25)))
print('first prompt of session:', dict(collections.Counter(sess_first.values()).most_common(10)), 'sessions:', len(sess_first))
print('keyword hits:', dict(kw.most_common()))
try:
    lines = open(psh, encoding='utf-8', errors='replace').read().splitlines()
    heads = collections.Counter()
    for l in lines:
        w = l.strip().split()
        if not w: continue
        h = w[0].lower()
        if h in ('cs', 'claude', 'git', 'npm', 'vercel', 'neonctl', 'neon', 'gh', 'cd', 'code', 'node', 'npx', 'pnpm'):
            key = h if h not in ('cs',) else 'cs ' + ' '.join(w[1:3]).lower()
            if h == 'claude': key = 'claude ' + (w[1] if len(w) > 1 and w[1].startswith('-') else '')
            heads[key] += 1
    print('PowerShell history lines:', len(lines), 'top commands:', dict(heads.most_common(30)))
except FileNotFoundError: print('no PowerShell history')
