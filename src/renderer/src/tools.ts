// Tools: the built in sessions that are not projects, and one click checks that
// hand the PC Helper a specific job. Each check is a plain request; the session
// looks, explains and asks before changing anything.
import { Activity, BatteryMedium, Gauge, HardDrive, Power, ShieldCheck, Wand2, Wifi, Wrench, type LucideIcon } from 'lucide-react';

export interface ToolCheck { id: string; title: string; blurb: string; icon: LucideIcon; prompt: string }

export const TOOL_INFO: Record<string, { title: string; tagline: string; icon: LucideIcon; about: string; examples: string[] }> = {
  laptop: {
    title: 'PC Helper',
    tagline: 'Audit and fix this computer with Claude.',
    icon: Wrench,
    about: 'Not tied to any project and keeps nothing important. Use it when the PC is slow, the Wi-Fi drops, the disk is full or something just feels off. It looks first, explains what it found in plain words, and asks before changing anything.',
    examples: ['Why is my laptop slow right now?', 'Why does my Wi-Fi keep dropping?', 'What is filling up my disk?', 'Is anything odd running in the background?'],
  },
  elysiumprod: {
    title: 'Customize Elysium',
    tagline: 'Change this app by asking.',
    icon: Wand2,
    about: 'Elysium can change itself. Describe what you want, a new theme, a button, a page or a fix, and this session edits the app, checks that it builds, and tells you when to restart to load it.',
    examples: ['Add a theme that looks like Solarized', 'Make the sidebar narrower', 'Add a button to the top bar that opens my email', 'Make Home load faster'],
  },
};

export const CHECKS: ToolCheck[] = [
  { id: 'speed', title: 'Speed check', blurb: 'What is using memory and CPU, and what to close', icon: Gauge,
    prompt: 'Run a speed check on this PC: memory and CPU use right now, the programs using the most, and anything stuck or leaking. Tell me in plain words what is slowing it down and what you would close or change. Do not change anything yet.' },
  { id: 'disk', title: 'Disk space', blurb: 'What is filling the drive, and what is safe to clear', icon: HardDrive,
    prompt: 'Audit disk space on this PC: free space per drive, the biggest folders, caches, temp files, old installers, duplicate downloads, and Windows cleanup candidates. List what is safe to clear and how much each frees. Do not delete anything until I say yes.' },
  { id: 'wifi', title: 'Wi-Fi check', blurb: 'Signal, speed, drops and DNS', icon: Wifi,
    prompt: 'Check the Wi-Fi and network on this PC: adapter, signal strength, link speed, recent disconnects in the event log, DNS and latency to a few well known hosts, and driver age. Tell me what looks wrong and what would help. Do not change settings yet.' },
  { id: 'startup', title: 'Startup apps', blurb: 'What starts with Windows and slows boot', icon: Power,
    prompt: 'List everything that starts with Windows on this PC (startup apps, scheduled tasks at logon, services set to automatic that are not Microsoft) with what each is and whether it is needed. Recommend what to turn off. Do not change anything yet.' },
  { id: 'battery', title: 'Battery health', blurb: 'Wear, cycles and what drains it', icon: BatteryMedium,
    prompt: 'Check battery health on this PC: generate the Windows battery report, read design versus full charge capacity and cycle count, and find what drains it most (power plan, apps, sleep settings). Summarize the health in plain words.' },
  { id: 'security', title: 'Security check', blurb: 'Updates, Defender, firewall and odd processes', icon: ShieldCheck,
    prompt: 'Run a security check on this PC: Windows Update status, Defender and firewall state, recent threats, accounts with admin rights, unsigned or odd processes, and programs listening on the network. Report anything that needs attention. Do not change anything yet.' },
  { id: 'health', title: 'Full check-up', blurb: 'All of the above, in one short report', icon: Activity,
    prompt: 'Give this PC a full check-up: speed, disk space, Wi-Fi, startup apps, battery and security. Keep it to one short report with a score for each and the top three things to fix. Do not change anything yet.' },
];
