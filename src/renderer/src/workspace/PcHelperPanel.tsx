// PC Helper as a system dashboard: live vitals along the top (no Claude needed),
// the tools down a narrow rail, and the chosen tool's latest report drawn big in
// the middle with its earlier runs one click away. The ask bar at the bottom puts
// free answers in the same place. Underneath it is one chat session (main/chat.ts,
// tool:laptop), so a quick check started from the sidebar shows up here too.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { ArrowUp, BatteryCharging, BatteryMedium, Clock, Cpu, HardDrive, Loader2, MemoryStick, MessageSquareText, Play, RotateCcw, Square, TriangleAlert, Wifi, WifiOff, X } from 'lucide-react';
import type { ChatMessage, ChatState, PcVitals, ResourceSample } from '@shared/ipc';
import { md, onLinkClick } from './project-widgets';
import { ago } from './live';
import { readPictures } from './ChatPanel';
import { MicButton, withPhrase } from '../Mic';
import { CHECKS, type ToolCheck } from '../tools';
import './pchelper.css';

const CHAT = 'tool:laptop';
const ASKED = 'asked';

interface Run { id: string; ask: ChatMessage; reply: ChatMessage | null; check: ToolCheck | null }

/** Each question and the reply that follows it. */
function runsOf(messages: ChatMessage[]): Run[] {
  const runs: Run[] = [];
  for (const m of messages) {
    if (m.role === 'you') runs.push({ id: m.id, ask: m, reply: null, check: CHECKS.find((c) => c.prompt === m.text.trim()) ?? null });
    else if (runs.length && !runs[runs.length - 1].reply) runs[runs.length - 1].reply = m;
  }
  return runs;
}

