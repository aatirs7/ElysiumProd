// Demo mode (ELYSIUM_DEMO=1): walk through setup without real sign ins. Connections
// start disconnected and "connect" a moment after you press the button; the
// project scan shows sample folders; adding them pretends to succeed. Nothing
// leaves this PC and no window opens. Use with its own ELYSIUM_DATA_DIR.
import type { ConnectService, ConnectStatus, RepoCandidate } from '@shared/ipc';

export const DEMO = process.env.ELYSIUM_DEMO === '1';

interface Fake { installed: boolean; signedIn: boolean; who: string | null }
const state: Record<ConnectService, Fake> = {
  claude: { installed: true, signedIn: false, who: null },
  git: { installed: true, signedIn: true, who: null },
  github: { installed: false, signedIn: false, who: null },
  vercel: { installed: true, signedIn: false, who: null },
  neon: { installed: true, signedIn: false, who: null },
};
const accounts: { id: string; configDir: string; signedIn: boolean }[] = [{ id: 'main', configDir: 'C:\\Users\\you\\.claude', signedIn: false }];
const WHO: Partial<Record<ConnectService, string>> = { github: 'you-on-github', vercel: 'you-on-vercel' };

const META: Record<ConnectService, { name: string; what: string; required: boolean }> = {
  claude: { name: 'Claude Code', what: 'Runs every session. Add more accounts to run more at once.', required: true },
  git: { name: 'Git', what: 'Tracks changes in your projects.', required: true },
  github: { name: 'GitHub', what: 'Clone repositories, see issues and pull requests.', required: false },
  vercel: { name: 'Vercel', what: 'Deploys and what each project costs to host.', required: false },
  neon: { name: 'Neon', what: 'Database usage and cost per project.', required: false },
};

export function demoConnections(): ConnectStatus[] {
  state.claude.signedIn = accounts.some((a) => a.signedIn);
  return (Object.keys(META) as ConnectService[]).map((id) => ({ id, ...META[id], ...state[id], ...(id === 'claude' ? { accounts: accounts.map((a) => ({ ...a })) } : {}) }));
}

export function demoConnect(service: ConnectService, action: 'install' | 'signin', accountId?: string): { ok: boolean; reason: string | null } {
  setTimeout(() => {
    if (action === 'install') { state[service].installed = true; return; }
    if (service === 'claude') { const a = accounts.find((x) => x.id === (accountId ?? 'main')); if (a) a.signedIn = true; return; }
    state[service].signedIn = true;
    state[service].who = WHO[service] ?? null;
  }, 1800);
  return { ok: true, reason: null };
}

export function demoAddAccount(name: string): { ok: boolean; reason: string | null; accountId?: string } {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  if (!slug || slug === 'main') return { ok: false, reason: 'Give it a short name, like work or personal.' };
  if (!accounts.some((a) => a.id === slug)) accounts.push({ id: slug, configDir: `C:\\Users\\you\\.claude-${slug}`, signedIn: false });
  demoConnect('claude', 'signin', slug);
  return { ok: true, reason: null, accountId: slug };
}

export function demoRepos(): RepoCandidate[] {
  const day = 86400000;
  return [
    ['storefront', 'C:\\Users\\you\\Projects\\storefront', 0], ['marketing-site', 'C:\\Users\\you\\Projects\\marketing-site', 1],
    ['mobile-app', 'C:\\Users\\you\\Projects\\mobile-app', 2], ['api-server', 'C:\\Users\\you\\Documents\\api-server', 4],
    ['portfolio', 'C:\\Users\\you\\portfolio', 9], ['invoice-tool', 'C:\\Users\\you\\Documents\\invoice-tool', 21],
    ['discord-bot', 'C:\\Users\\you\\discord-bot', 40], ['thesis-notes', 'C:\\Users\\you\\Documents\\thesis-notes', 120],
  ].map(([name, folder, ago]) => ({ name: String(name), folder: String(folder), touchedAt: new Date(Date.now() - Number(ago) * day).toISOString() }));
}
