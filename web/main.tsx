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

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function parseAmount(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{0,6})?$/.test(value)) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function friendlyError(code: string): string {
  switch (code) {
    case "live_authorization_disabled":
      return "Live Telegraph verification is not enabled on this deployment yet.";
    case "telegraph_credentials_unavailable":
      return "The live Telegraph verifier is not configured on this deployment.";
    case "live_rate_limited":
      return "This browser has reached the live-verification limit. Try again later.";
    case "live_daily_budget_exhausted":
      return "The public live-verification budget has been reached for today.";
    case "idempotency_key_required":
      return "The live request could not be safely identified. Please retry.";
    default:
      return "ProofGate could not complete this check. No permission was issued and no payment was sent.";
  }
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
  const limitError = limitNumber === null || limitNumber <= 0 || limitNumber > 10
    ? "Enter an amount from 0.000001 to 10 USDC."
    : null;
  const amountError = amountNumber === null || amountNumber <= 0 || amountNumber > 10
    ? "Enter an amount from 0.000001 to 10 USDC."
    : null;
  const withinLimit = !limitError && !amountError && amountNumber! <= limitNumber!;
  const canRun = !limitError && !amountError && reason.trim().length > 0 && !running;

  const summary = useMemo(() => {
    if (limitError || amountError) return "Enter valid amounts to compare this action with the boundary.";
    return withinLimit
      ? `${amount} USDC is within the agent's ${limit} USDC spending limit.`
      : `${amount} USDC exceeds the agent's ${limit} USDC spending limit.`;
  }, [amount, amountError, limit, limitError, withinLimit]);

  function resetDecision() {
    setResponse(null);
    setViewState("setup");
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
      window.requestAnimationFrame(() => document.getElementById("decision")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch (error) {
      setErrorCode(error instanceof Error ? error.message : "authorization_failed");
      setViewState("error");
    } finally {
      setRunning(false);
    }
  }

  async function runLiveVerification() {
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#top" aria-label="ProofGate home" onClick={() => setMobileMenuOpen(false)}>
            <span className="brand-mark" aria-hidden="true"><i /><i /></span>
            <span>ProofGate</span>
          </a>

          <div className="desktop-actions">
            <nav aria-label="Primary navigation">
              <a className="active" href="#try">Try ProofGate</a>
              <a href="#developers">Developers</a>
              <a href="#about">About</a>
            </nav>
            <button className="theme-toggle" type="button" onClick={() => setDarkMode(value => !value)}>
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>

          <button
            className="menu-button"
            type="button"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
            aria-label="Open navigation"
            onClick={() => setMobileMenuOpen(value => !value)}
          >
            <span /><span /><span />
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="mobile-nav" id="mobile-nav">
            <a href="#try" onClick={() => setMobileMenuOpen(false)}>Try ProofGate</a>
            <a href="#developers" onClick={() => setMobileMenuOpen(false)}>Developers</a>
            <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
            <button type="button" onClick={() => setDarkMode(value => !value)}>{darkMode ? "Use light mode" : "Use dark mode"}</button>
          </div>
        )}
      </header>

      <main id="try" className="page">
        <section className="hero" id="top">
          <div className="hero-copy">
            <h1>Proof before permission.</h1>
            <p>Set what an agent is allowed to do, propose an action, and see whether ProofGate permits it.</p>
          </div>
          <div className="context-pill" aria-label="Current environment"><span className="dot" />Base Sepolia testnet <span>·</span> USDC</div>
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
              <div className="static-field"><strong>ProofGate Vendor</strong><small>{shortAddress(VENDOR)} · Allowed recipient</small></div>
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
              <div className="static-field"><strong>ProofGate Vendor</strong><small>{shortAddress(VENDOR)}</small></div>
            </div>

            <label className="field-label">Why is this payment needed?<input value={reason} maxLength={256} onChange={(event) => { setReason(event.target.value); resetDecision(); }} /></label>
            <label className="field-label">Reference <span className="optional">optional</span><input value={reference} maxLength={200} placeholder="Invoice #, PO #, task id..." onChange={(event) => { setReference(event.target.value); resetDecision(); }} /></label>

            <div className={`callout ${limitError || amountError ? "neutral" : withinLimit ? "success" : "danger"}`}>{summary}</div>
          </article>
        </section>

        <div className="action-area">
          <button className="primary" onClick={runProofGate} disabled={!canRun}>{running && viewState === "setup" ? "Checking this action…" : "Run ProofGate"}<span aria-hidden="true">→</span></button>
          <small>Checking authorization does not execute a payment.</small>
        </div>

        <section className={`decision-panel ${decision ? decision.toLowerCase() : viewState}`} id="decision" aria-live="polite">
          {viewState === "setup" && (
            <div className="ready-state">
              <span className="decision-kicker">Ready</span>
              <h3>Ready to evaluate this exact action.</h3>
              <p>ProofGate will first check the action against the boundary above. External intelligence is only requested if the action is already authorized locally.</p>
            </div>
          )}

          {viewState === "preflight" && response && (
            <div className="verification-state">
              <div className="decision-copy">
                <span className="decision-kicker success-text">Authority check passed</span>
                <h3>This action requires external verification.</h3>
                <p>The payment fits the mandate. ProofGate classified it as <strong>{response.riskTier}</strong> consequence and will require live intelligence before making a final decision.</p>
                <dl className="facts">
                  <div><dt>Boundary</dt><dd>Up to {response.mandate.maxPerAction} USDC</dd></div>
                  <div><dt>Proposed</dt><dd>{response.action.amount} USDC</dd></div>
                  <div><dt>Consequence</dt><dd>{response.riskTier}</dd></div>
                </dl>
              </div>
              <div className="requirements">
                <span className="eyebrow">Required intelligence</span>
                {response.requirements.map((requirement) => (
                  <div className="requirement" key={requirement.intent}>
                    <div><strong>{requirement.label}</strong><small>{requirement.minimumDistinctMiners} independent source{requirement.minimumDistinctMiners === 1 ? "" : "s"}</small></div>
                    <span>Required</span>
                  </div>
                ))}
                <button className="secondary-primary" type="button" onClick={runLiveVerification} disabled={running}>Run live verification <span>→</span></button>
                <small className="live-note">Uses real Telegraph intelligence and x402. The proposed payment is not executed.</small>
              </div>
            </div>
          )}

          {viewState === "live" && response && (
            <div className="live-state">
              <span className="live-pulse" aria-hidden="true" />
              <div>
                <span className="decision-kicker">Live Telegraph</span>
                <h3>Requesting external intelligence.</h3>
                <p>ProofGate is evaluating this exact action. The final result is not predetermined.</p>
              </div>
            </div>
          )}

          {viewState === "result" && response && decision && (
            <div className="result-state">
              <div className="decision-badge">{decision}</div>
              <div className="result-copy">
                <span className="decision-kicker">Final authorization decision</span>
                <h3>{decision === "BLOCK" ? "Permission denied." : decision === "HOLD" ? "Permission withheld." : "Evidence and policy checks passed."}</h3>
                <p>{decision === "BLOCK"
                  ? response.reason === "mandate_amount_violation" ? "The proposed payment exceeds the delegated limit." : "This action violates policy or received disqualifying evidence."
                  : decision === "HOLD"
                    ? "ProofGate could not verify enough qualifying evidence to authorize this action."
                    : "ProofGate returned ALLOW for this action. The public site still does not issue an execution permit or send a transaction."}</p>

                <dl className="facts">
                  <div><dt>Boundary</dt><dd>{response.mandate.maxPerAction} USDC</dd></div>
                  <div><dt>Proposed</dt><dd>{response.action.amount} USDC</dd></div>
                  <div><dt>External evidence</dt><dd>{response.evidence.status === "NOT_REQUESTED" ? "Not queried" : response.evidence.status}</dd></div>
                </dl>

                {response.evidence.status === "NOT_REQUESTED" && <div className="plain-note">Telegraph was not queried because external intelligence cannot expand delegated authority.</div>}
                {response.evidence.status !== "NOT_REQUESTED" && <div className="plain-note">No protected payment was sent. Authorization and execution remain separate.</div>}

                <div className="result-actions">
                  <button type="button" className="text-button" onClick={() => { resetDecision(); document.getElementById("top")?.scrollIntoView({ behavior: "smooth" }); }}>Edit action</button>
                  <details className="technical-proof">
                    <summary>View technical proof</summary>
                    <div className="proof-grid">
                      <div><span>Policy</span><strong>{response.policyId} · v{response.policyVersion}</strong></div>
                      <div><span>Risk tier</span><strong>{response.riskTier}</strong></div>
                      <div><span>Action hash</span><code title={response.action.hash}>{shortAddress(response.action.hash)}</code></div>
                      <div><span>Mandate hash</span><code title={response.mandate.hash}>{shortAddress(response.mandate.hash)}</code></div>
                      <div><span>Chain</span><strong>Base Sepolia · {response.action.chainId}</strong></div>
                      <div><span>Evidence spend</span><strong>{(Number(response.evidence.spendRaw) / 1_000_000).toFixed(4)} USDC</strong></div>
                      {response.evidence.bundleHash && <div><span>Evidence bundle</span><code title={response.evidence.bundleHash}>{shortAddress(response.evidence.bundleHash)}</code></div>}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )}

          {viewState === "error" && errorCode && (
            <div className="error-state">
              <span className="decision-kicker">No decision issued</span>
              <h3>Live verification could not complete.</h3>
              <p>{friendlyError(errorCode)}</p>
              <button type="button" className="text-button" onClick={() => setViewState(response?.status === "REQUIRES_INTELLIGENCE" ? "preflight" : "setup")}>Try again</button>
            </div>
          )}
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
          <p>Telegraph gives ProofGate access to live external intelligence. ProofGate combines that evidence with the authority already delegated to the agent, then decides whether the exact action should be allowed, held, or blocked.</p>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