const GB = (b: number) => (b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : `${(b / 1e9).toFixed(b >= 1e11 ? 0 : 1)} GB`);
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
function upFor(sec: number): string {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
const tone = (pct: number | null | undefined, warn: number, bad: number) => (pct == null ? '' : pct >= bad ? 'bad' : pct >= warn ? 'warn' : '');

type Battery = { level: number; charging: boolean } | null;
type BatteryManager = EventTarget & { level: number; charging: boolean };

/** CPU and memory every two seconds from main; drives, Wi-Fi and uptime every 30 s; the battery from Chromium. Only while the pane shows. */
function useVitals(): { res: ResourceSample | null; pc: PcVitals | null; battery: Battery } {
  const [res, setRes] = useState<ResourceSample | null>(null);
  const [pc, setPc] = useState<PcVitals | null>(null);
  const [battery, setBattery] = useState<Battery>(null);
  useEffect(() => {
    let on = true;
    void window.elysium.resources().then((r) => { if (on && r) setRes(r); });
    const off = window.elysium.onResources((r) => { if (on) setRes(r); });
    const pull = () => { if (document.visibilityState === 'visible') void window.elysium.pcVitals().then((v) => { if (on) setPc(v); }); };
    pull();
    const t = setInterval(pull, 30000);
    let bm: BatteryManager | null = null;
    const read = () => { if (on && bm) setBattery({ level: bm.level, charging: bm.charging }); };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    void nav.getBattery?.().then((b) => { bm = b; read(); b.addEventListener('levelchange', read); b.addEventListener('chargingchange', read); }).catch(() => {});
    return () => { on = false; off(); clearInterval(t); if (bm) { bm.removeEventListener('levelchange', read); bm.removeEventListener('chargingchange', read); } };
  }, []);
  return { res, pc, battery };
}

function Vitals() {
  const { res, pc, battery } = useVitals();
  const drive = pc?.drives.find((d) => d.name === 'C:') ?? pc?.drives[0];
  const diskUsed = drive ? ((drive.totalBytes - drive.freeBytes) / drive.totalBytes) * 100 : null;
  const others = pc?.drives.filter((d) => d !== drive) ?? [];
  const cells: { key: string; icon: typeof Cpu; label: string; value: string; sub: string; pct: number | null; tone: string }[] = [
    { key: 'cpu', icon: Cpu, label: 'CPU', value: res?.cpuPercent != null ? `${Math.round(res.cpuPercent)}%` : '–', sub: 'in use', pct: res?.cpuPercent ?? null, tone: tone(res?.cpuPercent, 70, 90) },
    { key: 'mem', icon: MemoryStick, label: 'Memory', value: res ? GB(res.ramUsedBytes) : '–', sub: res ? `of ${GB(res.ramTotalBytes)}, ${GB(res.ramFreeBytes)} free` : '', pct: res?.ramUsedPercent ?? null, tone: tone(res?.ramUsedPercent, 80, 92) },
    { key: 'disk', icon: HardDrive, label: drive ? `Disk ${drive.name}` : 'Disk', value: drive ? `${GB(drive.freeBytes)} free` : res?.diskFreeBytes != null ? `${GB(res.diskFreeBytes)} free` : '–', sub: drive ? `of ${GB(drive.totalBytes)}${others.length ? `, ${others.map((d) => `${d.name} ${GB(d.freeBytes)}`).join(', ')}` : ''}` : '', pct: diskUsed, tone: drive ? (drive.freeBytes < 10e9 ? 'bad' : drive.freeBytes < 25e9 ? 'warn' : '') : '' },
  ];
  if (battery) cells.push({ key: 'bat', icon: battery.charging ? BatteryCharging : BatteryMedium, label: 'Battery', value: `${Math.round(battery.level * 100)}%`, sub: battery.charging ? (battery.level >= 0.995 ? 'plugged in, full' : 'charging') : 'on battery', pct: battery.level * 100, tone: !battery.charging && battery.level < 0.15 ? 'bad' : !battery.charging && battery.level < 0.3 ? 'warn' : '' });
  if (pc) cells.push({ key: 'wifi', icon: pc.wifi?.connected ? Wifi : WifiOff, label: 'Wi-Fi', value: pc.wifi?.connected ? (pc.wifi.signal != null ? `${pc.wifi.signal}%` : 'On') : 'Off', sub: pc.wifi?.connected ? short(pc.wifi.ssid ?? 'connected', 22) : pc.wifi ? 'not connected' : 'no adapter', pct: pc.wifi?.connected ? pc.wifi.signal : null, tone: pc.wifi?.connected && pc.wifi.signal != null && pc.wifi.signal < 40 ? 'warn' : '' });
  if (pc) cells.push({ key: 'up', icon: Clock, label: 'Up for', value: upFor(pc.uptimeSec), sub: pc.uptimeSec > 7 * 86400 ? 'a restart may help' : 'since the last restart', pct: null, tone: pc.uptimeSec > 14 * 86400 ? 'warn' : '' });
  return (
    <section className="pch-vitals" aria-label="This PC right now">
      {cells.map((c) => (
        <div key={c.key} className={`pch-vital ${c.tone}`}>
          <span className="pch-vital-label"><c.icon size={13} />{c.label}</span>
          <strong className="pch-vital-value">{c.value}</strong>
          <span className="pch-vital-sub" title={c.sub}>{c.sub}</span>
          <span className="pch-vital-meter" aria-hidden="true">{c.pct != null && <i style={{ width: `${Math.max(2, Math.min(100, c.pct)).toFixed(1)}%` }} />}</span>
        </div>
      ))}
    </section>
  );
}

export function PcHelperPanel(_props: IDockviewPanelProps<{ chatId: string; projectId: string }>) {
  const [state, setState] = useState<ChatState | null>(null);
  const [text, setText] = useState('');
  const [pics, setPics] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  // Which tool is shown (or the free questions), and which of its runs.
  const [sel, setSel] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    let on = true;
    void window.elysium.chatGet(CHAT).then((s) => { if (on) setState(s); });
    const off = window.elysium.onChat((e) => { if (e.chatId === CHAT) setState(e.state); });
    // A quick check from the sidebar or a dashboard request can hand this chat a message.
    const ask = (e: Event) => { const d = (e as CustomEvent<{ chatId: string; text: string }>).detail; if (d.chatId === CHAT) void send(d.text); };
    window.addEventListener('ep:chat-send', ask);
    const t = setInterval(() => tick((x) => x + 1), 60000);
    return () => { on = false; off(); window.removeEventListener('ep:chat-send', ask); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); }, [note]);

  const runs = useMemo(() => runsOf(state?.messages ?? []), [state?.messages]);
  const running = Boolean(state?.running);
  const live = running ? [...runs].reverse().find((r) => !r.ask.queued) ?? null : null;
  const groupOf = (r: Run) => r.check?.id ?? ASKED;
  const byGroup = useMemo(() => {
    const g: Record<string, Run[]> = {};
    for (const r of runs) (g[groupOf(r)] ??= []).push(r);
    return g;
  }, [runs]);

  // Follow what is happening: a run that starts shows itself.
  const liveId = live?.id;
  useEffect(() => { if (live) { setSel(groupOf(live)); setRunId(live.id); } }, [liveId]); // eslint-disable-line react-hooks/exhaustive-deps

  const newest = runs[runs.length - 1];
  const group = sel ?? (newest ? groupOf(newest) : CHECKS[0].id);
  const list = byGroup[group] ?? [];
  const run = list.find((r) => r.id === runId) ?? list[list.length - 1] ?? null;
  const check = CHECKS.find((c) => c.id === group) ?? null;

  const send = async (t: string, withPics: string[] = []) => {
    const v = t.trim();
    if (!v && !withPics.length) return false;
    const r = await window.elysium.chatSend(CHAT, v, withPics);
    if (!r.ok) { setNote(r.reason); return false; }
    return true;
  };
  const runCheck = (c: ToolCheck) => { setSel(c.id); setRunId(null); void send(c.prompt); };
  const pick = (c: ToolCheck) => {
    const mine = byGroup[c.id];
    if (!mine?.length) { runCheck(c); return; }
    setSel(c.id); setRunId(null);
  };
  const ask = async () => {
    if (await send(text, pics)) { setText(''); setPics([]); setSel(ASKED); setRunId(null); if (box.current) box.current.style.height = 'auto'; }
  };
  const addPics = async (files: Iterable<File>) => { const p = await readPictures(files); if (p.length) setPics((x) => [...x, ...p].slice(0, 8)); };

  // A button inside an answer (```actions) sends its request.
  const onBodyClick = (e: React.MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.vz-action');
    if (b?.dataset.prompt) { e.preventDefault(); void send(b.dataset.prompt).then((ok) => { if (ok) { setSel(ASKED); setRunId(null); setNote(`Asked: ${b.textContent ?? ''}`); } }); return; }
    onLinkClick(e);
  };

  const asked = byGroup[ASKED] ?? [];
  return (
    <div className="pch">
      <Vitals />
      <div className="pch-body">
        <nav className="pch-rail" aria-label="Tools">
          <div className="pch-rail-label">Tools</div>
          {CHECKS.map((c) => {
            const mine = byGroup[c.id] ?? [];
            const last = mine[mine.length - 1];
            const busy = Boolean(last && live === last);
            const queued = Boolean(last?.ask.queued);
            const step = busy ? last!.reply?.steps.at(-1)?.label : null;
            return (
              <div key={c.id} className={`pch-tool ${group === c.id ? 'on' : ''} ${busy ? 'busy' : ''}`}>
                <button className="pch-tool-main" onClick={() => pick(c)} title={c.blurb} aria-current={group === c.id}>
                  <c.icon size={15} className="pch-tool-icon" />
                  <span className="pch-tool-text">
                    <span className="pch-tool-name">{c.title}</span>
                    <span className="pch-tool-sub">{busy ? short(step ?? 'Looking', 34) : queued ? 'Waiting its turn' : last?.reply ? ago(last.reply.at) : 'Not run yet'}</span>
                  </span>
                  {busy ? <Loader2 size={13} className="spin pch-tool-state" /> : queued ? <span className="dot pch-tool-state" /> : last?.reply ? <span className="dot idle pch-tool-state" /> : null}
                </button>
                {!busy && !queued && <button className="pch-tool-run" onClick={() => runCheck(c)} title={`Run ${c.title.toLowerCase()} now`} aria-label={`Run ${c.title}`}><Play size={12} /></button>}
              </div>
            );
          })}
          {asked.length > 0 && (
            <>
              <div className="pch-rail-label">Asked</div>
              <div className={`pch-tool ${group === ASKED ? 'on' : ''} ${live && groupOf(live) === ASKED ? 'busy' : ''}`}>
                <button className="pch-tool-main" onClick={() => { setSel(ASKED); setRunId(null); }} aria-current={group === ASKED}>
                  <MessageSquareText size={15} className="pch-tool-icon" />
                  <span className="pch-tool-text"><span className="pch-tool-name">Your questions</span><span className="pch-tool-sub">{asked.length} so far</span></span>
                </button>
              </div>
            </>
          )}
          {runs.length > 0 && <button className="pch-rail-reset" onClick={() => void window.elysium.chatReset(CHAT)} title="Clear every report and start fresh"><RotateCcw size={12} />Start fresh</button>}
        </nav>

        <main className="pch-main" onClick={onBodyClick}>
          {state?.error && (state.error.startsWith('LOGIN:')
            ? <div className="pch-error"><TriangleAlert size={14} />{state.error.slice(6).trim()} <button className="btn small primary" onClick={() => void window.elysium.connect('claude', 'signin')}>Sign in</button></div>
            : <div className="pch-error"><TriangleAlert size={14} />{state.error}</div>)}
          <Report run={run} check={check} list={list} live={live} asked={group === ASKED} onPick={setRunId} onRun={check ? () => runCheck(check) : undefined} />
        </main>
      </div>

      <form className="pch-compose" onSubmit={(e) => { e.preventDefault(); void ask(); }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void addPics(e.dataTransfer.files); } }}>
        {pics.length > 0 && (
          <div className="compose-pics">
            {pics.map((p, i) => (
              <span key={i} className="compose-pic"><img src={p} alt={`Picture ${i + 1}`} />
                <button type="button" onClick={() => setPics((x) => x.filter((_, j) => j !== i))} aria-label="Remove picture"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="pch-compose-row">
          <textarea ref={box} rows={1} value={text} aria-label="Ask the PC Helper"
            placeholder={running ? 'Ask another. It waits its turn.' : 'Ask about this PC, like why the fan is loud'}
            onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.some((x) => x.type.startsWith('image/'))) { e.preventDefault(); void addPics(f); } }}
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }} />
          <MicButton onText={(t) => { setText((x) => withPhrase(x, t)); box.current?.focus(); }} />
          {running && !text.trim() && !pics.length
            ? <button type="button" className="chat-send stop" onClick={() => window.elysium.chatStop(CHAT)} aria-label="Stop"><Square size={13} /></button>
            : <button type="submit" className="chat-send" disabled={!text.trim() && !pics.length} aria-label="Send"><ArrowUp size={17} /></button>}
        </div>
      </form>
      {note && <div className="pch-note" role="status">{note}</div>}
    </div>
  );
}

