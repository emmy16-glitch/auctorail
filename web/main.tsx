import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ExecutionScreen,
  type ExecutionIntelligenceSource,
  type ExecutionPermitSummary,
  type ExecutionResponse,
  type ExecutionUiPhase
} from "./ExecutionScreen";
import "./styles.css";
import "./checking-screen.css";
import "./mobile-readability.css";

const API_BASE = (import.meta.env.VITE_PROOFGATE_API_URL ?? "").replace(/\/$/, "");
const VENDOR_ADDRESS = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT_ID = "invoice-bot";
const MAX_USDC = 10;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const DURATION_STEPS = [900, 1800, 3600, 7200, 14400, 28800, 86400] as const;

type CheckPhase = "checking" | "ready" | "error";
type Phase = "idle" | CheckPhase | ExecutionUiPhase;
type CheckStage = "rules" | "miners" | "decision";
type Decision = "ALLOW" | "HOLD" | "BLOCK";

type AuthorizationResponse = {
  status: "BLOCKED" | "REQUIRES_INTELLIGENCE" | "DECIDED";
  decision: Decision | null;
  reason: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  policyId: string;
  policyVersion: number;
  freezeFingerprint: string;
  routing: {
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
    sources?: ExecutionIntelligenceSource[];
  };
  executionAuthorized?: boolean;
  permit?: ExecutionPermitSummary | null;
  execution?: {
    status: "READY";
    token: string;
    endpoint: "/api/execute";
  } | null;
};

type ApiError = { error?: string; detail?: string };
type EventTimes = {
  request: string;
  rules?: string;
  miners?: string;
  decision?: string;
};
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

function CheckIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <path d="m7 17 6 6L26 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
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

