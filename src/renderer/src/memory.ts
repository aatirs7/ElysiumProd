// Plain language for what is using memory, and what to do about it.
import type { ProcGroup } from '@shared/ipc';

const KNOWN: Record<string, { label: string; tip: string }> = {
  chrome: { label: 'Chrome', tip: 'Each tab is its own process. Close tabs you are not using; that frees most of this.' },
  msedge: { label: 'Edge', tip: 'Each tab is its own process. Close tabs you are not using.' },
  firefox: { label: 'Firefox', tip: 'Close tabs you are not using.' },
  code: { label: 'VS Code', tip: 'Close windows for projects you are not editing. Extensions add up too.' },
  claude: { label: 'Claude Code', tip: 'Your agent sessions. End only sessions you have finished with, from their own pane.' },
  node: { label: 'Node.js', tip: 'Dev servers, watchers and builds. Stop the ones you are not using in their terminal.' },
  svchost: { label: 'Windows services', tip: 'Part of Windows. Leave it alone.' },
  msmpeng: { label: 'Microsoft Defender', tip: 'Antivirus. Leave it running.' },
  explorer: { label: 'File Explorer', tip: 'Part of Windows. Leave it alone.' },
  powershell: { label: 'PowerShell', tip: 'Terminals. Close the ones you have finished with.' },
  docker: { label: 'Docker', tip: 'Quit Docker Desktop when you are not using containers. It holds memory even when idle.' },
  'com.docker.backend': { label: 'Docker', tip: 'Quit Docker Desktop when you are not using containers.' },
  vmmem: { label: 'WSL or Docker VM', tip: 'A Linux virtual machine. Run "wsl --shutdown" when you are done with it.' },
  vmmemwsl: { label: 'WSL', tip: 'Run "wsl --shutdown" when you are done with Linux tools.' },
  teams: { label: 'Teams', tip: 'Quit it when you are not in a meeting.' },
  'ms-teams': { label: 'Teams', tip: 'Quit it when you are not in a meeting.' },
  slack: { label: 'Slack', tip: 'Quit and reopen it now and then; it grows over time.' },
  discord: { label: 'Discord', tip: 'Quit it when you are not using it.' },
  spotify: { label: 'Spotify', tip: 'Fine to keep; quit it if memory is tight.' },
  onedrive: { label: 'OneDrive', tip: 'Syncing. Pause it if memory is tight.' },
  msedgewebview2: { label: 'Web views', tip: 'Small windows inside other apps. Closing those apps frees these.' },
  electron: { label: 'ElysiumProd and Electron apps', tip: 'This app and others built the same way.' },
};

export function adviceFor(p: ProcGroup): { label: string; tip: string } {
  const k = KNOWN[p.name.toLowerCase()];
  if (k) return k;
  return { label: p.name, tip: p.windowTitle ? `Open window: ${p.windowTitle}.` : p.agentHost ? 'May be running one of your agents.' : 'Quit it if you are not using it.' };
}
