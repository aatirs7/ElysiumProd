# ElysiumProd

Personal multi-agent development harness. Replaces the "several VS Code windows, each with a terminal running Claude Code" workflow with a single customizable cockpit that launches a whole project with one click and tells you, at a glance, what every agent is doing and how close it is to running out of room.

Repository and project name: ElysiumProd. The identifier `elysiumprod` is used for the package name, the install directory and the data path.

Status: specification, v3. Revised by the Phase A audit of 2026-10-11 (`AUDIT-SUMMARY.md`). Nothing is built yet.

---

## 1. Problem statement

Current workflow:

1. Open a VS Code window per project.
2. Open or clone the repo.
3. Open one or two integrated terminals.
4. Run Claude Code in each, pick resume or fresh, wait.
5. Plan in the claude.ai web UI in a browser.
6. Bridge the two with a per-project MCP connector exposing a relay and a task queue.

Every one of those steps is manual, repeated per project, every day.

## 2. Evidence from the current workflow

Rewritten from the Phase A audit, which ran on the machine with every clone, config directory and transcript present. Version 2 of this section was a remote first pass from the Attestia board ledger. The local record overturned most of it. Sources and method are in `AUDIT-*.md`. Finding numbers below refer to `AUDIT-SUMMARY.md`.

### 2.1 What was audited

- 73 git checkouts, reducing to 55 remotes.
- Both Claude Code config directories, all MCP definitions, the owner's plugin, and every project's hooks and settings.
- 39 session transcripts, 337,412 lines, with 100 percent parse coverage.
- Prompt history, PowerShell history and VS Code workspaces.
- The Attestia and SecurITPosture boards and relays.
- Read only outside this repository throughout.

### 2.2 How the owner actually works

- **Four main projects run a Prime and Meridian pair:** Elysium Intern, SecurITPosture, Attestia and Gulf. Side projects run one session each.
- **Concurrency is normal.** More than one session is active in 72 percent of working time, and more than one project in 41 percent. The peak is 14:00 to 18:00 Eastern.
- **Sessions are resumed for days to weeks, not started per task.** The median session spans 7 active days, with 3 to 8 compactions over its life.
- **Meridian does real work.** It made 53 and 57 percent of commit calls in Attestia and SecurITPosture, and 28 to 30 percent in the other two. The owner rarely types to it: 0 to 8 turns in three of the four projects. Prime drives it by message. (Finding 1)
- **The in-CLI cockpit already exists.** The owner's `securitposture-mods` plugin shows context use, parks, compacts and resumes at 85 percent, shows the relay's waiting line and peer liveness, and has `/ram`. (Finding 2)
- **The launcher already exists.** `cs.ps1` maps eight session titles to folders and flags. (Finding 3)

### 2.3 Verdict on Prime and Meridian

**Overturned by the Phase A audit. Confirmed by the owner on 2026-10-11.**

Version 2 of this section said, provisionally:

> "So: **default to one session per project, with the second as an on-demand pane.** Meridian becomes a template with `autoStart: false` that Prime's relay can request, ElysiumProd surfaces as an alert, and one keystroke starts. That turns a nine-day blocker into a notification."

It rested on three claims. Each was wrong:

| v2 claim | What the local record shows | Source |
|---|---|---|
| "On six of the eight active days, one session did effectively all the work" | Both Attestia sessions were active together in 74 percent of the pair's working windows. Meridian made 194 commit calls to Prime's 172. The board ledger v2 read records hook start and end times, which show 0 minutes on days a session worked for hours. | AUDIT-WORKFLOW, Finding 1 |
| "Meridian idles for days, and its idleness silently blocks Prime." | Meridian made 53 percent of commit calls in Attestia and 57 percent in SecurITPosture, and 28 to 30 percent in Elysium Intern and Gulf. When it stops, the cause is low memory, low disk, or a broken name match, not idleness. | AUDIT-WORKFLOW; AUDIT-SUMMARY F1, F6 |
| "That is nine days blocked, and the blocking action is launching a terminal." | Prime renamed itself on 2026-10-02 and lost the match with Meridian. The pair was cut for about 36 hours, until Meridian was renamed on 10-04. For the remaining seven days the relay was simply never corrected. | AUDIT-WORKFLOW, Finding 2 |

Why v2 got it wrong: it was written from the board ledger and the relay text alone, without access to the transcripts or git. Both of those sources record what a hook or an agent last wrote, not what was running.

**The verdict now:** Prime and Meridian launch together for the main projects. Side projects launch a single session.

What ElysiumProd changes is the four things around the pair that actually failed (2.4):

- stable identity, in 7 and 8.3.2;
- machine maintained liveness, in 11.6;
- the resource gate, in 10.6;
- the attention strip, in 8.1.

### 2.4 What actually goes wrong

1. **Identity by string.** A rename on 2026-10-02 cut the Attestia pair's link for about 36 hours. The guard, the plugin, `cs.ps1` and the relay all match session titles as text. (Finding 4)
2. **Liveness reported by hand.** The Attestia relay has said "Meridian is not running" for nine days, seven of them after it stopped being true. Issues 19 and 20 were routed a day late. (Finding 7)
3. **The machine stops Meridian.** One Meridian was stopped by low memory and another is held by low disk. `C:` is 98 percent full. (Finding 6)
4. **Prompts wait unseen.** A Meridian waits for a yes in its own pane. SecurITPosture has 23 decisions waiting on people. (Finding 7)
5. **Watchers time out.** Board watchers run inside Prime with 30 minute and 2 hour timeouts. (Finding 9)
6. **Hooks race.** Two SessionEnd hooks left a git index lock that blocked Attestia commits for four hours on 2026-09-28. (Finding 10)

The board ledger figures that version 2 relied on are hook span timings. They show 0 minutes on days a session worked for hours, and 900-plus minutes for windows left open. Do not use them as activity. (Finding 5)

## 3. Goals

- One click takes a project from cold to fully running: repo fetched, every session spawned on the right account in the right directory, layout restored, relay loaded.
- Run several projects concurrently in one window.
- Bind each session to a specific Claude account and switch without losing the project.
- Show live context consumption and distance to auto-compact per session.
- Show which sessions and which projects need the owner, in one list, on the home screen.
- Push notifications to phone so long runs do not need babysitting.
- Clone and register a repo from inside the app.
- Route a single task to a different model or provider without leaving the app.
- Session identity that survives a rename: one stable id per template, and the title, plugin name and peer list are derived from it.
- Be the machine's source of truth for which sessions are alive, so no relay or note has to say so by hand.
- Keep the Surface from running out of memory or disk under a full set of sessions.
- Keep each project's board watcher running without occupying a session.
- Work with the owner's existing `securitposture-mods` plugin and `cs.ps1` launcher, importing from them rather than replacing them.
- Installable on the laptop like any other program.
- Modifiable by its owner in an evening: plain config files, small modules, no framework ceremony.

## 4. Non-goals

- Not a code editor. VS Code stays open for editing. ElysiumProd owns orchestration.
- Not multi-user, not commercial, no auth layer, no telemetry leaving the machine.
- Not a Claude Code reimplementation. It drives the real CLI as a child process, unwrapped, so every slash command and skill works normally.
- Not a second in-terminal status line. The `securitposture-mods` plugin owns the line above the prompt, the compaction guard and `/ram` inside each session. ElysiumProd shows the cross session and whole machine view.
- Not a home for shared hooks and slash commands. The copies of `no-em-dash`, `day-start` and `day-end` across repos belong in the plugin.
- No authentication provider of any kind. Clerk and similar are out.
- No cloud component. Only outbound traffic is the phone notification webhook and any declared HTTP provider.

