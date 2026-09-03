import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DecisionRecord } from "../src/policy/payments-strict-v1";
import "./styles.css";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const shortVendor = `${VENDOR.slice(0, 6)}...${VENDOR.slice(-4)}`;

type ApiDecision = DecisionRecord & { error?: string; evidence?: { status?: string; code?: string; completedIntents?: string[]; bundleHash?: string; spendRaw?: string } };

function App() {
  const [limit, setLimit] = useState("10.00");
  const [amount, setAmount] = useState("7.00");
  const [reason, setReason] = useState("Pay supplier invoice");
  const [reference, setReference] = useState("INV-1042");
  const [decision, setDecision] = useState<ApiDecision | null>(null);
  const [running, setRunning] = useState(false);
  const withinLimit = Number(amount) > 0 && Number(amount) <= Number(limit);
  const clearDecision = () => setDecision(null);
  const summary = useMemo(() => `${amount || "0.00"} USDC is ${withinLimit ? "within" : "above"} your ${limit || "0.00"} USDC spending boundary.`, [amount, limit, withinLimit]);

  async function runProofGate() {
    setRunning(true); setDecision(null);
    try {
      const response = await fetch("/api/authorize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit, amount, reason, reference }) });
      const result = await response.json() as ApiDecision;
      if (!response.ok && result.decision !== "HOLD") throw new Error(result.error ?? "authorization_failed");
      setDecision(result);
    } catch (error) {
      setDecision({ decision: "HOLD", reason: error instanceof Error ? error.message : "authorization_failed", policyId: "payments.adaptive.v1", policyVersion: 1, agentId: "demo-agent", actionId: "unavailable", mandate: { mandateId: "unavailable", mandateHash: "unavailable", principalId: "unavailable", agentId: "demo-agent", version: 1 }, checks: [], decidedAt: new Date().toISOString() });
    } finally { setRunning(false); }
  }

  const status = decision?.decision;
  const statusCopy = status === "ALLOW" ? "Verified evidence supports a one-use permission for this exact action." : status === "HOLD" ? decision?.reason === "telegraph_credentials_unavailable" ? "The trusted Telegraph verifier is not configured yet." : "ProofGate could not verify enough independent evidence." : status === "BLOCK" ? decision?.reason === "mandate_amount_violation" ? "The proposed payment exceeds the delegated boundary." : "This action violates the delegated authority or received disqualifying evidence." : "Ready to evaluate this exact action.";
  const statusLabel = status ?? "READY";

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><i /><i /><i /></span><span>ProofGate</span></a><nav><a className="active" href="#try">Playground</a><a href="#developer">Developer</a><a href="#about">About</a></nav><div className="network-chip"><span className="pulse" /> Testnet mode</div></header>
    <main id="try" className="page">
      <section className="hero" id="top"><div className="hero-copy"><div className="eyebrow"><span>●</span> TRUSTED AUTHORIZATION LAYER</div><h1>Proof before<br /><em>permission.</em></h1><p>Define the boundary. Freeze the action. Let independent evidence decide what happens next.</p></div><div className="hero-card"><div className="hero-card-top"><span className="shield">⌑</span><span>PROOFGATE GATEWAY</span><b>v1.2</b></div><div className="hero-rule" /><div className="hero-metric"><strong>0</strong><span>payments executed<br /><small>during evaluation</small></span></div><div className="hero-footer"><span className="live-dot" /> Evidence-first protection active</div></div></section>
      <div className="context-row"><div className="context-pill"><span className="chain-icon">◆</span><strong>Base Sepolia</strong><span className="muted">testnet</span><span className="divider" /><strong>USDC</strong></div><button className="example" onClick={() => { setLimit("10.00"); setAmount("7.00"); setReason("Pay supplier invoice"); setReference("INV-1042"); clearDecision(); }}><span className="doc-icon">▤</span> Load vendor invoice example <span className="chevron">↗</span></button></div>
      <section className="cards"><article className="card boundary"><div className="card-heading"><span className="step blue-step">01</span><div><div className="card-kicker">PRINCIPAL MANDATE</div><h2>Set the boundary</h2><p>What is this agent allowed to do?</p></div><span className="card-status">LOCKED</span></div><div className="field"><label>Maximum per payment</label><div className="money-input"><span>$</span><input inputMode="decimal" value={limit} onChange={e => { setLimit(e.target.value); clearDecision(); }} /><b>USDC</b></div></div><div className="field"><label>Approved recipient</label><div className="static-field recipient"><span className="avatar">PV</span><span><strong>ProofGate Vendor</strong><small>{shortVendor}</small></span><span className="verified">✓ Verified</span></div></div><div className="field compact-field"><label>Permission expires</label><div className="static-field"><span className="field-symbol">◷</span><strong>24 hours</strong><span className="field-end">rolling mandate</span></div></div><div className="boundary-note"><span>⌁</span><div><strong>Boundary enforced at evaluation</strong><small>This agent may spend up to {limit || "0.00"} USDC with this recipient.</small></div></div></article>
      <article className="card proposal"><div className="card-heading"><span className="step violet-step">02</span><div><div className="card-kicker">AGENT PROPOSAL</div><h2>Propose the action</h2><p>What should the agent do now?</p></div><span className="card-status neutral-status">DRAFT</span></div><div className="field"><label>Payment amount</label><div className="money-input"><span>$</span><input inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); clearDecision(); }} /><b>USDC</b></div></div><div className="field"><label>Recipient</label><div className="static-field recipient"><span className="avatar vendor-avatar">PV</span><span><strong>ProofGate Vendor</strong><small>{shortVendor}</small></span><span className="arrow">↗</span></div></div><div className="field"><label>Reason for payment</label><input className="text-input" value={reason} onChange={e => { setReason(e.target.value); clearDecision(); }} /></div><div className="field"><label>Reference <span className="optional">OPTIONAL</span></label><input className="text-input" value={reference} placeholder="Invoice #, PO #, task ID" onChange={e => { setReference(e.target.value); clearDecision(); }} /></div><div className={`limit-note ${withinLimit ? "good" : "bad"}`}><span>{withinLimit ? "✓" : "!"}</span><strong>{summary}</strong></div></article></section>
      <section className="run-section"><div className="run-line"><span /><button className="primary" onClick={runProofGate} disabled={running}><span className="button-icon">{running ? "◌" : "⌁"}</span>{running ? "Evaluating exact action…" : "Run ProofGate"}<b>→</b></button><span /></div><p><span>▣</span> Evaluation only · no payment will be sent</p></section>
      <section className={`result ${status ? status.toLowerCase() : "neutral"}`} aria-live="polite"><div className="result-icon">{status === "BLOCK" ? "×" : status === "ALLOW" ? "✓" : status === "HOLD" ? "!" : "⌑"}</div><div className="result-body"><div className="result-meta"><span>AUTHORIZATION RESULT</span><strong>{statusLabel}</strong></div><h3>{status ? statusCopy : "Ready to evaluate this exact action."}</h3><p>{status === "ALLOW" ? "One-use permission ready. Execution has not happened." : status === "HOLD" ? "No permission issued. No transaction sent." : status === "BLOCK" ? "The protected side effect remains unreachable." : "ProofGate will return ALLOW, HOLD, or BLOCK."}</p></div>{decision?.evidence && <div className="evidence-pill"><span>◈</span>{decision.evidence.completedIntents?.length ?? 0} intents verified</div>}</section>
      <div className="flow-strip"><span className="flow-done">01 <b>Mandate</b></span><i>→</i><span>02 <b>Action</b></span><i>→</i><span>03 <b>Evidence</b></span><i>→</i><span>04 <b>Decision</b></span><i>→</i><span>05 <b>Permit</b></span></div>
    </main><footer><span>ProofGate</span><span>Evidence is not authority.</span><span>Check-only playground · Base Sepolia</span></footer>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App />);
