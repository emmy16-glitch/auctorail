import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const API_BASE = (import.meta.env.VITE_PROOFGATE_API_URL ?? "").replace(/\/$/, "");

type Decision = "ALLOW" | "HOLD" | "BLOCK";
type RiskTier = "LOW" | "MEDIUM" | "HIGH";
type ViewState = "setup" | "preflight" | "live" | "result" | "error";

interface EvidenceRequirementSummary {
  intent: string;
  label: string;
  minimumDistinctMiners: number;
  minimumPositiveResults: number;
  minimumPositiveConfidence: number | null;
}

interface WebAuthorizationResponse {
  status: "BLOCKED" | "REQUIRES_INTELLIGENCE" | "DECIDED";
  decision: Decision | null;
  reason: string;
  riskTier: RiskTier;
  policyId: string;
  policyVersion: number;
  executionAuthorized: false;
  permit: null;
  action: {
    id: string;
    hash: string;
    amount: string;
    amountRaw: string;
    recipient: string;
    chainId: number;
    chain: string;
    asset: string;
    reason: string;
    reference: string;
  };
  mandate: {
    id: string;
    hash: string;
    maxPerAction: string;
    expiresAt: string;
  };
  requirements: EvidenceRequirementSummary[];
  evidence: {
    status: string;
    code?: string;
    spendRaw: string;
    bundleHash?: string;
    rejectedAttempts?: number;
    completedIntents?: string[];
  };
}

interface ApiError {
  error?: string;
}

const scenarios = {
  vendor: {
    label: "Vendor invoice · within authority",
    limit: "10.00",
    amount: "7.00",
    reason: "Pay supplier invoice",
    reference: "INV-1042"
  },
  blocked: {
    label: "Over-limit payment · blocked locally",
    limit: "5.00",
    amount: "7.00",
    reason: "Pay supplier invoice",
    reference: "INV-1042"
  },
  low: {
    label: "Small payment · low consequence",
    limit: "1.00",
    amount: "0.50",
    reason: "Pay test invoice",
    reference: "INV-1001"
  }
} as const;

type ScenarioKey = keyof typeof scenarios;

function shortValue(value: string): string {
  return value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}

function parseAmount(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{0,6})?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function riskCopy(risk: RiskTier): string {
  if (risk === "LOW") return "A small payment needs a focused external check before permission can be considered.";
  if (risk === "MEDIUM") return "A larger payment needs independent fraud evidence plus transaction intelligence.";
  return "A high-consequence payment needs stronger independent corroboration across multiple intelligence checks.";
}

function requirementCopy(requirement: EvidenceRequirementSummary): string {
  const sourceWord = requirement.minimumDistinctMiners === 1 ? "source" : "sources";
  const parts = [`${requirement.minimumDistinctMiners} independent ${sourceWord}`];
  if (requirement.minimumPositiveResults > 0) {
    parts.push(`${requirement.minimumPositiveResults} qualifying result${requirement.minimumPositiveResults === 1 ? "" : "s"}`);
  }
  if (requirement.minimumPositiveConfidence !== null) {
    parts.push(`${Math.round(requirement.minimumPositiveConfidence * 100)}% minimum confidence`);
  }
  return parts.join(" · ");
}

function friendlyError(code: string): string {
  switch (code) {
    case "live_authorization_disabled":
      return "Live Telegraph verification is not enabled on this deployment yet.";
    case "telegraph_credentials_unavailable":
      return "The live Telegraph verifier is not configured on this deployment.";
    case "live_rate_limited":
      return "This browser has reached the live-verification limit. Try again later.";
    case "policy_rate_limited":
      return "Too many policy checks were requested at once. Try again shortly.";
    case "live_daily_budget_exhausted":
      return "The public live-verification budget has been reached for today.";
    case "idempotency_key_required":
      return "The live request could not be safely identified. Please retry.";
    case "live_verification_failed":
      return "Telegraph verification did not complete safely. ProofGate issued no permission.";
    case "origin_not_allowed":
      return "This deployment is not allowed to call the ProofGate API.";
    default:
      return "ProofGate could not complete this check. No permission was issued and no payment was sent.";
  }
}

