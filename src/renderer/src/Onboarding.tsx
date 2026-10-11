import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Logo } from './Logo';
import { ProjectLogo } from './ProjectLogo';
import { useLive } from './workspace/live';
import { useWorkspace } from './workspace/store';

/** First run: name the accounts, choose each project's account, pin projects, and learn three things. */
export function Onboarding({ name }: { name: string }) {
  const { projects, accounts } = useLive();
  const { doc, setAccountLabel, setProjectAccount, togglePin, finishOnboarding } = useWorkspace();
  const [step, setStep] = useState(0);
  const label = (id: string) => doc.accounts[id]?.label ?? (id === 'main' ? name || 'Main account' : id);
  const steps = 4;

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="Welcome to ElysiumProd">
      <div className="onboard-card" key={step}>
        <div className="steps" aria-hidden="true">{Array.from({ length: steps }, (_, i) => <i key={i} className={i === step ? 'on' : ''} />)}</div>

        {step === 0 && (<>
          <Logo />
          <h1>Welcome, {name}</h1>
          <p>One place for your projects, their Claude sessions, your planning chat and your board. This takes a minute.</p>
        </>)}

        {step === 1 && (<>
          <h1>Your Claude accounts</h1>
          <p>Name each account so you can tell them apart. Both stay signed in at once.</p>
          <div className="onboard-list">
            {accounts.map((a) => (
              <div key={a.id} className="onboard-row">
                <span className="grow"><strong>{a.isDefault ? 'Main account' : `Account ${a.id}`}</strong><span className="muted small">{a.loggedIn ? 'Signed in' : 'Not signed in yet'} · {a.configDir}</span></span>
                <input className="text-input" style={{ width: '11rem' }} defaultValue={label(a.id)} onBlur={(e) => setAccountLabel(a.id, e.target.value)} aria-label="Name for this account" />
              </div>
            ))}
          </div>
        </>)}

        {step === 2 && (<>
          <h1>Your projects</h1>
          <p>Pick the account each project uses, and pin the ones you want in the sidebar. You can change this later in Settings.</p>
          <div className="onboard-list" style={{ maxHeight: '46vh', overflow: 'auto' }}>
            {projects.map((p) => (
              <div key={p.id} className="onboard-row">
                <ProjectLogo projectId={p.id} size="lg" />
                <span className="grow"><strong>{p.name}</strong><span className="muted small">{p.tier === 'main' ? 'Prime and Meridian' : 'One Claude session'}</span></span>
                <select className="picker" value={doc.projectAccounts[p.id] || 'main'} onChange={(e) => setProjectAccount(p.id, e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{label(a.id)}</option>)}
                </select>
                <button className={`chip-btn ${doc.pinned.includes(p.id) ? 'on' : ''}`} onClick={() => togglePin(p.id)}>{doc.pinned.includes(p.id) ? 'Pinned' : 'Pin'}</button>
              </div>
            ))}
          </div>
        </>)}

        {step === 3 && (<>
          <h1>Three things to know</h1>
          <div className="onboard-list">
            <div className="onboard-row"><kbd>Ctrl K</kbd><span className="grow">Search and run anything: projects, sessions, panes, settings.</span></div>
            <div className="onboard-row"><kbd>Alt Space</kbd><span className="grow">From anywhere in Windows, hand a project a task. It runs in the background and tells you when it is done.</span></div>
            <div className="onboard-row"><kbd>+</kbd><span className="grow">On any pane, adds Claude, terminals, relay, tasks, memory and more. Drag tabs to arrange them.</span></div>
          </div>
          <p className="muted small">Everything is explained in Help, in the sidebar.</p>
        </>)}

        <div className="onboard-actions">
          {step > 0 && <button className="btn" onClick={() => setStep((s) => s - 1)}>Back</button>}
          {step < steps - 1
            ? <button className="btn primary" onClick={() => setStep((s) => s + 1)}>Continue <ArrowRight size={15} /></button>
            : <button className="btn primary" onClick={finishOnboarding}>Start working <ArrowRight size={15} /></button>}
        </div>
      </div>
    </div>
  );
}
