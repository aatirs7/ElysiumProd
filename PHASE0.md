# PHASE0

Phase 0 spike, run 2026-10-11 on the owner's Surface. Harness and raw results are in `spike/`. Each step lists its result, then the evidence, then what it changes in SPEC.md.

Environment: Windows 11 on ARM64, Node 22.19.0 arm64, Claude Code 2.1.296, Electron 44.7.0 (Node 24.21.0 inside), node-pty 1.1.0.

How it ran: every step ran inside Electron's main process through node-pty, the same path the app will use. Sessions ran in `spike/sandbox`, never in a project repo, and never with `--resume`. The status line and hooks were injected with `claude --settings spike/settings.spike.json`, so neither config directory's `settings.json` was edited. Spike turns used Haiku 5.5, except the flag check in step 6.

| Step | Result |
|---|---|
| 1. node-pty under Electron on win32-arm64 | **Pass** |
| 2. Two accounts at the same time | **Pass** |
| 3. Status line JSON | **Pass** |
| 4. Hooks | **Pass**, with two events not reachable in a spike |
| 5. OTLP to a local receiver | **Pass** |
| 6. Launch like `cs`, with the plugin | **Pass**, peers line not verified |
| 7. Watcher delivery path | **Settled**, and section 13.1 changes |

## 1. node-pty under Electron on win32-arm64: pass

- node-pty 1.1.0 ships Node-API prebuilds for `win32-arm64` (`pty.node`, `conpty.node`, and a bundled `conpty.dll` with `OpenConsole.exe`). They load in Electron 44 with **no rebuild**, so the VC ARM64 toolset is not needed.
- Electron downloads as a native ARM64 binary (`electron.exe`, PE32+ ARM64).
- The PowerShell prompt appeared after 320 ms. Echo round-trip, resize to 120 columns and a clean exit with code 0 all worked (`spike/out/step1.json`).
- **PowerShell 7 is not installed.** `C:\Program Files\PowerShell` does not exist. The spike used Windows PowerShell 5.1 (`powershell.exe`).
- node-pty's Windows console-list helper threw `AttachConsole failed` once while a PTY was being killed after exit. It is harmless, but Phase 1 must catch it so it never shows up as an app error.
- Consequence: section 5 drops "PowerShell 7 as the default" for `powershell.exe`, with `pwsh` used when present. Section 19's top risk is retired.

## 2. Two accounts at the same time: pass

Session A ran on the main account with `CLAUDE_CONFIG_DIR` unset, as today. Session B ran with `CLAUDE_CONFIG_DIR=C:\Users\aatir\.claude-account2`. Both were launched together and each answered two turns (`spike/out/step2.json`).

