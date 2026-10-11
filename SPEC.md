# ElysiumProd

Personal multi-agent development harness. Replaces the "several VS Code windows, each with a terminal running Claude Code" workflow with a single customizable cockpit that launches a whole project with one click and tells you, at a glance, what every agent is doing and how close it is to running out of room.

Repository and project name: ElysiumProd. The identifier `elysiumprod` is used for the package name, the install directory and the data path.

Status: specification, v2. Nothing is built yet.

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

This section is an audit of how the Prime and Meridian model is actually performing, not how it is designed to perform. It drives several decisions below.

### 2.1 What was and was not auditable

Audited: the Attestia board's agent session ledger for 2026-09-21 to 2026-10-11, the live relay file, and the documented working model.

Not audited: the repos themselves, the local Claude Code configuration, the MCP servers, the plugin, the custom skills, and the session transcripts. The session that wrote this spec had no access to the machine.

**That audit is not optional and it is not skipped. It is delegated.** It is Phase A, section 21, and it runs before any code is written. The implementing session sits on the actual machine with every clone, every config directory and every transcript present, and it has full authority to go and look. Everything in section 2.2 and 2.3 below is therefore provisional: a remote first pass, to be confirmed, extended or overturned by Phase A.

### 2.2 Findings

**Finding 1. The two sessions are almost never both working.**

Session minutes by day, from the ledger:

| Day | Session A (16047ae8) | Session B (fabb5698) | Session C (a6950d7b) |
|---|---|---|---|
| 09-21 | 0 | 268 | |
| 09-22 | 298 | 298 | |
| 09-23 | 923 | | |
| 09-24 | 308 | 0 | 8 |
| 09-26 | | | 79 |
| 09-27 | 904 | 24 | |
| 09-28 | 0 | 255 | 23 |
| 09-29 | 0 | 17 | |

On six of the eight active days, one session did effectively all the work while the other logged zero to twenty four minutes. The single day that looks parallel, 09-22, has both sessions sharing an identical start and end timestamp, which reads as co-started and co-stopped rather than two agents genuinely working at once.

**Finding 2. The current blocker is a session that is not running.**

The relay has read "Meridian is not running right now. Start it so the two sessions can message each other again" since 2026-10-02. That is nine days blocked, and the blocking action is launching a terminal. This is not an agent capability problem. It is a launcher problem, which is exactly what this app is for.

**Finding 3. Session liveness has caused real data problems before.**

The relay went thirty six hours stale from 2026-09-23 because only Prime writes it and Prime was not running. Separately, issues 19 and 20 were routed to Meridian a day late because Prime was not running when they arrived. Both were patched at the data layer by making `get_relay` read main live. The underlying cause, no visibility into whether a session is alive, was never addressed.

**Finding 4. The board has been dark since 2026-09-29.** Twelve days with no recorded session on the project the owner calls the priority.

**Finding 5. Sessions run very long and nobody can see the context ceiling.** Recorded sessions of 923, 904, 308, 298 and 255 minutes. Sessions that long auto-compact, probably repeatedly, and there is currently no indicator of when that is about to happen or what it costs.

### 2.3 Provisional verdict on Prime and Meridian

Provisional, pending Phase A. Keep the architecture, change the default.

The two-session model, the message guard, the relay, and the rule that Attestia's sessions talk only to each other are all load-bearing for the product's own story, and tearing them out would be expensive for no gain. But the evidence says a permanently-running second session is not earning its keep: Meridian idles for days, and its idleness silently blocks Prime.

So: **default to one session per project, with the second as an on-demand pane.** Meridian becomes a template with `autoStart: false` that Prime's relay can request, ElysiumProd surfaces as an alert, and one keystroke starts. That turns a nine-day blocker into a notification.

The real parallelism win was never two agents inside one repo. It is one agent each in two repos at the same time, which is the thing the current setup makes awkward and this app makes trivial.

Phase A step A.4 tests this against the local record and may overturn it. If it does, the local evidence wins and this section gets rewritten.

## 3. Goals

- One click takes a project from cold to fully running: repo fetched, every session spawned on the right account in the right directory, layout restored, relay loaded.
- Run several projects concurrently in one window.
- Bind each session to a specific Claude account and switch without losing the project.
- Show live context consumption and distance to auto-compact per session.
- Show which sessions and which projects need the owner, in one list, on the home screen.
- Push notifications to phone so long runs do not need babysitting.
- Clone and register a repo from inside the app.
- Route a single task to a different model or provider without leaving the app.
- Installable on the laptop like any other program.
- Modifiable by its owner in an evening: plain config files, small modules, no framework ceremony.

