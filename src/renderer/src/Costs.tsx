// Costs: this month across Vercel, Neon, AWS and your fixed subscriptions,
// per project, with each provider's breakdown one click away.
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { CostItem, CostReport } from '@shared/ipc';
import { ProjectLogo } from './ProjectLogo';
import { ago, useLive } from './workspace/live';
import { useWorkspace, type FixedCost, COST_CATEGORIES, monthlyOf } from './workspace/store';

type Provider = CostItem['provider'] | 'fixed';
const PROVIDERS: { id: Provider; name: string; color: string }[] = [
  { id: 'vercel', name: 'Vercel', color: '#5B8DEF' },
  { id: 'neon', name: 'Neon', color: '#3FB5B0' },
  { id: 'aws', name: 'AWS', color: '#D9A043' },
  { id: 'fixed', name: 'Fixed', color: '#9B7BE0' },
];
const colorOf = (p: Provider) => PROVIDERS.find((x) => x.id === p)!.color;

const usd = (n: number) => (n >= 100 ? `$${n.toFixed(0)}` : n >= 0.995 || n === 0 ? `$${n.toFixed(2)}` : n >= 0.005 ? `$${n.toFixed(2)}` : '<$0.01');
const uid = () => Math.random().toString(36).slice(2, 10);

interface Row { projectId: string | null; name: string; items: CostItem[]; fixed: FixedCost[]; byProvider: Record<Provider, number>; total: number }

/** One click to add the usual ones; amounts are list prices and easy to change. */
const COST_PRESETS: { name: string; amount: number; cycle: 'monthly' | 'yearly'; category: string }[] = [
  { name: 'Claude Max', amount: 200, cycle: 'monthly', category: 'AI' },
  { name: 'Claude Pro', amount: 20, cycle: 'monthly', category: 'AI' },
  { name: 'ChatGPT Plus', amount: 20, cycle: 'monthly', category: 'AI' },
  { name: 'Cursor', amount: 20, cycle: 'monthly', category: 'AI' },
  { name: 'GitHub Copilot', amount: 10, cycle: 'monthly', category: 'AI' },
  { name: 'Vercel Pro seat', amount: 20, cycle: 'monthly', category: 'Hosting' },
  { name: 'Apple Developer', amount: 99, cycle: 'yearly', category: 'Software' },
  { name: 'Domain', amount: 15, cycle: 'yearly', category: 'Domain' },
  { name: 'Google Workspace', amount: 7, cycle: 'monthly', category: 'Software' },
  { name: 'Figma', amount: 16, cycle: 'monthly', category: 'Design' },
];

