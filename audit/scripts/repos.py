"""Repo inventory for Phase A. Read only. Usage: python -I repos.py <since YYYY-MM-DD> <repo paths...>"""
import subprocess, sys, collections, os, json
since = sys.argv[1]
def git(r, *a):
    try: return subprocess.run(['git', '-C', r, *a], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120).stdout
    except Exception: return ''
groups = collections.OrderedDict()
for r in sys.argv[2:]:
    remote = git(r, 'remote', 'get-url', 'origin').strip()
    remote = remote.split('@')[-1] if '@' in remote else remote
    groups.setdefault(remote or ('local:' + r), []).append(r)
out = []
for remote, paths in groups.items():
    main = paths[0]
    log = git(main, 'log', '--all', '--since=' + since, '--no-merges', '--format=@@%H|%cs|%an', '--numstat')
    commits, days, add, dele, authors = 0, collections.Counter(), 0, 0, collections.Counter()
    for line in log.splitlines():
        if line.startswith('@@'):
            h, d, a = line[2:].split('|', 2); commits += 1; days[d] += 1; authors[a] += 1
        else:
            p = line.split('\t')
            if len(p) == 3 and p[0].isdigit():
                if any(x in p[2] for x in ('lock', 'package-lock', '.min.', 'dist/', '.svg', '.png')): continue
                add += int(p[0]); dele += int(p[1])
    last = git(main, 'log', '--all', '-1', '--format=%cs').strip()
    wts = []
    for p in paths:
        wts.append({'path': p, 'branch': git(p, 'symbolic-ref', '--short', '-q', 'HEAD').strip() or 'DETACHED',
                    'last': git(p, 'log', '-1', '--format=%cs').strip(), 'dirty': len(git(p, 'status', '--porcelain').splitlines())})
    out.append({'remote': remote, 'commits': commits, 'active_days': len(days), 'by_day': dict(sorted(days.items())),
                'added_ex_lock': add, 'removed_ex_lock': dele, 'authors': dict(authors), 'last': last, 'checkouts': wts,
                'default_branch': git(main, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').strip()})
out.sort(key=lambda x: -x['commits'])
json.dump(out, sys.stdout, indent=1)
