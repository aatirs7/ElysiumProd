# AUDIT-SESSIONS

Phase A, step 21.3. Session level facts only. No message content was read into any output.

## Method and coverage

- Source: every top level `*.jsonl` under `projects/` in both config directories, parsed by `audit/scripts/sessions.py`, then `overlap.py` and `origins.py`.
- **Parse coverage: 337,412 lines read, 0 failed to parse, 100.0 percent.** 39 transcript files in total; 23 have activity on or after 2026-09-21. All 39 are in `C:\Users\aatir\.claude`; `.claude-account2` has none.
- Subagent transcripts live in a folder named after the parent session. They are excluded from every timing figure and counted separately in the "Subagent files" column.
- Timezone: all times are converted to the machine's zone, Eastern Daylight Time.
- "Active" means the session wrote at least one non sidechain, timestamped record in a ten minute window. This includes records that arrive without the owner, such as peer messages, background task notifications and plugin prompts. It is an upper bound on working time, and a much better one than the board's start to end span (see AUDIT-WORKFLOW).
- A "resume" is a gap of more than 60 minutes between consecutive records in one file, over the session's whole life.
- Cost figures are the CLI's own `cost-state` record. On a Max subscription these are API equivalent estimates, not money spent.

## Every session active in the window

| Repo | Session | Name | First | Last | Active min | Days | Owner turns | Compactions (auto/manual) | Resumes | Subagent files | Cost USD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AppData-Local-Temp-claude-secu | 5e662344 | - | 2026-10-06 | 2026-10-06 | 10 | 1 | 1 | 0 (0/0) | 0 | 0 | 0 |
| Documents-sharjeelcrm | 3145aebb | sharjeel-crm-affiliate-upgrade | 2026-07-08 | 2026-10-07 | 870 | 7 | 70 | 2 (1/1) | 11 | 3 | 221 |
| ElysiumProd | d1c75bd5 | - | 2026-10-11 | 2026-10-11 | 20 | 1 | 1 | 0 (0/0) | 0 | 0 | 0 |
| ElysiumVentures | 7f95b228 | - | 2026-09-25 | 2026-09-25 | 40 | 1 | 7 | 0 (0/0) | 0 | 0 | 6 |
| Gulf | 15afd643 | Prime Gulf | 2026-10-04 | 2026-10-05 | 420 | 2 | 17 | 1 (1/0) | 3 | 4 | 114 |
| Gulf | 7cb70671 | Meridian Gulf | 2026-10-04 | 2026-10-05 | 210 | 2 | 2 | 0 (0/0) | 3 | 1 | 86 |
| elysiumbuilds | 6f1446cd | - | 2026-07-21 | 2026-10-06 | 2200 | 35 | 188 | 4 (4/0) | 52 | 3 | 56 |
| elysiumintern | 3fcb5ead | hours-model-tracks-telemetry | 2026-09-09 | 2026-09-22 | 2430 | 10 | 106 | 6 (5/1) | 22 | 66 | 711 |
| elysiumintern | 50e01874 | cloudtest | 2026-09-15 | 2026-09-28 | 1120 | 9 | 140 | 3 (3/0) | 15 | 5 | 102 |
| elysiumintern | 1d8a8515 | - | 2026-09-21 | 2026-09-21 | 10 | 1 | 6 | 0 (0/0) | 0 | 0 | 0 |
| elysiumintern | b0810051 | sec+test | 2026-09-21 | 2026-09-23 | 610 | 3 | 19 | 0 (0/0) | 9 | 4 | 78 |
| elysiumintern | 217d4788 | ElysiumPrime | 2026-09-25 | 2026-10-11 | 2930 | 13 | 113 | 6 (2/4) | 31 | 118 | 1956 |
| elysiumintern | 2affe11c | ElysiumMeridian | 2026-09-25 | 2026-10-10 | 1580 | 10 | 17 | 6 (3/3) | 18 | 13 | 545 |
| phirmilingay | 23bae232 | phirmilengay | 2026-09-29 | 2026-10-11 | 1240 | 9 | 58 | 2 (2/0) | 18 | 3 | 332 |
| securitposture-2026 | 0ff3763c | mcp-spec-049-setup | 2026-09-03 | 2026-09-28 | 1160 | 10 | 102 | 3 (3/0) | 14 | 23 | 736 |
| securitposture-2026 | 88f71e03 | - | 2026-09-18 | 2026-09-23 | 40 | 2 | 4 | 0 (0/0) | 1 | 0 | 6 |
| securitposture-2026 | 50655ff0 | Prime - SecurITPosture | 2026-09-28 | 2026-10-11 | 2630 | 12 | 173 | 7 (4/3) | 23 | 39 | 637 |
| securitposture-2026 | feb72296 | Meridian - SecurITPosture | 2026-09-28 | 2026-10-11 | 2180 | 11 | 23 | 8 (4/4) | 19 | 73 | 79 |
| truestate | fabb5698 | Meridian - Attestia | 2026-09-16 | 2026-10-04 | 2700 | 16 | 130 | 6 (6/0) | 36 | 11 | 206 |
| truestate | a6950d7b | - | 2026-09-18 | 2026-09-28 | 210 | 5 | 15 | 0 (0/0) | 6 | 0 | 25 |
| truestate | 16047ae8 | Prime - Attestia | 2026-09-20 | 2026-10-04 | 1830 | 12 | 80 | 3 (3/0) | 26 | 10 | 471 |
| twitterbookmarksite | b8984ba0 | - | 2026-10-07 | 2026-10-07 | 140 | 1 | 10 | 0 (0/0) | 0 | 2 | 54 |
| winboard | 366b5ee3 | - | 2026-10-10 | 2026-10-10 | 110 | 1 | 3 | 0 (0/0) | 1 | 0 | 47 |

