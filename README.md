# ElysiumProd

A personal multi-agent development cockpit for Claude Code on Windows ARM64. Read `SPEC.md` for the design, `AUDIT-SUMMARY.md` for why it looks the way it does, and `PHASE0.md` for what was proven on this machine.

Status: Phase 1, one terminal.

## Run

```
npm install
node node_modules/electron/install.js   # only if the Electron binary did not download
npm run dev                             # development, with hot reload
npm run build && npm start              # production build
```

## Check

```
npm run typecheck
npm test                                # scrollback rotation, age and size caps
npm run smoke                           # builds, opens a PowerShell pane through the UI, echoes,
                                        # checks xterm and scrollback, saves smoke-out/window.png, quits
```

The smoke test only uses the PowerShell template. It never starts or resumes a Claude session.

## Where things live

- `src/main`: sessions, scrollback, resources and the spawn gate, child env scrubbing, finding `claude.exe`.
- `src/preload`: the typed IPC bridge, and nothing else.
- `src/renderer`: React UI.
- `src/shared/ipc.ts`: the IPC contract.
- `%APPDATA%\elysiumprod\scrollback`: session logs in 10 MB segments, newest two kept per session, 30 days, 1 GB total.
- `spike/`: the Phase 0 harness, kept for reference.
