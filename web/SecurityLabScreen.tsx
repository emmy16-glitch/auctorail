import React, { useMemo, useState } from "react";
import "./security-lab-screen.css";

export interface SecurityLabScenario {
  id: string;
  attack: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface SecurityLabReport {
  schemaVersion: string;
  mode: string;
  policyId: string;
  baselineDecision: string;
  scenarios: SecurityLabScenario[];
  passed: number;
  total: number;
  allPassed: boolean;
}

interface SecurityLabScreenProps { apiBase: string; }

type Category = "action" | "permit" | "evidence" | "receipt";

type AttackPreset = {
  id: string;
  category: Category;
  label: string;
  description: string;
  original: string;
  mutated: string;
  boundary: string;
  stoppedAt: string;
};

const PRESETS: AttackPreset[] = [
  { id: "amount_mutation", category: "action", label: "Modify payment amount", description: "Change the payment amount after a valid authorization has been created.", original: "1.00 USDC", mutated: "2.00 USDC", boundary: "Action Binding", stoppedAt: "Permit validation" },
  { id: "mandate_substitution", category: "action", label: "Change mandate version", description: "Rebind the permit to a different mandate version after authorization.", original: "Mandate v1", mutated: "Mandate v2", boundary: "Action Binding", stoppedAt: "Permit validation" },
  { id: "permit_replay", category: "permit", label: "Replay consumed permit", description: "Reuse a permit after the authorized action has already consumed it.", original: "Fresh permit", mutated: "Consumed permit", boundary: "Permit", stoppedAt: "Consumption guard" },
  { id: "permit_forgery", category: "permit", label: "Forge permit signature", description: "Alter the HMAC signature on an otherwise valid permit.", original: "Valid signature", mutated: "Forged signature", boundary: "Permit", stoppedAt: "Signature verification" },
  { id: "expired_permit", category: "permit", label: "Use expired permit", description: "Attempt execution after the permit's 30-second TTL.", original: "Within 30s TTL", mutated: "31s after mint", boundary: "Permit", stoppedAt: "Expiry validation" },
  { id: "evidence_subject_swap", category: "evidence", label: "Swap evidence subject", description: "Replace vendor evidence with evidence bound to another address.", original: "ProofGate Vendor", mutated: "Different vendor", boundary: "Evidence", stoppedAt: "Evidence binding" },
  { id: "negative_miner", category: "evidence", label: "Force negative Miner verdict", description: "Keep runtime proof valid while the deterministic Telegraph verdict becomes BLOCK.", original: "Miner: ALLOW", mutated: "Miner: BLOCK", boundary: "Evidence", stoppedAt: "Policy evaluation" },
  { id: "runtime_attestation_tamper", category: "evidence", label: "Tamper runtime attestation", description: "Alter pinned runtime evidence while Telegraph still reports ALLOW.", original: "Pinned runtime", mutated: "Modified runtime", boundary: "Evidence", stoppedAt: "Runtime attestation" },
  { id: "receipt_tamper", category: "receipt", label: "Modify transaction hash", description: "Change the transaction hash inside a completed Proof Receipt.", original: "Signed receipt hash", mutated: "Altered tx hash", boundary: "Receipt", stoppedAt: "Receipt verification" }
];

const CATEGORY_META: Record<Category, { n: string; title: string; copy: string }> = {
  action: { n: "01", title: "ACTION BINDING", copy: "Amount and mandate substitution" },
  permit: { n: "02", title: "PERMIT", copy: "Replay, forgery and expiry" },
  evidence: { n: "03", title: "EVIDENCE", copy: "Subject, Miner and runtime tampering" },
  receipt: { n: "04", title: "RECEIPT", copy: "Post-execution integrity mutation" }
};

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function SecurityLabScreen({ apiBase }: SecurityLabScreenProps) {
  const [category, setCategory] = useState<Category>("action");
  const [presetId, setPresetId] = useState("amount_mutation");
  const [report, setReport] = useState<SecurityLabReport | null>(null);
  const [lastResult, setLastResult] = useState<SecurityLabScenario | null>(null);
  const [lastPreset, setLastPreset] = useState<AttackPreset | null>(null);
  const [lastTime, setLastTime] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [runningSuite, setRunningSuite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = useMemo(() => PRESETS.filter((item) => item.category === category), [category]);
  const selected = PRESETS.find((item) => item.id === presetId) ?? presets[0];

  function chooseCategory(next: Category) {
    setCategory(next);
    const first = PRESETS.find((item) => item.category === next);
    if (first) setPresetId(first.id);
  }

  async function fetchReport(): Promise<SecurityLabReport> {
    const response = await fetch(`${apiBase}/api/security-lab`, { method: "POST" });
    const body = await response.json() as SecurityLabReport & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "security_lab_failed");
    return body;
  }

  async function runAttack() {
    if (running || !selected) return;
    setRunning(true); setError(null);
    try {
      const body = await fetchReport();
      const result = body.scenarios.find((item) => item.id === selected.id);
      if (!result) throw new Error("attack_scenario_missing");
      setReport(body); setLastResult(result); setLastPreset(selected); setLastTime(nowLabel());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "security_lab_failed");
    } finally { setRunning(false); }
  }

