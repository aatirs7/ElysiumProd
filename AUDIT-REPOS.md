# AUDIT-REPOS

Phase A, step 21.1. Window: 2026-09-21 to 2026-10-11. Machine: the owner's Surface, read only outside this repository.

Scope, as directed by the owner on 2026-10-11: full treatment for the main, high involvement projects (Elysium Intern, Attestia, SecurITPosture), a short section for side projects, and an appendix for everything dormant. Gulf is placed with the main projects because the evidence puts it there: it runs the same Prime and Meridian pair, the same plugin config and the same relay layout (see below).

## Method

- Walked `C:\Users\aatir` to depth 4 for `.git`, excluding `node_modules` and `AppData`: 73 checkouts found, this repository included.
- Grouped checkouts by `origin` URL so worktrees and second clones count once. 73 checkouts reduce to 55 distinct remotes; a checkout with no remote counts as its own.
- Commits counted with `git log --all --since=2026-09-21 --no-merges`. Line counts exclude lockfiles, `dist/`, `.min.`, `.svg` and `.png`.
- Cross checked against the 37 folder names under `~/.claude/projects/`, not counting this session's, the 50 trusted project entries in `~/.claude.json`, `githubRepoPaths` in `~/.claude.json` (50 repos), and VS Code's `workspaceStorage`. The 13 VS Code folders opened since 2026-09-21 are all active repos listed below, except `C:\Users\aatir\Attestia-print`, which is not a git repository.
- Script: `audit/scripts/repos.py`. Re-run it to reproduce every number here.

## Main projects

| Project | Remote | Commits in window | Active days | Lines added / removed | Last commit | Checkouts |
|---|---|---|---|---|---|---|
| Elysium Intern | aatirs7/elysiumintern | 750 | 18 of 21 | 507,374 / 33,951 | 2026-10-11 | 2 |
| SecurITPosture | SecurITPosture-01/securitposture_2026 | 616 (602 owner, 14 dependabot) | 14 | 416,369 / 7,801 | 2026-10-11 | 1 |
| Attestia | aatirs7/attestia | 390 (384 owner, 6 dependabot) | 19 | 56,692 / 4,667 | 2026-10-10 | 8 |
| Gulf | aatirs7/Gulf | 160 | 2 | 26,858 / 7,357 | 2026-10-05 | 2 |

### Elysium Intern

- Paths: `C:\Users\aatir\Documents\Elysium Ventures LLC\elysiumintern` (branch `main`, 1 dirty file) and `...\elysiumintern-v4` (branch `homepage-copy-238`, clean, last commit 2026-10-08). The second is a full clone used as a worktree substitute.
- Commits per day: 09-21 55, 09-22 33, 09-23 9, 09-24 3, 09-25 6, 09-26 10, 09-27 7, 09-28 4, 09-29 38, 09-30 9, 10-01 32, 10-02 68, 10-06 10, 10-07 26, 10-08 79, 10-09 229, 10-10 125, 10-11 7. No commits 10-03 to 10-05.
- Line volume is dominated by content, not application code. Top paths by lines added: `infra/secplus` 111,277; `docs/accessibility` 99,611; `curriculum/v2` 85,408; `docs/curriculum` 83,528; `tests/fixtures` 47,109; `src/pages` 10,951.
- Has `CLAUDE.md` and `.claude/` with `commands/` (day-end, day-start), `hooks/` (no-em-dash), `rules/` (relay, tracker), `skills/` (3 vendored), `settings.json`, `settings.local.json`, `mods.json`, `worktrees/`. No `.mcp.json`.
- Deploys: Vercel project `elysiumintern`, production `https://elysiumintern.com`, updated 13 hours before the audit. Neon project `elysium-internship`, created 2026-01-14.
- Exposes its own MCP server at `https://elysiumintern.com/api/mcp`, registered at user scope in `~/.claude.json`.

### SecurITPosture

