import React, { useMemo, useState } from "react";

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
  { id: "evidence_subject_swap", category: "evidence", label: "Swap evidence subject", description: "Replace vendor evidence with evidence bound to another address.", original: "Auctorail Vendor", mutated: "Different vendor", boundary: "Evidence", stoppedAt: "Evidence binding" },
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
    <main data-testid="security-lab-screen">
      <div className="lab-intro">
        <div>
          <span className="eyebrow">SECURITY LAB · DETERMINISTIC</span>
          <h1>Try to break Auctorail.</h1>
          <p className="lab-lede">Mutate a valid authorization and see exactly where Auctorail stops it. This lab proves enforcement boundaries without pretending to be a live Miner run.</p>
        </div>
        <div className="note">
          <span style={{ fontSize: 20, color: "var(--accent)", display: "grid", placeItems: "center", width: 30, height: 30, border: "1px solid var(--line)", borderRadius: 8 }} aria-hidden="true">△</span>
          <div>
            <strong>SAFE · OFFLINE · ZERO REAL PAYMENTS</strong>
            <p>The lab is isolated from live checks. No Telegraph/x402 purchase or blockchain write is made. Every result comes from the deterministic attack harness.</p>
          </div>
        </div>
      </div>

      <div className="lab-layout">
        <aside className="lab-categories" aria-label="Attack categories">
          {(Object.keys(CATEGORY_META) as Category[]).map((key) => {
            const meta = CATEGORY_META[key];
            return <button key={key} className={`lab-category ${category === key ? "active" : ""}`} onClick={() => chooseCategory(key)} type="button">
              <b>{meta.n}</b><span><strong>{meta.title}</strong><small>{meta.copy}</small></span>
            </button>;
          })}
        </aside>

        <section style={{ display: "grid", gap: 20 }}>
          <div className="card card-pad">
            <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 12, alignItems: "center", marginBottom: 16 }}>
              <span className="mono" style={{ color: "var(--accent)", fontSize: 12 }}>{CATEGORY_META[category].n}</span>
              <div>
                <strong style={{ display: "block", fontSize: 15, fontWeight: 650 }}>{CATEGORY_META[category].title}</strong>
                <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{CATEGORY_META[category].copy}</span>
              </div>
            </div>

            <label className="field" style={{ marginBottom: 14 }}>
              <span>ATTACK TYPE</span>
              <select className="select" value={selected.id} onChange={(e) => setPresetId(e.target.value)}>
                {presets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>

            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>{selected.description}</p>

            <div className="mutation-grid" style={{ marginBottom: 14 }}>
              <div className="mutation-card">
                <span className="mc-label">ORIGINAL · AUTHORIZED</span>
                <dl>
                  <div><dt>State</dt><dd>{selected.original}</dd></div>
                  <div><dt>Recipient</dt><dd>Auctorail Vendor</dd></div>
                  <div><dt>Mandate</dt><dd>INV-4471</dd></div>
                  <div><dt>Valid for</dt><dd>1 hour</dd></div>
                </dl>
              </div>
              <div className="mutation-card mutated">
                <span className="mc-label">MUTATED · ATTACK</span>
                <dl>
                  <div><dt>State</dt><dd>{selected.mutated}</dd></div>
                  <div><dt>Recipient</dt><dd>Auctorail Vendor</dd></div>
                  <div><dt>Mandate</dt><dd>INV-4471</dd></div>
                  <div><dt>Valid for</dt><dd>1 hour</dd></div>
                </dl>
              </div>
            </div>

            <p className="editor-note" style={{ marginBottom: 16 }}>
              <strong>Controlled mutation.</strong> You are mutating a valid deterministic authorization. Auctorail runs the real local attack-harness check for this boundary; no live external effect is attempted.
            </p>

            <button className="btn btn-primary btn-block" onClick={runAttack} disabled={running} type="button">
              <span>{running ? "RUNNING ATTACK..." : "RUN ATTACK"}</span><span className="arrow" aria-hidden="true">→</span>
            </button>
          </div>

          <div className="card card-pad last-result" aria-label="Last result">
            <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>LAST RESULT</span>
            {lastResult && lastPreset ? <>
              <div className={`lr-status ${lastResult.passed ? "blocked" : "failed"}`}>
                <span>{lastResult.passed ? "✓" : "×"}</span>
                <div>
                  <strong>{lastResult.passed ? "ATTACK BLOCKED" : "BOUNDARY FAILED"}</strong>
                  <p>{lastResult.passed ? "Auctorail stopped this mutated request before protected execution." : "The expected security boundary did not hold."}</p>
                </div>
              </div>
              <dl className="kv">
                <div><dt>BOUNDARY</dt><dd>{lastPreset.boundary}</dd></div>
                <div><dt>REASON</dt><dd className="mono">{lastResult.observed}</dd></div>
                <div><dt>STOPPED AT</dt><dd>{lastPreset.stoppedAt}</dd></div>
                <div><dt>TIME</dt><dd className="mono">{lastTime}</dd></div>
              </dl>
              <div className="compare-row">
                <div><span>EXPECTED</span><strong>{lastResult.expected}</strong></div>
                <div><span>OBSERVED</span><strong>{lastResult.observed}</strong></div>
              </div>
              <details className="technical" style={{ marginBottom: 14 }}>
                <summary>VIEW TECHNICAL TRACE ↓</summary>
                <div className="verify-json" style={{ border: 0, borderRadius: 0 }}><pre>{JSON.stringify(lastResult, null, 2)}</pre></div>
              </details>
              <button className="btn btn-ghost btn-block" type="button" onClick={() => { setLastResult(null); setLastPreset(null); }}>TRY ANOTHER MUTATION ↻</button>
            </> : report ? <div className="empty-result"><strong>SUITE COMPLETE · {report.passed}/{report.total}</strong><p>{report.allPassed ? "Every deterministic attack was rejected by its expected security boundary." : "The full suite did not hold — review the scenario report below."} Pick a single mutation above to see one boundary in detail.</p></div> : <div className="empty-result"><strong>NO ATTACK RUN YET</strong><p>Choose a mutation and run it. The exact enforcement boundary will appear here.</p></div>}
          </div>

          {error && <div className="lab-error" role="alert"><strong>LAB STOPPED</strong><span>{error}</span></div>}

          <div className="card card-pad suite-card">
            <div className="suite-copy">
              <strong>RUN FULL ATTACK SUITE</strong>
              <p>Execute every deterministic adversarial test against the authorization boundary.</p>
              <button className="btn" onClick={runFullSuite} disabled={runningSuite} type="button">
                <span>{runningSuite ? "RUNNING SUITE..." : "RUN SUITE"}</span><span className="arrow" aria-hidden="true">→</span>
              </button>
            </div>
            <div className={`suite-score ${report?.allPassed ? "passed" : ""}`}>
              <b>{report ? `${report.passed}/${report.total}` : "—/—"}</b>
              <strong>{report?.allPassed ? "RAIL HELD" : "AWAITING RUN"}</strong>
              <span>{report?.allPassed ? "Every attack was rejected by the expected security boundary." : "Run the suite to verify every invariant."}</span>
            </div>
          </div>

          <div className="card card-pad">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="eyebrow">RECENT ATTACKS</span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{recent.length ? "LATEST SUITE" : "NO RESULTS YET"}</span>
            </div>
            {recent.length ? (
              <div className="recent-list">
                {recent.map((item) => (
                  <div key={item.id}>
                    <span>{item.attack}</span>
                    <b className={item.passed ? "ok" : "fail"}>{item.passed ? "BLOCKED" : "FAILED"}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-3)" }}>Run an attack or the full suite to populate deterministic results.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
