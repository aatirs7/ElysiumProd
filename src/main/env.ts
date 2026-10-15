// Child environment scrubbing (spec 11.2, widened by Phase 0).
//
// Strip the three credential variables that override a subscription login,
// every other CLAUDE* variable (a process started from a Claude Code terminal
// passes on ten of them, including a messaging socket and token, and the child
// then turns transcript saving off), and every OTEL_ variable. Then add back
// only what the template declares.

const DROP = /^(CLAUDE|ANTHROPIC_API_KEY$|ANTHROPIC_AUTH_TOKEN$|OTEL_)/i;

const AGENT_KEYS = /^(OPENAI_API_KEY|CODEX_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY)$/i;

export function childEnv(extra: Record<string, string> = {}, agent = false): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || DROP.test(k) || (agent && AGENT_KEYS.test(k))) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}
