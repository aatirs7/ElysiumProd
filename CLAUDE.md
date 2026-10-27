# Elysium

A Windows desktop app (Electron 44, React 19, TypeScript, Tailwind v4, xterm.js, dockview) that runs Claude Code sessions for many projects in one window. Whoever is running this copy can ask Claude (through the built in "Customize Elysium" tool) to change it.

## Layout

- `src/main`: the Electron main process. Sessions (`sessions.ts`, node-pty), projects and templates (`templates.ts`), chats over `claude -p` stream-json (`chat.ts`), hooks telemetry (`ingest.ts`), costs, usage, tokens, updates, onboarding checks (`connect.ts`).
- `src/preload`: the typed IPC bridge only. Every channel is declared in `src/shared/ipc.ts`.
- `src/renderer/src`: the UI. `App.tsx` is the shell, `workspace/` holds the panes, `styles.css` holds every style and the theme tokens.

## Rules for changes

- Match the surrounding code: comment density, naming, idioms. Plain sentences in UI text; no em dashes.
- UI quality bar: calm and glanceable, in the spirit of the Claude and ChatGPT desktop apps. Few things per screen, no dense tables, no loud banners. Use the theme tokens in `styles.css` (`--bg`, `--surface`, `--text`, `--accent`, ...), never fixed colours, so every theme keeps working.
- Never stop, kill or restart `electron.exe` or `claude.exe`: you are running inside the app. When a change is built, tell the person to use Restart Elysium (tray, Settings or Ctrl K).
- Never put personal data (names, paths, clients, tokens) in the code. Per person settings live in the data folder (`%APPDATA%\elysiumprod`): `workspace.json`, `profile.json`, `projects.json`.
- Sessions must always run on the person's Claude plan: `env.ts` strips API keys from every child. Keep it that way.

## Keep it fast

Speed is a feature. Before and after any change that could affect startup, opening a screen, loading its content or scrolling, measure it (for example with `performance.now()` around the work, or the smoke test's timings) and say what changed. Prefer:

- doing work lazily and in the background over blocking the first paint;
- caching slow reads (git, CLIs, transcripts) and reading only what changed;
- one fetch per screen open, not two;
- keeping long lists virtual or capped, and avoiding layout jumps while content loads.

If asked to "make it faster", find where the real time goes first, fix that, and show the before and after numbers.

## Check every change

```
npx tsc --noEmit -p tsconfig.json
npx electron-vite build
```

For a fuller check, an isolated smoke run that never touches real sessions:

```
ELYSIUM_DATA_DIR=<an empty temp folder> node_modules/electron/dist/electron.exe . --smoke
```

It writes `smoke-out/result.json` and screenshots; read them.
