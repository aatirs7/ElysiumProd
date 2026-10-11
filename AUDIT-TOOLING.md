# AUDIT-TOOLING

Phase A, step 21.2. Configuration and metadata only. Secrets are recorded by path, never by value.

## 1. Config directories

| Directory | Created | Contents | Used |
|---|---|---|---|
| `C:\Users\aatir\.claude` | long standing | `settings.json`, `.credentials.json`, `history.jsonl` (9,032 lines, 2.6 MB), `projects/` (37 folders before this session), `plugins/`, `skills/`, `dev-mods/`, `file-history/`, `plans/`, `telemetry/` | Every session in the window |
| `C:\Users\aatir\.claude-account2` | 2026-09-21 19:55 | `settings.json`, `.credentials.json`, **its own `.claude.json`** (48 KB, 1 trusted project, has an `oauthAccount` key), `plugins/`, `skills/`, `sessions/` | **Never.** Every file carries the creation timestamp and there is no `projects/` folder |

Two facts the spec marked UNVERIFIED are answered by this directory:

- **`.claude.json` does live inside `CLAUDE_CONFIG_DIR`.** `.claude-account2\.claude.json` exists with its own `oauthAccount`, `userID` and project list. Spec section 11.3 and risk row 3 assumed it might not. Phase 0 step 2 should still confirm `%USERPROFILE%\.claude.json` is left untouched when the variable is set, but the per-directory file is now observed, not hypothetical.
- **The second account has been set up and abandoned.** One login on 2026-09-21, zero sessions since. Meanwhile `/login` was typed 9 times in `history.jsonl` and appears 10 times in transcripts during the window (see AUDIT-FRICTION). Guess: account switching is being done by re-logging in the main directory instead of by switching directories.

Secrets present, path only: `C:\Users\aatir\.claude\.credentials.json`, `C:\Users\aatir\.claude-account2\.credentials.json`. `securitposture_2026\.claude\agents.local.json` maps a session id to an AWS IAM user identity; not a credential but an account identifier, not reproduced. The SecurITPosture relay mentions a board App `.pem` in Downloads and an admin AWS default profile on the laptop; both are recorded there by the owner, not inspected here.

## 2. Settings, every non-default value

User scope, `~/.claude/settings.json`:

| Setting | Value | Effect |
|---|---|---|
| `model` | `opus` | Default model for every session |
| `effortLevel` | `medium`, with `claude-opus-5` high and `claude-opus-5-5` medium | Reasoning effort per model |
| `advisorModel` | `fable` | Advisor tool backed by Fable |
| `attribution.commit`, `attribution.pr`, `includeCoAuthoredBy` | empty, false | **No co-author trailer on any commit.** This is why commits cannot be attributed to Prime or Meridian from git alone |
| `enabledPlugins` | stripe, diagram-design | Two marketplace plugins on everywhere |
| `tui` | `fullscreen` | Full screen terminal UI |
| `voice` | enabled, hold mode | Push to talk dictation, consistent with the spoken style of prompts |
| `skipDangerousModePermissionPrompt`, `skipAutoPermissionPrompt` | true | No confirmation when launching with `--dangerously-skip-permissions` |
| `agentPushNotifEnabled` | true | Push notifications from agents already on |

No `statusLine` and no `hooks` at user scope. `.claude-account2\settings.json` sets only `theme` and `skipDangerousModePermissionPrompt`.

Project scope, per main repo `.claude/settings.json`:

| Repo | Hooks | Other |
|---|---|---|
| Attestia (`truestate`) | SessionStart: set `core.hooksPath`, `attestia.mjs day-start`, `watch-hint.mjs`. SessionEnd: `session-end.mjs`. PreToolUse: `attestia.mjs policy-tool`, `session-guard.mjs`. PostToolUse: no-em-dash, no-hardcoded-color, check (typecheck), `inbox.mjs --during`. Stop: `inbox.mjs` | `includeCoAuthoredBy: false` |
| SecurITPosture | SessionStart: `day-start.mjs`. SessionEnd: `day-end-capture.mjs`. PreToolUse: `aws-profile-guard.mjs`. PostToolUse: aws-identity-check, then no-em-dash, no-hardcoded-color, cron-guard, check-auth-guards, check-secrets, check, check-aws-mcp, then aws-mcp-audit | `enabledMcpjsonServers: [aws]`, plugin marketplace `securitposture` as a local directory |
| Elysium Intern | SessionStart: `day-start.mjs`. SessionEnd: `day-end-capture.mjs`. PostToolUse: no-em-dash | none |
| Gulf | none (no `settings.json`) | `mods.json` only |

