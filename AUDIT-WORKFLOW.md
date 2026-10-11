# AUDIT-WORKFLOW

Phase A, step 21.4. The Prime and Meridian model, tested against the local record.

The spec scoped this step to Attestia. The local record shows the model runs in **four** projects, so all four are measured. Attestia stays the detailed case.

## Where the model runs

| Project | Prime session | Meridian session | Launch titles in `cs.ps1` | Relay |
|---|---|---|---|---|
| Attestia | `16047ae8` | `fabb5698` | Prime Attestia, Meridian Attestia | `tracker/relay/from-prime.md` |
| SecurITPosture | `50655ff0` | `feb72296` | Prime Posture, Meridian Posture | GitHub issue #105 |
| Elysium Intern | `217d4788` | `2affe11c` | Prime Intern, Meridian Intern | `tracker/relay/from-main.md` |
| Gulf | `15afd643` | `7cb70671` | Prime Gulf, Meridian Gulf | `docs/relay/from-prime.md` |

Identity comes from `agent-name` records in each transcript and from `.claude/mods.json` in each repo.

## How the work divides

### Measures

- **Commit calls**: Bash or PowerShell tool calls containing `git commit`, per session, from `audit/scripts/commits_by_session.py`. Git alone cannot attribute commits, because co-author trailers are switched off (`includeCoAuthoredBy: false`) and every worktree branch has been merged into main. A call is not always a landed commit, so read these as shares, not totals.
- **Tool calls** and **owner typed turns** (`origin.kind = human`) from `origins.py`.
- **Overlap**: ten minute windows in which both sessions wrote a record, from `overlap.py`.

| Project | Prime commit calls | Meridian commit calls | Meridian share | Prime tool calls | Meridian tool calls | Owner typed turns, Prime / Meridian | Both active, share of union |
|---|---|---|---|---|---|---|---|
| Attestia | 172 | 194 | 53% | 2,460 | 3,810 | 67 / 97 | 74% |
| SecurITPosture | 198 | 265 | 57% | 4,516 | 5,411 | 136 / 5 | 74% |
| Elysium Intern | 247 | 108 | 30% | 3,881 | 2,917 | 66 / 8 | 47% |
| Gulf | 122 | 47 | 28% | 761 | 444 | 16 / 0 | 50% |

Attestia's figures cover each transcript's full life, which starts 2026-09-16 for Meridian and 2026-09-20 for Prime; commit calls are counted from 2026-09-21.

### What this shows

- **Meridian is not idle.** In Attestia and SecurITPosture it ran more tool calls and more commits than Prime. In Elysium Intern and Gulf it carried 28 to 30 percent of commits.
- **The owner barely talks to Meridian** outside Attestia: 5, 8 and 0 owner typed turns, against 136, 66 and 16 to the matching Prime. Owner typed means `origin.kind = human`. Its input is peer messages from Prime (`origin.kind = task-notification, producer = session-task`: 77 in Meridian Posture, 44 in Meridian Intern) and the plugin's compaction prompts. Meridian is a worker Prime drives, which is the design.
- **The two run together most of the time.** Both sessions were active in 74 percent of the pair's active windows in Attestia and SecurITPosture.

## Section 2.2, finding by finding

**Finding 1, "the two sessions are almost never both working": refuted.**

The board ledger rows the spec read are SessionStart to SessionEnd spans written by `scripts/session-end.mjs`. They measure when a hook fired, not when work happened. Side by side for the same Attestia sessions:

| Day | Ledger, Prime | Local active, Prime | Ledger, Meridian | Local active, Meridian | Local, both |
|---|---|---|---|---|---|
| 09-21 | 0 | 110 | 268 | 80 | 80 |
| 09-22 | 298 | 60 | 298 | 40 | 40 |
| 09-23 | 923 | 50 | absent | 90 | 50 |
| 09-24 | 308 | 210 | 0 | 190 | 190 |
| 09-27 | 904 | 220 | 24 | 250 | 210 |
| 09-28 | 0 | 270 | 255 | 250 | 250 |
| 09-29 | 0 | 70 | 17 | 60 | 60 |

Minutes. Local figures from `overlap.py`, bucketed by Eastern day; the ledger keys days by its own day boundary, so single day comparisons can shift by a few hours; ledger figures from `get_sessions` on board `aatirs7/attestia`, read 2026-10-11.

The zero rows have start and end three to fourteen seconds apart: a resume that fired the hooks and ended at once, while the real session kept running elsewhere. The 900 minute rows are wall clock spans over a session left open. On every day, the session the ledger shows at zero was in fact working.

**Finding 2, "nine days blocked on starting Meridian": partly confirmed, mostly a stale relay.**

The sequence, all times UTC:

1. 2026-10-02 16:11. Meridian, then titled `Meridian - Attestia`, answers a peer message. Its last record that day is at 16:12:57.
2. 16:27. Prime renames itself `Prime Attestia`, dropping the dash. Commit `05a8b58` applies the new names to the guard list, the plugin options and the rules.
3. 16:33. Prime writes the relay: "Meridian is not running right now. Start it as Meridian Attestia".
4. 2026-10-04 04:29. Meridian is renamed `Meridian Attestia`, exactly as asked. Both sessions then work: 11 SendMessage calls from Prime and 5 from Meridian through 10-05 02:00.
5. The relay is never rewritten. As of 2026-10-11 it still reads "Meridian is not running".