## 5. Target environment

- Windows 11 on ARM64 (Surface Pro). Primary and only supported target.
- Node 20 LTS or newer, Claude Code CLI and Git on PATH.
- PowerShell 7 as the default spawned shell, configurable per project.
- Resource constrained in practice. At audit time `C:` was 98 percent full with 14 GB free, and a Meridian had been stopped for low memory. Treat disk and RAM as first class limits from Phase 1.

ARM64 is the single biggest build risk. See section 17.

## 6. Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron | node-pty has maintained win32-arm64 prebuilds against Electron ABI. Tauri means a Rust PTY layer and a second language for no gain. |
| Renderer | React 19 + Vite | Existing muscle memory, instant HMR. |
| Terminal | xterm.js with fit, webgl, search, serialize addons | What VS Code uses. WebGL matters once six panes are live. |
| PTY | node-pty | Only real option on Windows, via ConPTY. |
| Styling | Tailwind + shadcn/ui | Existing stack. |
| Layout | Dockview | Tabs, floating groups, serializable layout state. |
| Store | SQLite via better-sqlite3 | Synchronous, no server, trivial backup. |
| Renderer state | Zustand | Light. |
| Charts | Recharts | For the home dashboard sparklines only. |
| IPC | contextBridge with a typed channel allowlist | No nodeIntegration in the renderer. |
| Packaging | electron-builder, NSIS target, win-arm64 | Section 16. |

Hard UI rules carried from every other project:

