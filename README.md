# Elysium

One calm place to run all your projects with Claude Code, on Windows.

- **Every project, side by side.** Each project opens with its Claude sessions, terminals, dashboard, Git and any web pages you pin.
- **Hand off work, get told when it is done.** Tell a project what to do from Home, or press Alt Space anywhere in Windows.
- **See what your agents are doing.** Live status, context use, a step by step flow, usage against your plan's limits, and costs per project.
- **Plan without getting in the way.** A planning chat per project that stays current with the code and sends tasks to the builder in one click.
- **PC Helper.** A Claude chat for the computer itself: slow PC, Wi-Fi, disk space, startup apps, battery, security.
- **It changes itself.** Ask Customize Elysium for a theme, a button or a fix, and it edits your copy of the app.

Everything runs on your Claude plan. Elysium never uses API keys.

## Install

You need Windows 10 or 11 and a Claude plan (Pro or Max).

1. Download [`Install Elysium.cmd`](setup/Install%20Elysium.cmd) and double click it. Or paste this into PowerShell:

   ```
   irm https://raw.githubusercontent.com/aatirs7/ElysiumProd/main/setup/install.ps1 | iex
   ```

2. It installs Git, Node.js and Claude Code if you do not have them, puts your own copy of Elysium in `%LOCALAPPDATA%\Elysium\app`, builds it, and adds Elysium to the Start menu and desktop.
3. Elysium opens on a short setup: pick a look, sign in to Claude (and GitHub, Vercel or Neon if you use them), and choose your projects.

## Updates

Settings, Updates, **Get updates**. Your own changes are kept: they are saved first and the new version is merged in. If the two clash, nothing is changed and Customize Elysium can combine them for you.

## For developers

```
npm ci
npm run dev                 # hot reload
npx tsc --noEmit -p tsconfig.json
npx electron-vite build
```

See `CLAUDE.md` for how the code is laid out and the rules for changes.
