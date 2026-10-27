// What a new project is: an iOS app, a web app, or anything else. A kind writes
// its working rules into the new folder (AGENTS.md, with CLAUDE.md pointing at it)
// and gives the project's Claude session a first message that scaffolds the app
// with the newest tools and asks the owner what the app is. Nothing here pins a
// version or holds anyone's accounts: the session reads current docs and asks.
import type { ProjectKind } from '@shared/ipc';

interface Kind { agents: (name: string) => string; kickoff: (name: string) => string }

const COMMON = [
  'No em dashes, in code, comments, UI copy or commit messages. Use commas, periods or parentheses.',
  'Never commit secrets: keys, tokens, .env files, certificates or anything a CLI prints as a credential.',
  'Before saying something works, run the checks below and say what you ran and what it printed.',
];

const KINDS: Record<Exclude<ProjectKind, 'blank'>, Kind> = {
  ios: {
    agents: (name) => [
      `# ${name}`, '',
      'An iOS app built with Expo and EAS, developed on Windows. There is no Xcode on this PC: builds run in the cloud with EAS, and the app is tried on a phone through a development build or Expo Go.', '',
      'Rules:', '',
      '1. Read the versioned Expo docs for the SDK in package.json (https://docs.expo.dev/versions/) before writing code against an Expo module. The APIs change between SDKs and older recollections are unreliable.',
      '2. TypeScript in strict mode, screens with Expo Router.',
      '3. Colours, spacing and type live in one theme file under src/theme. A colour literal in a screen is a bug.',
      '4. Anything in an EXPO_PUBLIC_ variable is inlined into the app bundle and is therefore public. Secrets stay on a server.',
      '5. Never commit Apple credentials, .p8 keys, provisioning profiles or what `eas credentials` prints.',
      '6. Ask before a production build or `eas submit`: they use build minutes and reach Apple.',
      ...COMMON.map((x, i) => `${i + 7}. ${x}`), '',
      'Checks: `npx tsc --noEmit` and `npx expo-doctor`.', '',
      'Builds: `eas build --platform ios --profile development` (a build for your phone), `preview` (to share), `production` (the App Store), then `eas submit --platform ios`.', '',
    ].join('\n'),
    kickoff: (name) => [
      `This is a new iOS app, ${name}. Read AGENTS.md first and follow it.`,
      'Then:',
      '1. Ask me what the app is, who it is for, the bundle identifier (like com.company.app) and the look I want. Wait for my answers before building anything.',
      '2. Scaffold it with the latest create-expo-app (TypeScript, Expo Router). This folder already has AGENTS.md, CLAUDE.md, README.md and git. If create-expo-app will not use a folder that is not empty, scaffold into a temporary folder beside this one and move everything in, keeping those files.',
      '3. Set the name, slug, scheme and bundle identifier in app.json, add eas.json with development, preview and production profiles, and make the theme file.',
      '4. Run the checks in AGENTS.md, commit, and tell me in a few short steps how to see it on my iPhone (eas login, then a development build or Expo Go).',
    ].join('\n'),
  },
  web: {
    agents: (name) => [
      `# ${name}`, '',
      'A web app built with Next.js (App Router), TypeScript and Tailwind, deployed on Vercel.', '',
      'Rules:', '',
      '1. Read the Next.js docs for the version in package.json before using an API you are not sure of. It changes between major versions.',
      '2. TypeScript in strict mode. Server code stays on the server: only NEXT_PUBLIC_ variables reach the browser, and those are public.',
      '3. Colours and type come from one set of theme tokens. A colour literal in a component is a bug.',
      '4. Ask before deploying to production or changing a Vercel project setting.',
      ...COMMON.map((x, i) => `${i + 5}. ${x}`), '',
      'Checks: `npx tsc --noEmit`, `npm run lint` and `npm run build`.', '',
    ].join('\n'),
    kickoff: (name) => [
      `This is a new web app, ${name}. Read AGENTS.md first and follow it.`,
      'Then:',
      '1. Ask me what it is, who it is for and the look I want. Wait for my answers before building anything.',
      '2. Scaffold it with the latest create-next-app (TypeScript, App Router, Tailwind, ESLint). This folder already has AGENTS.md, CLAUDE.md, README.md and git. If create-next-app will not use a folder that is not empty, scaffold into a temporary folder beside this one and move everything in, keeping those files.',
      '3. Build a first screen in the look I describe, run the checks in AGENTS.md, commit, and tell me how to run it locally and how to put it on Vercel.',
    ].join('\n'),
  },
};

/** The files a kind adds to a new project's folder: name to contents. */
export function kindFiles(kind: ProjectKind | undefined, name: string): Record<string, string> {
  const k = kind && kind !== 'blank' ? KINDS[kind] : undefined;
  return k ? { 'AGENTS.md': k.agents(name), 'CLAUDE.md': '@AGENTS.md\n' } : {};
}

/** The first message the project's Claude session gets, or null for a blank project. */
export function kindKickoff(kind: ProjectKind | undefined, name: string): string | null {
  const k = kind && kind !== 'blank' ? KINDS[kind] : undefined;
  return k ? k.kickoff(name) : null;
}