function Report({ run, check, list, live, asked, onPick, onRun }: { run: Run | null; check: ToolCheck | null; list: Run[]; live: Run | null; asked: boolean; onPick(id: string): void; onRun?: () => void }) {
  const html = useMemo(() => (run?.reply?.text ? md(run.reply.text) : ''), [run?.reply?.text]);
  const isLive = Boolean(run && live === run);
  const step = run?.reply?.steps.length ? run.reply.steps[run.reply.steps.length - 1].label : null;
  const Icon = check?.icon ?? MessageSquareText;
  const title = check?.title ?? (run ? short(run.ask.text, 90) : 'Your questions');
  // Newest first; a check's runs are named by when, a question by what was asked.
  const history = [...list].reverse().slice(0, 8);

  if (!run) {
    return (
      <div className="pch-empty">
        <Icon size={22} className="pch-empty-icon" />
        <h2>{check?.title ?? 'Ask anything'}</h2>
        <p>{check?.blurb ?? 'Type below. The answer shows here as a report.'}</p>
        {onRun && <button className="btn primary" onClick={onRun}><Play size={14} />Run {check?.title.toLowerCase()}</button>}
      </div>
    );
  }
  return (
    <article className={`pch-report ${isLive ? 'live' : ''}`}>
      <header className="pch-report-head">
        <div className="pch-report-title">
          <Icon size={17} />
          <h2>{title}</h2>
        </div>
        <div className="pch-report-side">
          <span className="pch-report-when">{isLive ? <><span className="dot busy" />Running</> : run.ask.queued ? 'Waiting its turn' : run.reply ? ago(run.reply.at) : ago(run.ask.at)}</span>
          {onRun && !isLive && !run.ask.queued && <button className="btn small" onClick={onRun}><RotateCcw size={13} />Run again</button>}
        </div>
      </header>
      {history.length > 1 && (
        <div className="pch-history" role="tablist" aria-label="Earlier runs">
          {history.map((r, i) => (
            <button key={r.id} role="tab" aria-selected={r === run} className={`pch-history-item ${r === run ? 'on' : ''}`} onClick={() => onPick(r.id)} title={asked ? r.ask.text : undefined}>
              {asked ? short(r.ask.text, 28) : i === 0 ? 'Latest' : ago(r.reply?.at ?? r.ask.at)}
            </button>
          ))}
        </div>
      )}
      {asked && run.ask.text.length > 90 && <p className="pch-report-ask">{run.ask.text}</p>}
      <div className="pch-report-body">
        {html ? <div className={`msg-text md ${isLive ? 'typing' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
          : isLive ? <div className="pch-working big"><Loader2 size={16} className="spin" />{step ?? 'Looking at this PC'}</div>
          : run.ask.queued ? <div className="pch-working">Waits for the one before it.</div> : null}
        {html && isLive && step && <div className="pch-working"><Loader2 size={14} className="spin" />{step}</div>}
      </div>
    </article>
  );
}