- No em dashes in code, copy, or comments.
- No pure white (#FFFFFF) or pure black (#000000). Base dark surface #0E1116, base light #F7F8FA.
- Center alignment by default for titles, headers, card contents, buttons. Terminal content is the explicit exception.
- Avoid dense data tables. Prefer cards and lists.

## 7. Domain model

```
Workspace
 ├─ Account        a Claude login mapped to an isolated config dir
 ├─ Provider       a non-Claude routing target
 ├─ Project        a local repo and its settings
 │   ├─ BootProfile   a named set of sessions and panes to launch together
 │   ├─ Session       a live PTY bound to one account
 │   ├─ Telemetry     live per-session metrics from the side channel
 │   └─ Relay         cached relay state, read from the relay file or issue
 ├─ Layout         serialized Dockview state per project
 └─ Rule           event to action mapping
```

```ts
interface Account {
  id: string;                    // "main", "account2"
  label: string;
  color: string;                 // pane accent, never pure white or black
  configDir: string;             // absolute; the real ones are C:\Users\aatir\.claude and C:\Users\aatir\.claude-account2
  kind: "claude-max" | "api-key";
  state: "ok" | "rate-limited" | "needs-login" | "unknown";
  fiveHourRemaining: number | null;   // from statusline rate_limits
  sevenDayRemaining: number | null;
  resetAt: string | null;
}

interface Project {
  id: string;
  name: string;
  path: string;
  remote: string | null;
  defaultAccountId: string;
  failoverAccountId: string | null;
  shell: string;
  env: Record<string, string>;
  relay: RelaySource | null;     // imported from .claude/mods.json
  waitingHeading: string | null; // "Blocked on the owner", "Waiting on Aatir"; from mods.json
  watcher: WatcherSpec | null;   // section 13.1; from mods.json watchStart
  tier: "main" | "side";         // main defaults to the full profile, side to solo
  bootProfiles: BootProfile[];
  defaultProfileId: string;
  color: string;
}

interface BootProfile {
  id: string;
  label: string;                 // "full", "solo", "review"
  templates: SessionTemplate[];
  panes: ("relay" | "git" | "notes" | "router")[];
  postLaunch: string[];          // shell commands run once after spawn
}

interface RelaySource {
  repo: string;                  // "aatirs7/attestia"
  file: string | null;           // "tracker/relay/from-prime.md"
  issue: string | null;          // "105" for SecurITPosture
}

interface WatcherSpec {
  command: string;               // e.g. "node scripts/board-watch.mjs"
  deliverTo: string;             // template id that receives its output, normally Prime
}

interface SessionTemplate {
  id: string;                    // stable, ElysiumProd owned, never shown or retyped: "attestia.prime"
  role: "prime" | "meridian" | "solo";
  title: string;                 // derived, passed with -n / --resume: "Prime Attestia"
  pluginName: string;            // SP_SESSION_NAME for securitposture-mods: "Prime Attestia", or "Prime" for Posture
  command: string;               // "claude"
  args: string[];                // extra flags only; the fields below are rendered into flags
  model: string | null;          // "claude-opus-5-5"
  advisor: string | null;        // "claude-fable-5-1"
  effort: string | null;
  pluginDir: string | null;      // C:\Users\aatir\securitposture_2026\plugins\securitposture-mods
  skipPermissions: boolean;      // every imported template is true, matching cs.ps1
  resume: "by-title" | "fresh";  // cs.ps1 resumes by title unless -New
  accountId: string | null;      // null means project default
  autoStart: boolean;
  cwd: string | null;            // a worktree or second clone, e.g. Gulf-meridian
}

interface SessionTelemetry {
  sessionId: string;
  claudeSessionId: string | null;
  model: string | null;
  contextWindowSize: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  usedPercentage: number | null;       // input side only, see 10.2
  remainingPercentage: number | null;
  tokensToCompact: number | null;      // computed, see 10.5
  costUsd: number | null;
  linesAdded: number | null;
  linesRemoved: number | null;
  compactionCount: number;
  lastCompactionAt: string | null;
  rssBytes: number | null;
  updatedAt: string;
}
```

## 8. Home: the launcher and dashboard

Home is the first tab in the left rail and the default view on app start. It is the screen that replaces "open VS Code, open terminal, run claude, pick resume."

### 8.1 Attention strip

Pinned at the top, full width, centered. The single most valuable widget in the app, given section 2.4 items 2 to 4. It lists everything currently waiting on the owner, across all projects, newest first:

- Sessions in `awaiting-input`, from the `Notification` hook. This is the case of a Meridian waiting for a yes in its own pane.
- Relay items under the project's own `waitingHeading`, which differs per repo: "Blocked on the owner", "Waiting on Aatir".
- GitHub issues labelled `needs:owner`, and board decisions over a configurable age.
- Sessions within a configurable margin of auto-compact
- Accounts rate limited, with reset countdown
- Projects whose boot profile expects a session that is not running
- A peer link down: a pair where both sessions run but no message has passed for a configurable time, or where a template's title no longer matches its peers.
- Free disk or RAM under the warning floor, naming the sessions it suggests stopping.
- A board watcher that has exited and not restarted.

Each row has a one-click action: focus the pane, start the missing session, open the issue. When the strip is empty it collapses to a single centered line saying nothing needs you, rather than taking up space.

Had this existed on 2026-10-02, the rename that cut the Attestia pair for 36 hours would have shown as a peer link down within minutes.

### 8.2 Project cards

A responsive grid, centered content in each card:

- Project name in its color, with a status dot
- Last activity, relative ("3 hours ago", "12 days ago"), from agent activity and development commits. Automated commits such as the daily `chore(tracker): day end` do not count, so a paused project reads as paused. Attestia's repo committed every day from 10-03 to 10-10 while no development happened.
- Session row: one chip per template, green running, grey stopped, amber awaiting input, red error
- Git line: branch, ahead/behind, dirty file count
- Relay line: counts for open, blocked, waiting on owner
- Context pressure bar for the hottest running session
- A primary **Launch** button, plus a small profile selector

### 8.3 Launch

One click, idempotent:

1. Verify the repo path exists. If missing but a remote is recorded, offer to clone.
2. `git fetch` in the background, do not block on it.
3. Check free RAM and disk against the floors in 10.6. Below the floor, start Prime only and raise an attention row for the rest.
4. Spawn every template in the chosen profile, each with its account's `CLAUDE_CONFIG_DIR`, scrubbed env, correct cwd, `SP_SESSION_NAME` set to the template's `pluginName`, and flags rendered from the template: `--resume <title>` or `-n <title>`, `--model`, `--advisor`, `--plugin-dir`, `--dangerously-skip-permissions`. This is exactly what `cs.ps1` does today, per template instead of per hardcoded map.
5. Start the project's board watcher if it is not running (13.1).
6. Open the profile's non-terminal panes.
7. Restore the saved Dockview layout for the project.
8. Run `postLaunch` commands.
9. Focus the first terminal pane.

Clicking Launch on an already-running project just switches to it. Launching a profile when some of its sessions are already up starts only the missing ones.

Three stock profiles, editable per project:

- **full**: Prime, Meridian, relay, git, notes. The default for `tier: main` projects, per section 2.3.
- **solo**: one session, git. The default for `tier: side` projects. A relay pane only if the project has a relay.
- **review**: no PTY at all, just the router pane. For when the task is a single headless query.

### 8.3.1 First run import

The first launch of ElysiumProd builds its projects from what is already on the machine, with a review screen before anything is saved:

1. Parse `C:\Users\aatir\cs.ps1`: the `$map` of titles to folders and plugin names, the `--plugin-dir` value, and the per title model and advisor flags. Each pair becomes a `tier: main` project with Prime and Meridian templates.
2. Read each project's `.claude/mods.json` for the relay source, `waitingHeading`, session colours and the watcher command, and `.claude/sessions.json` for the peer list.
3. Detect a second checkout of the same remote, such as `Gulf-meridian` or `elysiumintern-v4`, and offer it as the Meridian template's `cwd`.
4. Offer every other repo with Claude activity in the last 30 days as a `tier: side` project with a solo profile.
5. Register `C:\Users\aatir\.claude` as the account. Register `C:\Users\aatir\.claude-account2` as a second account only if Phase 0 step 2 passed.

Import is read only against those files. Writing back is section 8.3.2.

### 8.3.2 Session identity

The template `id` is the identity. The title is a derived label. When a title or a peer list changes in ElysiumProd, it writes the change to every place that matches by string, in one action, after showing the diff:

- the template;
- the project's `.claude/sessions.json` peer list;
- the `sessions` option in `.claude/mods.json`;
- the running CLI session, through `/rename` sent to the PTY, if it is running.

It never edits `cs.ps1`; once ElysiumProd launches the sessions, `cs` is a fallback. A mismatch between a running session's title and its peers' lists raises the "peer link down" attention row. This is the failure of 2026-10-02.

`Ctrl+Shift+1..9` launches project N on its default profile from anywhere in the app.

### 8.4 Stats

A strip above the project grid, and a wider panel below it.

Live counters: sessions running, sessions awaiting input, accounts healthy, machine CPU, RAM and free disk.

Today: active agent minutes, commits, lines added and removed, spend in USD, compactions. All of these come free from the telemetry channel in section 10, which means they are real figures rather than estimates.

Trends, a 14-day sparkline row: active minutes per day, commits per day, spend per day, compactions per day. Keep it to four sparklines. This is a cockpit, not an analytics product.

Per-project breakdown is a list of cards, not a table, per the alignment rules.

## 9. Project view

Dockview container per project. Panes dock, resize, float, and the layout serializes to SQLite so it is identical next launch.

**Terminal pane.** xterm instance. Header, centered: template label, account chip in the account color, status dot, and a compact context meter. Right-aligned: restart, switch account, close. Pane border takes the account color at 2px so a glance tells you which account you are on.

**Relay pane.** Reads the project's relay source from `mods.json`: a file on the default branch for Attestia, Elysium Intern and Gulf, a GitHub issue for SecurITPosture. It reads through `gh` and the system credential manager, polling every 60s with manual refresh. It does not go through MCP: the owner's board servers serve the claude.ai planning chat, and terminal side tools already read the relay file directly. Four centered cards: shipped, open, blocked, and the project's `waitingHeading`. Beside the relay's own text it shows the relay's age and a "liveness from ElysiumProd" line from 11.6, so a hand written "not running" that has gone stale is visibly contradicted. Read only in v1; see open question 3.

**Git pane.** Branch, ahead/behind, dirty count, last three commits, fetch and pull buttons. Also lists every worktree and sibling clone of the same remote with branch, last commit date and dirty count, read only. At audit time 5 of the 7 Attestia worktrees were 17 or more days stale, and the primary Attestia checkout was on a detached HEAD. Not a git client.

**Notes pane.** Per-project markdown scratch, saved to SQLite. Where a plan pasted from the web UI lands before being fed to a session.

**Router pane.** Section 12.

**Context pane.** Optional. Expanded telemetry for the focused session: the context bar broken into input, cache read, cache write, output; compaction history; cost; tokens per minute; model.

### 9.1 Keyboard

| Binding | Action |
|---|---|
| `Ctrl+K` | Command palette |
| `Ctrl+1..9` | Jump to project N |
| `Ctrl+Shift+1..9` | Launch project N default profile |
| `Alt+1..9` | Focus pane N |
| `Ctrl+Shift+T` | New session from template |
| `Ctrl+Shift+A` | Switch account on focused session |
| `Ctrl+Shift+R` | Restart focused session |
| `Ctrl+Shift+F` | Search focused scrollback |
| `Ctrl+\` | Split focused pane |
| `Ctrl+0` | Home |

Everything else passes straight through to the PTY. Slash commands, skills, `/handoff`, all work because the PTY is real and unwrapped. Hard requirement, and the reason not to build a chat UI over the CLI.

## 10. Telemetry

A PTY yields bytes, not structure. Guessing session state from output regexes is brittle and breaks whenever CLI wording changes. Claude Code exposes three real structured channels, and ElysiumProd uses all three. Regex scraping is reduced to a last-resort fallback.

All three feed one local ingest server in the main process: bound to `127.0.0.1`, random port per launch, and every child gets a per-session shared secret in its env that it echoes back, so nothing else on the machine can post fake telemetry.

### 10.1 Status line shim (primary, live)

Claude Code supports a custom `statusLine` command. It runs a script and passes JSON on stdin. ElysiumProd writes a tiny shim script into each account's config directory; the shim POSTs the JSON to the ingest and prints a minimal line back to the terminal.

No settings scope on the machine sets `statusLine` today, so the shim takes nothing away. The `securitposture-mods` plugin draws its own line above the prompt and already shows the session badge and context use. The shim therefore prints an empty line by default, so the owner does not see context twice, with a config switch to print a short line in sessions that do not load the plugin.

Documented fields this delivers:

- `session_id`, `session_name`, `model.display_name`, `cwd`, `workspace.*`, `workspace.repo.{host,owner,name}`
- `cost.total_cost_usd`, `cost.total_duration_ms`, `cost.total_api_duration_ms`, `cost.total_lines_added`, `cost.total_lines_removed`
- `context_window.total_input_tokens`, `total_output_tokens`, `context_window_size` (200000, or 1000000 on extended context), `used_percentage`, `remaining_percentage`, `current_usage`
- `exceeds_200k_tokens`
- `rate_limits.five_hour`, `rate_limits.seven_day`, `rate_limits.spend_limit` (subscriber only, populated after the first response)

This one channel supplies live context percentage, model, cost, and, crucially, **real rate limit state**. That replaces pattern-matching output for rate limits, which was the weakest part of the earlier design, and it makes account failover trustworthy rather than a guess.

Invocation is event driven, debounced 300ms, with an optional `refreshInterval` of at least 1s. Set `refreshInterval` to 5s so an idle session still reports.

Caveats to honor in the UI:

- `used_percentage` counts the input side only: input plus cache creation plus cache read. Output is excluded. Do not label it "context used" without qualification.
- `current_usage` is null before the first API call and after a `/compact`. Handle nulls rather than rendering zero.
- Figures come from the most recent API response, so the bar lags the live conversation by up to one turn. Say so in the tooltip.

### 10.2 Hooks (events)

ElysiumProd writes hook definitions into each account's config directory. Each hook POSTs its stdin JSON to the ingest and exits zero.

Rules learned from the existing setup:

- The main repos already run their own hooks on the same events: SessionStart and SessionEnd scripts that write git, 1 to 9 PostToolUse checks, a PreToolUse session guard and a Stop inbox. ElysiumProd's hooks run beside them. Phase 0 must confirm that user scope hooks in the account directory add to project hooks rather than replace them.
- **ElysiumProd hooks never touch git or the repo, and never block.** Claude Code runs an event's hooks in parallel. On 2026-09-28 two parallel SessionEnd hooks raced on the git index and blocked Attestia commits for four hours. ElysiumProd's hook is one POST with a 2 second timeout, then exit 0.
- Expect hook events from the plugin's own activity. A `PreCompact` with trigger `manual` is usually the plugin's automatic park and compact, not the owner. Label manual compactions "manual or plugin" unless Phase 0 finds a hook or OTel field that tells them apart. Do not read transcripts to decide (10.4).

Hooks subscribed in v1: `SessionStart`, `SessionEnd`, `Stop`, `Notification`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`.

Common stdin fields on every event: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `permission_mode`, `hook_event_name`.

What this buys:

- `Notification` gives real `awaiting-input` instead of a prompt-shape regex.
- `Stop` gives real turn completion, which is the signal to fire a phone push.
- `PreCompact` and `PostCompact` carry a `trigger` matcher of `manual` or `auto`, so compactions are observed, counted and charted rather than inferred.
- `SessionStart` with source `resume` or `fork` carries `context_tokens`, `seconds_since_last_response`, `prompt_cache_likely_expired` and `estimated_cache_write_usd`. That is a useful immediate context reading plus a cache-cost warning on resume.
- `PreModelSwitch` and `PostModelSwitch` carry `from_model` and `to_model`.

Note: `model` is not a common hook field. It appears only on `SessionStart`, and not always. Take model from the status line instead.

UNVERIFIED: the exact stdin schemas for `PreCompact`, `Stop`, `SessionEnd` and `Notification` were not fully confirmed. Confirm in Phase 0 by logging raw stdin for each before building UI on specific fields.

### 10.3 OpenTelemetry (totals and history)

Per child process env:

```
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<ingest port>
OTEL_METRIC_EXPORT_INTERVAL=15000
```

ElysiumProd runs a minimal OTLP over HTTP receiver on the ingest port.

Metrics: `claude_code.session.count` (with `start_type` of fresh, resume, continue), `claude_code.token.usage` (type input, output, cacheRead, cacheCreation), `claude_code.cost.usage`, `claude_code.lines_of_code.count`, `claude_code.commit.count`, `claude_code.pull_request.count`, `claude_code.code_edit_tool.decision`, `claude_code.active_time.total`.

Events: `api_request` (token counts and cost), `api_error`, `compaction` (trigger, success, duration, pre and post tokens), `tool_decision`, `subagent_completed`, `permission_mode_changed`, `mcp_server_connection`, `skill_activated`, hook execution events.

Every metric carries `session.id`, so all of it attributes to the right pane and the right project. This is the source for the Today and Trends panels in 8.4, and the honest answer to "how much did I actually do this week."

Two rules:

- Leave content capture off. Do not set the `OTEL_LOG_*` content gates. Prompts, responses and tool parameters would otherwise land on disk.
- Project settings files cannot set OTel variables; they must be process environment. That suits this design, since ElysiumProd controls the child env anyway.

### 10.4 What not to do

Do not parse `~/.claude/projects/<slug>/<session-id>.jsonl`. The format is documented as internal to Claude Code and liable to change on any release, and `transcript_path` is written asynchronously so it lags the live conversation. Use it only as a diagnostic of last resort, never as a data source the UI depends on.

Do not depend on `/context`. It is interactive only, with no machine-readable output.

### 10.5 Distance to compaction

Compaction behavior, documented:

- By default a session compacts at the model's context limit.
- Sonnet 4.6 and Opus 4.6 without extended context compact at 200K.
- Native 1M-window models compact at roughly 967K. `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` pulls that back to 200K.
- The window is tunable: `CLAUDE_CODE_AUTO_COMPACT_WINDOW` (a plain token count, takes precedence), the `/autocompact` command, the `--autocompact` flag, and `autoCompactWindow` in settings. Accepted values run 100K to 1M, and bare numbers 100 to 1000 are read as thousands.

ElysiumProd computes:

```
effectiveWindow = project.autoCompactWindow ?? documentedDefaultFor(model)
tokensToCompact = effectiveWindow - context_window.total_input_tokens
```

Displayed as a bar plus a token figure, always labelled an estimate, with the one-turn lag noted.

**Thresholds come from the plugin, not from ElysiumProd.** The `securitposture-mods` plugin warns at `warnPercent`, default 75, and parks, compacts and resumes at `parkPercent`, default 85. ElysiumProd reads those options and colours the bar to match: calm below warn, amber from warn, red from park. One source, so the pane header and the line above the prompt never disagree.

**ElysiumProd never triggers a compaction.** The plugin already does that safely: it refuses during a running turn, with a prompt draft, or while a heavy job lock is held, and it writes a resume note first. ElysiumProd's job is the cross session view: which of the eight paired sessions is closest to park, compaction counts per day, and a phone push on crossing amber only when the owner is away from the machine.

Expect frequent compactions on Meridian at low owner turn counts. Meridian sessions compacted after 0 to 7 prompt turns, because peer messages fill their context. Chart compactions per session against time, not against turns.

Correction to v2: version 2 said sessions "compacted repeatedly and silently" with "no indicator". The audit found the plugin's meter in every main session from 2026-10-02, and 14 of the 16 manual compactions in the window fall on or after that date.

### 10.6 Machine resources

Promoted by the audit: memory and disk are what actually stop Meridian on this machine (section 2.4 item 3). Built in Phase 1, not Phase 4.

Per session: resident set size of the PTY process tree, sampled every 5s, including the subagents, renders and dev servers the session started.
System: CPU percentage and RAM used against total, sampled every 2s; free disk on the system drive and on the drive holding `%APPDATA%\elysiumprod`, sampled every 60s. All shown in the bottom bar and on Home.

Floors, editable in `config.jsonc`:

| Signal | Warn | Refuse new sessions |
|---|---|---|
| RAM used | 85 percent | 92 percent |
| Free disk | 20 GB | 8 GB |

At audit time free disk was 14 GB, which is below the warn floor. That is intended: the first launch should say so.

On a warning, the attention strip names what to stop, in this order: idle Meridians, idle side project sessions, then the largest process trees. It never stops anything itself. The plugin's `/ram` stays the in-session tool; ElysiumProd adds the whole machine view the plugin cannot see.

ElysiumProd's own disk use counts too: scrollback is capped from Phase 1 (section 15), and the Home stats show the size of each account's `projects/` transcript folder, which was about 1.8 GB at audit time.

### 10.7 Residual regex classifier

Still needed for one case the structured channels do not cover: `needs-login`. Patterns live in hot-reloaded config, never compiled in. A classifier failure degrades to `unknown` and never kills a session.

## 11. Multi-account isolation

### 11.1 Mechanism

Claude Code reads `CLAUDE_CONFIG_DIR`. When set, the config directory moves wholesale: `settings.json`, `.credentials.json`, transcripts under `projects/`, `history.jsonl`, skills and plugins. So two accounts means two directories:

```
C:\Users\aatir\.claude            main account, every session to date
C:\Users\aatir\.claude-account2   second account, logged in 2026-09-21, never used
```

Use these existing directories. Do not create new ones; the second is already logged in and has its own `.claude.json`.

The main account directory has no `CLAUDE_CONFIG_DIR` set today, so the CLI uses it by default. ElysiumProd sets the variable explicitly for both, so a pane's account never depends on the default.

ElysiumProd injects it into each spawned PTY's environment. Never globally, never into a settings file, since project and local settings files are not permitted to set it. First launch against a fresh directory triggers a normal interactive login, inside the pane the owner is already looking at.

This is also where the status line shim and the hooks from section 10 get written, one copy per account directory.

### 11.2 Environment scrubbing

Before spawning anything, strip from the child environment:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`
- `CLAUDE_CODE_OAUTH_TOKEN`

Each takes precedence over the subscription login. If any is inherited, both sessions silently authenticate or bill to the same place, which defeats the design and is nearly invisible. Scrub unconditionally, then add back only what the project config explicitly declares.

### 11.3 Caveats

- Console sign-in without an API key stores credentials outside `CLAUDE_CONFIG_DIR` and would collide. Does not apply here; both accounts are Max.
- Expired logins need interactive `/login`. Surface as `needs-login`, not as a merely idle pane.
- Largely resolved by the audit: `.claude.json` does move with `CLAUDE_CONFIG_DIR`. `C:\Users\aatir\.claude-account2\.claude.json` exists with its own `oauthAccount`, `userID` and project trust list. Phase 0 confirms only that `%USERPROFILE%\.claude.json` is left untouched while the variable is set. Consequence: the two accounts do not share user scope MCP servers. `elysiumvault` and `elysiumintern` are registered only in the main account today and must be added to the second, or moved to project `.mcp.json`. The claude.ai connectors, including Attestia, securITposture and Elysium Intern, follow the claude.ai login, so each account needs them connected separately.
- **Multi-account is unproven.** The second account exists but has never run a session (created 2026-09-21, no `projects/` folder). The 9 to 10 `/login` runs in the window were re-authentications of the main account after expiry, not account switching (owner, 2026-10-11). Nothing on this machine shows two accounts working side by side. Phase 0 step 2 is the test that decides it, and every multi-account feature waits for its result.
- Re-authentication after expiry is the login friction that actually happens. `needs-login` detection (10.7) and the attention row for it matter more than switching.
- UNVERIFIED: whether concurrent use of two Max accounts is permitted under Anthropic's terms. Resolve before building automatic failover. If not, keep account switching manual and drop section 11.5.

### 11.4 Switching

Kill the PTY, respawn against the other account's config dir, with `--continue` or `--resume <session-id>` where the CLI session can be resumed, otherwise cold. Confirm dialog states plainly what is lost.

### 11.5 Failover

On `rate_limits.five_hour` from the status line crossing a configured floor, or on a hard rate-limit signal, switch to the failover account automatically and notify. Off by default. Gated on three things, in order: Phase 0 step 2 passing, the terms question in 11.3, and the owner confirming before it is built. Until all three hold, this section is not built. Always writes a loud visible banner into the pane; never silent.

### 11.6 Liveness file

ElysiumProd is the only process that knows for certain which sessions are alive, so it publishes that fact rather than leaving it to agents.

For every project with a running session, it maintains `.claude/sessions-live.json` in the checkout, rewritten on every change and at least every 60 seconds:

```jsonc
{
  "writtenBy": "elysiumprod",
  "at": "2026-10-11T19:20:00Z",
  "sessions": [
    { "template": "attestia.prime", "title": "Prime Attestia", "state": "running", "since": "...", "lastTurnEnd": "...", "awaitingInput": false },
    { "template": "attestia.meridian", "title": "Meridian Attestia", "state": "stopped", "since": "...", "reason": "low-memory" }
  ]
}
```

- Written only when ElysiumProd is running. A file older than 5 minutes means ElysiumProd itself is down, and readers must say "unknown", never "running".
- Add it to each repo's `.gitignore` through the review screen in 8.3.1; it is never committed by ElysiumProd.
- Readers it is meant for: the plugin's peers line, `inbox.mjs`, and Prime when it writes the relay's Now lines. Changing those readers is plugin work, outside this repo; the file format is the contract.
- Open question 7: whether the board servers should see liveness, which would need it pushed somewhere.

## 12. Routing to other providers

A Router pane with a prompt box and a target selector. Targets declared in config:

```jsonc
{
  "providers": [
    {
      "id": "claude-review",
      "label": "Claude (review)",
      "kind": "cli-headless",
      "command": "claude",
      "args": ["-p", "{{prompt}}", "--output-format", "json"],
      "accountId": "account2"
    },
    {
      "id": "gpt",
      "label": "ChatGPT",
      "kind": "http",
      "endpoint": "https://api.openai.com/v1/chat/completions",
      "model": "gpt-5.1",
      "keyRef": "OPENAI_API_KEY"
    }
  ]
}
```

**`cli-headless`** runs print mode rather than a PTY: `claude -p "<prompt>"` with `--output-format json`, or `stream-json` plus `--verbose` for token streaming. `--json-schema` when a specific shape is wanted. `--permission-mode` and `--allowedTools` for unattended runs. Print mode is used here precisely because a PTY exposes no structured result.

Two caveats:

- Never pass `--bare`. It skips OAuth and keychain credentials, which breaks Max authentication.
- Custom skills and slash commands work in print mode when placed at the start of the prompt string. Terminal-only builtins such as `/login` do not. `/model`, `/config`, `/output-style` and `/mcp` accept arguments in print mode on recent CLI builds. Whether `/review` specifically works in print mode is UNVERIFIED; check `/commands` in the installed build.

**`http`** is a plain API call, key read from Windows Credential Manager, never from disk config.

Results render as a card with copy and **insert into focused session**. The second is the point: it writes the result into the active PTY's stdin so the main agent can act on it.

## 13. Repo management

Clone from the command palette or the Home add button:

1. GitHub URL or `owner/repo` shorthand.
2. Target defaults to `<workspaceRoot>\<repo>`, editable.
3. `git clone` streamed into a transient pane.
4. Create the Project. Auto-detect: read `.mcp.json` for expected servers, `.claude/mods.json` and `.claude/sessions.json` as in 8.3.1, `package.json` for a display name, assign a color by hash.
5. Prompt once for default and failover account, and for the tier, main or side.
6. Offer the stock boot profiles, with `full` preselected for main and `solo` for side.

Auth goes through the system git credential manager. ElysiumProd never handles tokens.

Default `workspaceRoot` is `C:\Users\aatir`, where 51 of the 73 checkouts already live; the other 22 are under `Documents`. Open question 1 still stands for new clones.

### 13.1 Board watcher process

Each main project has a board or chat watcher, declared in `mods.json` as `watchStart`:

- Attestia: `node packages/cli/bin/attestia.mjs watch ...`, run today as a Monitor with a 30 minute timeout.
- Elysium Intern: `node scripts/board-watch.mjs`, run as background Bash with a 2 hour timeout.
- Gulf: `node scripts/board-watch.mjs --replay`, run as a Monitor with a 30 minute timeout.

Today each one runs inside Prime, times out, and depends on Prime noticing and restarting it. The plugin grew a restart prompt, back off and `/watch` to cope.

ElysiumProd runs each watcher as a supervised child process of the main process, in the project's directory, with no timeout:

- restarted on exit with back off, 5s doubling to 5 minutes, and an attention row after three failures;
- stdout lines are delivered to the template named in `WatcherSpec.deliverTo` by writing them where `inbox.mjs` already looks, so Prime sees them at its next tool call or turn end through the existing hook path. ElysiumProd never types into a busy PTY;
- the plugin's watcher status reads the 11.6 liveness file, so its restart prompt stays quiet while ElysiumProd owns the watcher.

UNVERIFIED: what each watcher writes and where `inbox.mjs` reads from. Phase 0 reads those two scripts, as configuration, before this is built. If delivery through the inbox path does not fit, fall back to leaving the watcher in Prime and only supervising its restart.

## 14. Notifications

Events, each individually toggleable:

- Session entered `awaiting-input` (from the `Notification` hook)
- Turn finished (from `Stop`). On by default for Prime and solo sessions only. Meridian's turns end constantly on peer messages, about 77 in one Meridian's life, and would bury everything else.
- Peer link down (8.1)
- RAM or disk crossed a warn floor (10.6)
- A board watcher failed to restart (13.1)
- Session exited, with code
- Context crossed the amber threshold
- Compaction occurred
- Account rate limited, or failover performed
- Router task completed
- Relay gained an item blocked on the owner
- A boot profile expects a session that is not running, after a grace period

Channels: OS toast via Electron Notification, always on. Phone push via ntfy.sh, topic-based, no account, one POST, no SDK. Pushover as the alternative if ntfy latency is annoying.

Body always names the project and the session label, because the decision being supported is whether to walk back to the machine.

Coalesce to at most one notification per session per 30 seconds.

## 15. Persistence

SQLite at `%APPDATA%\elysiumprod\elysiumprod.db`.

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, color TEXT NOT NULL,
  config_dir TEXT NOT NULL, kind TEXT NOT NULL, state TEXT,
  five_hour_remaining REAL, seven_day_remaining REAL, reset_at TEXT
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
  remote TEXT, default_account_id TEXT REFERENCES accounts(id),
  failover_account_id TEXT REFERENCES accounts(id),
  shell TEXT NOT NULL DEFAULT 'pwsh', color TEXT NOT NULL,
  relay_json TEXT, waiting_heading TEXT, watcher_json TEXT,
  tier TEXT NOT NULL DEFAULT 'side', env_json TEXT NOT NULL DEFAULT '{}',
  default_profile_id TEXT, auto_compact_window INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE boot_profiles (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL, panes_json TEXT NOT NULL DEFAULT '[]',
  post_launch_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE session_templates (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id TEXT REFERENCES boot_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL, title TEXT NOT NULL, plugin_name TEXT,
  command TEXT NOT NULL, args_json TEXT NOT NULL DEFAULT '[]',
  model TEXT, advisor TEXT, effort TEXT, plugin_dir TEXT,
  skip_permissions INTEGER NOT NULL DEFAULT 1, resume TEXT NOT NULL DEFAULT 'by-title',
  account_id TEXT REFERENCES accounts(id), auto_start INTEGER NOT NULL DEFAULT 0, cwd TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id TEXT, account_id TEXT NOT NULL, claude_session_id TEXT,
  pid INTEGER, status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
  exit_code INTEGER, scrollback_path TEXT NOT NULL
);

CREATE TABLE telemetry (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  model TEXT, context_window_size INTEGER, input_tokens INTEGER, output_tokens INTEGER,
  used_pct REAL, remaining_pct REAL, tokens_to_compact INTEGER, cost_usd REAL,
  lines_added INTEGER, lines_removed INTEGER, compactions INTEGER NOT NULL DEFAULT 0,
  last_compaction_at TEXT, rss_bytes INTEGER, updated_at TEXT NOT NULL
);

CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, project_id TEXT,
  session_id TEXT, name TEXT NOT NULL, value REAL NOT NULL, attrs_json TEXT
);

CREATE TABLE layouts (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  dockview_json TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE notes (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, project_id TEXT,
  session_id TEXT, kind TEXT NOT NULL, payload_json TEXT
);
```

`metrics` is the OTel sink and backs every chart. Roll up to daily aggregates nightly and prune raw rows past 90 days.

Scrollback lives at `%APPDATA%\elysiumprod\scrollback\<sessionId>.log`, rotated at 10MB, pruned after 30 days, with a total cap of 1 GB across all sessions, oldest pruned first. The cap is there from Phase 1 because the disk was 98 percent full at audit time.

Human-editable config sits beside the db as `%APPDATA%\elysiumprod\config.jsonc`: providers, notification channels, detection patterns, thresholds, keybindings. Watched and hot-reloaded. The db is state, the jsonc is preferences, and the jsonc is the customization surface.

## 16. Packaging and install

Yes, it should be a real installed program, and it is not hard. It is a config block, not a project.

- `electron-builder` with `target: nsis`, `arch: arm64`, `win` platform. Produces a normal `.exe` installer with a Start Menu entry and an uninstaller.
- No code signing certificate for personal use. Windows SmartScreen warns on first run; click through once. Buying a cert is only worth it if this is ever shared.
- Add a `portable` target as a fallback in case NSIS on arm64 misbehaves.
- Auto-update: skip in v1. `electron-updater` against a private GitHub releases repo is a Phase 9 nicety, not a v1 requirement, and rebuilding locally is a `npm run dist` away.
- `asar: true`, with `node-pty` and `better-sqlite3` in `asarUnpack` since native modules cannot load from inside an asar archive. This is the most common packaging failure and worth getting right the first time.
- Ship a single-instance lock. Two copies of ElysiumProd managing the same PTYs and the same db would be bad.

## 17. Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All privileged work crosses typed IPC with a fixed channel allowlist.
- No remote content in any BrowserWindow.
- Ingest server binds `127.0.0.1` only, random port per launch, per-session shared secret required on every post.
- API keys in Windows Credential Manager via keytar. Config holds a reference name only.
- OTel content capture stays off, so prompts and tool parameters never hit disk.
- Scrollback may contain secrets echoed by tools. Store under the user profile with default ACLs, exclude from backup sync, and provide a purge-all button in settings.
- No analytics, no crash reporting. Outbound traffic limited to the notification webhook and declared HTTP providers.

## 18. Build phases

Each phase ends in something usable. Do not start one before the previous runs on the real machine.

**Phase A, workflow audit. Done 2026-10-11.** Output: `AUDIT-REPOS.md`, `AUDIT-TOOLING.md`, `AUDIT-SESSIONS.md`, `AUDIT-WORKFLOW.md`, `AUDIT-FRICTION.md`, `AUDIT-SUMMARY.md`, and this revision. Ends when the owner has read `AUDIT-SUMMARY.md`.

**Phase 0, spike, half a day.** Prove the risky things before writing app code.
1. `node-pty` installs or builds for Electron on win32-arm64, and a PowerShell session round-trips through ConPTY.
2. **Load-bearing: prove two accounts work at once.** The rest of the multi-account design depends on this step, so treat it as a test that can fail. Launch one session on the main account and one with `CLAUDE_CONFIG_DIR=C:\Users\aatir\.claude-account2`, at the same time. Pass only if all of these hold:
   - each session reports the expected account, and the status line `rate_limits` differ between them;
   - neither session forces the other to log in again, across a full turn in each;
   - `%USERPROFILE%\.claude.json` and `C:\Users\aatir\.claude\.credentials.json` are unchanged by the second session;
   - the second session still sees the claude.ai connectors it needs, or the gap is recorded.

   Record the result as pass or fail in `PHASE0.md`. On a fail, ElysiumProd is single account: section 11.4 becomes a re-login helper, 11.5 is dropped, and Phase 3 builds only the account chip and `needs-login`.
3. A status line shim receives JSON on stdin. Dump the raw object and confirm which documented fields actually arrive on this CLI version, especially `context_window.*` and `rate_limits.*`.
4. Register all eight hooks from 10.2 to a logging script in the account directory and capture raw stdin for each, especially `PreCompact`, `Stop`, `SessionEnd` and `Notification`. In the same run, confirm the project hooks of `securitposture_2026` still fire, so user scope and project scope hooks add up.
5. Confirm the OTLP exporter reaches a trivial local HTTP receiver.
6. Launch one session exactly as `cs prime posture` does, from node-pty, with `SP_SESSION_NAME`, `--plugin-dir`, `--model`, `--advisor` and `--resume`, and confirm the plugin's line appears and its peers line sees the other session.
7. Read, as configuration, `inbox.mjs` and one `board-watch.mjs` to settle the watcher delivery path in 13.1.
Output: `PHASE0.md`. If (1) fails, fall back to Electron x64 under emulation, or accept a Tauri rewrite of section 6.

**Phase 1, one terminal and the resource gate.** Electron shell, one xterm pane, SessionManager, one PTY, scrollback to disk with the total cap, resize, clean shutdown. RAM and free disk in the bottom bar with the floors in 10.6. Hardcode one template imported from `cs.ps1`, no db.

**Phase 2, projects, templates and import.** SQLite, project CRUD, left rail, Dockview, multiple panes, layout persistence, session templates with the full field set in 7, the first run import in 8.3.1, and stable identity in 8.3.2.

**Phase 3, accounts and liveness.** Account record for `.claude`, per-session config dir injection, env scrubbing, account chip and pane border, `needs-login` surfacing. Only if Phase 0 step 2 passed: the `.claude-account2` record and manual switch with confirm. The liveness file in 11.6.

**Phase 4, telemetry.** Ingest server, status line shim, hooks, OTLP receiver, telemetry table, context meter in the pane header using the plugin's thresholds. This is the phase that makes the app worth having.

**Phase 5, Home.** Attention strip with every row in 8.1, project cards, Launch and boot profiles, stats and sparklines.

**Phase 6, notifications and watchers.** OS toasts, ntfy push, rules in config. Supervised board watchers in 13.1.

**Phase 7, repo and git.** Clone flow, auto-detect, git pane with worktrees and sibling clones.

**Phase 8, router and relay.** Router pane, both provider kinds, insert-into-session, relay pane, notes, command palette, settings UI.

**Phase 9, failover and polish.** Failover only if Phase 0 step 2 passed, the terms question in 11.3 is resolved, and the owner has confirmed. Auto-update if wanted.

## 19. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| node-pty on win32-arm64 | High | Phase 0. Fallbacks named. |
| Native modules inside asar | High | `asarUnpack` from the first packaged build, not at the end. |
| `~/.claude.json` ignores `CLAUDE_CONFIG_DIR`, so MCP config is shared | Low | Audit found a separate `.claude.json` in `.claude-account2`. Phase 0 step 2 confirms the main one is untouched. The new consequence is the opposite one: user scope servers must be added to each account. |
| Multi-account is unproven: the second account has never run a session, and concurrent use may not be permitted | High | Phase 0 step 2 is a pass or fail test. On a fail, single account design, as in 18. Terms checked before Phase 9 either way. |
| Hook and status line schemas shift between CLI versions | Medium | Treat every field as optional, render nulls as unknown, log unrecognized shapes rather than crashing. Phase 0 captures a baseline. |
| Six-plus WebGL xterm instances on an ARM Surface | Medium | Benchmark in Phase 2. Canvas renderer fallback; pause rendering for hidden panes while still consuming the stream. |
| Scope creep into building an editor | High | Section 4 exists for this. Reread it. |
| Building the dashboard before the data channel works | Medium | Phase 4 precedes Phase 5 deliberately. A dashboard of guesses is worse than no dashboard. |
| Duplicating the owner's plugin: a second compaction controller, status line or RAM tool that fights `securitposture-mods` | High | Section 4 and 10.5. ElysiumProd reads plugin options and never triggers compaction. |
| Disk exhaustion on a drive already 98 percent full | High | Resource gate in Phase 1, scrollback cap, free disk on Home. |
| ElysiumProd hooks racing project hooks on git or the repo | Medium | 10.2: one POST, short timeout, exit 0, never touch git. |
| Session titles drifting from the plugin options and peer lists | Medium | Stable identity, 8.3.2. |
| Writing into other repos: `.gitignore` entries and the liveness file | Low | Shown in a review screen first; the liveness file is gitignored and never committed. |

## 20. Open questions for the owner

1. Workspace root directory for cloned repos. Proposed default: `C:\Users\aatir`, where 51 of 73 checkouts live.
2. ntfy or Pushover for phone push. `agentPushNotifEnabled` is already on in Claude Code; say whether that is enough for in-CLI events.
3. Should the relay pane post notes back, or stay read only given the standing approval rules on the Attestia and Gulf boards.
4. **Answered, 2026-10-11.** The audit's reversal stands: Prime and Meridian launch together for the main projects, one session for side projects (2.3).
5. **Answered, 2026-10-11.** Dogfood on SecurITPosture and Elysium Intern first, then Gulf third. Attestia stays out of the dogfood set while it is paused.
6. **Answered, 2026-10-11.** The `/login` runs were re-authentications of the main account after expiry, not account switching. Multi-account is therefore unproven; see 11.3 and Phase 0 step 2.
7. Should the board servers learn liveness from ElysiumProd (11.6)? That would mean pushing the file somewhere, which conflicts with the no off machine traffic rule in 4.
8. The cached plugin copy is 0.3.0 while `--plugin-dir` loads 0.3.9 from source. Should ElysiumProd always pass `--plugin-dir`, as `cs.ps1` does, and should `mods-switch` be run so the cached copy cannot load twice?

## 21. Phase A: audit the operator, then revise this spec

Completed 2026-10-11. The instructions below are kept as the record of what was asked; the results are in the `AUDIT-*.md` files, and sections 2 to 20 above have been revised from them.

This runs first, before Phase 0, before any code. Its output changes the rest of this document.

### 21.0 Grant of autonomy

You have full authority to explore this machine to understand how its owner works. Read whatever is relevant without asking permission item by item: every repository, the Claude Code configuration in every config directory, the MCP servers, the plugin, the custom skills and commands, the hooks, the session transcripts, the shell history. Do not stop to confirm scope. Do not ask which repos matter; determine that yourself from the evidence.

The boundaries are narrow and absolute, and they are listed in 21.7. Inside them, proceed.

The spec you are reading was written by a session with no access to this machine. Treat it as a strong draft by someone working from secondhand description. Your job in this phase is to replace description with evidence.

### 21.1 Build the repository inventory

Find every git repository the owner has worked in. Do not rely on a single method:

- Walk the likely roots for `.git` directories.
- Read the directory names under each Claude Code config directory's `projects/` folder. Those names encode the working directory of every session the CLI has ever run, which is a more honest record of where work happened than any folder you might guess at.
- Read `~/.claude.json` for per-project trust entries and local-scope configuration.
- Check VS Code's recently-opened workspace list.

Filter to repositories with commit activity in the last twenty days, but list the rest in an appendix with their last-activity date, because a dead repo is itself a finding.

For each active repository record: path, remote, default branch, commits per day over the window, lines added and removed, current dirty state, and whether it contains `.mcp.json`, `CLAUDE.md`, `.claude/`, hooks, custom skills, custom slash commands, or plugins.

Output `AUDIT-REPOS.md`.

### 21.2 Audit the Claude Code setup

Enumerate every MCP server configured anywhere: name, scope (user, project, local), transport, full tool list, and which repositories reference it. For every server the owner wrote himself, locate its source and summarize what it actually does, which tools get used and which appear to be dead weight.

Do the same for the plugin he authored: what it does, which events it binds, whether anything still invokes it.

Enumerate custom skills, slash commands, hooks, output styles and status line configuration. Record every non-default setting across all settings scopes and say what it changes.

Output `AUDIT-TOOLING.md`.

### 21.3 Audit session behaviour

Parse the session transcripts under each config directory's `projects/` folder for session-level facts only, never content. The transcript format is internal to Claude Code and changes between releases, so write defensively: skip entries that do not parse, never fail the whole run on one bad line, and report parse coverage as a percentage so the numbers can be trusted or discounted.

Answer these specifically:

- How many sessions actually run at the same time, by hour of day.
- How long does a typical session last, and how many turns, before it compacts.
- How often is a session resumed versus started fresh.
- Which repositories have sessions that sit idle for days.
- What is the gap between one session ending and the next starting on the same repo, and what happens in that gap.

Output `AUDIT-SESSIONS.md`.

### 21.4 Audit the Prime and Meridian model

For the Attestia repository, reconstruct the real division of labour from the local record: which session produced which commits, how often Meridian was running at the moment Prime needed it, how frequently the relay was updated, and how long items sat under blocked-on-owner before being cleared.

Section 2.2 found, from the board alone, that on six of eight active days one session did effectively all the work, and that the relay has read "start Meridian" since 2026-10-02. Confirm or refute both against the local record, which is richer than the board.

Then give an explicit verdict: keep both sessions always-on, make the second on demand, or drop it entirely. Section 2.3 provisionally recommends the second. Overturn it if the evidence says otherwise and show the evidence.

Output `AUDIT-WORKFLOW.md`.

### 21.5 Find the friction

The most valuable step, and the most open-ended. You are looking for everything the owner does by hand, repeatedly, that software should be doing for him. Candidates worth checking, not a closed list:

- Commands retyped at the start of nearly every session, from the shell history and from `history.jsonl` in each config directory.
- The same fix or the same class of bug recurring across repos.
- Long gaps between related sessions, which usually mean a manual step happened in between.
- Work visibly lost to a compaction and redone afterwards.
- Sessions started in the wrong directory, or on the wrong account.
- Things done in a browser that a connector he already has could do.
- Steps in his setup that exist only to work around a limitation this app removes.

Rank findings by estimated time cost, highest first. For each, propose a concrete ElysiumProd feature, or say plainly that no feature is warranted.

Output `AUDIT-FRICTION.md`.

### 21.6 Revise this spec

Write `AUDIT-SUMMARY.md`: the ten findings that most change the design, each with its evidence and its consequence for the build.

Then edit `SPEC.md` directly on a branch and open a PR. Amend sections, add features the evidence justifies, and cut features the evidence says will go unused. Do not preserve a section out of deference to whoever wrote it. Be specific in the PR description about what changed and which finding drove it.

### 21.7 Rules

- **Read only outside the ElysiumProd repository.** No commits, no edits, no deletions, no branch creation, no pushes in any other repo. The ElysiumProd repo is the only place you write.
- **Metadata and configuration, not code review.** Read source only where a question above requires it, such as understanding what an MCP server does. Do not read through his application code.
- **Secrets.** If you encounter a `.env`, credential file, key, token or anything resembling one, record that it exists and where, never its contents, and never copy it into an audit file. Do not include credential values in any output, even redacted.
- **Evidence or silence.** Every claim in an audit file carries a path, a commit hash, a date or a count. No unsourced assertions, no inferred narratives presented as fact. Where you are guessing, label it a guess.
- **Timebox.** If any single step runs past an hour, write what you have, mark the gap explicitly, and move to the next.
- **Stop at the end.** Do not begin Phase 0 or Phase 1. Phase A ends when the audit files exist and the owner has read `AUDIT-SUMMARY.md`.

## 22. Kickoff prompt for the implementing session

Phase A is done. For Phase 0, paste into a fresh Claude Code session in this repository:

> Read SPEC.md in full, then AUDIT-SUMMARY.md. Execute Phase 0, section 18, and nothing else.
>
> Write PHASE0.md with the raw results of each of the seven steps, including the exact stdin captured from every hook and the status line, the CLI version, and whether the securitposture-mods plugin's line and peers line appear when the session is launched from node-pty. Read only outside this repository, except that step 2 may launch one session against C:\Users\aatir\.claude-account2. Never record a secret's contents. Stop when PHASE0.md is written; do not start Phase 1. Do not use em dashes.
