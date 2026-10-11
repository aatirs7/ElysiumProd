# AUDIT-SUMMARY

Phase A result, 2026-10-11. The ten findings that most change the ElysiumProd design, each with its evidence and its consequence. Detail and sources are in the five audit files beside this one. Every number can be reproduced with the scripts in `audit/scripts/`.

Scope, as the owner directed: the main projects get the full audit. The local record shows four of them, Elysium Intern, SecurITPosture, Attestia and Gulf, because Gulf runs the same paired setup. Side projects get a short section in AUDIT-REPOS.

## 1. Meridian earns its keep. Keep the pair, launched together.

- **Evidence:** Meridian made 53 percent of commit calls in Attestia and 57 percent in SecurITPosture, and ran more tool calls than Prime in both. It made 30 percent in Elysium Intern and 28 percent in Gulf. Both sessions were active together in 74 percent of the pair's working windows in Attestia and SecurITPosture. (AUDIT-WORKFLOW)
- **Consequence:** section 2.3 is overturned. `full`, meaning Prime plus Meridian, is the default profile for the four main projects. `solo` is the default for side projects, which never ran a pair.

## 2. The owner already built the in-CLI half of this app.

- **Evidence:** the `securitposture-mods` plugin, about 2,250 lines of TypeScript, loads into every main project session via `--plugin-dir`. It already has a context meter, warns at 75 percent, and parks, compacts and resumes at 85 percent. It also shows the relay's waiting-on-owner line, peer liveness taken from the CLI's agent listing, a `/ram` view and a watcher restart prompt. (AUDIT-TOOLING section 4)
- **Consequence:** ElysiumProd must not build a second compaction controller or a second in-terminal status line. It owns what the plugin cannot see: several sessions at once, the whole machine, and process lifecycle. It reads the plugin's thresholds so the two always agree.

## 3. The launcher already exists as `cs.ps1`.

- **Evidence:** `C:\Users\aatir\cs.ps1` maps eight session titles to folders, plugin names, `--plugin-dir`, `--dangerously-skip-permissions` and per project model flags. It was used about 44 times. `claude --resume` was typed 140 times. (AUDIT-TOOLING section 6, AUDIT-FRICTION item 2)
- **Consequence:** first run imports `cs.ps1`, each repo's `.claude/mods.json` and `.claude/sessions.json` into projects and session templates. Session templates gain fields for title, plugin session name, model, advisor, effort, plugin directory and permission mode.

## 4. Session identity by free text title breaks the pair.

- **Evidence:** on 2026-10-02 at 16:27 UTC Prime renamed itself to drop a dash. Six minutes later it reported Meridian "not running", though Meridian had answered a message at 16:11. The pair was cut for about 36 hours, until Meridian was renamed to match on 2026-10-04 at 04:29. `/rename` was the most typed slash command in the window, 26 times. (AUDIT-WORKFLOW Finding 2)
- **Consequence:** templates get a stable id that ElysiumProd owns. The title is derived from it and pushed to the CLI, the plugin and `sessions.json` together, so a rename can never desynchronise them.

## 5. The board ledger mismeasures sessions, and section 2 was built on it.

- **Evidence:** ledger rows are hook span timings. On 09-21, 09-24, 09-28 and 09-29 the ledger shows an Attestia session at 0 minutes on days the local transcript shows it active for 70 to 270 minutes. Its 904 and 923 minute rows are open windows, not work. (AUDIT-WORKFLOW Finding 1)
- **Consequence:** section 2 is rewritten from local evidence. ElysiumProd takes active time from OTel and hooks, never from start to end spans. The spec drops "a nine-day blocker" as its motivating example.

## 6. The machine, not the model, is what stops Meridian.

- **Evidence:** Elysium Intern's Meridian was stopped for critically low memory on 2026-10-10. SecurITPosture's Meridian is holding uncommitted work until 5 GB is free. `C:` is 98 percent full with 14 GB free, and transcripts alone take about 1.8 GB. (AUDIT-FRICTION item 3)
- **Consequence:** the resource view moves from Phase 4 polish to Phase 1, and it gains free disk. ElysiumProd refuses to spawn below a floor and suggests stopping Meridians first. It also stores scrollback with a size cap from the first build, since the disk is already full.

## 7. Prompts wait in panes nobody is watching, and the relay goes stale.

- **Evidence:** Intern's Meridian is waiting for a yes inside its own session. The Attestia relay has said "Meridian is not running" for nine days, seven of them after it stopped being true, because only Prime writes it by hand. SecurITPosture has 23 decisions waiting, two of them for 13 days. (AUDIT-WORKFLOW)
- **Consequence:** the attention strip stays the most important widget. ElysiumProd also writes a gitignored liveness file per repo, so the plugin and the relay stop asserting liveness by hand.

## 8. The second account directory exists and has never been used.

- **Evidence:** `C:\Users\aatir\.claude-account2` was created on 2026-09-21 and holds no sessions. It contains its own `.claude.json` with its own `oauthAccount`, which answers the spec's open question about whether that file moves. `/login` was run about 9 to 10 times in the window. (AUDIT-TOOLING section 1)
- **Consequence:** the account model uses the real directories, `.claude` and `.claude-account2`. The `.claude.json` risk drops from Medium to Low, with one confirmation left for Phase 0. Before building failover, ask the owner what the repeated logins were for.

## 9. Board watchers run inside Prime and time out.

- **Evidence:** each project's watcher is a `Monitor` or background Bash with a 30 minute or 2 hour timeout. The plugin gained restart prompts, back off and a `/watch` switch to cope. A board comment "was missed only while the watcher was down" (relay #105). (AUDIT-FRICTION item 8)
- **Consequence:** a new feature. ElysiumProd runs each project's watcher as a supervised background process and restarts it on exit, and Prime's context no longer pays for watcher output.

## 10. Project hooks already run on every event, and one race cost four hours.

- **Evidence:** the main repos have 2 to 9 PostToolUse hooks each, plus SessionStart and SessionEnd scripts that write git. On 2026-09-28 two parallel SessionEnd hooks left an `index.lock` that blocked every Attestia commit for four hours. (AUDIT-TOOLING sections 2 and 5)
- **Consequence:** ElysiumProd's own hooks must post to the ingest and exit. They never touch git, never write the repo and never block, and they live in the account config directory, never in project settings. Phase 0 must confirm they compose with the project hooks rather than replace them.

## Also changed in the spec

- Gulf is added to the projects to dogfood. The first pair is SecurITPosture and Elysium Intern, the two busiest repos in the window with 616 and 750 commits. Attestia's development has been paused since 10-02.
- Model, advisor and effort become template fields, because `/advisor`, `/model` and `/effort` were typed 34 times between them.
- The git pane lists worktrees and sibling clones. That is read only, because 5 of 7 Attestia worktrees are stale.
- Duplicated hooks and commands across repos are explicitly out of scope for ElysiumProd. They belong in the plugin.
- No authentication layer is added anywhere. Clerk is not used.