- Path: `C:\Users\aatir\securitposture_2026`, branch `main`, **31 dirty files** at audit time.
- Commits per day: 09-23 67, 09-24 35, 09-28 97, 09-29 17, 09-30 38, 10-01 134, 10-02 111, 10-04 21, 10-05 6, 10-06 33, 10-07 39, 10-08 5, 10-10 7, 10-11 6.
- The richest Claude setup on the machine. `.mcp.json` with one server (`aws`, stdio, `node scripts/aws-mcp.mjs`). `.claude/` holds `agents/` (security-review), `agents.local.json`, `commands/` (day-end, day-start), `hooks/` (7 files: aws-identity-check, aws-mcp-audit, aws-profile-guard, check, cron-guard, no-em-dash, no-hardcoded-color), `rules/` (data, security, tracker, ui), `skills/` (8 AWS skills), `mods-cost.json`, `mods-watch.json`, `worktrees/`.
- Hosts the owner's plugin source at `plugins/securitposture-mods`, registered as a directory marketplace. See AUDIT-TOOLING.
- Deploys: Vercel `securitposture`, updated 7 minutes before the audit. Neon `securitposture`, created 2026-09-04.
- **Migration nobody recorded:** `C:\Users\aatir\SecureITPosture` (remote `aatirs7/SecureITPosture`) last committed 2026-09-03, the day before Neon `securitposture` was created. Its `.mcp.json` is empty. `githubRepoPaths` also lists `ashkadri/securitposture_2026`. Three remotes, one product. Guess: the project moved to the `SecurITPosture-01` organization on or about 2026-09-03 and the old clone was never removed.

### Attestia

- Primary checkout: `C:\Users\aatir\truestate`, which is on a **detached HEAD** with 7 dirty files. Its local folder name, Vercel project `truestate`, Neon project `truestate` and a second board `aatirs7/truestate` are all leftovers of the earlier product name. The remote is `aatirs7/attestia`.
- Seven worktrees under `C:\Users\aatir\truestate-wt\`:

| Worktree | Branch | Last commit | Dirty |
|---|---|---|---|
| pilot-archive | wt/pilot-archive | 2026-10-04 | 1 |
| meridian-docs | wt/meridian-docs | 2026-10-02 | 0 |
| meridian-record | wt/meridian-record | 2026-09-24 | 0 |
| onboarding-checklist-setup | wt/onboarding-checklist-setup | 2026-09-24 | 0 |
| install-package-reshape-story | wt/install-package-reshape-story | 2026-09-20 | 0 |
| seo-sitemap-attestia | wt/seo-sitemap-attestia | 2026-09-18 | 0 |
| enterprise-first-reposition | wt/enterprise-first-reposition | 2026-09-18 | 0 |

  Five of seven have had no commit in 17 or more days.
- Commits per day: 09-22 19, 09-23 32, 09-24 58, 09-25 32, 09-26 25, 09-27 74, 09-28 93, 09-29 18, 09-30 2, 10-01 1, 10-02 27, then exactly 1 per day from 10-03 to 10-10.
- **The one-per-day commits are automated.** Every one is `chore(tracker): day end <date> (aatir)`, committed between 10:34 and 12:35. The last development commits are on 10-02, plus one session-rules commit `2af20b2` on 10-04 at 22:25. So Attestia development stopped on 2026-10-02 while the repo kept looking alive.
- `.claude/` holds `commands/` (day-end, day-start, handoff), `handoff/TEMPLATE.md`, `hooks/` (check, inbox, no-em-dash, no-hardcoded-color, session-guard), `rules/` (context-guard, relay, tracker), `sessions.json`, `mods.json`, `settings.json`, `settings.local.json`. No `.mcp.json`; the Attestia MCP server is a claude.ai connector.
- Deploys: Vercel `attestia` at `https://attestia.dev` and Vercel `truestate` at `https://truestate.space`, both updated 8 hours before the audit.

### Gulf

- Paths: `C:\Users\aatir\Gulf` (main, clean) and `C:\Users\aatir\Gulf-meridian` (branch `meridian/provenance`, clean). A second clone per session, the same pattern as Elysium Intern.
- 160 commits on two days: 10-04 45, 10-05 115. None since.
- `CLAUDE.md` and `.claude/mods.json` only. No hooks, commands, rules or `settings.json`. Configured for `Prime Gulf` and `Meridian Gulf`, relay at `docs/relay/from-prime.md`.
- Seeded by Attestia: Attestia commit `2af20b2` (2026-10-04 22:25) grants "a one time exception to message the Prime Gulf session, until 2026-10-07" to "hand over the extracted ledger core and the website starting point".
- Deploys: Vercel `gulf` and `gulf-site`, both updated 6 days before the audit.

## Side projects

Quick read only. Each line: commits in window, active days, last commit, and anything ElysiumProd should know.