export function Costs() {
  const { projects } = useLive();
  const { doc, patchDoc } = useWorkspace();
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [showZero, setShowZero] = useState(false);

  const load = (force = false) => {
    setLoading(true);
    void window.elysium.costs(force).then((r) => {
      setReport(r);
      // An older report shows at once; the fresh one replaces it when the providers answer.
      if (r.refreshing) void window.elysium.costs(true).then((f) => { setReport(f); setLoading(false); }).catch(() => setLoading(false));
      else setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => load(false), []);

  // A hand set link wins over the automatic match.
  const projectOf = (i: CostItem) => {
    const l = doc.costLinks[i.key];
    return l === 'none' ? null : l ?? i.projectId;
  };

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    const row = (pid: string | null) => {
      const k = pid ?? '';
      if (!map.has(k)) map.set(k, { projectId: pid, name: pid ? projects.find((p) => p.id === pid)?.name ?? pid : 'Not linked to a project', items: [], fixed: [], byProvider: { vercel: 0, neon: 0, aws: 0, fixed: 0 }, total: 0 });
      return map.get(k)!;
    };
    for (const i of report?.items ?? []) {
      const r = row(projectOf(i));
      r.items.push(i);
      r.byProvider[i.provider] += i.cost;
      r.total += i.cost;
    }
    for (const f of doc.fixedCosts) {
      const r = row(f.projectId);
      r.fixed.push(f);
      const m = monthlyOf(f);
      r.byProvider.fixed += m;
      r.total += m;
    }
    return [...map.values()].sort((a, b) => (a.projectId === null ? 1 : b.projectId === null ? -1 : b.total - a.total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, doc.costLinks, doc.fixedCosts, projects]);

  const totals = useMemo(() => {
    const t: Record<Provider, number> = { vercel: 0, neon: 0, aws: 0, fixed: 0 };
    for (const r of rows) for (const p of PROVIDERS) t[p.id] += r.byProvider[p.id];
    return t;
  }, [rows]);
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const linked = rows.filter((r) => r.projectId);
  const unlinked = rows.find((r) => r.projectId === null);
  const peak = Math.max(0.01, ...linked.map((r) => r.total));
  const month = new Date().toLocaleDateString([], { month: 'long' });
  const errors = report ? Object.entries(report.errors).filter(([, e]) => e) as [string, string][] : [];

  const setFixed = (list: FixedCost[]) => patchDoc({ fixedCosts: list });
  const [quick, setQuick] = useState(false);
  const link = (key: string, pid: string) => patchDoc({ costLinks: { ...doc.costLinks, [key]: pid } });

  return (
    <div className="page page-enter">
      <div className="page-inner costs">
        <h1 className="page-title">Costs</h1>
        <p className="page-sub">
          {report ? `${month} so far · ${report.refreshing ? 'updating…' : `updated ${ago(report.computedAt)}`}` : loading ? 'Asking Vercel and Neon…' : 'Could not load costs.'}
          <button className="link-btn costs-refresh" onClick={() => load(true)} disabled={loading} title="Ask every provider again">
            <RefreshCw size={13} className={loading ? 'spin' : ''} />{loading ? 'Refreshing' : 'Refresh'}
          </button>
        </p>

        <section className="cost-hero">
          <div className="cost-total">{report ? usd(grand) : '…'}</div>
          <div className="cost-total-label">this month, across everything</div>
          <div className="cost-split">
            {PROVIDERS.map((p) => (
              <div key={p.id} className="cost-split-item">
                <span className="cost-key" style={{ background: p.color }} />
                <span className="cost-split-name">{p.name}</span>
                <strong>{p.id === 'neon' && totals.neon > 0 ? '≈ ' : ''}{usd(totals[p.id])}</strong>
              </div>
            ))}
          </div>
          {report?.lastMonth.vercel != null && <div className="cost-last">Vercel last month: {usd(report.lastMonth.vercel)} billed{report.lastMonth.vercelValue ? `, ${usd(report.lastMonth.vercelValue)} of usage covered by your plan` : ""}</div>}
        </section>

        {errors.length > 0 && (
          <div className="cost-errors">{errors.map(([k, e]) => <div key={k}><strong>{k === 'aws' ? 'AWS' : k.charAt(0).toUpperCase() + k.slice(1)}:</strong> {e}</div>)}</div>
        )}

        <section className="settings-card">
          <h2>By project</h2>
          {!linked.length && <p className="setting-hint">{loading ? 'Loading…' : 'Nothing is linked to a project yet.'}</p>}
          {linked.map((r) => {
            const k = r.projectId!;
            const isOpen = open === k;
            return (
              <div key={k} className={`cost-row ${isOpen ? 'open' : ''}`}>
                <button className="cost-row-head" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                  <ProjectLogo projectId={k} />
                  <span className="cost-row-name">{r.name}</span>
                  <span className="cost-bar" aria-hidden="true">
                    {PROVIDERS.map((p) => r.byProvider[p.id] > 0 && (
                      <span key={p.id} style={{ width: `${(r.byProvider[p.id] / peak) * 100}%`, background: p.color }} title={`${p.name}: ${usd(r.byProvider[p.id])}`} />
                    ))}
                  </span>
                  <span className="cost-row-total">{usd(r.total)}</span>
                  <ChevronDown size={15} className="cost-chev" />
                </button>
                {isOpen && <Breakdown row={r} projects={projects} onLink={link} />}
              </div>
            );
          })}
          <div className="cost-legend">{PROVIDERS.map((p) => <span key={p.id}><span className="cost-key" style={{ background: p.color }} />{p.name}</span>)}</div>
        </section>

        {unlinked && (
          <section className="settings-card">
            <h2>Not linked to a project</h2>
            <p className="setting-hint" style={{ marginTop: '-.2rem' }}>Hosting and databases that did not match one of your projects. Pick a project to count them there.</p>
            {unlinked.items.filter((i) => showZero || i.cost >= 0.005 || i.value >= 0.05).sort((a, b) => b.cost - a.cost || b.value - a.value).map((i) => (
              <div key={i.key} className="setting-row">
                <div>
                  <div className="setting-label"><span className="cost-key" style={{ background: colorOf(i.provider) }} />{i.name}</div>
                  <div className="setting-hint">{PROVIDERS.find((p) => p.id === i.provider)!.name}{i.note ? ` · ${i.note}` : ''}{i.value > i.cost + 0.005 ? ` · ${usd(i.value)} of usage` : ''}</div>
                </div>
                <div className="setting-control">
                  <strong className="cost-amt">{i.estimate && i.cost ? '≈ ' : ''}{usd(i.cost)}</strong>
                  <select className="picker" value={doc.costLinks[i.key] ?? ''} onChange={(e) => link(i.key, e.target.value)} aria-label={`Project for ${i.name}`}>
                    <option value="">Pick a project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="none">Not a project</option>
                  </select>
                </div>
              </div>
            ))}
            {unlinked.items.some((i) => i.cost < 0.005 && i.value < 0.05) && (
              <button className="link-btn" onClick={() => setShowZero((x) => !x)}>{showZero ? 'Hide' : 'Show'} {unlinked.items.filter((i) => i.cost < 0.005 && i.value < 0.05).length} with no cost</button>
            )}
          </section>
        )}

        <section className="settings-card">
          <div className="other-costs-head">
            <div>
              <h2>Your other costs</h2>
              <p>Subscriptions, seats, domains, one off purchases: anything no provider reports.</p>
            </div>
            {doc.fixedCosts.length > 0 && <div className="other-total"><strong>${doc.fixedCosts.reduce((n, f) => n + monthlyOf(f), 0).toFixed(2)}</strong><span>this month</span></div>}
          </div>
          {!doc.fixedCosts.length && <div className="cost-empty">Nothing added yet. Add your Claude plan, a domain or anything else you pay for, and it counts in the totals above.</div>}
          {doc.fixedCosts.length > 0 && (
            <div className="cost-list">
              {doc.fixedCosts.map((f) => {
                const set = (patch: Partial<FixedCost>) => setFixed(doc.fixedCosts.map((x) => (x.id === f.id ? { ...x, ...patch } : x)));
                return (
                  <div key={f.id} className="cost-item">
                    <input className="text-input" value={f.name} placeholder="What is it?" aria-label="Name" onChange={(e) => set({ name: e.target.value })} />
                    <span className="usd-input">$<input className="text-input" type="number" min={0} step={0.01} value={f.monthly} aria-label="Amount" onChange={(e) => set({ monthly: Math.max(0, Number(e.target.value) || 0) })} /></span>
                    <select className="picker" value={f.cycle ?? 'monthly'} aria-label="How often" onChange={(e) => set({ cycle: e.target.value as FixedCost['cycle'], date: e.target.value === 'once' ? (f.date ?? new Date().toISOString().slice(0, 10)) : f.date })}>
                      <option value="monthly">a month</option><option value="yearly">a year</option><option value="once">once</option>
                    </select>
                    <select className="picker" value={f.category ?? 'Other'} aria-label="Category" onChange={(e) => set({ category: e.target.value })}>
                      {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="picker" value={f.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || null })} aria-label="Project">
                      <option value="">All projects</option>
                      {projects.filter((x) => !x.builtin).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <button className="ghost-icon" onClick={() => setFixed(doc.fixedCosts.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name || 'cost'}`}><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="cost-add-row">
            <button className="btn primary" onClick={() => setFixed([...doc.fixedCosts, { id: uid(), name: '', monthly: 0, cycle: 'monthly', category: 'Other', projectId: null }])}><Plus size={14} />Add a cost</button>
            <button className="btn" onClick={() => setQuick((q) => !q)} aria-expanded={quick}>Quick add</button>
            {quick && (
              <div className="cost-quick" role="menu" onMouseLeave={() => setQuick(false)}>
                <div className="cost-quick-label">Common ones, at list price</div>
                {COST_PRESETS.filter((x) => !doc.fixedCosts.some((f) => f.name === x.name)).map((x) => (
                  <button key={x.name} role="menuitem" onClick={() => { setFixed([...doc.fixedCosts, { id: uid(), name: x.name, monthly: x.amount, cycle: x.cycle, category: x.category, projectId: null }]); setQuick(false); }}>
                    {x.name}<span>${x.amount} / {x.cycle === 'yearly' ? 'yr' : 'mo'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <p className="cost-foot">
          Vercel figures come from vercel usage and show what is billed after your plan's included credit.
          Neon has no billing figures on the Launch plan, so its amounts are estimates from each project's compute time and storage at ${report?.neonRates.cuHour ?? 0.106} per CU hour and ${report?.neonRates.gbMonth ?? 0.35} per GB month.
          AWS comes from a project's .claude/mods-cost.json, when a plugin writes one.
        </p>
      </div>
    </div>
  );
}

function Breakdown({ row, projects, onLink }: { row: Row; projects: { id: string; name: string }[]; onLink(key: string, pid: string): void }) {
  return (
    <div className="cost-break">
      {row.items.sort((a, b) => b.cost - a.cost || b.value - a.value).map((i) => (
        <div key={i.key} className="cost-item">
          <div className="cost-item-head">
            <span className="cost-key" style={{ background: colorOf(i.provider) }} />
            <span className="cost-item-name">{PROVIDERS.find((p) => p.id === i.provider)!.name} · {i.name}</span>
            {i.note && <span className="muted small">{i.note}</span>}
            <strong>{i.estimate && i.cost ? '≈ ' : ''}{usd(i.cost)}</strong>
            <select className="picker small-picker" value="" onChange={(e) => e.target.value && onLink(i.key, e.target.value)} aria-label="Move to another project">
              <option value="">Move</option>
              {projects.filter((p) => p.id !== row.projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="none">Not a project</option>
            </select>
          </div>
          {i.services.map((s) => (
            <div key={s.name} className="cost-line"><span>{s.name}</span><span>{usd(s.cost)}{s.value > s.cost + 0.005 ? <em> of {usd(s.value)}</em> : null}</span></div>
          ))}
        </div>
      ))}
      {row.fixed.map((f) => (
        <div key={f.id} className="cost-item">
          <div className="cost-item-head"><span className="cost-key" style={{ background: colorOf('fixed') }} /><span className="cost-item-name">Fixed · {f.name || 'Unnamed'}</span><strong>{usd(f.monthly)}</strong></div>
        </div>
      ))}
    </div>
  );
}
