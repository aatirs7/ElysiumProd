"""Session-level facts from Claude Code transcripts. Never reads or emits message content.
The transcript format is internal to Claude Code; every field is optional and bad lines are skipped.
Usage: python -I sessions.py <config_dir> [<config_dir> ...]  > sessions.json"""
import json, sys, os, glob, collections
from datetime import datetime, timezone, timedelta
GAP_MIN = 60  # a gap longer than this inside one file is counted as a resume
def ts(s):
    try: return datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone()
    except Exception: return None
results = []; total = bad = 0
for cfg in sys.argv[1:]:
    for f in glob.glob(os.path.join(cfg, 'projects', '*', '*.jsonl')):
        proj = os.path.basename(os.path.dirname(f)); sid = os.path.basename(f)[:-6]
        subdir = os.path.join(os.path.dirname(f), sid)
        subagents = len(glob.glob(os.path.join(subdir, '**', '*.jsonl'), recursive=True)) if os.path.isdir(subdir) else 0
        S = dict(config=cfg, project=proj, session=sid, subagent_files=subagents, lines=0, bad=0, user_turns=0,
                 compactions=[], turns_between_compactions=[], versions=set(), cwds=set(), branches=set(),
                 agent_names=set(), titles=set(), pr_links=set(), mcp=collections.Counter(), skills=collections.Counter(),
                 tools=collections.Counter(), slash=collections.Counter(), cost=None, entrypoints=set(), api_errors=0)
        stamps = []; turns_since = 0
        with open(f, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                S['lines'] += 1; total += 1
                try: o = json.loads(line)
                except Exception: S['bad'] += 1; bad += 1; continue
                if not isinstance(o, dict): continue
                t = o.get('type'); d = ts(o['timestamp']) if isinstance(o.get('timestamp'), str) else None
                if d and not o.get('isSidechain'): stamps.append(d)
                for k, dst in (('version', 'versions'), ('cwd', 'cwds'), ('gitBranch', 'branches'), ('entrypoint', 'entrypoints')):
                    if o.get(k): S[dst].add(o[k])
                if t == 'agent-name' and o.get('agentName'): S['agent_names'].add(o['agentName'])
                elif t == 'custom-title' and o.get('customTitle'): S['titles'].add(o['customTitle'][:80])
                elif t == 'pr-link' and o.get('prUrl'): S['pr_links'].add(o['prUrl'])
                elif t == 'cost-state': S['cost'] = {k: o.get(k) for k in ('totalCostUSD', 'totalDuration', 'totalAPIDuration', 'totalLinesAdded', 'totalLinesRemoved')}
                elif t == 'system' and o.get('subtype') == 'compact_boundary':
                    m = o.get('compactMetadata') or {}
                    S['compactions'].append({'at': d.isoformat() if d else None, 'trigger': m.get('trigger'), 'preTokens': m.get('preTokens')})
                    S['turns_between_compactions'].append(turns_since); turns_since = 0
                elif t == 'assistant':
                    if o.get('isApiErrorMessage'): S['api_errors'] += 1
                    msg = o.get('message') or {}
                    for b in (msg.get('content') or []) if isinstance(msg.get('content'), list) else []:
                        if isinstance(b, dict) and b.get('type') == 'tool_use':
                            n = b.get('name', '?'); S['tools'][n] += 1
                            if n.startswith('mcp__'): S['mcp'][n] += 1
                            if n == 'Skill': S['skills'][str((b.get('input') or {}).get('skill'))[:60]] += 1
                elif t == 'user' and not o.get('isSidechain') and not o.get('isMeta') and not o.get('isCompactSummary') and not o.get('toolUseResult'):
                    c = (o.get('message') or {}).get('content')
                    if isinstance(c, list) and c and all(isinstance(x, dict) and x.get('type') == 'tool_result' for x in c): continue
                    text = c if isinstance(c, str) else ' '.join(x.get('text', '') for x in c if isinstance(x, dict)) if isinstance(c, list) else ''
                    if '<command-name>' in text:
                        cmd = text.split('<command-name>')[1].split('</command-name>')[0].strip()[:40]; S['slash'][cmd] += 1
                    elif '<local-command' in text or '<task-notification' in text or 'system-reminder' in text[:40]: continue
                    S['user_turns'] += 1; turns_since += 1
        stamps.sort()
        buckets = sorted({(x.replace(minute=x.minute // 10 * 10, second=0, microsecond=0)) for x in stamps})
        gaps = [(b - a).total_seconds() / 60 for a, b in zip(stamps, stamps[1:])]
        S.update(first=stamps[0].isoformat() if stamps else None, last=stamps[-1].isoformat() if stamps else None,
                 active_minutes=len(buckets) * 10, days=sorted({b.date().isoformat() for b in buckets}),
                 resumes=sum(1 for g in gaps if g > GAP_MIN), longest_gap_hours=round(max(gaps) / 60, 1) if gaps else 0,
                 buckets=[b.isoformat() for b in buckets], turns_after_last_compaction=turns_since)
        for k in ('versions', 'cwds', 'branches', 'agent_names', 'titles', 'pr_links', 'entrypoints'): S[k] = sorted(S[k])
        for k in ('mcp', 'skills', 'tools', 'slash'): S[k] = dict(S[k].most_common())
        results.append(S)
tz = datetime.now().astimezone().tzname()
json.dump({'timezone': tz, 'total_lines': total, 'bad_lines': bad, 'parse_coverage_pct': round(100 * (total - bad) / max(total, 1), 3), 'sessions': results}, sys.stdout)