## 4. Non-goals

- Not a code editor. VS Code stays open for editing. ElysiumProd owns orchestration.
- Not multi-user, not commercial, no auth layer, no telemetry leaving the machine.
- Not a Claude Code reimplementation. It drives the real CLI as a child process, unwrapped, so every slash command and skill works normally.
- No cloud component. Only outbound traffic is the phone notification webhook and any declared HTTP provider.

## 5. Target environment

- Windows 11 on ARM64 (Surface Pro). Primary and only supported target.
- Node 20 LTS or newer, Claude Code CLI and Git on PATH.
- PowerShell 7 as the default spawned shell, configurable per project.

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
 │   └─ Relay         cached MCP relay state
 ├─ Layout         serialized Dockview state per project
 └─ Rule           event to action mapping
```

```ts
interface Account {
  id: string;                    // "max-primary", "max-secondary"
  label: string;
  color: string;                 // pane accent, never pure white or black
  configDir: string;             // absolute, e.g. C:\Users\x\.claude-primary
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
  relayTool: string | null;      // e.g. "mcp__Attestia__get_relay"
  relayBoard: string | null;     // e.g. "aatirs7/attestia"
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

interface SessionTemplate {
  id: string;
  label: string;                 // "Prime Attestia", "Meridian Attestia"
  command: string;
  args: string[];
  accountId: string | null;      // null means project default
  autoStart: boolean;
  cwd: string | null;
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

Pinned at the top, full width, centered. The single most valuable widget in the app, given findings 2 and 3. It lists everything currently waiting on the owner, across all projects, newest first:

- Sessions in `awaiting-input`
- Relay items under "blocked on the owner" or "waiting on you"
- GitHub issues labelled `needs:owner`
- Sessions within a configurable margin of auto-compact
- Accounts rate limited, with reset countdown
- Projects whose boot profile expects a session that is not running

Each row has a one-click action: focus the pane, start the missing session, open the issue. When the strip is empty it collapses to a single centered line saying nothing needs you, rather than taking up space.

Had this existed in September, the nine-day Meridian blocker would have been a nine-second fix.

### 8.2 Project cards

A responsive grid, centered content in each card:

- Project name in its color, with a status dot
- Last activity, relative ("3 hours ago", "12 days ago"). Dark projects say so plainly; the Attestia board sitting twelve days cold should be visible without being asked for.
- Session row: one chip per template, green running, grey stopped, amber awaiting input, red error
- Git line: branch, ahead/behind, dirty file count
- Relay line: counts for open, blocked, waiting on owner
- Context pressure bar for the hottest running session
- A primary **Launch** button, plus a small profile selector

### 8.3 Launch

One click, idempotent:

1. Verify the repo path exists. If missing but a remote is recorded, offer to clone.
2. `git fetch` in the background, do not block on it.
3. Spawn every template in the chosen profile, each with its account's `CLAUDE_CONFIG_DIR`, scrubbed env, correct cwd.
4. Open the profile's non-terminal panes.
5. Restore the saved Dockview layout for the project.
6. Run `postLaunch` commands.
7. Focus the first terminal pane.

Clicking Launch on an already-running project just switches to it. Launching a profile when some of its sessions are already up starts only the missing ones.

Three stock profiles, editable per project:

- **solo**: Prime, relay, git. The new default, per section 2.3.
- **full**: Prime, Meridian, relay, git, notes.
- **review**: no PTY at all, just the router pane. For when the task is a single headless query.

`Ctrl+Shift+1..9` launches project N on its default profile from anywhere in the app.

### 8.4 Stats

A strip above the project grid, and a wider panel below it.

Live counters: sessions running, sessions awaiting input, accounts healthy, machine CPU and RAM.

Today: active agent minutes, commits, lines added and removed, spend in USD, compactions. All of these come free from the telemetry channel in section 10, which means they are real figures rather than estimates.

Trends, a 14-day sparkline row: active minutes per day, commits per day, spend per day, compactions per day. Keep it to four sparklines. This is a cockpit, not an analytics product.

Per-project breakdown is a list of cards, not a table, per the alignment rules.

## 9. Project view

Dockview container per project. Panes dock, resize, float, and the layout serializes to SQLite so it is identical next launch.

**Terminal pane.** xterm instance. Header, centered: template label, account chip in the account color, status dot, and a compact context meter. Right-aligned: restart, switch account, close. Pane border takes the account color at 2px so a glance tells you which account you are on.

**Relay pane.** Polls the project's configured relay tool, default 60s, manual refresh. Four centered cards: shipped, open, blocked, waiting on owner. Read only in v1; see open question 3.

**Git pane.** Branch, ahead/behind, dirty count, last three commits, fetch and pull buttons. Not a git client.

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

Displayed as a bar plus a token figure, always labelled an estimate, with the one-turn lag noted. Colour thresholds: calm above 40 percent remaining, amber below 20, red below 8, and a notification fires on crossing the amber line so a long run can be checkpointed before it compacts rather than after.

The ledger shows sessions of 900-plus minutes. Those compacted repeatedly and silently. This meter is the single feature most likely to change day to day behavior.

### 10.6 Machine resources

Per session: resident set size of the PTY process tree, sampled every 5s.
System: CPU percentage and RAM used against total, sampled every 2s, shown in the bottom bar and on Home.
A warning banner at 85 percent RAM, and the new-session button disables above 92 percent rather than letting the machine thrash.

### 10.7 Residual regex classifier

Still needed for one case the structured channels do not cover: `needs-login`. Patterns live in hot-reloaded config, never compiled in. A classifier failure degrades to `unknown` and never kills a session.

## 11. Multi-account isolation

### 11.1 Mechanism

Claude Code reads `CLAUDE_CONFIG_DIR`. When set, the config directory moves wholesale: `settings.json`, `.credentials.json`, transcripts under `projects/`, `history.jsonl`, skills and plugins. So two accounts means two directories:

```
C:\Users\<user>\.claude-primary
C:\Users\<user>\.claude-secondary
```

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
- UNVERIFIED: whether `~/.claude.json` moves with `CLAUDE_CONFIG_DIR`. It holds the OAuth session, per-project trust, and user-scope and local-scope MCP definitions. The docs place it as a sibling of `~/.claude/` and never say it relocates. Test in Phase 0. If it does not move, both accounts share user-scope and local-scope MCP config, and the mitigation is to put every MCP server in project-scope `.mcp.json` committed to each repo, which is better practice regardless.
- UNVERIFIED: whether concurrent use of two Max accounts is permitted under Anthropic's terms. Resolve before building automatic failover. If not, keep account switching manual and drop section 11.5.

### 11.4 Switching

Kill the PTY, respawn against the other account's config dir, with `--continue` or `--resume <session-id>` where the CLI session can be resumed, otherwise cold. Confirm dialog states plainly what is lost.

### 11.5 Failover

On `rate_limits.five_hour` from the status line crossing a configured floor, or on a hard rate-limit signal, switch to the failover account automatically and notify. Off by default. Gated on the terms question in 11.3. Always writes a loud visible banner into the pane; never silent.

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
      "accountId": "max-secondary"
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
4. Create the Project. Auto-detect: read `.mcp.json` for expected servers, `package.json` for a display name, assign a color by hash.
5. Prompt once for default and failover account.
6. Offer the stock boot profiles.

Auth goes through the system git credential manager. ElysiumProd never handles tokens.

## 14. Notifications

Events, each individually toggleable:

- Session entered `awaiting-input` (from the `Notification` hook)
- Turn finished (from `Stop`)
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
  relay_tool TEXT, relay_board TEXT, env_json TEXT NOT NULL DEFAULT '{}',
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
  label TEXT NOT NULL, command TEXT NOT NULL, args_json TEXT NOT NULL DEFAULT '[]',
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

Scrollback lives at `%APPDATA%\elysiumprod\scrollback\<sessionId>.log`, rotated at 10MB, pruned after 30 days.

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

**Phase 0, spike, half a day.** Prove the risky things before writing app code.
1. `node-pty` installs or builds for Electron on win32-arm64, and a PowerShell session round-trips through ConPTY.
2. Two `CLAUDE_CONFIG_DIR` directories give two genuinely independent logins. Record whether `%USERPROFILE%\.claude.json` is modified and whether a `claude.json` appears inside the new directories.
3. A status line shim receives JSON on stdin. Dump the raw object and confirm which documented fields actually arrive on this CLI version, especially `context_window.*` and `rate_limits.*`.
4. Register all eight hooks from 10.2 to a logging script and capture raw stdin for each, especially `PreCompact`, `Stop`, `SessionEnd` and `Notification`.
5. Confirm the OTLP exporter reaches a trivial local HTTP receiver.
Output: `PHASE0.md`. Phase A must already be complete; see section 21. If (1) fails, fall back to Electron x64 under emulation, or accept a Tauri rewrite of section 6.

**Phase A, workflow audit.** Section 21. Runs before everything. Ends when `AUDIT-SUMMARY.md` exists and the owner has read it.

**Phase 1, one terminal.** Electron shell, one xterm pane, SessionManager, one PTY, scrollback to disk, resize, clean shutdown. Hardcode one project, no db.

**Phase 2, projects and layout.** SQLite, project CRUD, left rail, Dockview, multiple panes, layout persistence, session templates.

**Phase 3, accounts.** Account records, per-session config dir injection, env scrubbing, account chips and pane borders, manual switch with confirm.

**Phase 4, telemetry.** Ingest server, status line shim, hooks, OTLP receiver, telemetry table, context meter in the pane header, bottom bar resources. This is the phase that makes the app worth having.

**Phase 5, Home.** Attention strip, project cards, Launch and boot profiles, stats and sparklines.

**Phase 6, notifications.** OS toasts, ntfy push, rules in config.

**Phase 7, repo and git.** Clone flow, auto-detect, git pane.

**Phase 8, router and relay.** Router pane, both provider kinds, insert-into-session, relay pane, notes, command palette, settings UI.

**Phase 9, failover and polish.** Only after the terms question in 11.3 resolves. Auto-update if wanted.

## 19. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| node-pty on win32-arm64 | High | Phase 0. Fallbacks named. |
| Native modules inside asar | High | `asarUnpack` from the first packaged build, not at the end. |
| `~/.claude.json` ignores `CLAUDE_CONFIG_DIR`, so MCP config is shared | Medium | Phase 0 test. Move all MCP servers to project-scope `.mcp.json`. |
| Multi-account concurrency may not be permitted | Medium | Verify before Phase 9. Manual switching only if not. |
| Hook and status line schemas shift between CLI versions | Medium | Treat every field as optional, render nulls as unknown, log unrecognized shapes rather than crashing. Phase 0 captures a baseline. |
| Six-plus WebGL xterm instances on an ARM Surface | Medium | Benchmark in Phase 2. Canvas renderer fallback; pause rendering for hidden panes while still consuming the stream. |
| Scope creep into building an editor | High | Section 4 exists for this. Reread it. |
| Building the dashboard before the data channel works | Medium | Phase 4 precedes Phase 5 deliberately. A dashboard of guesses is worse than no dashboard. |

## 20. Open questions for the owner

1. Workspace root directory for cloned repos.
2. ntfy or Pushover for phone push.
3. Should the relay pane post notes back, or stay read only given the standing approval rules on the Attestia and Gulf boards.
4. Confirm the section 2.3 verdict: default to one session per project, Meridian on demand. If you disagree, say so and `full` becomes the default profile instead.
5. Which two projects to dogfood first. The stated pair is SecuriTPosture and Elysium Intern; the evidence suggests Attestia belongs in there too, since it is the project the current workflow is stalling.

## 21. Phase A: audit the operator, then revise this spec

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

Paste into a fresh Claude Code session in an empty repo:

> Read SPEC.md in full. Then execute Phase A, section 21, and nothing else.
>
> Phase A is an audit of how I actually work, run on this machine. You have full autonomy inside the boundaries in section 21.7: explore every repository I have worked in over the last twenty days, every Claude Code config directory, every MCP server and plugin and skill I have built, and the session transcripts. Do not ask me which repos matter or whether you may look at something. Work it out from the evidence and go.
>
> Produce AUDIT-REPOS.md, AUDIT-TOOLING.md, AUDIT-SESSIONS.md, AUDIT-WORKFLOW.md, AUDIT-FRICTION.md and AUDIT-SUMMARY.md, then open a PR revising SPEC.md against what you found. This spec was written without access to this machine, so treat it as a draft and change whatever the evidence contradicts, including the Prime and Meridian verdict in section 2.3.
>
> Read only outside this repo. Never record a secret's contents. Every claim carries its evidence. Stop when AUDIT-SUMMARY.md is written; do not start Phase 0 or Phase 1. Do not use em dashes.
