# AUDIT-FRICTION

Phase A, step 21.5. Things the owner does by hand, repeatedly, that software could do.

Sources: `~/.claude/history.jsonl` (1,051 prompts since 2026-09-21), PowerShell history at `%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt` (2,372 lines, undated, so counts there are all time), the transcripts, the relays and the repos. Counted by `audit/scripts/friction.py`; no prompt text is reproduced.

Ranking is by estimated time cost. **Every time figure in this file is a guess** built from the counts shown beside it, not a measurement.

## 1. Outages caused by session identity and liveness

- Evidence: the Attestia pair lost its link for about 36 hours on 2026-10-02 to 10-04 after a rename removed a dash (AUDIT-WORKFLOW, Finding 2). `/rename` was typed 26 times in the window, more than any other slash command. Session titles drifted through `Prime`, `Prime - Attestia`, `Prime Attestia` and `Prime - SecurITPosture` versus `Prime Posture` in `cs.ps1`. The guard, the plugin, `cs.ps1` and each relay match names as strings.
- Cost guess: the largest single item. 36 hours of one project's paired work stalled once, plus a week of a wrong relay, plus 26 renames.
- Feature: **stable session identity.** Each template gets an id ElysiumProd owns. The display title is passed to the CLI with `-n` and, through `SP_SESSION_NAME`, to the plugin, and is generated from the template so it cannot drift. A rename is a template edit that ElysiumProd applies to the plugin options and `sessions.json` together.

## 2. Launching and resuming by hand

- Evidence: PowerShell history shows `claude --resume` 140 times, `claude --dangerously-skip-permissions` 111, `cs` about 44, `claude -r` 7. Three `cs` calls named no known session and 8 `claude` launches had a misspelled flag. A pair launch is two terminals and two commands. One session started in a temporary scratchpad folder (`5e662344`, 2026-10-06).
- Cost guess: one to two minutes per launch, several launches a day across four paired projects and the side projects. Small each time, constant.
- Feature: **Launch, seeded from `cs.ps1`.** Import its eight titles, folders, `SP_SESSION_NAME` values, `--plugin-dir` and per project model flags as the initial session templates. This is section 8.3 as written, with the data already known.

## 3. Meridian stopped by the machine, not by the model

- Evidence: Elysium Intern's Meridian was stopped by the CLI for critically low memory at about 17:11 Eastern on 2026-10-10. SecurITPosture's Meridian is holding uncommitted work until there is 5 GB free. `C:` has 14 GB free, 98 percent used. Transcripts alone are about 1.8 GB in `~/.claude/projects` (778 MB for Elysium Intern). The owner already built `/ram` into the plugin (0.3.7) to cope.
- Cost guess: hours per incident, and two of four Meridians are affected today.
- Feature: **resource gate, promoted.** Section 10.6 plus a disk check: show free disk beside RAM, refuse to spawn below a configured floor, and on pressure suggest which sessions to stop, Meridians first since they hold the least owner state. Do not duplicate `/ram` inside the CLI; ElysiumProd sees the whole machine, the plugin sees one session.

## 4. Answers waiting in panes nobody is looking at

- Evidence: Intern's Meridian is waiting for a yes in its own session ("answer in its session", Intern relay). SecurITPosture has 23 decisions waiting, two for 13 days. The prompt history has 39 prompts mentioning Meridian and 30 mentioning the board or chat, which reads as the owner asking one session about another.
- Cost guess: the item that keeps work stopped longest, since nothing else signals it.
- Feature: the **attention strip** in 8.1, fed by the `Notification` hook per pane, plus the relay's "Blocked on the owner" or "Waiting on Aatir" heading, whose name already varies per repo and is in each `.claude/mods.json` as `waitingHeading`.

## 5. A relay that only Prime writes

- Evidence: the Attestia relay has said "Meridian is not running" for 9 days after it stopped being true. Issues 19 and 20 were routed a day late because Prime was not running. `get_relay` was patched to prepend live commits to cover this.
- Cost guess: low direct time, high misdirection: every planning chat that read the relay in that week was told something false.
- Feature: ElysiumProd **publishes liveness**. Write a small machine maintained file, for example `.claude/sessions-live.json` in each repo, gitignored, that records which templates are running, since when, and their last turn end. The plugin's peers line and the inbox hook can read it, and the relay text stops carrying liveness at all. Open question for the owner: whether the board servers should read it, which would need it committed or pushed somewhere.