Duplication across repos: `no-em-dash.mjs` exists in 3 repos, `no-hardcoded-color.mjs` in 2, `check.mjs` in 2, `day-start` and `day-end` commands in 3. Each is a copy, not a shared module.

## 3. MCP servers

| Server | Scope | Transport | Where defined | Owner wrote it | Terminal calls in window |
|---|---|---|---|---|---|
| elysiumvault | user | http, `https://elysiumvault.vercel.app/api/mcp`, with headers | `~/.claude.json` | yes | 0 |
| elysiumintern | user | http, `https://elysiumintern.com/api/mcp` | `~/.claude.json` | yes | 0 under this name; 11 via the `Elysium Intern` claude.ai connector |
| neon | local, ILMYIOS only | http, `mcp.neon.tech` | `~/.claude.json` | no | 0 |
| expo | local, drift only; project, DurusIOS | http / stdio | `~/.claude.json`, `DurusIOS/.mcp.json` | no | 0 |
| agent-device | project, DurusIOS | stdio | `DurusIOS/.mcp.json` | no | 0 |
| aws | project, SecurITPosture | stdio, `node scripts/aws-mcp.mjs` | `securitposture_2026/.mcp.json` | wrapper, yes | 0 by that name in transcripts |
| Attestia | claude.ai connector | remote | claude.ai account | yes | 4 (`list_boards`) |
| securITposture | claude.ai connector | remote | claude.ai account | yes | 0 |
| Elysium Intern | claude.ai connector | remote | claude.ai account | yes | 11 across 7 tools |
| Elysium Builds | claude.ai connector | remote | claude.ai account | yes | 2 |
| Claude in Chrome | extension | local | built in | no | **1,460** |

Tool call counts come from `tool_use` blocks in the 23 transcripts active in the window (`audit/scripts/sessions.py`).

What the owner's servers are for, from their tool descriptions in this session:

- **Attestia** (22 tools): board reads (phases, stories, tasks, day, blockers, hours), the auditor ledger (sessions, reviews, exceptions, chain, verify), relay, handoff, and writes (`post_note`, `create_task`, `answer_decision`, `ask`).
- **securITposture** (21 tools): read only repo access (head, log, read, search, tree), board reads and writes, `relay_read`, specs, status, tracker.
- **Elysium Intern**: roster, needs attention, provisioning, messages, AWS costs, relay, notes.

Reading: these servers are built for the **claude.ai planning chat**, not for terminal sessions. Terminal sessions reach the same state through files in the repo (`tracker/relay/*.md`) and through the `gh` CLI. That split is deliberate and working. It means ElysiumProd's relay pane should read the relay file or the same live endpoint `get_relay` uses, not go through MCP from the main process.

Dead weight: `neon` and `expo` local entries attach to dormant repos (ILMYIOS last commit 2026-08-24, drift 2026-08-25). `elysiumvault` at user scope loads into every session and was called zero times from the terminal in 21 days.

## 4. The plugin: securitposture-mods

Source: `C:\Users\aatir\securitposture_2026\plugins\securitposture-mods`, about 2,250 lines of TypeScript across `hooks/register.ts` and `hooks/lib/` (compact, config, cost, name, peers, ram, relay, text, thresholds, watch, watchintent), with tests. Author field: Vesta Cyber Solutions.

Loading: two ways at once.

- Installed copy 0.3.0 under `~/.claude/plugins/cache/securitposture/`, from a directory marketplace pointing at the repo.
- Live source via `--plugin-dir` in the `cs` launcher (section 6), which picks up every commit without reinstalling. The latest plugin commits are 0.3.6 to 0.3.9 (`7fa5c7e` to `6ecc86d`), so the cached 0.3.0 is six versions behind. `mods-switch` in `cs.ps1` exists to uninstall the stale copies so the plugin is not loaded twice.

Events bound: SessionStart, SessionEnd, Stop, Notification, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, PostCompact.

What it does, from `plugin.json` options and module exports:

