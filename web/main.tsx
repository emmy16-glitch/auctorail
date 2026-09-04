import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = (import.meta.env.VITE_PROOFGATE_API_URL ?? "").replace(/\/$/, "");
const VENDOR_ADDRESS = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT_ID = "invoice-bot";
const MAX_USDC = 10;
const DURATION_STEPS = [900, 1800, 3600, 7200, 14400, 28800, 86400] as const;

type Phase = "idle" | "checking" | "ready" | "error";
type Decision = "ALLOW" | "HOLD" | "BLOCK";

type AuthorizationResponse = {
  status: "BLOCKED" | "REQUIRES_INTELLIGENCE" | "DECIDED";
  decision: Decision | null;
  reason: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  policyId: string;
  policyVersion: number;
  routing?: {
    mode: string;
    endpoint: string;
  };
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
  evidence: {
    status: string;
    code?: string;
    spendRaw: string;
    bundleHash?: string;
    rejectedAttempts?: number;
    completedIntents?: string[];
  };
};

type ApiError = { error?: string; detail?: string };

type SvgProps = React.SVGProps<SVGSVGElement>;

function ShieldIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 48 56" aria-hidden="true" {...props}>
      <path d="M24 3 43 10v15c0 12-7.6 22.4-19 28C12.6 47.4 5 37 5 25V10L24 3Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter" />
    </svg>
  );
}

function MenuIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" {...props}>
      <path d="M4 7h20M4 14h20M4 21h20" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FileIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 38 44" aria-hidden="true" {...props}>
      <path d="M7 2h16l8 8v32H7V2Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M23 2v9h8M12 21h14M12 27h14M12 33h10" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LockIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 40 44" aria-hidden="true" {...props}>
      <path d="M11 18v-6a9 9 0 0 1 18 0v6M6 18h28v23H6V18Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 27v7" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function ChevronIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function formatUsdc(value: number): string {
  return value.toFixed(2);
}

function durationLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds === 3600) return "1 hour";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return "24 hours";
}

function friendlyError(code: string): string {
  switch (code) {
    case "live_authorization_disabled":
      return "Live checks are not enabled on this deployment.";
    case "telegraph_credentials_unavailable":
      return "The live Telegraph wallet is not connected yet.";
    case "live_rate_limited":
      return "The live-check limit was reached. Try again later.";
    case "live_daily_budget_exhausted":
      return "Today's live evidence budget has been used.";
    case "live_verification_failed":
      return "The real Miner check did not finish safely. Nothing was approved.";
    case "origin_not_allowed":
      return "This page is not allowed to use the ProofGate API.";
    default:
      return "The request could not be checked safely. Nothing was approved.";
  }
}