function Header(props: {
  darkMode: boolean;
  mobileMenuOpen: boolean;
  onToggleTheme: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onTry: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand brand-button" type="button" onClick={props.onTry} aria-label="Go to Try ProofGate">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>ProofGate</span>
        </button>

        <div className="desktop-actions">
          <nav aria-label="Primary navigation">
            <button className="nav-link active" type="button" onClick={props.onTry}>Try ProofGate</button>
            <a href="#developers">Developers</a>
            <a href="#about">About</a>
          </nav>
          <button className="theme-toggle" type="button" onClick={props.onToggleTheme}>{props.darkMode ? "Light" : "Dark"}</button>
        </div>

        <button className="menu-button" type="button" aria-expanded={props.mobileMenuOpen} aria-controls="mobile-nav" aria-label="Open navigation" onClick={props.onToggleMenu}>
          <span /><span /><span />
        </button>
      </div>

      {props.mobileMenuOpen && (
        <div className="mobile-nav" id="mobile-nav">
          <button type="button" onClick={() => { props.onTry(); props.onCloseMenu(); }}>Try ProofGate</button>
          <a href="#developers" onClick={props.onCloseMenu}>Developers</a>
          <a href="#about" onClick={props.onCloseMenu}>About</a>
          <button type="button" onClick={props.onToggleTheme}>{props.darkMode ? "Use light mode" : "Use dark mode"}</button>
        </div>
      )}
    </header>
  );
}

function ContextPill() {
  return <div className="context-pill" aria-label="Current environment"><span className="dot" />Base Sepolia testnet <span>·</span> USDC</div>;
}