## 6. Switching model, advisor and effort

- Evidence: `/advisor` 19, `/model` 11, `/effort` 4 in the window. `cs.ps1` hardcodes `--model claude-opus-5-5 --advisor claude-fable-5-1` for the Posture pair only, and relay #105 asks the owner to restart both Posture sessions to pick up a model change (#187).
- Cost guess: a minute each, plus a restart of a long session when it is done by relaunch.
- Feature: **model, advisor and effort per template**, applied at launch and editable without touching a script. Shown in the pane header next to the account chip.

## 7. Logging in repeatedly while a second account sits unused

- Evidence: `/login` typed 9 times in `history.jsonl` and present 10 times in window transcripts. `.claude-account2` was set up on 2026-09-21 and has never run a session.
- Cost guess: a few minutes per login. Why the logins happen is not in the record; a guess is that the owner switches accounts by logging in again rather than by changing `CLAUDE_CONFIG_DIR`.
- Feature: section 11 as written, with one change: ElysiumProd should import `.claude-account2` as the second account rather than invent a `.claude-secondary`. Ask the owner what the logins were for before building failover.

## 8. Board watchers that time out

- Evidence: each project's chat watcher runs as a `Monitor` or background Bash inside Prime with a 30 minute or 2 hour timeout (`watchStart` in each `mods.json`). The plugin has a "watcher restart ask" with back off (0.3.6) and a `/watch` switch (0.3.8, 0.3.9). Relay #105 notes a board comment "was missed only while the watcher was down".
- Cost guess: a restart prompt answered several times a day, plus missed notes.
- Feature: run the watcher as **a managed background process per project**, owned by ElysiumProd, restarted on exit, its output delivered to Prime the same way the inbox hook does now. Removes the timeout, keeps the session's context free of watcher output.

## 9. Hooks and commands copied between repos

- Evidence: `no-em-dash.mjs` in 3 repos, `no-hardcoded-color.mjs` in 2, `check.mjs` in 2, `day-start` and `day-end` commands in 3, each a separate copy.
- Cost guess: small, paid when a rule changes and three copies need the edit.
- Feature: **none in ElysiumProd.** These belong in the owner's plugin, which already loads in every main repo through `--plugin-dir`. Recorded so the spec does not absorb it.

## 10. Stale worktrees and clones

- Evidence: 7 Attestia worktrees, 5 untouched for 17 or more days; second clones for Meridian (`elysiumintern-v4`, `Gulf-meridian`); 7 separate full clones of `drift`; `SecureITPosture` left behind after the move to `securitposture_2026`.
- Cost guess: low time, some disk on a disk that is full.
- Feature: in the git pane, **list worktrees and sibling clones** of the project's remote with last commit date. No deletion from the app.

## 11. Board ledger that undercounts

- Evidence: the Attestia ledger records 0 minutes on days the same session was active for hours (AUDIT-WORKFLOW, Finding 1 table).
- Cost guess: no direct time, but it already misled one spec.
- Feature: ElysiumProd's metrics from OTel and hooks (section 10.3) give the true active time. Whether to send it to the board is the owner's call; the spec's no telemetry off machine rule says no by default.

## Checked and not worth a feature

- **Screenshots and the browser.** 64 prompts mention a screenshot or image, and terminal sessions made 1,460 Claude in Chrome tool calls. That is the agents testing UI through the owner's Chrome, and it works.
- **Planning in the claude.ai web UI.** The board connectors already carry notes from the chat to Prime and the relay back. It works; ElysiumProd should not try to replace it.
- **"Continue" prompts.** 28 prompts start with continue, go on or similar. Mostly after the owner reads output; not worth automating.
- **Compactions losing work.** The plugin's park, compact and resume flow writes a resume note first. No redo after a compaction was identified from metadata. This check was limited to metadata, so it is a weak negative.