function App() {
  const [limit, setLimit] = useState(5);
  const [durationIndex, setDurationIndex] = useState(2);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("Supplier invoice #4471");
  const [reference, setReference] = useState("INV-4471");
  const [requestEditorOpen, setRequestEditorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AuthorizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const durationSeconds = DURATION_STEPS[durationIndex];
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= MAX_USDC;
  const limitValid = Number.isFinite(limit) && limit > 0 && limit <= MAX_USDC;
  const withinLimit = amountValid && limitValid && amount <= limit;
  const canCheck = amountValid && limitValid && reason.trim().length > 0 && phase !== "checking";

  const statusMessage = useMemo(() => {
    if (phase === "checking") return "Checking the rules, then asking real Telegraph Miners if evidence is required.";
    if (phase === "ready" && result?.decision) {
      const suffix = result.evidence.status === "NOT_REQUESTED" ? " No Miner call was needed because the rules already decided it." : " Real Miner evidence was used.";
      return `Decision ready: ${result.decision}.${suffix}`;
    }
    if (phase === "error" && error) return error;
    if (!withinLimit) return "This request is above the current limit. ProofGate will block it before any Miner is paid.";
    return "Nothing is sent yet. We check the rules and real evidence first. You stay in control.";
  }, [error, phase, result, withinLimit]);

  function resetDecision() {
    setPhase("idle");
    setResult(null);
    setError(null);
    requestIdRef.current = null;
  }

  function adjustLimit(delta: number) {
    setLimit((current) => Math.min(MAX_USDC, Math.max(0.01, Number((current + delta).toFixed(2)))));
    resetDecision();
  }

  function adjustDuration(delta: number) {
    setDurationIndex((current) => Math.min(DURATION_STEPS.length - 1, Math.max(0, current + delta)));
    resetDecision();
  }

  function adjustAmount(delta: number) {
    setAmount((current) => Math.min(MAX_USDC, Math.max(0.01, Number((current + delta).toFixed(2)))));
    resetDecision();
  }

  async function checkRequest() {
    if (!canCheck) return;
    setPhase("checking");
    setError(null);
    setResult(null);

    const idempotencyKey = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = idempotencyKey;

    try {
      const response = await fetch(`${API_BASE}/api/authorize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          mode: "live",
          agentId: AGENT_ID,
          limit: formatUsdc(limit),
          amount: formatUsdc(amount),
          destination: VENDOR_ADDRESS,
          durationSeconds,
          reason: reason.trim(),
          reference: reference.trim()
        })
      });

      const body = await response.json() as AuthorizationResponse & ApiError;
      if (!response.ok) throw new Error(body.error ?? "authorization_failed");
      setResult(body);
      setPhase("ready");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "authorization_failed";
      setError(friendlyError(code));
      setPhase("error");
      requestIdRef.current = null;
    }
  }

  return (
    <div className="app-page">
      <div className="live-strip" aria-label="Live environment">
        <span className="live-dot" />
        <span>LIVE</span><i>·</i><span>BASE SEPOLIA</span><i>·</i><span>REAL MINERS</span>
      </div>

      <header className="brand-row">
        <div className="brand-lockup">
          <ShieldIcon className="brand-shield" />
          <div>
            <strong>PROOFGATE</strong>
            <span>Real authorization</span>
          </div>
        </div>
        <div className="menu-wrap">
          <button className="menu-button" type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <MenuIcon />
          </button>
          {menuOpen && (
            <div className="menu-popover" role="menu">
              <a href="https://github.com/emmy16-glitch/proof-gate" target="_blank" rel="noreferrer" role="menuitem">View source ↗</a>
              <div className="menu-note">Live route only<br />Telegraph /v1/ask + x402</div>
            </div>
          )}
        </div>
      </header>

      <nav className="top-tabs" aria-label="ProofGate sections">
        <button type="button" className="active" aria-current="page">CHECK</button>
        <button type="button" disabled title="Activity is wired next">ACTIVITY</button>
        <button type="button" disabled title="Permissions is wired next">PERMISSIONS</button>
        <button type="button" disabled title="Security Lab is wired next">SECURITY LAB</button>
      </nav>

      <main className="content-shell">
        <section className="hero-block">
          <div>
            <h1>Control what an<br />agent can do.</h1>
            <p>Set the limit. Give it a request.<br />ProofGate decides whether it can proceed.</p>
          </div>
          <div className="hero-mark" aria-hidden="true">
            <span className="corner c1" /><span className="corner c2" /><span className="corner c3" /><span className="corner c4" />
            <ShieldIcon />
          </div>
        </section>

        <section className="authority-panel hard-shadow" aria-label="Agent permission">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">AGENT</span>
              <strong className="agent-name">invoice-bot</strong>
            </div>
            <span className="active-badge">ACTIVE</span>
          </div>

          <div className="control-section">
            <label>ALLOWED TO SEND (MAX)</label>
            <div className="stepper" role="group" aria-label="Maximum payment">
              <button type="button" aria-label="Decrease maximum payment" onClick={() => adjustLimit(-1)} disabled={limit <= 1}>−</button>
              <output data-testid="limit-value">{formatUsdc(limit)} USDC</output>
              <button type="button" aria-label="Increase maximum payment" onClick={() => adjustLimit(1)} disabled={limit >= MAX_USDC}>+</button>
            </div>
          </div>

          <div className="control-section">
            <label htmlFor="allowed-recipient">ONLY TO</label>
            <div className="select-shell">
              <select id="allowed-recipient" value={VENDOR_ADDRESS} disabled aria-label="Allowed recipient">
                <option value={VENDOR_ADDRESS}>ProofGate Vendor</option>
              </select>
              <ChevronIcon />
            </div>
          </div>

          <div className="control-section">
            <label>PERMISSION LASTS</label>
            <div className="stepper" role="group" aria-label="Permission duration">
              <button type="button" aria-label="Shorten permission duration" onClick={() => adjustDuration(-1)} disabled={durationIndex === 0}>−</button>
              <output data-testid="duration-value">{durationLabel(durationSeconds)}</output>
              <button type="button" aria-label="Extend permission duration" onClick={() => adjustDuration(1)} disabled={durationIndex === DURATION_STEPS.length - 1}>+</button>
            </div>
          </div>
        </section>

        <section className={`request-panel hard-shadow ${requestEditorOpen ? "editing" : ""}`} aria-label="Current request">
          <button className="request-summary" type="button" aria-expanded={requestEditorOpen} onClick={() => setRequestEditorOpen((open) => !open)}>
            <div>
              <span className="eyebrow">CURRENT REQUEST</span>
              <strong>{formatUsdc(amount)} USDC → ProofGate Vendor</strong>
              <span>{reason}</span>
              <span>Ref: {reference || "—"}</span>
            </div>
            <FileIcon />
          </button>

          {requestEditorOpen && (
            <div className="request-editor" data-testid="request-editor">
              <div className="editor-row">
                <label htmlFor="request-amount">AMOUNT</label>
                <div className="mini-stepper">
                  <button type="button" aria-label="Decrease request amount" onClick={() => adjustAmount(-1)} disabled={amount <= 1}>−</button>
                  <input id="request-amount" inputMode="decimal" value={amount.toFixed(2)} onChange={(event) => {
                    const next = Number(event.target.value);
                    setAmount(Number.isFinite(next) ? next : 0);
                    resetDecision();
                  }} />
                  <span>USDC</span>
                  <button type="button" aria-label="Increase request amount" onClick={() => adjustAmount(1)} disabled={amount >= MAX_USDC}>+</button>
                </div>
              </div>
              <label className="editor-field">REASON
                <input value={reason} maxLength={256} onChange={(event) => { setReason(event.target.value); resetDecision(); }} />
              </label>
              <label className="editor-field">REFERENCE
                <input value={reference} maxLength={200} onChange={(event) => { setReference(event.target.value); resetDecision(); }} />
              </label>
              <button className="done-editing" type="button" onClick={() => setRequestEditorOpen(false)}>DONE</button>
            </div>
          )}
        </section>

        <button className={`check-button ${phase === "checking" ? "is-loading" : ""}`} type="button" onClick={checkRequest} disabled={!canCheck} aria-busy={phase === "checking"}>
          <span>{phase === "checking" ? "CHECKING REAL MINERS" : phase === "ready" ? "CHECK AGAIN" : "CHECK THIS REQUEST"}</span>
          <span className="arrow" aria-hidden="true">→</span>
        </button>

        <div className={`safety-note ${phase}`} role="status" aria-live="polite">
          <LockIcon />
          <div>
            <strong>{phase === "ready" && result?.decision ? `${result.decision} — decision ready.` : phase === "checking" ? "Checking now…" : phase === "error" ? "Check stopped safely." : "Nothing is sent yet."}</strong>
            <p>{statusMessage}</p>
          </div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