function timeLabel(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isSha256Hex(value: string | undefined): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function friendlyError(code: string): string {
  switch (code) {
    case "live_authorization_disabled":
      return "Live checks are not enabled on this deployment.";
    case "telegraph_credentials_unavailable":
      return "The live Telegraph wallet is not connected yet.";
    case "permit_signer_unavailable":
      return "The production permit signer is unavailable. No Miner or vendor payment was started.";
    case "permit_issuance_failed":
      return "ProofGate could not issue a valid execution permit. The vendor payment was not started.";
    case "executor_credentials_unavailable":
      return "The protected Base Sepolia executor is unavailable. No Miner or vendor payment was started.";
    case "live_rate_limited":
      return "The live-check limit was reached. Try again later.";
    case "policy_rate_limited":
      return "The rules check is busy. Try again in a moment.";
    case "live_daily_budget_exhausted":
      return "Today's live evidence budget has been used.";
    case "live_verification_failed":
      return "The real Miner check did not finish safely. Nothing was approved.";
    case "frozen_request_mismatch":
      return "The request changed after the rules check. Start again before any live Miner check.";
    case "frozen_request_required":
    case "frozen_request_invalid":
    case "frozen_request_expired":
    case "frozen_request_consumed":
      return "The verified preflight is no longer valid. Start the check again before any live Miner request.";
    case "origin_not_allowed":
      return "This page is not allowed to use the ProofGate API.";
    default:
      return "The request could not be checked safely. Nothing was approved.";
  }
}

function friendlyExecutionError(code: string): string {
  switch (code) {
    case "execution_token_invalid":
      return "The protected execution token was rejected before a transaction started.";
    case "idempotency_key_required":
    case "idempotency_key_conflict":
      return "The protected execution request was rejected before a transaction started.";
    case "execution_session_invalid":
    case "execution_session_expired":
    case "execution_session_consumed":
      return "The protected execution session is no longer usable. No new transaction was started by this request.";
    case "execution_rate_limited":
      return "The protected executor reached its live rate limit. No transaction was started by this request.";
    case "executor_credentials_unavailable":
      return "The protected Base Sepolia executor is unavailable. No transaction was started by this request.";
    case "proof_receipt_verification_failed":
      return "Execution may have occurred, but ProofGate could not verify its receipt. Do not retry automatically.";
    case "execution_response_mismatch":
      return "The execution response did not match the exact authorized request. ProofGate will not retry automatically.";
    default:
      return "The execution request did not return a trustworthy final receipt. ProofGate will not retry automatically.";
  }
}

function executionHttpFailureIsDefinitelyPreBroadcast(code: string): boolean {
  return [
    "execution_token_invalid",
    "idempotency_key_required",
    "idempotency_key_conflict",
    "execution_session_invalid",
    "execution_session_expired",
    "execution_session_consumed",
    "executor_credentials_unavailable",
    "execution_rate_limited",
    "request_too_large",
    "request_body_invalid",
    "invalid_execution_request"
  ].includes(code);
}

function isExecutionPhase(phase: Phase): phase is ExecutionUiPhase {
  return phase === "executing" || phase === "executed" || phase === "execution_failed" || phase === "execution_ambiguous";
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
  const [checkStage, setCheckStage] = useState<CheckStage>("rules");
  const [eventTimes, setEventTimes] = useState<EventTimes | null>(null);
  const [result, setResult] = useState<AuthorizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const executionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const durationSeconds = DURATION_STEPS[durationIndex];
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= MAX_USDC;
  const limitValid = Number.isFinite(limit) && limit > 0 && limit <= MAX_USDC;
  const withinLimit = amountValid && limitValid && amount <= limit;
  const canCheck = amountValid && limitValid && reason.trim().length > 0 && phase === "idle";

  const statusMessage = useMemo(() => {
    if (!withinLimit) return "This request is above the current limit. ProofGate will block it before any Miner is paid.";
    return "We check the rules and real evidence first. You stay in control.";
  }, [withinLimit]);

  function clearCheckState() {
    setPhase("idle");
    setCheckStage("rules");
    setEventTimes(null);
    setResult(null);
    setError(null);
    setExecutionResult(null);
    setExecutionError(null);
    setProofOpen(false);
    requestIdRef.current = null;
    executionIdRef.current = null;
    abortRef.current = null;
  }

  function resetDecision() {
    if (phase !== "idle") return;
    setResult(null);
    setError(null);
    setExecutionResult(null);
    setExecutionError(null);
    setProofOpen(false);
    requestIdRef.current = null;
    executionIdRef.current = null;
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

  function requestBody(mode: "policy" | "live", freezeFingerprint?: string) {
    return {
      mode,
      agentId: AGENT_ID,
      limit: formatUsdc(limit),
      amount: formatUsdc(amount),
      destination: VENDOR_ADDRESS,
      durationSeconds,
      reason: reason.trim(),
      reference: reference.trim(),
      ...(freezeFingerprint ? { freezeFingerprint } : {})
    };
  }

  async function parseAuthorization(response: Response): Promise<AuthorizationResponse> {
    const body = await response.json() as AuthorizationResponse & ApiError;
    if (!response.ok) throw new Error(body.error ?? "authorization_failed");
    return body;
  }

  async function executeAuthorized(liveResult: AuthorizationResponse): Promise<void> {
    if (
      liveResult.decision !== "ALLOW" ||
      liveResult.executionAuthorized !== true ||
      !liveResult.permit ||
      !liveResult.execution ||
      liveResult.execution.status !== "READY" ||
      liveResult.execution.endpoint !== "/api/execute" ||
      liveResult.permit.actionHash !== liveResult.action.hash ||
      liveResult.evidence.status !== "COMPLETE" ||
      !isSha256Hex(liveResult.evidence.bundleHash) ||
      !isSha256Hex(liveResult.action.hash) ||
      !isSha256Hex(liveResult.permit.hash) ||
      liveResult.action.chainId !== BASE_SEPOLIA_CHAIN_ID ||
      liveResult.action.asset !== "USDC" ||
      liveResult.action.recipient.toLowerCase() !== VENDOR_ADDRESS.toLowerCase()
    ) {
      throw new Error("permit_issuance_failed");
    }

    setPhase("executing");
    setExecutionResult(null);
    setExecutionError(null);
    setProofOpen(false);
    const executionId = executionIdRef.current ?? crypto.randomUUID();
    executionIdRef.current = executionId;
    let requestDispatched = false;

    try {
      requestDispatched = true;
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": executionId
        },
        body: JSON.stringify({ executionToken: liveResult.execution.token })
      });
      const body = await response.json() as ExecutionResponse & ApiError;

      if (!response.ok) {
        const code = body.error ?? "execution_failed";
        setExecutionError(friendlyExecutionError(code));
        setPhase(executionHttpFailureIsDefinitelyPreBroadcast(code) ? "execution_failed" : "execution_ambiguous");
        return;
      }

      const bindingsMatch =
        body.actionHash === liveResult.action.hash &&
        body.freezeFingerprint === liveResult.freezeFingerprint &&
        body.permit.id === liveResult.permit.id &&
        body.permit.hash === liveResult.permit.hash &&
        body.network.chainId === BASE_SEPOLIA_CHAIN_ID &&
        body.network.asset === "USDC" &&
        body.payment.amount === liveResult.action.amount &&
        body.payment.recipient.toLowerCase() === liveResult.action.recipient.toLowerCase();

      if (!bindingsMatch) {
        setExecutionError(friendlyExecutionError("execution_response_mismatch"));
        setPhase("execution_ambiguous");
        return;
      }

      setExecutionResult(body);
      if (body.status === "EXECUTED" && body.transaction.status === "CONFIRMED" && body.transaction.transactionHash && body.receipt.hash) {
        setPhase("executed");
      } else if (body.status === "AMBIGUOUS") {
        setExecutionError(body.error ?? friendlyExecutionError("execution_ambiguous"));
        setPhase("execution_ambiguous");
      } else {
        setExecutionError(body.error ?? "The protected executor did not complete the authorized payment.");
        setPhase("execution_failed");
      }
    } catch {
      if (requestDispatched) {
        setExecutionError("The execution request lost its trustworthy response after dispatch. The payment may have reached Base Sepolia, so ProofGate will not retry automatically.");
        setPhase("execution_ambiguous");
      } else {
        setExecutionError("The protected execution request could not be started.");
        setPhase("execution_failed");
      }
    }
  }

  async function checkRequest() {
    if (!canCheck) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("checking");
    setCheckStage("rules");
    setEventTimes({ request: timeLabel() });
    setError(null);
    setResult(null);
    setExecutionResult(null);
    setExecutionError(null);
    setProofOpen(false);

    try {
      const policyResponse = await fetch(`${API_BASE}/api/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody("policy")),
        signal: controller.signal
      });
      const policyResult = await parseAuthorization(policyResponse);
      const rulesAt = timeLabel();
      setEventTimes((current) => current ? { ...current, rules: rulesAt } : { request: rulesAt, rules: rulesAt });

      if (policyResult.status === "BLOCKED" || policyResult.decision === "BLOCK") {
        setResult(policyResult);
        setCheckStage("decision");
        setEventTimes((current) => current ? { ...current, decision: timeLabel() } : { request: rulesAt, rules: rulesAt, decision: timeLabel() });
        setPhase("ready");
        abortRef.current = null;
        return;
      }

      if (policyResult.status !== "REQUIRES_INTELLIGENCE") {
        throw new Error("policy_preflight_unexpected");
      }

      if (!isSha256Hex(policyResult.freezeFingerprint)) {
        throw new Error("frozen_request_mismatch");
      }

      setCheckStage("miners");
      setEventTimes((current) => current ? { ...current, miners: timeLabel() } : { request: rulesAt, rules: rulesAt, miners: timeLabel() });

      const idempotencyKey = requestIdRef.current ?? crypto.randomUUID();
      requestIdRef.current = idempotencyKey;

      const liveResponse = await fetch(`${API_BASE}/api/authorize`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify(requestBody("live", policyResult.freezeFingerprint)),
        signal: controller.signal
      });
      const liveResult = await parseAuthorization(liveResponse);

      if (liveResult.freezeFingerprint !== policyResult.freezeFingerprint) {
        throw new Error("frozen_request_mismatch");
      }

      setResult(liveResult);
      setCheckStage("decision");
      setEventTimes((current) => current ? { ...current, decision: timeLabel() } : { request: timeLabel(), decision: timeLabel() });
      abortRef.current = null;

      if (liveResult.decision === "ALLOW") {
        await executeAuthorized(liveResult);
        return;
      }

      setPhase("ready");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const code = caught instanceof Error ? caught.message : "authorization_failed";
      setError(friendlyError(code));
      setCheckStage("decision");
      setEventTimes((current) => current ? { ...current, decision: timeLabel() } : { request: timeLabel(), decision: timeLabel() });
      setPhase("error");
      requestIdRef.current = null;
      abortRef.current = null;
    }
  }

  function cancelCheck() {
    if (phase !== "checking" || checkStage !== "rules") return;
    abortRef.current?.abort();
    clearCheckState();
  }

  const onSecondaryAction = phase === "checking" ? cancelCheck : clearCheckState;
  const secondaryDisabled = phase === "checking" && checkStage !== "rules";
  const secondaryLabel = phase === "checking" ? "CANCEL CHECK" : "BACK TO REQUEST";
  const executionAuthorization = result?.permit && result.decision === "ALLOW" ? {
    decision: result.decision,
    policyId: result.policyId,
    riskTier: result.riskTier,
    routing: result.routing,
    action: {
      hash: result.action.hash,
      amount: result.action.amount,
      recipient: result.action.recipient,
      reason: result.action.reason,
      reference: result.action.reference
    },
    permit: result.permit,
    evidence: {
      spendRaw: result.evidence.spendRaw,
      bundleHash: result.evidence.bundleHash,
      sources: result.evidence.sources
    }
  } : null;

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

      {phase === "idle" ? (
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

          <button className="check-button" type="button" onClick={checkRequest} disabled={!canCheck}>
            <span>CHECK THIS REQUEST</span>
            <span className="arrow" aria-hidden="true">→</span>
          </button>

          <div className="safety-note idle" role="status" aria-live="polite">
            <LockIcon />
            <div>
              <strong>Nothing is sent yet.</strong>
              <p>{statusMessage}</p>
            </div>
          </div>
        </main>
      ) : isExecutionPhase(phase) && executionAuthorization ? (
        <ExecutionScreen
          phase={phase}
          authorization={executionAuthorization}
          response={executionResult}
          error={executionError}
          proofOpen={proofOpen}
          onToggleProof={() => setProofOpen((open) => !open)}
          onNewRequest={clearCheckState}
        />
      ) : (
        <CheckingScreen
          amount={amount}
          reason={reason}
          reference={reference}
          phase={phase as CheckPhase}
          stage={checkStage}
          times={eventTimes}
          result={result}
          error={error}
          secondaryLabel={secondaryLabel}
          secondaryDisabled={secondaryDisabled}
          onSecondaryAction={onSecondaryAction}
        />
      )}
    </div>
  );
}

function CheckingScreen(props: {
  amount: number;
  reason: string;
  reference: string;
  phase: CheckPhase;
  stage: CheckStage;
  times: EventTimes | null;
  result: AuthorizationResponse | null;
  error: string | null;
  secondaryLabel: string;
  secondaryDisabled: boolean;
  onSecondaryAction: () => void;
}) {
  const { amount, reason, reference, phase, stage, times, result, error, secondaryLabel, secondaryDisabled, onSecondaryAction } = props;
  const rulesDone = Boolean(times?.rules);
  const rulesStopped = phase === "error" && !rulesDone;
  const minerSkipped = stage === "decision" && result?.evidence.status === "NOT_REQUESTED";
  const minersDone = stage === "decision" && !minerSkipped && phase === "ready";
  const minersRunning = phase === "checking" && stage === "miners";
  const minersStopped = phase === "error" && Boolean(times?.miners);
  const rulesRunning = phase === "checking" && stage === "rules";
  const decision = result?.decision;

  const workingTitle = phase === "error"
    ? "Stopped safely."
    : phase === "ready"
      ? `${decision ?? "DONE"}.`
      : minersRunning
        ? "Working..."
        : "Checking rules...";

  const workingCopy = phase === "error"
    ? error ?? "The check stopped without granting permission."
    : phase === "ready"
      ? decision === "ALLOW"
        ? "The checks passed. ProofGate is issuing the exact-action execution permit."
        : "The checks finished without permission to execute the requested payment."
      : minersRunning
        ? "Independent evidence is being requested through Telegraph automatic Intent routing. Bounded x402 verification fees may be paid to real Miners. The requested payment has not been sent."
        : "The real policy engine is checking the delegated authority first. No Miner has been paid at this stage.";

  return (
    <main className="checking-shell" data-testid="checking-screen">
      <h1>CHECKING REQUEST</h1>

      <section className="checking-request-card" aria-label="Request being checked">
        <FileIcon />
        <div>
          <strong>{formatUsdc(amount)} USDC → ProofGate Vendor</strong>
          <span>{reason} <b aria-hidden="true">•</b> Ref: {reference || "—"}</span>
        </div>
      </section>

      <section className="check-timeline" aria-label="Live authorization progress">
        <TimelineRow
          number="01"
          title="REQUEST RECEIVED"
          copy="Request captured from invoice-bot"
          state="done"
          time={times?.request}
        />
        <TimelineRow
          number="02"
          title={rulesRunning ? "RULES CHECKING" : rulesDone ? "RULES CHECKED" : rulesStopped ? "RULES STOPPED" : "RULES PENDING"}
          copy={rulesRunning ? "Authorization rules are being verified" : rulesDone ? "Authorization rules verified" : rulesStopped ? "Authorization rules did not complete" : "Waiting to verify authorization rules"}
          state={rulesRunning ? "running" : rulesDone ? "done" : rulesStopped ? "error" : "pending"}
          time={times?.rules}
        />
        <TimelineRow
          number="03"
          title={minerSkipped ? "REAL CHECKS NOT NEEDED" : minersDone ? "REAL CHECKS COMPLETE" : minersStopped ? "REAL CHECKS STOPPED" : rulesStopped ? "REAL CHECKS NOT STARTED" : "REAL CHECKS RUNNING"}
          copy={minerSkipped ? "Rules blocked this request before any Miner call" : minersRunning ? "Independent checks with real Miners and the policy engine" : minersDone ? "Independent Miner evidence collected" : minersStopped ? "Live Miner verification did not produce a trusted result" : rulesStopped ? "Rules did not complete, so no Miner call was made" : "Waiting for authorization rules"}
          state={minerSkipped ? "skipped" : minersRunning ? "running" : minersDone ? "done" : minersStopped || rulesStopped ? "error" : "pending"}
          time={times?.miners}
        />
        <TimelineRow
          number="04"
          title="DECISION"
          copy={phase === "ready" ? decision === "ALLOW" ? "All required checks completed" : "Permission was not granted" : phase === "error" ? "The check stopped safely" : "Waiting for all checks to complete"}
          state={phase === "ready" ? "decision" : phase === "error" ? "error" : "pending"}
          time={times?.decision}
          decision={phase === "ready" ? decision ?? undefined : phase === "error" ? "STOPPED" : undefined}
        />
      </section>

      <section className={`checking-work-box ${phase}`} role="status" aria-live="polite">
        <div className="terminal-icon" aria-hidden="true">&gt;_</div>
        <div>
          <strong>{workingTitle}</strong>
          <p>{workingCopy}</p>
        </div>
      </section>

      <button
        className="cancel-check-button"
        type="button"
        onClick={onSecondaryAction}
        disabled={secondaryDisabled}
        aria-label={secondaryLabel}
        title={secondaryDisabled ? "A real Miner request is already in flight, so the browser cannot safely promise cancellation." : undefined}
      >
        <span>{secondaryLabel}</span>
        <span className="cancel-x" aria-hidden="true">{phase === "checking" ? "×" : "←"}</span>
      </button>

      <section className="checking-safety-note">
        <div className="checking-lock-box"><LockIcon /></div>
        <p><strong>No agent payment is made on this screen.</strong><br />ProofGate is deciding whether permission can be issued.</p>
      </section>
    </main>
  );
}

type TimelineState = "done" | "running" | "pending" | "skipped" | "decision" | "error";

function TimelineRow(props: {
  number: string;
  title: string;
  copy: string;
  state: TimelineState;
  time?: string;
  decision?: string;
}) {
  const { number, title, copy, state, time, decision } = props;
  return (
    <div className={`timeline-row timeline-${state}`} data-stage={number}>
      <div className="timeline-number">{number}</div>
      <div className="timeline-copy">
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
      <div className="timeline-status-wrap">
        <div className="timeline-status" aria-label={decision ?? state}>
          {state === "done" ? <CheckIcon /> : state === "running" ? <span className="status-spinner" /> : state === "decision" ? (decision === "ALLOW" ? <CheckIcon /> : <span className="status-symbol">!</span>) : state === "error" ? <span className="status-symbol">×</span> : <span className="status-dash">−</span>}
        </div>
        <span className="timeline-time">{decision ?? (state === "skipped" ? "NOT NEEDED" : time ?? (state === "pending" ? "PENDING" : "—"))}</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
