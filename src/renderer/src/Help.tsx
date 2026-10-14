import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronDown, CircleDollarSign, Keyboard, Layers, Lightbulb, LifeBuoy, Palette, Rocket, Search, ShieldCheck, Sparkles, SquareTerminal, Wrench, type LucideIcon } from 'lucide-react';

interface QA { q: string; a: React.ReactNode; words?: string }
interface Topic { id: string; title: string; blurb: string; icon: LucideIcon; items: QA[] }

const K = ({ children }: { children: React.ReactNode }) => <kbd>{children}</kbd>;

const TOPICS: Topic[] = [
  {
    id: 'start', title: 'Getting started', blurb: 'What Elysium is and your first five minutes', icon: Rocket,
    items: [
      { q: 'What is Elysium for?', a: <p>It is one window for all your projects and their Claude Code sessions. Each project opens with its sessions, a dashboard, Git, and any web pages you pin, side by side. You hand off work, Elysium tells you when it is done, and you can see what every agent is doing at a glance.</p> },
      { q: 'How do I add a project?', a: <p>Press the <K>+</K> beside Projects in the sidebar. Clone one from GitHub, start a new one, or pick a folder you already have. Setup also offers the Git folders it finds on your PC.</p>, words: 'new clone add folder' },
      { q: 'How do I start working in one?', a: <p>Click it in the sidebar. Its Claude session starts by itself and picks up where it left off. Type to it like any terminal; every Claude Code command works, because it is the real Claude Code.</p> },
      { q: 'Does closing the window stop my sessions?', a: <p>No. Elysium keeps running in the tray so sessions and background tasks carry on. Quit from the tray icon to stop everything. To load a new version, use <strong>Restart Elysium</strong> in the tray, Settings or <K>Ctrl K</K>; it brings back what was running.</p>, words: 'tray quit restart' },
      { q: 'Can I see setup again?', a: <p>Yes: Settings, then <strong>Show setup again</strong>.</p>, words: 'onboarding welcome' },
    ],
  },
  {
    id: 'sessions', title: 'Projects and sessions', blurb: 'Start, compact, wrap up, and keep an eye on them', icon: SquareTerminal,
    items: [
      { q: 'What can I do with a project from the sidebar?', a: <p>Hover it and press <strong>⋯</strong>, or right click it: open, start its sessions, compact, wrap up and end, end now, open its dashboard or folder, add its sessions to a layout, or unpin it. Its running sessions are listed right under it.</p>, words: 'menu right click end start' },
      { q: 'What does Compact do?', a: <p>It frees up a session's context without losing work: the session finishes its step and saves notes, compacts, then carries on. It also happens on its own when a session passes the percent set in Settings.</p> },
      { q: 'What does Wrap up do?', a: <p>Every session in the project reaches a clean stopping point, saves what is unfinished, and closes by itself. If one needs you first, you get a notification.</p>, words: 'stop close end' },
      { q: 'How do I hand off a task without opening the project?', a: <p>Type it into the box on Home, for example "Tell Website to fix the footer", or press <K>Alt Space</K> anywhere in Windows. It runs in the background and you get a notification when it is done.</p>, words: 'quick alt space command home' },
      { q: 'What is the Flow button?', a: <p>A live picture of each session's steps as they happen: editing, running, searching. A short summary on top is optional and uses a little of your Claude usage.</p> },
      { q: 'Can I run two sessions on one project?', a: <p>Yes. When you add a project, choose a pair: two sessions that split the work and message each other.</p>, words: 'pair prime meridian' },
      { q: 'Why does a session say it cannot start?', a: <p>The reason shows in the pane. If memory or disk is very low, press <strong>Start anyway</strong>. The memory pill at the bottom left shows free memory and disk.</p>, words: 'error memory disk' },
    ],
  },
  {
    id: 'plan', title: 'Planning chat', blurb: 'Think it through, then send it to the builder', icon: Lightbulb,
    items: [
      { q: 'Where do I plan, price or strategize?', a: <p>Press <strong>Plan</strong> in a project's top bar. It is a chat that knows the project but never edits code, so you can talk about product, pricing, launch or priorities without getting in the coding session's way.</p>, words: 'business market strategy' },
      { q: 'How does it stay up to date?', a: <p>Every message you send carries a fresh context pack: recent commits, open tasks, and what the coding sessions said lately. It can also read the project's files. No relay or connector needed.</p> },
      { q: 'How do I turn a decision into work?', a: <p>When you settle something, the chat ends with a task. Press <strong>Send this task to the builder</strong> and the project's session gets it.</p> },
    ],
  },
  {
    id: 'tools', title: 'Tools', blurb: 'PC Helper and Customize Elysium', icon: Wrench,
    items: [
      { q: 'What is the PC Helper?', a: <p>A Claude chat for this computer itself, not a project. Ask why it is slow, why the Wi-Fi drops or what fills the disk. It looks first, explains in plain words, and asks before changing anything.</p>, words: 'laptop wifi slow disk' },
      { q: 'What are the one click checks?', a: <p>Under PC Helper in the sidebar: speed, disk space, Wi-Fi, startup apps, battery, security, or a full check-up. Each runs a careful audit and reports back.</p> },
      { q: 'How do I change Elysium itself?', a: <p>Open <strong>Customize Elysium</strong> under Tools and ask: "add a theme", "make the sidebar narrower", "fix this". It edits the app, checks it builds, and tells you to restart to load it.</p>, words: 'customize change edit app builder' },
    ],
  },
  {
    id: 'look', title: 'Look and layout', blurb: 'Themes, panes, layouts and colours', icon: Palette,
    items: [
      { q: 'How do I change the theme?', a: <p>The sun or moon button in the top bar lists all fourteen themes. Settings, Appearance also sets the accent colour, text size and spacing.</p>, words: 'theme dark light color accent' },
      { q: 'How do I add or arrange panes?', a: <p>Press <K>+</K> at the top right of any pane group, or <K>Ctrl K</K>. Drag a tab to an edge to split, onto another group to stack, or float it.</p>, words: 'pane split drag float' },
      { q: 'Can I colour a pane?', a: <p>Right click its tab and pick a colour. It is saved with the view.</p> },
      { q: 'What are layouts?', a: <p>Views of your own that mix panes from any project. Add a project's sessions to one from its ⋯ menu.</p>, words: 'view layout' },
    ],
  },
  {
    id: 'costs', title: 'Costs and usage', blurb: 'What you spend and how close you are to limits', icon: CircleDollarSign,
    items: [
      { q: 'What does the Costs page add up?', a: <p>This month per project: Vercel from its billing figures, Neon estimated from usage, AWS when a project reports it, and any cost you add yourself.</p>, words: 'vercel neon aws money' },
      { q: 'How do I add a subscription or any other cost?', a: <p>On Costs, under Your other costs: pick a preset like Claude Max, or Add a cost. Set it monthly, yearly or one off, give it a category, and tie it to a project if you like.</p>, words: 'subscription fixed cost add' },
      { q: 'What are the numbers in the top bar?', a: <p>Each Claude account's five hour and weekly use. Click them for bars, reset times, and which sessions are running on each account.</p>, words: 'usage limit account' },
      { q: 'What is Your stats?', a: <p>Agent time from your Claude Code sessions on this PC, plus commits from Git. Message content is never read.</p>, words: 'stats hours streak' },
    ],
  },
  {
    id: 'accounts', title: 'Accounts and connections', blurb: 'Claude accounts, GitHub, Vercel, Neon', icon: Sparkles,
    items: [
      { q: 'Can I use more than one Claude account?', a: <p>Yes. Add one in setup (Settings, Show setup again, Connect). Each project can use its own account, chosen in Settings, and all stay signed in at once.</p>, words: 'account login multiple' },
      { q: 'How do I connect GitHub, Vercel or Neon?', a: <p>In setup's Connect step. Each sign in happens in that tool's own login window; Elysium never sees a password.</p>, words: 'github vercel neon login' },
    ],
  },
  {
    id: 'keys', title: 'Shortcuts', blurb: 'The keys worth knowing', icon: Keyboard,
    items: [
      { q: 'Keyboard shortcuts', a: <ul><li><K>Ctrl K</K> search and run anything</li><li><K>Alt Space</K> hand a project a task from anywhere</li><li><K>Ctrl 0</K> Home</li><li><K>Ctrl ,</K> Settings</li><li><K>Ctrl Shift T</K> new PowerShell</li><li><K>Ctrl V</K> in a Claude pane pastes a picture too</li><li>Middle click a tab to close it</li></ul>, words: 'keyboard hotkey' },
    ],
  },
  {
    id: 'privacy', title: 'Privacy', blurb: 'What stays on your PC', icon: ShieldCheck,
    items: [
      { q: 'What leaves my computer?', a: <p>Nothing beyond what Claude, GitHub and the tools you connect already receive. Everything else stays on this PC.</p> },
      { q: 'What is stored?', a: <p>Terminal output for 30 days, capped at 1 GB. Session telemetry keeps numbers only: context, state, cost and limits. Chats keep their messages so you can scroll back.</p>, words: 'data scrollback' },
    ],
  },
  {
    id: 'stats', title: 'Troubleshooting', blurb: 'When something looks wrong', icon: LifeBuoy,
    items: [
      { q: 'A pane looks broken or empty', a: <p>Settings, Start over, Reset this view. Your sessions and history are kept.</p> },
      { q: 'The quick task shortcut does nothing', a: <p>Another app may own <K>Alt Space</K>. Pick another in Settings.</p> },
      { q: 'A web page will not sign in', a: <p>Use email sign in, or the open in browser button. Some Google sign ins refuse embedded windows.</p> },
      { q: 'Elysium feels slow', a: <p>Ask Customize Elysium: "make it faster, measure before and after". It looks for the real cause and proves the fix.</p>, words: 'slow performance' },
    ],
  },
];

export function Help() {
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return TOPICS.flatMap((t) => t.items.filter((i) => `${i.q} ${i.words ?? ''} ${t.title}`.toLowerCase().includes(s)).map((i) => ({ t, i })));
  }, [q]);
  const current = TOPICS.find((t) => t.id === topic);

  return (
    <div className="page page-enter">
      <div className="page-inner help">
        {!current && (
          <header className="help-hero">
            <span className="help-hero-icon"><Layers size={22} /></span>
            <h1>How can we help?</h1>
            <label className="help-search">
              <Search size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, for example compact, costs, theme" aria-label="Search help" autoFocus />
            </label>
          </header>
        )}

        {hits && !current && (
          <div className="help-results">
            {hits.map(({ t, i }) => <Item key={`${t.id}-${i.q}`} item={i} tag={t.title} open={open === i.q} toggle={() => setOpen(open === i.q ? null : i.q)} />)}
            {!hits.length && <p className="help-none">Nothing matches. Try another word, or ask Customize Elysium below.</p>}
          </div>
        )}

        {!hits && !current && (
          <div className="help-grid">
            {TOPICS.map((t, n) => (
              <button key={t.id} className="help-card" style={{ animationDelay: `${n * 35}ms` }} onClick={() => { setTopic(t.id); setOpen(t.items[0]?.q ?? null); }}>
                <span className="help-card-icon"><t.icon size={18} /></span>
                <strong>{t.title}</strong>
                <span>{t.blurb}</span>
                <em>{t.items.length} answer{t.items.length > 1 ? 's' : ''}</em>
              </button>
            ))}
          </div>
        )}

        {current && (
          <div className="help-topic">
            <button className="link-btn help-back" onClick={() => setTopic(null)}><ArrowLeft size={14} />All topics</button>
            <div className="help-topic-head"><span className="help-card-icon"><current.icon size={18} /></span><h1>{current.title}</h1></div>
            {current.items.map((i) => <Item key={i.q} item={i} open={open === i.q} toggle={() => setOpen(open === i.q ? null : i.q)} />)}
          </div>
        )}

        <div className="help-ask">
          <span><strong>Still stuck?</strong> Customize Elysium knows this app inside out. Ask it anything, or ask it to change how something works.</span>
          <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent('ep:open-tool', { detail: 'elysiumprod' }))}>Ask it<ArrowUpRight size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function Item({ item, open, toggle, tag }: { item: QA; open: boolean; toggle(): void; tag?: string }) {
  return (
    <div className={`help-item ${open ? 'open' : ''}`}>
      <button className="help-q" onClick={toggle} aria-expanded={open}>
        <span>{item.q}</span>
        {tag && <em>{tag}</em>}
        <ChevronDown size={16} />
      </button>
      {open && <div className="help-a">{item.a}</div>}
    </div>
  );
}
