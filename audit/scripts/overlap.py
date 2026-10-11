"""Concurrency and Prime/Meridian overlap from sessions.json (output of sessions.py). Usage: python -I overlap.py sessions.json"""
import json, sys, collections
d = json.load(open(sys.argv[1]))
S = [s for s in d['sessions'] if (s['last'] or '') >= '2026-09-21']
# hourly concurrency: for each 10-min bucket in window, number of distinct sessions active
by_bucket = collections.defaultdict(set)
for s in S:
    for b in s['buckets']:
        if b >= '2026-09-21': by_bucket[b].add(s['session'][:8])
dist = collections.Counter(len(v) for v in by_bucket.values())
print('10-min buckets with N sessions active:', dict(sorted(dist.items())), 'total active buckets', len(by_bucket))
hour = collections.defaultdict(list)
for b, v in by_bucket.items(): hour[int(b[11:13])].append(len(v))
print('hour: active buckets / mean concurrent / max')
for h in range(24):
    v = hour.get(h, []); print(f'  {h:02d} {len(v):4d} {sum(v)/len(v) if v else 0:.2f} {max(v) if v else 0}')
# distinct projects concurrently active
pb = collections.defaultdict(set)
for s in S:
    for b in s['buckets']:
        if b >= '2026-09-21': pb[b].add(s['project'])
print('10-min buckets with N distinct projects active:', dict(sorted(collections.Counter(len(v) for v in pb.values()).items())))
def role(s):
    n = ' '.join(s['agent_names']).lower()
    return 'meridian' if 'meridian' in n else 'prime' if 'prime' in n else None
pairs = collections.defaultdict(dict)
for s in S:
    r = role(s)
    if r: pairs[s['project']][r] = s
for p, r in pairs.items():
    if len(r) < 2: continue
    P, M = set(r['prime']['buckets']), set(r['meridian']['buckets'])
    P = {b for b in P if b >= '2026-09-21'}; M = {b for b in M if b >= '2026-09-21'}
    print(f'\n{p}: prime {len(P)*10}m meridian {len(M)*10}m both {len(P&M)*10}m only-prime {len(P-M)*10}m only-meridian {len(M-P)*10}m overlap-of-union {100*len(P&M)/max(len(P|M),1):.0f}%')
    days = sorted({b[:10] for b in P | M})
    for day in days:
        pp = sum(1 for b in P if b.startswith(day)); mm = sum(1 for b in M if b.startswith(day)); bb = sum(1 for b in P & M if b.startswith(day))
        print(f'   {day} prime {pp*10:4d} meridian {mm*10:4d} both {bb*10:4d}')
