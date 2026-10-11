# Phase 0 captured schemas

Key names only, from Claude Code 2.1.296. Values are omitted except enum-like fields.

## Hook stdin
- **SessionStart**: `cwd`, `hook_event_name`, `model`, `scratchpad_dir`, `session_id`, `session_title`, `source`, `transcript_path`
  - `hook_event_name` seen: SessionStart
  - `source` seen: startup
- **UserPromptSubmit**: `cwd`, `hook_event_name`, `permission_mode`, `prompt`, `prompt_id`, `scratchpad_dir`, `session_id`, `session_title`, `transcript_path`
  - `hook_event_name` seen: UserPromptSubmit
  - `permission_mode` seen: auto, default
- **Stop**: `background_tasks`, `cwd`, `effort`, `hook_event_name`, `last_assistant_message`, `permission_mode`, `prompt_id`, `scratchpad_dir`, `session_crons`, `session_id`, `stop_hook_active`, `transcript_path`
  - `hook_event_name` seen: Stop
  - `permission_mode` seen: auto, default
  - `stop_hook_active` seen: False
- **Notification**: `cwd`, `hook_event_name`, `message`, `notification_type`, `prompt_id`, `scratchpad_dir`, `session_id`, `transcript_path`
  - `hook_event_name` seen: Notification
  - `notification_type` seen: idle_prompt
- **PreModelSwitch**: `cache_ttl`, `context_tokens`, `cwd`, `estimated_cache_write_usd`, `from_model`, `hook_event_name`, `pricing`, `prompt_cache_warm`, `prompt_id`, `requested_model`, `scratchpad_dir`, `session_id`, `source`, `to_model`, `transcript_path`
  - `cache_ttl` seen: 1h
  - `from_model` seen: claude-haiku-5-5
  - `hook_event_name` seen: PreModelSwitch
  - `prompt_cache_warm` seen: True
  - `source` seen: command
  - `to_model` seen: claude-sonnet-5-5
- **PostModelSwitch**: `cache_ttl`, `context_tokens`, `cwd`, `estimated_cache_write_usd`, `from_model`, `hook_event_name`, `pricing`, `prompt_cache_warm`, `prompt_id`, `requested_model`, `scratchpad_dir`, `session_id`, `source`, `to_model`, `transcript_path`
  - `cache_ttl` seen: 1h
  - `from_model` seen: claude-haiku-5-5
  - `hook_event_name` seen: PostModelSwitch
  - `prompt_cache_warm` seen: True
  - `source` seen: command
  - `to_model` seen: claude-sonnet-5-5
- **SessionEnd**: `cwd`, `hook_event_name`, `prompt_id`, `reason`, `scratchpad_dir`, `session_id`, `transcript_path`
  - `hook_event_name` seen: SessionEnd
  - `reason` seen: prompt_input_exit
- **PreCompact**: common fields plus `trigger`. Seen: `manual`. Captured in a run whose raw file was later overwritten; the trigger value was recorded before that.
- **PostCompact**: common fields plus `trigger` and `compact_summary`. Seen: `manual`.
- After a compaction, **SessionStart fires again**. Its `source` value was not retained.
- **Not observed**: a permission prompt `Notification`. The test command ran without one. `trigger: auto` compaction was not reachable in a short spike.

## Status line stdin
`context_window.context_window_size`, `context_window.current_usage`, `context_window.current_usage.cache_creation_input_tokens`, `context_window.current_usage.cache_read_input_tokens`, `context_window.current_usage.input_tokens`, `context_window.current_usage.output_tokens`, `context_window.remaining_percentage`, `context_window.total_input_tokens`, `context_window.total_output_tokens`, `context_window.used_percentage`, `cost.total_api_duration_ms`, `cost.total_cost_usd`, `cost.total_duration_ms`, `cost.total_lines_added`, `cost.total_lines_removed`, `cwd`, `effort.level`, `exceeds_200k_tokens`, `fast_mode`, `model.display_name`, `model.id`, `output_style.name`, `prompt_cache.cache_write_tokens`, `prompt_cache.caching_observed`, `prompt_cache.expected_rebuilds`, `prompt_cache.expires_at`, `prompt_cache.hit_ratio`, `prompt_cache.last_miss_at`, `prompt_cache.last_miss_cause`, `prompt_cache.miss_recache_tokens`, `prompt_cache.misses`, `prompt_cache.recache_tokens_if_cold`, `prompt_cache.requests`, `prompt_cache.ttl`, `prompt_cache.warm`, `prompt_id`, `rate_limits.five_hour.resets_at`, `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.resets_at`, `rate_limits.seven_day.used_percentage`, `scratchpad_dir`, `session_id`, `session_name`, `thinking.enabled`, `transcript_path`, `version`, `workspace.added_dirs`, `workspace.current_dir`, `workspace.project_dir`, `workspace.repo.host`, `workspace.repo.name`, `workspace.repo.owner`