So the outage was about **36 hours**, not nine days. It was **caused by a rename**: session identity is a free text title that the guard, the plugin and `cs.ps1` all match by string, and changing the punctuation broke the link. After the fix, the relay stayed wrong for **7 days** because only Prime writes it by hand and Prime stopped working on Attestia.

**Finding 3, "liveness has caused real data problems": confirmed, with more cases.**

- The two cases the spec cites stand: the 36 hour stale relay from 2026-09-23 and issues 19 and 20 routed a day late, both in the Attestia relay text.
- The Finding 2 sequence above is a third.
- Fourth: on 2026-09-28, two SessionEnd hooks raced on the git index and left an `index.lock` that blocked every commit in the Attestia checkout for four hours (`truestate/scripts/session-end.mjs` header).
- Fifth, a different cause: Elysium Intern's Meridian was stopped by the CLI at about 17:11 Eastern on 2026-10-10 because the laptop ran critically low on memory. It is now waiting for the owner's answer inside its own pane (Intern relay, "Blocked on the owner" item 2).
- Sixth: SecurITPosture's Meridian is holding uncommitted work "until the reinstall (4.1 GB free, needs 5)" (relay #105, 2026-10-11). `C:` has 14 GB free, 98 percent used.

**Finding 4, "the board has been dark since 2026-09-29": wrong in detail, right in substance.**

Local transcripts show both Attestia sessions active on 10-02 and 10-04, which the ledger does not record. But Attestia development did stop: the last development commits are on 10-02, plus one sessions rule commit on 10-04. Everything after is a once a day `chore(tracker): day end` commit made by automation. The work moved to Gulf, which Attestia seeded on 10-04 (commit `2af20b2`) and which took 160 commits over 10-04 and 10-05.

**Finding 5, "sessions run very long and nobody can see the context ceiling": first half confirmed, second half refuted.**

Sessions do run for days to weeks, with 3 to 8 compactions each (AUDIT-SESSIONS). But the owner already sees the ceiling: the `securitposture-mods` plugin shows context use above the prompt, warns at 75 percent, and parks, compacts and resumes at 85 percent. 14 of the 16 manual compactions in the window fall on or after 2026-10-02, the day that guard went live.

## How often the relay is updated

Commits touching the relay file on main, per day:

| Relay | Updates per active day | Silent since |
|---|---|---|
| Attestia | 09-22 4, 09-23 2, 09-24 11, 09-25 8, 09-26 4, 09-27 17, 09-28 24, 09-29 5, 10-02 10 | 2026-10-02 16:33 UTC |
| Elysium Intern | 09-27 1, 09-28 2, 09-29 14, 09-30 4, 10-01 9, 10-02 10, 10-06 2, 10-07 7, 10-08 19, 10-09 25, 10-10 11, 10-11 1 | current |
| SecurITPosture | an issue, not a file; updated 2026-10-11 19:18 UTC | current |
| Gulf | 10-04 11, 10-05 16 | 2026-10-05 |

When Prime runs, the relay is updated many times a day. When Prime stops, it stops, and nothing marks it stale except the live commit list `get_relay` prepends.

## How long items wait on the owner

- Attestia: "Start Meridian" waited about 36 hours to be acted on and is still listed after 9 days.
- SecurITPosture board decisions waiting on the owner or partners at audit time: #115 and #118, 13 days; #156, #158 and #160, 10 days; #190, 4 days; 17 more opened today (`board_blockers`).
- SecurITPosture blocked tasks owned by `aatir`: 5, all waiting on an account, a key or a tenant the owner must create (AWS sandbox, Tenable trial, Bedrock access, Resend domain, MFA, which is deferred).
- Elysium Intern: three items, one of which is Meridian's restart, which only gets answered by looking at Meridian's pane.

## Verdict

**Keep both sessions, launched together, for the main projects. Do not make Meridian on demand.** This overturns section 2.3.

Evidence:

- Meridian did 53 and 57 percent of the commit work in two of four projects and 28 to 30 percent in the other two.
- The two were active together in 47 to 74 percent of their working time.
- The nine day blocker that motivated on demand Meridian was a 36 hour outage caused by a rename, followed by a stale relay.

What actually failed, and what ElysiumProd should fix instead:

1. **Identity by free text title.** The guard, the plugin, `cs.ps1` and the relay all match session names as strings. ElysiumProd should own a stable session id per template and pass the display name to the CLI, so a rename is a label change, not a broken link.
2. **Liveness is reported by hand.** Prime wrote "not running" and nobody unwrote it. ElysiumProd knows which PTYs are alive and should be the source of the "running" fact that the relay and the attention strip read.
3. **Machine resources stop Meridian.** Two of the four Meridians are stopped or held today by memory or disk. Meridian is the session that gets cut when the Surface runs short, so the resource view and the pre-spawn checks in section 10.6 matter more than the spec assumed.
4. **Prompts waiting in a pane nobody is looking at.** Intern's Meridian is waiting for a yes in its own session. The attention strip in 8.1 is the fix, fed by the `Notification` hook.

For side projects the evidence is the opposite: every side project ran a single session (AUDIT-REPOS), so their default should be `solo`.