function App() {
  const [limit, setLimit] = useState("10.00");
  const [amount, setAmount] = useState("7.00");
  const [reason, setReason] = useState("Pay supplier invoice");
  const [reference, setReference] = useState("INV-1042");
  const [scenario, setScenario] = useState<ScenarioKey>("vendor");
  const [response, setResponse] = useState<WebAuthorizationResponse | null>(null);
  const [viewState, setViewState] = useState<ViewState>("setup");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem("proofgate-theme") === "dark");
  const [liveRequestKey, setLiveRequestKey] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("proofgate-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const limitNumber = parseAmount(limit);
  const amountNumber = parseAmount(amount);
  const limitError = limitNumber === null || limitNumber <= 0 || limitNumber > 10 ? "Enter an amount from 0.000001 to 10 USDC." : null;
  const amountError = amountNumber === null || amountNumber <= 0 || amountNumber > 10 ? "Enter an amount from 0.000001 to 10 USDC." : null;
  const withinLimit = !limitError && !amountError && amountNumber! <= limitNumber!;
  const canRun = !limitError && !amountError && reason.trim().length > 0 && !running;

  const summary = useMemo(() => {
    if (limitError || amountError) return "Enter valid amounts to compare this action with the boundary.";
    return withinLimit
      ? `${amount} USDC is within the agent's ${limit} USDC spending limit.`
      : `${amount} USDC exceeds the agent's ${limit} USDC spending limit.`;
  }, [amount, amountError, limit, limitError, withinLimit]);

  function returnToSetup() {
    setResponse(null);
    setViewState("setup");
    setErrorCode(null);
    setLiveRequestKey(null);
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function resetDecision() {
    if (viewState !== "setup") setViewState("setup");
    setResponse(null);
    setErrorCode(null);
    setLiveRequestKey(null);
  }

  function applyScenario(key: ScenarioKey) {
    const next = scenarios[key];
    setScenario(key);
    setLimit(next.limit);
    setAmount(next.amount);
    setReason(next.reason);
    setReference(next.reference);
    resetDecision();
  }

  async function requestAuthorization(mode: "policy" | "live") {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (mode === "live") {
      const key = liveRequestKey ?? crypto.randomUUID();
      if (!liveRequestKey) setLiveRequestKey(key);
      headers["idempotency-key"] = key;
    }

    const result = await fetch(`${API_BASE}/api/authorize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ mode, limit, amount, reason, reference })
    });
    const body = await result.json() as WebAuthorizationResponse & ApiError;
    if (!result.ok) throw new Error(body.error ?? "authorization_failed");
    return body;
  }

  async function runProofGate() {
    if (!canRun) return;
    setRunning(true);
    setErrorCode(null);
    setResponse(null);
    try {
      const result = await requestAuthorization("policy");
      setResponse(result);
      setViewState(result.status === "BLOCKED" ? "result" : "preflight");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "authorization_failed");
      setViewState("error");
    } finally {
      setRunning(false);
    }
  }

  async function runLiveVerification() {
    if (!response) return;
    setRunning(true);
    setErrorCode(null);
    setViewState("live");
    try {
      const result = await requestAuthorization("live");
      setResponse(result);
      setViewState("result");
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "authorization_failed");
      setViewState("error");
    } finally {
      setRunning(false);
    }
  }

  const decision = response?.decision ?? null;
  const completed = new Set(response?.evidence.completedIntents ?? []);

  return (
    <div className="app-shell">
      <Header
        darkMode={darkMode}
        mobileMenuOpen={mobileMenuOpen}
        onToggleTheme={() => setDarkMode(value => !value)}
        onToggleMenu={() => setMobileMenuOpen(value => !value)}
        onCloseMenu={() => setMobileMenuOpen(false)}
        onTry={returnToSetup}
      />

      {viewState === "setup" && (
        <main id="try" className="page setup-page">
          <section className="hero" id="top">
            <div className="hero-copy">
              <h1>Proof before permission.</h1>
              <p>Set what an agent is allowed to do, propose an action, and see whether ProofGate permits it.</p>
            </div>
            <ContextPill />
          </section>

          <div className="scenario-row">
            <label className="scenario-picker">
              <span>Try an example</span>
              <select value={scenario} onChange={(event) => applyScenario(event.target.value as ScenarioKey)}>
                {Object.entries(scenarios).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </select>
            </label>
            <span className="support-note">Public demo scope: one Base Sepolia USDC payment, up to 10 USDC.</span>
          </div>

          <section className="cards" aria-label="Configure authorization">
            <article className="card">
              <div className="card-title">
                <span className="step">1</span>
                <div><h2>Set the boundary</h2><p>What can this agent spend?</p></div>
              </div>

              <label className="field-label">
                Maximum per payment
                <div className={`input-row amount-row ${limitError ? "invalid" : ""}`}>
                  <input inputMode="decimal" aria-invalid={Boolean(limitError)} value={limit} onChange={(event) => { setLimit(event.target.value); resetDecision(); }} />
                  <span>USDC</span>
                </div>
                {limitError && <small className="field-error">{limitError}</small>}
              </label>

              <div className="field-block">
                <span className="field-label-text">Who can receive it?</span>
                <div className="static-field"><strong>ProofGate Vendor</strong><small>{shortValue(VENDOR)} · Allowed recipient</small></div>
              </div>

              <div className="field-block">
                <span className="field-label-text">Permission expires</span>
                <div className="static-field single-line"><strong>24 hours</strong></div>
              </div>

              <div className="callout info">This agent may spend up to <strong>{limit || "0.00"} USDC</strong> with this recipient.</div>
            </article>

            <article className="card">
              <div className="card-title">
                <span className="step">2</span>
                <div><h2>Propose the action</h2><p>What should the agent do now?</p></div>
              </div>

              <label className="field-label">
                Payment amount
                <div className={`input-row amount-row ${amountError ? "invalid" : ""}`}>
                  <input inputMode="decimal" aria-invalid={Boolean(amountError)} value={amount} onChange={(event) => { setAmount(event.target.value); resetDecision(); }} />
                  <span>USDC</span>
                </div>
                {amountError && <small className="field-error">{amountError}</small>}
              </label>

              <div className="field-block">
                <span className="field-label-text">Recipient</span>
                <div className="static-field"><strong>ProofGate Vendor</strong><small>{shortValue(VENDOR)}</small></div>
              </div>

              <label className="field-label">Why is this payment needed?<input value={reason} maxLength={256} onChange={(event) => { setReason(event.target.value); resetDecision(); }} /></label>
              <label className="field-label">Reference <span className="optional">optional</span><input value={reference} maxLength={200} placeholder="Invoice #, PO #, task id..." onChange={(event) => { setReference(event.target.value); resetDecision(); }} /></label>

              <div className={`callout ${limitError || amountError ? "neutral" : withinLimit ? "success" : "danger"}`}>{summary}</div>
            </article>
          </section>

          <div className="action-area">
            <button className="primary" onClick={runProofGate} disabled={!canRun}>{running ? "Checking this action…" : "Run ProofGate"}<span aria-hidden="true">→</span></button>
            <small>Checking authorization does not execute a payment.</small>
          </div>

          <section className="ready-panel" aria-live="polite">
            <span className="decision-kicker">Ready</span>
            <h3>Ready to evaluate this exact action.</h3>
            <p>ProofGate checks delegated authority first. Telegraph is only queried when the action is already inside that boundary.</p>
          </section>

          <section className="developer-section" id="developers">
            <div>
              <span className="section-label">Developers</span>
              <h2>Inspect the proof, not just the verdict.</h2>
              <p>ProofGate freezes the action, checks delegated authority, determines the evidence required by consequence, and produces a deterministic decision record.</p>
            </div>
            <div className="developer-actions">
              <code>npm run demo</code>
              <code>npm run proof:adaptive -- 7</code>
              <a href="https://github.com/emmy16-glitch/proof-gate" target="_blank" rel="noreferrer">View source on GitHub <span>↗</span></a>
            </div>
          </section>

          <section className="about-section" id="about">
            <span className="section-label">Why Telegraph</span>
            <h2>Intelligence informs the decision. It does not grant authority.</h2>
            <p>Telegraph gives ProofGate access to live external intelligence. ProofGate combines that evidence with authority already delegated to the agent, then decides whether the exact action should be allowed, held, or blocked.</p>
          </section>
        </main>
      )}

      {(viewState === "preflight" || viewState === "live") && response && (
        <main className="page authorization-page">
          <div className="authorization-topline">
            <button className="back-button" type="button" onClick={returnToSetup}><span aria-hidden="true">←</span> Back to setup</button>
            <ContextPill />
          </div>

          <section className="authorization-heading">
            <span className="section-label">Authorization</span>
            <h1>{viewState === "live" ? "Checking this action." : "This action needs proof."}</h1>
            <p>{viewState === "live"
              ? "ProofGate is requesting live intelligence for this exact payment. The result is not predetermined."
              : "The action is inside the agent's delegated authority. ProofGate now determines how much external intelligence the consequence deserves."}</p>
          </section>

          <section className="action-summary" aria-label="Action being checked">
            <div className="summary-half">
              <span className="summary-label">Boundary</span>
              <strong>Up to {response.mandate.maxPerAction} USDC</strong>
              <small>ProofGate Vendor · expires in 24 hours</small>
            </div>
            <div className="summary-divider" aria-hidden="true" />
            <div className="summary-half">
              <span className="summary-label">Proposed action</span>
              <strong>Send {response.action.amount} USDC</strong>
              <small>ProofGate Vendor · {response.action.reason}</small>
            </div>
          </section>

          <div className="authorization-layout">
            <section className="authorization-flow" aria-label="ProofGate authorization stages">
              <article className="flow-stage passed">
                <div className="flow-index">1</div>
                <div className="flow-title">
                  <span>Delegated authority</span>
                  <small>Checked against the agent's boundary</small>
                </div>
                <div className="flow-content authority-checks">
                  <div><span className="checkmark">✓</span><p><strong>Amount is within the limit</strong><small>{response.action.amount} USDC ≤ {response.mandate.maxPerAction} USDC</small></p></div>
                  <div><span className="checkmark">✓</span><p><strong>Recipient is allowed</strong><small>Matches ProofGate Vendor · {shortValue(response.action.recipient)}</small></p></div>
                  <div><span className="checkmark">✓</span><p><strong>Permission is active</strong><small>Mandate is valid for this authorization check</small></p></div>
                </div>
                <span className="stage-status pass">Passed</span>
              </article>

              <article className="flow-stage">
                <div className="flow-index">2</div>
                <div className="flow-title">
                  <span>Consequence assessment</span>
                  <small>How much proof should this action require?</small>
                </div>
                <div className="flow-content risk-content">
                  <span className={`risk-pill ${response.riskTier.toLowerCase()}`}>{response.riskTier}</span>
                  <p>{riskCopy(response.riskTier)}</p>
                </div>
                <span className="stage-status">Requires intelligence</span>
              </article>

              <article className={`flow-stage intelligence-stage ${viewState === "live" ? "active" : ""}`}>
                <div className="flow-index">3</div>
                <div className="flow-title">
                  <span>External intelligence</span>
                  <small>Requested through Telegraph only after authority passes</small>
                </div>
                <div className="flow-content intelligence-content">
                  <div className="intelligence-header">
                    <div>
                      <strong>{viewState === "live" ? "Requesting live intelligence through Telegraph" : "ProofGate is ready to request live intelligence"}</strong>
                      <small>{viewState === "live" ? "Waiting for Telegraph and the required Miners to return evidence." : "Nothing below has been queried yet."}</small>
                    </div>
                    {viewState === "live" && <span className="live-indicator"><i /> Live</span>}
                  </div>

                  <div className="intelligence-list">
                    {response.requirements.map((requirement) => (
                      <div className="intelligence-row" key={requirement.intent}>
                        <div className="intelligence-copy">
                          <span className="intel-mark" aria-hidden="true" />
                          <p><strong>{requirement.label}</strong><small>{requirementCopy(requirement)}</small></p>
                        </div>
                        <span className={`intel-status ${viewState === "live" ? "working" : "waiting"}`}>{viewState === "live" ? "Requesting" : "Not requested"}</span>
                      </div>
                    ))}
                  </div>

                  {viewState === "preflight" ? (
                    <div className="live-action">
                      <button className="primary live-button" type="button" onClick={runLiveVerification} disabled={running}>Run live verification <span>→</span></button>
                      <small>Uses real Telegraph intelligence and x402 testnet payments. The proposed payment is not executed.</small>
                    </div>
                  ) : (
                    <div className="live-action live-waiting">
                      <span className="spinner" aria-hidden="true" />
                      <p><strong>Verification in progress</strong><small>Keep this page open. ProofGate will show the actual decision returned by the completed evidence run.</small></p>
                    </div>
                  )}
                </div>
              </article>
            </section>

            <aside className="authorization-rail" aria-label="Authorization status">
              <div className="rail-title">
                <span className="rail-live-dot" />
                <div><strong>Authorization status</strong><small>One action. One decision.</small></div>
              </div>
              <ol className="rail-steps">
                <li className="done"><span>1</span><div><strong>Authority</strong><small>Passed</small></div></li>
                <li className={viewState === "live" ? "active" : "current"}><span>2</span><div><strong>External verification</strong><small>{viewState === "live" ? "In progress" : "Ready"}</small></div></li>
                <li><span>3</span><div><strong>Final decision</strong><small>ALLOW, HOLD, or BLOCK</small></div></li>
                <li><span>4</span><div><strong>Execution</strong><small>Always separate</small></div></li>
              </ol>
              <div className="separation-note">
                <strong>Authorization ≠ execution</strong>
                <p>ProofGate decides whether an action may proceed. This public flow never sends the proposed payment.</p>
              </div>
            </aside>
          </div>
        </main>
      )}

      {viewState === "result" && response && decision && (
        <main className="page result-page">
          <div className="authorization-topline">
            <button className="back-button" type="button" onClick={returnToSetup}><span aria-hidden="true">←</span> Back to setup</button>
            <ContextPill />
          </div>

          <section className={`final-decision ${decision.toLowerCase()}`}>
            <div className="final-mark"><span>{decision}</span></div>
            <div className="final-copy">
              <span className="section-label">Final authorization decision</span>
              <h1>{decision === "BLOCK" ? "Permission denied." : decision === "HOLD" ? "Permission withheld." : "Evidence and policy checks passed."}</h1>
              <p>{decision === "BLOCK"
                ? response.reason === "mandate_amount_violation" ? "The proposed payment exceeds the agent's delegated limit." : "This action violates policy or received disqualifying evidence."
                : decision === "HOLD"
                  ? "ProofGate could not verify enough qualifying evidence to authorize this action."
                  : "ProofGate returned ALLOW for this exact action. Execution is still a separate step and is not performed by this public flow."}</p>
            </div>
          </section>

          <section className="result-grid">
            <article className="result-card">
              <span className="summary-label">Action</span>
              <strong>{response.action.amount} USDC → ProofGate Vendor</strong>
              <small>{response.action.chain} · {response.action.reason}</small>
            </article>
            <article className="result-card">
              <span className="summary-label">Boundary</span>
              <strong>Up to {response.mandate.maxPerAction} USDC</strong>
              <small>Exact recipient · 24 hour mandate</small>
            </article>
            <article className="result-card">
              <span className="summary-label">External evidence</span>
              <strong>{response.evidence.status === "NOT_REQUESTED" ? "Not queried" : response.evidence.status}</strong>
              <small>{response.evidence.status === "NOT_REQUESTED" ? "Blocked before external intelligence" : `${(Number(response.evidence.spendRaw) / 1_000_000).toFixed(4)} USDC evidence spend`}</small>
            </article>
          </section>

          {response.evidence.status === "NOT_REQUESTED" ? (
            <div className="decision-explanation">Telegraph was not queried because external intelligence cannot expand delegated authority.</div>
          ) : (
            <section className="evidence-result-list">
              <div className="evidence-result-heading"><div><span className="section-label">Evidence</span><h2>What ProofGate received.</h2></div><span>{response.evidence.rejectedAttempts ?? 0} rejected attempt{response.evidence.rejectedAttempts === 1 ? "" : "s"}</span></div>
              {response.requirements.map((requirement) => (
                <div className="evidence-result-row" key={requirement.intent}>
                  <div><strong>{requirement.label}</strong><small>{requirementCopy(requirement)}</small></div>
                  <span className={completed.has(requirement.intent) ? "completed" : "incomplete"}>{completed.has(requirement.intent) ? "Completed" : "Not completed"}</span>
                </div>
              ))}
            </section>
          )}

          <details className="technical-proof final-proof">
            <summary>View technical proof</summary>
            <div className="proof-grid">
              <div><span>Policy</span><strong>{response.policyId} · v{response.policyVersion}</strong></div>
              <div><span>Risk tier</span><strong>{response.riskTier}</strong></div>
              <div><span>Action hash</span><code title={response.action.hash}>{shortValue(response.action.hash)}</code></div>
              <div><span>Mandate hash</span><code title={response.mandate.hash}>{shortValue(response.mandate.hash)}</code></div>
              <div><span>Chain</span><strong>Base Sepolia · {response.action.chainId}</strong></div>
              <div><span>Evidence spend</span><strong>{(Number(response.evidence.spendRaw) / 1_000_000).toFixed(4)} USDC</strong></div>
              {response.evidence.bundleHash && <div><span>Evidence bundle</span><code title={response.evidence.bundleHash}>{shortValue(response.evidence.bundleHash)}</code></div>}
            </div>
          </details>

          <div className="result-footer-actions">
            <button className="primary" type="button" onClick={returnToSetup}>Try another action <span>→</span></button>
            <small>No protected payment was sent.</small>
          </div>
        </main>
      )}

      {viewState === "error" && (
        <main className="page error-page">
          <div className="authorization-topline">
            <button className="back-button" type="button" onClick={returnToSetup}><span aria-hidden="true">←</span> Back to setup</button>
            <ContextPill />
          </div>
          <section className="error-card">
            <span className="section-label">No decision issued</span>
            <h1>Verification stopped safely.</h1>
            <p>{friendlyError(errorCode ?? "authorization_failed")}</p>
            <div className="error-actions">
              {response?.status === "REQUIRES_INTELLIGENCE" && <button className="primary" type="button" onClick={() => setViewState("preflight")}>Return to verification</button>}
              <button className="text-button" type="button" onClick={returnToSetup}>Edit action</button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
