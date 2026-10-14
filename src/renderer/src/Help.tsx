import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

interface Article { id: string; title: string; body: React.ReactNode; words: string }

const K = ({ children }: { children: React.ReactNode }) => <kbd>{children}</kbd>;

const ARTICLES: Article[] = [
  {
    id: 'start', title: 'Getting started', words: 'start begin home overview first',
    body: (<>
      <p>ElysiumProd is where your projects, their Claude sessions, your planning chat and your board live together, in one window, instead of several VS Code windows and browser tabs.</p>
      <ol>
        <li>Open a project from the sidebar or from Home. Each project has its own view with its sessions, Claude, relay and tasks.</li>
        <li>Start a session from the Launch pane. For a main project that is Prime or Meridian; for a side project it is its one Claude session.</li>
        <li>Work in the terminal exactly as before. Every slash command and skill works, because it is the real Claude Code.</li>
      </ol>
      <p>Close the window and ElysiumProd keeps running in the tray, so sessions and quick tasks carry on. Reopening shows that same copy. To load a new version, use <strong>Restart ElysiumProd</strong>: in Settings, in <K>Ctrl K</K>, or by right-clicking the tray icon. Quit from the tray menu to stop it completely.</p>
    </>),
  },
  {
    id: 'projects', title: 'Projects and accounts', words: 'project pin account ashraf login switch history resume fresh',
    body: (<>
      <p>Every project you worked on in the last 20 days is listed in Settings, under Projects. Pin the ones you want in the sidebar and on Home.</p>
      <h3>Two Claude accounts at once</h3>
      <p>Each project uses one Claude account, chosen in Settings. Its terminals start on that account and its Claude pane signs in to that account. Both accounts stay signed in side by side, so you never log out to switch.</p>
      <h3>Resume or start fresh</h3>
      <p>A session's history belongs to the account it ran on. If you move a project to an account that has no history for it, its sessions start fresh there under the same name. Settings tells you when this applies.</p>
    </>),
  },
  {
    id: 'panes', title: 'Panes, views and presets', words: 'pane split drag tab float maximize view preset layout widget add',
    body: (<>
      <ul>
        <li><strong>Add a pane:</strong> the <K>+</K> at the top right of any pane group, or <K>Ctrl K</K> and type what you want.</li>
        <li><strong>Arrange:</strong> drag a tab to an edge to split, onto another group to stack, or press the float button to pop it out.</li>
        <li><strong>Focus:</strong> the maximize button fills the window with one group; press it again to restore.</li>
        <li><strong>Views:</strong> each project has its own view. Make extra views of your own with <K>+</K> next to Views in the sidebar. Double click a view to rename it.</li>
        <li><strong>Presets:</strong> Settings, Presets saves this view's panes and your appearance under a name, like a car's seat memory. Apply it any time. A preset never starts a Claude session by itself; its terminals wait for you to press Start.</li>
      </ul>
    </>),
  },
  {
    id: 'sessions', title: 'Sessions and terminals', words: 'terminal session prime meridian context meter compact name rename drift restart close',
    body: (<>
      <p>Each Claude session runs in a terminal pane. Its tab shows a small bar for how full its context is. It turns amber at 75 percent and red at 85 percent, the same points where your plugin warns and then compacts.</p>
      <p>The number counts the input side only and updates after each turn, so it trails the conversation by one turn.</p>
      <h3>Reader and terminal styles</h3>
      <p>Each Claude pane has a Terminal and a Reader switch at its top right. Reader shows the conversation as a calm page: your prompts as quiet quotes and Claude's replies as formatted text, with a reply box at the bottom. Settings, Appearance, Terminal style switches the terminal between Soft dark, a light Paper style like Notion, and the app theme.</p>
      <h3>Getting a session back</h3>
      <p>In a project, the top bar always shows Prime and Meridian. Click one to show it; if it is not running, you are asked whether to start it. Opening a session that is already running, from the top bar, the <K>+</K> menu or <K>Ctrl K</K>, shows the same session again rather than starting a second copy.</p>
      <h3>Two terminals stacked</h3>
      <p>Start Prime and Meridian from the Launch pane and they open one above the other. Ctrl K, Stack terminals rearranges any view's terminals into one column.</p>
      <h3>Wrap up</h3>
      <p>When a project has sessions running, its top bar shows <strong>Wrap up</strong>. Every Claude session in the project is asked to bring its current step to a clean stopping point, commit or note what is unfinished, and update its resume note and relay line. Each one then closes by itself. If one stops to ask you something, you get a notification first.</p>
      <h3>Compact</h3>
      <p>Beside Wrap up, <strong>Compact</strong> frees up context without losing work. Each session first finishes its current step and saves its resume note and relay line, then compacts and carries on. It also happens by itself when a session passes the percent set in Settings, under Sessions. To compact one session only, right-click its tab.</p>
      <h3>Dashboard</h3>
      <p>Every project has a <strong>Dashboard</strong> tab beside Claude, and a Dashboard button in the top bar. It shows what waits on you, open tasks, this week's commits and agent time, and this month's cost. Its links, such as your admin page or team board, open beside your terminals and stay signed in. Every link in a project shares one saved sign in, kept for 30 days. Use <strong>Ask for something here</strong> to describe a change; it goes to the ElysiumProd Builder session, which builds it, tests it and pushes it. Restart Elysium to load what it built.</p>
      <h3>Live flow</h3>
      <p>Click <strong>Flow</strong> in a project's top bar to see each session's steps drawn as they happen: editing, running, searching, messaging the other session. The steps cost nothing. The short summary on top comes from Sonnet 5.5, at most every five minutes per session and only while the pane shows; it counts toward the main account's limits, and you can turn it off in the pane.</p>
      <h3>iOS</h3>
      <p>The <strong>iOS</strong> project is one Claude session that works across all your iOS apps. Pin it from the plus beside Projects. Its dashboard opens App Store Connect, TestFlight, Apple Developer and Expo, and sign ins there are kept.</p>
      <h3>Costs</h3>
      <p><strong>Costs</strong> in the sidebar adds up this month across Vercel, Neon and AWS, plus fixed subscriptions you enter, per project. Vercel is what is billed after your plan's credit. Neon is estimated from usage, since its Launch plan has no billing figures. AWS comes from the SecurITPosture plugin's daily check.</p>
      <h3>Pane colours</h3>
      <p>Right-click any tab to give its pane a colour. The tab bar takes a soft tint and the pane a coloured edge, so Prime, Meridian and the rest are easy to tell apart. The colour is saved with the view.</p>
      <h3>Chat watcher and usage</h3>
      <p>In a project with a chat watcher, the top bar shows <strong>Watcher on</strong> or <strong>Watcher off</strong>. Clicking it tells the sessions to start or stop the watcher. Turning it off also ends the watcher program. The figures on the right of the top bar are each Claude account's five hour and weekly use, as its sessions last reported them.</p>
      <h3>Replies while you are away</h3>
      <p>When a session you are not looking at replies or needs you, a card appears in the top right corner. Click it to jump there. With the window in the background you get a Windows notification instead. Turn this off in Settings, under Sessions.</p>
      <h3>Name drift</h3>
      <p>Prime and Meridian find each other by name. If a session is running under a different name than expected, its tab shows a warning; click it to rename the session back while it is idle.</p>
      <h3>Moving and closing</h3>
      <p>Moving, floating or switching away from a terminal never stops it. Closing its tab does. The sidebar dot shows each project's state: green running, pulsing working, amber waiting on you.</p>
    </>),
  },
  {
    id: 'claude', title: 'The Claude pane', words: 'claude web chat planning send terminal sign in google browser pin pinned same chat sidebar',
    body: (<>
      <p>The Claude pane is claude.ai beside your terminals, for planning chats. It uses the project's account, and the picker in its toolbar switches it.</p>
      <ul>
        <li><strong>Open the same chat every time:</strong> open the chat you plan this project in (or a Claude Project), then press <strong>Pin chat</strong> in the pane's toolbar. From then on the project's Claude pane opens straight to it, and the home button returns to it. Press Pinned again to unpin.</li>
        <li><strong>Hide claude.ai's chat list:</strong> use the panel button at the top left of claude.ai's own sidebar. The pane remembers it.</li>
        <li><strong>Send to terminal:</strong> copy text in the chat, then press Send to terminal. It is pasted into the terminal you last used, without pressing Enter, so you can read it first.</li>
        <li><strong>Tasks between them:</strong> notes you post to the board from the chat still reach Prime through your connectors and the watcher, as before.</li>
        <li><strong>Trouble signing in:</strong> use email sign in, or the open in browser button. Some Google sign ins refuse embedded windows.</li>
      </ul>
    </>),
  },
  {
    id: 'quick', title: 'Quick tasks from anywhere', words: 'quick alt space shortcut background task notification tray',
    body: (<>
      <ol>
        <li>Press <K>Alt Space</K> anywhere in Windows. You can change the shortcut in Settings.</li>
        <li>Type a project, for example Elysium Builds, and press <K>Tab</K> or <K>Enter</K>.</li>
        <li>Type the task and press <K>Enter</K>.</li>
      </ol>
      <p>The project's lead session, Prime or its single session, starts in the background on the project's account, receives the task, and gets to work. A Windows notification tells you when it is done or needs you; click it to open that session.</p>
    </>),
  },
  {
    id: 'relay', title: 'Relay, tasks and watchers', words: 'relay tasks board watcher github needs me waiting',
    body: (<>
      <p><strong>Relay</strong> shows what is waiting on you first, then what each session is doing now. Read the full relay underneath when you need it.</p>
      <p><strong>Tasks</strong> lists the project's open board issues. Needs me is the default: decisions and anything labelled for you. Click one to open it on GitHub.</p>
      <p><strong>Watchers</strong> (Settings, In the background) watch the board for new tasks. Show only lists them; Hand to Prime also types a new task into Prime, but only while Prime is idle. Turn off the watcher inside Prime when you turn this on, so tasks are not announced twice.</p>
    </>),
  },
  {
    id: 'memory', title: 'Memory', words: 'memory ram slow free end close chrome vscode auto',
    body: (<>
      <p>The memory pill at the bottom of the sidebar shows how much RAM is in use. Click it to see what uses the most and what to do about each one.</p>
      <ul>
        <li>Around 70 to 85 percent is normal on Windows; spare memory is kept busy as cache.</li>
        <li>Above 85 percent, closing the top programs frees the most. Browser tabs and VS Code windows are usually the biggest.</li>
        <li><strong>End</strong> closes a program after you confirm. Windows itself is protected and never listed.</li>
        <li><strong>Auto free memory</strong> is off until you turn it on. It only ends programs you marked Auto, and only above the threshold you set.</li>
      </ul>
      <p>New sessions are paused if memory passes 97 percent or free disk falls under 8 GB, so the laptop never grinds to a halt.</p>
    </>),
  },
  {
    id: 'stats', title: 'Your stats', words: 'stats hours usage streak commits week',
    body: (<p>Your stats counts agent time in ten minute blocks from the timestamps in your Claude Code sessions on this machine, plus commits and changed lines from git. Message content is never read. Automated commits, such as the daily tracker commit, are not counted.</p>),
  },
  {
    id: 'keys', title: 'Keyboard shortcuts', words: 'keyboard shortcut keys hotkey',
    body: (<ul>
      <li><K>Ctrl K</K> search and run anything</li>
      <li><K>Ctrl 0</K> Home</li>
      <li><K>Ctrl ,</K> Settings</li>
      <li><K>Ctrl Shift T</K> new PowerShell</li>
      <li><K>Alt Space</K> quick task, from anywhere in Windows</li>
      <li>Middle click a tab to close it</li>
    </ul>),
  },
  {
    id: 'look', title: 'Themes and appearance', words: 'theme dark light color accent text size density',
    body: (<p>Settings, Theme switches the whole app between seven themes, including Warm dark and Warm light in the style of Claude and Graphite in the style of ChatGPT. Appearance sets the accent, the text size for the whole app, the terminal text size, density and the space between panes.</p>),
  },
  {
    id: 'privacy', title: 'Privacy and safety', words: 'privacy safety secret data local',
    body: (<ul>
      <li>Everything runs on this machine. Nothing is sent anywhere except what Claude, GitHub and claude.ai already receive.</li>
      <li>Terminal output is kept on disk for 30 days, capped at 1 GB, under %APPDATA%\elysiumprod\scrollback.</li>
      <li>Session telemetry keeps numbers only: context, state, cost and limits. Prompts and replies are not stored.</li>
      <li>ElysiumProd never edits your other repositories; it reads git, the relay and the board.</li>
    </ul>),
  },
  {
    id: 'trouble', title: 'Troubleshooting', words: 'trouble problem not working loading blank stuck',
    body: (<ul>
      <li><strong>A session will not start:</strong> the reason shows in the pane. Most often memory or disk is too full; the memory pill explains.</li>
      <li><strong>Claude pane keeps loading:</strong> press reload, or open in browser. Use email sign in if Google sign in refuses.</li>
      <li><strong>Quick task shortcut does nothing:</strong> another app may own it. Pick another in Settings.</li>
      <li><strong>A pane looks wrong:</strong> Settings, Start over, Reset this view.</li>
    </ul>),
  },
];

export function Help() {
  const [q, setQ] = useState('');
  const [id, setId] = useState('start');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ARTICLES.filter((a) => `${a.title} ${a.words}`.toLowerCase().includes(s)) : ARTICLES;
  }, [q]);
  const current = list.find((a) => a.id === id) ?? list[0];

  return (
    <div className="page page-enter">
      <div className="page-inner wide">
        <h1 className="page-title">Help</h1>
        <p className="page-sub">Everything ElysiumProd does, and how to do it.</p>
        <div className="help-layout">
          <nav className="help-nav" aria-label="Help topics">
            <div className="palette-input text-input help-search" style={{ padding: '.4rem .6rem', border: '1px solid var(--line-strong)' }}>
              <Search size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help" aria-label="Search help" style={{ fontSize: '.92rem' }} />
            </div>
            {list.map((a) => <button key={a.id} className={`nav ${current?.id === a.id ? 'active' : ''}`} onClick={() => setId(a.id)}>{a.title}</button>)}
            {!list.length && <div className="muted small">No topic matches.</div>}
          </nav>
          {current && <article key={current.id} className="help-article"><h2>{current.title}</h2>{current.body}</article>}
        </div>
      </div>
    </div>
  );
}