| Repo | Path | Commits | Days | Last | Notes |
|---|---|---|---|---|---|
| phirmilingay | `C:\Users\aatir\phirmilingay` | 76 | 8 | 2026-10-11 | Busiest side project. One long session (23bae232, 9 days, 2 auto compactions). Duplicate stale clone at `Documents\phirmilingay`, last commit 2026-01-20. Vercel `www.phirmilengey.com`. |
| twitterbookmarksite | `C:\Users\aatir\twitterbookmarksite` | 20 | 1 | 2026-10-07 | Built in one 140 minute session. Vercel `xbookmarkvault.space`. |
| elysiumbuilds | `C:\Users\aatir\elysiumbuilds` | 8 | 6 | 2026-10-04 | One session (6f1446cd) running since 2026-07-21, 35 days of activity, 52 resumes. Has a claude.ai connector (`Elysium Builds`). |
| sharjeelcrm | `C:\Users\aatir\Documents\sharjeelcrm` | 6 | 5 | 2026-10-07 | One session since 2026-07-08, resumed 11 times. |
| winboard | `C:\Users\aatir\winboard` | 6 | 1 | 2026-10-10 | Created 2026-10-10 (Neon project the same day). |
| accshop | `C:\Users\aatir\accshop` | 5 | 3 | 2026-10-02 | Checked out on `agentpr38`, not main. Commits by an `Elysium Agent` identity and `github-actions[bot]`, so some work here is automated. |
| ElysiumVentures | `C:\Users\aatir\ElysiumVentures` | 4 | 1 | 2026-09-25 | Second, older clone at `Documents\Elysium Ventures LLC\ElysiumVentures` with 3 dirty files. |
| elysiumvault | `C:\Users\aatir\elysiumvault` | 0 | 0 | 2026-09-12 | Dormant as code, live as a service: its MCP server is registered at user scope and used for finances. |

Side project pattern: one session per repo, never a pair, often resumed for weeks. For ElysiumProd these want a single "solo" launch with no relay and no board, which is exactly the case section 8.3 should make cheapest.

## Appendix: dormant repositories

No commit since 2026-09-21. Last commit date in brackets. A dead repo is itself a finding: 42 of 55 remotes are dormant, and several still hold Neon databases.

- Over 30 days: fantasypremierleague (09-17), elysiumvault (09-12), Documents\vega (09-09, remote is `aatirs7/empty`), SecureITPosture (09-03), wanderpress (08-31), elysiumcyberv2 (08-31), ibmbrain (08-27), Durus (08-27), DurusIOS (08-27, 3 dirty), cobalt (08-27), clonelab (08-27), drift and its 6 sibling clones (08-24 to 08-25, each a separate full clone on its own feature branch), aatirsiddiqui (08-25), ILMYIOS (08-24, 5 dirty), bidclone (08-22), ILMY (08-20), cybercourse (08-18), elysiumse7en (08-16, remote `elysiumhome`), sehat (08-11, **38 dirty files**), trajectorycoaching (07-27), Peru-Bolivia-2026 (07-25), wc26 and wc26-general (07-20), systems10-1 (07-18), SiddiquiFamilyTree (07-16), travld (07-14), parrot (07-10), meridian (06-25), ilmy-promo (06-15, no remote, 12 dirty).
- Over 6 months: arkhamprotocol (04-06), shannon (02-11, third party), content-ops-starter (02-11, remote points at ElysiumCyber), elysium-welcome-video (01-27, no remote, 18 dirty), ElysiumCyber (01-21), Documents\phirmilingay (01-20), UltraSe7en (01-13), timer (01-12), projectarkhamv2 (2025-09-29), ElysiumVentures in Documents (2025-08-07), projectarkham (2025-06-06), Project-Arkham (2025-05-26), blackbird (2025-03-10, third party).
- No commits at all: fashionreps (19 dirty), Documents\se7en.
- `C:\Users\aatir\.claude\skills\onetake` is a third party skill installed as a git clone (feitangyuan/onetake, 6 upstream commits in window).

## Infrastructure inventory

- Vercel, team `aatir-siddiquis-projects`: 20 projects on the first page of `vercel project ls`, more on a second page. All main projects and most side projects deploy here.
- Neon: 30 projects in org `org-dark-poetry-53016155` and 2 in a Vercel linked org `org-empty-recipe-82878989`. `wanderpress` appears twice. Several belong to dormant repos (drift, durus, sehat, parrot, meridian, arkhamprotocol).
- Disk: `C:` is 475 GB with 14 GB free, 98 percent used, at audit time. The SecurITPosture relay on 2026-10-11 records Meridian's work held "until the reinstall (4.1 GB free, needs 5)".