- **Session badge**: name and colour per session, read from `SP_SESSION_NAME`, configured as `Name:color` pairs per repo in `.claude/mods.json`.
- **Compaction guard**: warns at 75 percent context, asks the session to "park" at 85 percent (write a resume note to `.claude/resume/<name>.md` or `docs/resume/`), then compacts and resumes from the note automatically. Refuses to compact while a turn is running, a draft is in the prompt, or a heavy job lock is held, and backs off 10 minutes (`lib/compact.ts`).
- **Relay line**: reads the relay from a GitHub issue or a file on the default branch and shows what is waiting on the owner above the prompt; `/relay` card and `/wyd`.
- **Peers line**: shows whether the other session is busy, idle, up or offline, and whether a message passed between them in the last 30 minutes, **from the CLI's own `ListAgents` output** (`lib/peers.ts`, written 2026-10-02, the same day the Attestia relay began reporting Meridian down).
- **Chat watcher**: tracks the background board watcher (a `Monitor` or background Bash with a 30 minute or 2 hour timeout) and asks to restart it when it stops.
- **`/ram`**: memory use per process with a stop button for what is safe to stop (0.3.7).
- **Cost meter**: AWS and Bedrock month to date, one Cost Explorer call a day, SecurITPosture only.

Still invoked: yes. 105 user turns across the main sessions in the window carry `origin.kind = plugin, name = securitposture-mods`, which is the plugin's auto compact and resume prompts.

Consequence for ElysiumProd: the plugin already implements, inside the CLI, the context meter, the compaction checkpoint, the relay "waiting on you" line, peer liveness and a RAM view. Spec sections 8.1, 9 and 10.5 to 10.6 re-specify all of these from scratch. See AUDIT-SUMMARY finding 2.

## 5. Inter session messaging and guards

- Prime and Meridian talk through `SendMessage` between local sessions. In the transcripts this arrives as user turns with `origin.kind = task-notification, producer = session-task` (Meridian Posture 77, Meridian Intern 44, Prime Intern 164).
- `truestate/.claude/hooks/session-guard.mjs` (PreToolUse on SendMessage) refuses any recipient not listed in `.claude/sessions.json`, per the owner's ruling of 2026-09-22. `sessions.json` supports dated exceptions; one was used for Prime Gulf until 2026-10-07.
- `inbox.mjs` surfaces planning chat notes and `needs:owner` answers at the end of each turn and, throttled to every two minutes, mid turn.
- The 2026-09-28 SessionEnd incident (`truestate/scripts/session-end.mjs` header): two SessionEnd hooks ran in parallel, both wrote the git index, one was killed and left an `index.lock` that **blocked every commit in the checkout for four hours**. Fixed by serialising them into one script.

## 6. The existing launcher: cs.ps1

`C:\Users\aatir\cs.ps1`, last modified 2026-10-06. A PowerShell function, `cs <name>`, that maps eight session titles to a folder and a plugin name:

| Title | Folder | `SP_SESSION_NAME` |
|---|---|---|
| Prime Posture, Meridian Posture | `securitposture_2026` | Prime, Meridian |
| Prime Attestia, Meridian Attestia | `truestate` | same as title |
| Prime Intern, Meridian Intern | `Documents\Elysium Ventures LLC\elysiumintern` | same as title |
| Prime Gulf, Meridian Gulf | `Gulf` | same as title |

It runs `claude --resume <title> --dangerously-skip-permissions --plugin-dir <mods>`, adding `--model claude-opus-5-5 --advisor claude-fable-5-1` for the Posture pair only, or `-n <title>` with `-New`. No account selection, no `CLAUDE_CONFIG_DIR`.

This is ElysiumProd's session template table, already written by hand. Spec section 7's `SessionTemplate` should be seeded from it.

## 7. Skills, commands, output styles, status line

- User skills in `~/.claude/skills`: 14 folders, most vendored from public sources; `onetake` is a git clone of a third party repo.
- Skill use, from `skillUsage` in `~/.claude.json` (all time): frontend-design 19, artifact-design 12, claude-api 10, browser-use 5, day-end 3, vercel-react-best-practices 3, others 1 or 2. In window transcripts: 19 Skill calls total. Skills are a minor part of the workflow.
- Custom slash commands: `day-start` and `day-end` in all three main repos, `handoff` in Attestia. The plugin adds `/relay`, `/wyd`, `/ram`, `/watch`, `/session-name`.
- Repo agents: `securitposture_2026/.claude/agents/security-review.md`.
- Output styles: none found.
- Status line: none configured in any settings file. The plugin draws its own line above the prompt instead.