  async function runFullSuite() {
    if (runningSuite) return;
    setRunningSuite(true); setError(null);
    try { setReport(await fetchReport()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "security_lab_failed"); }
    finally { setRunningSuite(false); }
  }

  const recent = report?.scenarios.filter((item) => item.id !== "baseline").slice(0, 4) ?? [];

  return (
    <main className="lab-workbench" data-testid="security-lab-screen">
      <header className="lab-intro">
        <div>
          <span className="lab-kicker">SECURITY LAB</span>
          <h1>Try to break ProofGate.</h1>
          <p>Mutate a valid authorization and see exactly where ProofGate stops it. Learn by doing.</p>
        </div>
        <aside className="lab-safety">
          <span className="lab-flask" aria-hidden="true">△</span>
          <div><strong>A SAFE, OFFLINE TEST ENVIRONMENT</strong><p>The lab is isolated from CHECK. No real payments are made. Every result comes from the deterministic attack harness.</p></div>
        </aside>
      </header>

      <div className="lab-layout">
        <aside className="lab-categories" aria-label="Attack categories">
          <span className="section-label">ATTACK CATEGORIES</span>
          {(Object.keys(CATEGORY_META) as Category[]).map((key) => {
            const meta = CATEGORY_META[key];
            return <button key={key} className={`lab-category ${category === key ? "active" : ""} cat-${key}`} onClick={() => chooseCategory(key)} type="button">
              <b>{meta.n}</b><span><strong>{meta.title}</strong><small>{meta.copy}</small></span>
            </button>;
          })}
          <div className="lab-examples">
            <span className="section-label">EXAMPLES</span>
            <p>Common attack patterns</p><p>How protections work</p><p>Technical reference</p>
          </div>
        </aside>

        <section className="attack-builder hard-shadow">
          <div className={`builder-title cat-${category}`}><b>{CATEGORY_META[category].n}</b><div><strong>{CATEGORY_META[category].title}</strong><span>{CATEGORY_META[category].copy}</span></div></div>
          <div className="builder-body">
            <label className="attack-type"><span>ATTACK TYPE</span><select value={selected.id} onChange={(e) => setPresetId(e.target.value)}>{presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <div className="attack-description">{selected.description}</div>
            <div className="mutation-grid">
              <div className="mutation-card original"><span>ORIGINAL REQUEST (AUTHORIZED)</span><dl><dt>State</dt><dd>{selected.original}</dd><dt>Recipient</dt><dd>ProofGate Vendor</dd><dt>Mandate</dt><dd>INV-4471</dd><dt>Valid for</dt><dd>1 hour</dd></dl></div>
              <div className="mutation-card mutated"><span>MUTATED REQUEST (ATTACK)</span><dl><dt>State</dt><dd>{selected.mutated}</dd><dt>Recipient</dt><dd>ProofGate Vendor</dd><dt>Mandate</dt><dd>INV-4471</dd><dt>Valid for</dt><dd>1 hour</dd></dl></div>
            </div>
            <div className="builder-note"><strong>CONTROLLED MUTATION</strong><p>You are mutating a valid deterministic authorization. ProofGate will execute the real attack-harness check for this boundary.</p></div>
            <button className="run-attack" onClick={runAttack} disabled={running} type="button"><span>{running ? "RUNNING ATTACK..." : "RUN ATTACK"}</span><b>→</b></button>
          </div>
        </section>

        <aside className="last-result hard-shadow">
          <div className="result-heading">LAST RESULT</div>
          {lastResult && lastPreset ? <>
            <div className={`result-status ${lastResult.passed ? "blocked" : "failed"}`}><span>✓</span><div><strong>{lastResult.passed ? "ATTACK BLOCKED" : "ATTACK SUCCEEDED"}</strong><p>{lastResult.passed ? "ProofGate stopped this mutated request." : "The expected boundary did not hold."}</p></div></div>
            <dl className="result-facts"><dt>BOUNDARY</dt><dd>{lastPreset.boundary}</dd><dt>REASON</dt><dd>{lastResult.observed}</dd><dt>STOPPED AT</dt><dd>{lastPreset.stoppedAt}</dd><dt>TIME</dt><dd>{lastTime}</dd></dl>
            <div className="compare-row"><div><span>EXPECTED</span><strong>{lastResult.expected}</strong></div><div><span>OBSERVED</span><strong>{lastResult.observed}</strong></div></div>
            <div className="result-explain"><strong>EXPLANATION</strong><p>The mutated state no longer matches the signed authorization or protected integrity boundary, so protected execution is rejected.</p></div>
            <details className="technical-trace"><summary>VIEW TECHNICAL TRACE ↓</summary><pre>{JSON.stringify(lastResult, null, 2)}</pre></details>
            <button className="try-again" type="button" onClick={() => { setLastResult(null); setLastPreset(null); }}>TRY ANOTHER MUTATION ↻</button>
          </> : <div className="empty-result"><strong>NO ATTACK RUN YET</strong><p>Configure a mutation and run it. The exact boundary result will appear here.</p></div>}
        </aside>
      </div>

      {error && <div className="lab-error" role="alert"><strong>LAB STOPPED</strong><span>{error}</span></div>}

      <div className="lab-bottom">
        <section className="recent-attacks">
          <div className="bottom-heading"><strong>RECENT ATTACKS</strong><span>{recent.length ? "LATEST SUITE" : "NO RESULTS YET"}</span></div>
          {recent.length ? <div className="recent-list">{recent.map((item) => <div key={item.id}><span>{item.attack}</span><b>{item.passed ? "BLOCKED" : "FAILED"}</b></div>)}</div> : <p className="recent-empty">Run an attack or the full suite to populate deterministic results.</p>}
        </section>
        <section className="suite-card">
          <div><strong>⚡ RUN FULL ATTACK SUITE</strong><p>Execute all deterministic adversarial tests against the gate.</p><button onClick={runFullSuite} disabled={runningSuite} type="button">{runningSuite ? "RUNNING SUITE..." : "RUN SUITE →"}</button></div>
          <aside className={report?.allPassed ? "suite-score passed" : "suite-score"}><b>{report ? `${report.passed}/${report.total}` : "—/—"}</b><strong>{report?.allPassed ? "GATE HELD" : "AWAITING RUN"}</strong><span>{report?.allPassed ? "Every attack was rejected by the expected security boundary." : "Run the suite to verify every invariant."}</span></aside>
        </section>
      </div>
    </main>
  );
}