| Check | Result |
|---|---|
| Distinct accounts | Yes. The OTel `user.account_uuid` hashes differ; only hashes were compared. |
| Separate rate limits | Yes. A: 5 hour 19%, 7 day 6%. B: 5 hour 2%, 7 day **84%**. |
| Neither forced a re-login | Yes. Both answered a second turn with no login screen. |
| Main credentials untouched | Yes. The hash of `.claude\.credentials.json` is identical before and after. |
| B left no trace in the main `.claude.json` | Yes. B's folder never appeared in its `projects`. |
| B wrote to its own directory | Yes. `.claude-account2\.credentials.json` changed (a token refresh) and a `projects\` folder was created. |

Things the owner should know:

- **Account 2's weekly limit was 84% used** at test time, with a reset on 2026-10-13. Account 2 has run no Claude Code sessions on this machine, so that usage came from elsewhere, most likely claude.ai on the same login. It has little headroom for failover this week.
- A new folder in a new account shows the **folder trust dialog, defaulting to "No, exit"**. Enter alone quits the session, and only down arrow then Enter accepts. B also showed a one-time "auto mode" notice that took the first keystrokes.
- **Not tested on purpose:** setting `CLAUDE_CONFIG_DIR` explicitly to `C:\Users\aatir\.claude` for the main account. The CLI might then look for `.claude.json` inside that folder, which does not exist, and start onboarding. The spec now leaves the variable unset for the main account.
- **Still open:** whether running two Max accounts at once is allowed under Anthropic's terms. Failover stays gated on that and on the owner.

Consequence: multi-account switching can be built in Phase 3. Failover stays gated as section 11.5 says. The spec's 11.1 rule changes to "set the variable only for non-default accounts".

## 3. Status line: pass

- The shim received JSON on every update; there were 6 calls over 80 seconds in the telemetry run.
- Fields the spec relies on all arrive: `context_window.{total_input_tokens, total_output_tokens, context_window_size, used_percentage, remaining_percentage, current_usage.*}`, `cost.*`, `model.{id, display_name}`, `workspace.repo.*`, `rate_limits.five_hour.{used_percentage, resets_at}` and `rate_limits.seven_day.*`.
- New fields the spec did not know about:
  - `prompt_cache.*`: warm, ttl, expires_at, hit_ratio, misses, recache_tokens_if_cold;
  - `effort.level`, `fast_mode`, `thinking.enabled`, `version`, `session_name`.
- `rate_limits` arrived before the first response in a fresh session, so the spec's note that it appears only after the first response is wrong for this version. `spend_limit` was absent.
- Haiku 5.5 reports `context_window_size` 1,000,000. A fresh sandbox session already starts with about 53,000 input tokens of system prompt and tools.
- Full key list: `spike/out/SCHEMAS.md`.

## 4. Hooks: pass

- All nine events registered through `--settings` fired with JSON on stdin: SessionStart, UserPromptSubmit, Stop, Notification, PreModelSwitch, PostModelSwitch, PreCompact, PostCompact and SessionEnd. Key lists are in `spike/out/SCHEMAS.md`.
- Useful specifics:
  - `Stop` carries `last_assistant_message`, `background_tasks` and `session_crons`.
  - `Notification` carries `notification_type` (seen: `idle_prompt`) and `message`.
  - PreModelSwitch and PostModelSwitch carry `context_tokens`, `prompt_cache_warm` and `estimated_cache_write_usd`.
  - PostCompact carries `compact_summary`.
  - `SessionEnd.reason` was `prompt_input_exit`.
  - SessionStart fires again after a compaction.
- Hooks supplied through `--settings` ran alongside the user settings without replacing anything. A separate check of project-level `settings.json` hooks was not run; the Phase 1 dogfood will show it in the real repos.
- **Not reached:** a permission-prompt `Notification`, because the test command ran without a prompt, and `trigger: auto` compaction.
- Consequence: section 10.2's UNVERIFIED note is resolved. The `--settings` file is a better injection point than writing hooks into each account directory, because it touches no user config. The spec moves to it.

## 5. OTLP: pass

- With `OTEL_EXPORTER_OTLP_PROTOCOL=http/json`, the CLI posted to `/v1/metrics` and `/v1/logs` on the local receiver every 5 seconds.
- Metrics seen: `claude_code.session.count`, `claude_code.token.usage`, `claude_code.cost.usage` and `claude_code.active_time.total`. Commit, pull request and lines metrics did not appear, because nothing was committed.
- Events seen: `user_prompt`, `assistant_response`, `api_request`, `compaction`, `hook_execution_start`, `hook_execution_complete`, `hook_registered`, `mcp_server_connection`, `plugin_loaded` and `managed_settings_resolved`.
- **Content is redacted by default.** `prompt`, `prompt_text` and `response` arrive as a redaction marker with no content gate set. That matches the spec's rule.
- **Identity travels on every data point:** `user.email`, `user.account_uuid`, `user.account_id`, `user.id` and `organization.id`. The raw capture is gitignored for that reason. Consequence: the ingest drops those attributes before anything reaches SQLite and keeps only a hash of `user.account_uuid`, which is also how ElysiumProd can confirm which account a pane is really on.

## 6. Launch like `cs`, with the plugin: pass, peers not verified

- These flags launched together with no error: `--dangerously-skip-permissions --plugin-dir <mods> --model claude-opus-5-5 --advisor claude-fable-5-1 -n "Spike Posture"`. The banner read "Opus 5.5 with medium effort · Claude Max", and the advisor notice showed. The session was ready to type 3.7 seconds after spawn.
- The `securitposture-mods` line rendered and showed "4 waiting on you", read from the relay.
- With `SP_SESSION_NAME=Spike`, which is not in the plugin's configured list, the badge read "unnamed, /session-name". The plugin only names sessions it was configured with. This is the identity-by-string problem again, and it supports section 8.3.2.
- The **peers line was not verified.** Seeing it needs a configured name such as Prime, and using one would impersonate the owner's live session. It is deferred to the first dogfood launch of a real template.
- The CLI is an npm shim. node-pty needs the real executable at `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`, which the `claude.cmd` shim resolves.

## 7. Watcher delivery path: settled, and section 13.1 changes

- `board-watch.mjs` (Elysium Intern) prints exactly one stdout line per new `board:task` issue and keeps its seen list in the OS temp folder. It exists so that Monitor can wake an idle Prime.
- `inbox.mjs` (Attestia) does not read watcher output. It polls GitHub itself through `gh`, throttled, and injects through PostToolUse `additionalContext` mid-turn and through the Stop hook.
- So there is no file to drop watcher lines into. Consequence: ElysiumProd runs the watcher. When a line arrives and the target session is idle (its last event was `Stop` or `Notification: idle_prompt`), ElysiumProd types the line into that PTY as a prompt. When the session is busy, it does nothing, because `inbox.mjs` reaches the same issue at the next tool call. Every line also becomes an attention row.

## Other findings

- **Environment leakage.** A session started from inside Claude Code inherits 10 `CLAUDE*` variables, including `CLAUDE_CODE_MESSAGING_SOCKET` and a messaging token. The child then printed "Transcript saving is off, inherited CLAUDE_CODE_CHILD_SESSION marker". ElysiumProd must strip every `CLAUDE*` variable it does not set itself, not only the three keys in section 11.2.
- **Spawn to ready**: 1.6 seconds to SessionStart, 2.5 to 3.7 seconds to an input box, and 7.4 seconds to the end of a first one-word turn on Haiku.
- **Default mode**: the main account starts in "auto mode" unless `--permission-mode` is passed. Templates should set the mode explicitly.

## Cost of the spike

About 7 short sessions on the main account and 3 on account 2, nearly all on Haiku 5.5. The main account's 5 hour usage read 19% before the first spike session and 19% after the last.