Totals: 23 sessions. 41 automatic and 16 manual compactions. 42 distinct CLI versions seen across them, because long lived sessions span many auto updates.

## How many sessions run at the same time

Share of active ten minute windows, 771 in total, by number of sessions active:

| Sessions active | Windows | Share |
|---|---|---|
| 1 | 218 | 28% |
| 2 | 265 | 34% |
| 3 | 159 | 21% |
| 4 | 94 | 12% |
| 5 | 33 | 4% |
| 6 or 7 | 2 | under 1% |

By distinct projects active at once:

| Projects active | Windows | Share |
|---|---|---|
| 1 | 457 | 59% |
| 2 | 231 | 30% |
| 3 | 73 | 9% |
| 4 or 5 | 10 | 1% |

By hour of day, Eastern:

| Hour | Active windows | Mean sessions | Max |
|---|---|---|---|
| 00 to 02 | 110 | 1.7 | 4 |
| 03 to 09 | 16 | 1.2 | 2 |
| 10 to 11 | 19 | 2.3 | 5 |
| 12 to 13 | 80 | 2.3 | 6 |
| 14 to 18 | 359 | 2.6 | 7 |
| 19 to 23 | 187 | 2.1 | 4 |

Reading: more than one session is active in 72 percent of working time, and more than one project in 41 percent. The peak is 14:00 to 18:00 Eastern. Activity runs until about 02:00 and is near zero from 03:00 to 11:00.

## How long sessions last and how often they compact

- Sessions are not started per task. They are **resumed by title for days or weeks**. Median life of a window session is 7 active days; elysiumbuilds `6f1446cd` has activity on 35 days since 2026-07-21, and Meridian Attestia `fabb5698` on 16.
- Median active time per session is 870 minutes; the maximum is 2,930 (Prime Intern `217d4788`).
- Owner turns between compactions: median 15, across 57 compactions.
- The median hides a split by role. Prime sessions compact after 13 to 67 owner turns. **Meridian sessions compact after 0 to 7 owner turns** (Meridian Posture `feb72296`: 3, 1, 0, 0, 5, 4, 1, 6; Meridian Intern `2affe11c`: 7, 4, 3, 1, 1, 1). Meridian's context is filled by peer messages and its own tool work, not by the owner, so an owner turn count says nothing about when it will compact.
- Manual compactions are 16 of 57, and 14 of those 16 fall on or after 2026-10-02, the day the plugin's compaction guard (park at 85 percent, then compact) went live; Prime Intern has 4 of its 6 manual, Meridian Posture 4 of 8.

## Fresh versus resumed

- 14 sessions were started fresh in the window, including this one. 5 of those were 40 minutes or less.
- The window sessions show 308 gaps over an hour, most of them resumes of the same long lived session.
- In PowerShell history (all time, PSReadLine keeps no dates): `claude --resume` 140, `claude -r` 7, `claude --dangerously-skip-permissions` without resume 111, and the `cs` launcher about 44 times. Three `cs` calls named no known session, and `claude` was launched with a misspelled flag 8 times. Resume is the dominant way in.
- The board ledger shows the effect. On 2026-09-21, 09-24 and 09-28 one of the Attestia pair shows 0 minutes with start and end three to fourteen seconds apart: the SessionStart and SessionEnd hooks fired on a resume that the owner exited, or a launch that immediately ended, while the real work happened in the already running session.

## Repositories whose sessions sit idle for days

Longest gap inside one session, in hours:

| Session | Repo | Longest gap |
|---|---|---|
| 3145aebb | sharjeelcrm | 668 (28 days) |
| 6f1446cd | elysiumbuilds | 400 (17 days) |
| 0ff3763c | securitposture_2026 | 299 (12 days) |
| 50e01874 | elysiumintern | 115 |
| a6950d7b | truestate | 112 |
| 23bae232 | phirmilingay | 94 |
| 3fcb5ead, 217d4788, 2affe11c | elysiumintern | 93 to 94 |

Across the main pairs, the shared gap is 2026-10-03 to 10-05 (no Intern commits, Attestia only automated commits, Posture 21 and 6 commits), and Attestia has had no session activity since 2026-10-04 22:40.

## What happens between sessions on the same repo

Because sessions are resumed rather than restarted, the useful gap is inside one session. What the record shows in those gaps:

- Git keeps moving without a session. Attestia's `chore(tracker): day end` commit lands once a day between 10:34 and 12:35 from 10-03 to 10-10 with no session active, so it comes from scheduled automation, not an agent.
- The relay goes stale. The Attestia relay was last written 2026-10-02 16:33 UTC; `get_relay` now prepends live commits to compensate (AUDIT-WORKFLOW).
- The owner works in the browser. The claude.ai planning chat routes notes to Prime through the board; the inbox hook surfaces them only when Prime is next running.

## Other session facts

- One session ran with its working directory set to a temporary scratchpad folder: `C--Users-aatir-AppData-Local-Temp-claude-C--Users-aatir-securitposture-2026-50655ff0-...-scratchpad`, session `5e662344`, 2026-10-06, 1 turn. A wrong directory start, caught quickly.
- Several sessions report many working directories: Meridian Intern `2affe11c` 22, Gulf Prime 11, Prime Intern 10. These are worktrees and second clones the session moved into, which the board and the plugin both attribute to the parent project.
- API error records: 42 across window sessions, highest in Meridian Attestia (11) and `3fcb5ead` (7).
