import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExecutionScreen, type ExecutionIntelligenceSource, type ExecutionPermitSummary, type ExecutionResponse, type ExecutionUiPhase } from "./ExecutionScreen";
import { ActivityScreen, type ActivityItem, type ActivityTechnicalDetail } from "./ActivityScreen";
import { PermissionsScreen } from "./PermissionsScreen";
import { SecurityLabScreen } from "./SecurityLabScreen";
import { CheckingScreen, type CheckPhase, type CheckStage, type EventTimes } from "./CheckingScreen";
import { HomeLandingScreen } from "./HomeLandingScreen";
import { TrustScreen } from "./TrustScreen";
import { GuidedDemoScreen } from "./GuidedDemoScreen";
import { SdkScreen } from "./SdkScreen";
import { ShieldIcon, FileIcon, LockIcon } from "./icons";
import "./app.css";

const API_BASE = (import.meta.env.VITE_PROOFGATE_API_URL ?? import.meta.env.VITE_AUCTORAIL_API_URL ?? "").replace(/\/$/, "");
const VENDOR_ADDRESS = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const VENDOR_LABEL = "Auctorail Vendor";
const AGENT_ID = "invoice-bot";
const MAX_USDC = 10;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const DURATION_STEPS = [900, 1800, 3600, 7200, 14400, 28800, 86400] as const;
const GITHUB_URL = "https://github.com/emmy16-glitch/auctorail";

export type Route = "home" | "check" | "activity" | "permissions" | "security" | "trust" | "content" | "verify" | "demo" | "docs";

const ROUTE_BY_PATH: Record<string, Route> = {
  "": "home",
  check: "check",
  activity: "activity",
  permissions: "permissions",
  "security-lab": "security",
  trust: "trust",
  content: "content",
  verify: "verify",
  demo: "demo",
  docs: "docs"
};

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "").split(/[?#]/, 1)[0];
  return ROUTE_BY_PATH[raw] ?? "home";
}

function routePath(route: Route): string {
  const byRoute: Record<Route, string> = {
    home: "",
    check: "check",
    activity: "activity",
    permissions: "permissions",
    security: "security-lab",
    trust: "trust",
    content: "content",
    verify: "verify",
    demo: "demo",
    docs: "docs"
  };
  return `#/${byRoute[route]}`;
}

type CheckDecisionPhase = "idle" | CheckPhase | ExecutionUiPhase;
type Decision = "ALLOW" | "HOLD" | "BLOCK";

type AuthorizationResponse = {
  status: "BLOCKED" | "REQUIRES_INTELLIGENCE" | "DECIDED";
  decision: Decision | null;
  reason: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  policyId: string;
  policyVersion: number;
  freezeFingerprint: string;
  routing: { mode: string; endpoint: string };
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
  mandate: { id: string; hash: string; maxPerAction: string; expiresAt: string };
  checks?: { name: string; status: "PASS" | "HOLD" | "BLOCK"; reason: string; code?: string }[];
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
  execution?: { status: "READY"; token: string; endpoint: "/api/execute" } | null;
};

type ApiError = { error?: string; detail?: string };
type RequestSnapshot = {
  limit: number;
  amount: number;
  durationSeconds: number;
  reason: string;
  reference: string;
};

function formatUsdc(value: number): string { return value.toFixed(2); }
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
function activityTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function isSha256Hex(value: string | undefined): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
function shortAddress(value: string): string { return `${value.slice(0, 10)}…${value.slice(-8)}`; }

function friendlyError(code: string): string {
  switch (code) {
    case "live_authorization_disabled": return "Live checks are not enabled on this deployment.";
    case "telegraph_credentials_unavailable": return "The live Telegraph wallet is not connected yet.";
    case "permit_signer_unavailable": return "The production permit signer is unavailable. No Miner or vendor payment was started.";
    case "permit_issuance_failed": return "Auctorail could not issue a valid execution permit. The vendor payment was not started.";
    case "executor_credentials_unavailable": return "The protected Base Sepolia executor is unavailable. No Miner or vendor payment was started.";
    case "live_rate_limited": return "Auctorail paused new live Miner calls because this deployment reached its hourly safety quota. Telegraph was not called for this attempt.";
    case "policy_rate_limited": return "The local rules service is receiving too many requests. Try again in a moment.";
    case "live_daily_budget_exhausted": return "Auctorail reached this deployment's daily budget for real x402 evidence. No new Miner call was started.";
    case "live_verification_failed": return "The real Miner check did not finish safely. Nothing was approved.";
    case "frozen_request_mismatch": return "The request changed after the rules check. Auctorail rejected the changed request before using the old authorization.";
    case "frozen_request_required":
    case "frozen_request_invalid":
    case "frozen_request_expired":
    case "frozen_request_consumed": return "The verified preflight is no longer valid. Start a new check before any live Miner request.";
    case "origin_not_allowed": return "This page is not allowed to use the Auctorail API.";
    default: return "The request could not be checked safely. Nothing was approved.";
  }
}

function friendlyExecutionError(code: string): string {
  switch (code) {
    case "execution_token_invalid": return "The protected execution token was rejected before a transaction started.";
    case "idempotency_key_required":
    case "idempotency_key_conflict": return "The protected execution request was rejected before a transaction started.";
    case "execution_session_invalid":
    case "execution_session_expired":
    case "execution_session_consumed": return "The protected execution session is no longer usable. No new transaction was started by this request.";
    case "execution_rate_limited": return "Auctorail reached its protected execution safety quota. No transaction was started by this request.";
    case "executor_credentials_unavailable": return "The protected Base Sepolia executor is unavailable. No transaction was started by this request.";
    case "proof_receipt_verification_failed": return "Execution may have occurred, but Auctorail could not verify its receipt. Automatic retry is locked.";
    case "execution_response_mismatch": return "The execution response did not match the exact authorized request. Automatic retry is locked.";
    default: return "The execution request did not return a trustworthy final receipt. Automatic retry is locked.";
  }
}

function executionHttpFailureIsDefinitelyPreBroadcast(code: string): boolean {
  return ["execution_token_invalid","idempotency_key_required","idempotency_key_conflict","execution_session_invalid","execution_session_expired","execution_session_consumed","executor_credentials_unavailable","execution_rate_limited","request_too_large","request_body_invalid","invalid_execution_request"].includes(code);
}
function isExecutionPhase(phase: CheckDecisionPhase): phase is ExecutionUiPhase {
  return phase === "executing" || phase === "executed" || phase === "execution_failed" || phase === "execution_ambiguous";
}

function buildAuthorizationTechnical(auth: AuthorizationResponse, recipientLabel: string): ActivityTechnicalDetail[] {
  return [
    { label: "Decision", value: auth.decision ?? "—" },
    { label: "Policy", value: `${auth.policyId} · v${auth.policyVersion}`, mono: true },
    { label: "Risk tier", value: auth.riskTier },
    { label: "Agent", value: AGENT_ID, mono: true },
    { label: "Amount", value: `${auth.action.amount} USDC` },
    { label: "Recipient", value: `${recipientLabel} · ${auth.action.recipient}`, mono: true },
    { label: "Action hash", value: auth.action.hash, mono: true },
    { label: "Freeze fingerprint", value: auth.freezeFingerprint, mono: true },
    { label: "Evidence", value: auth.evidence.status },
    { label: "Mandate hash", value: auth.mandate.hash, mono: true }
  ];
}

function describeAuthorizationOutcome(result: AuthorizationResponse): string {
  if (result.decision === "ALLOW") return result.reason || "All required checks passed for the exact action.";
  if (result.decision === "HOLD") return result.reason || "Required evidence did not reach the policy threshold, so the request is held.";
  if (result.decision === "BLOCK") return result.reason || "A policy or trusted evidence check blocked this request.";
  return result.reason || "The authorization has not been decided yet.";
}

function executionTechnical(auth: AuthorizationResponse, response: ExecutionResponse | null, errorCode?: string): ActivityTechnicalDetail[] {
  return [
    ...buildAuthorizationTechnical(auth, VENDOR_LABEL),
    { label: "Permit hash", value: auth.permit?.hash ?? "Not issued", mono: true },
    { label: "Execution code", value: response?.code ?? errorCode ?? "—", mono: true },
    { label: "Tx status", value: response?.transaction.status ?? "No trusted final status" },
    { label: "Tx hash", value: response?.transaction.transactionHash ?? "Not recorded", mono: true },
    { label: "Block", value: response?.transaction.blockNumber?.toString() ?? "—" },
    { label: "Receipt hash", value: response?.receipt.hash ?? "Not recorded", mono: true },
    { label: "Automatic retry", value: "NO" }
  ];
}

/* ------------------------------------------------------------------ */
/*  Shell                                                               */
/* ------------------------------------------------------------------ */

const NAV_LINKS: { route: Route; label: string }[] = [
  { route: "check", label: "CHECK" },
  { route: "activity", label: "ACTIVITY" },
  { route: "permissions", label: "PERMISSIONS" },
  { route: "security", label: "SECURITY LAB" }
];

function TopNav({ route }: { route: Route }) {
  const go = (target: string) => { window.location.hash = target; };

  const NavButton = ({ target, label }: { target: Route; label: string }) => (
    <button type="button" className={route === target ? "active" : ""} onClick={() => go(routePath(target))}>{label}</button>
  );

  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <a className="brand-lockup home-brand" href={routePath("home")}>
          <ShieldIcon className="brand-shield" />
          <span>
            <strong><DecodeText text="AUCTORAIL" /></strong>
            <small>Authorization rails</small>
          </span>
        </a>
        <nav className="nav-links" aria-label="Auctorail sections">
          {NAV_LINKS.map((link) => <NavButton key={link.route} target={link.route} label={link.label} />)}
        </nav>
        <div className="nav-side">
          <NavButton target="trust" label="TRUST" />
          <NavButton target="docs" label="DOCS" />
          <span className="status-pill"><span className="status-dot" aria-hidden="true" />BASE SEPOLIA · TESTNET</span>
        </div>
      </div>
    </header>
  );
}

const SCRAMBLE_CHARS = "AUCTORAILXKMNZ0123456789#";

function DecodeText({ text }: { text: string }) {
  const [display, setDisplay] = useState(text);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(text);
      return;
    }
    let frame = 0;
    const totalFrames = 22;
    const id = window.setInterval(() => {
      frame += 1;
      const resolved = Math.floor((frame / totalFrames) * text.length);
      if (resolved >= text.length) {
        window.clearInterval(id);
        setDisplay(text);
        return;
      }
      let out = "";
      for (let i = 0; i < text.length; i++) {
        out += i < resolved ? text[i] : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      setDisplay(out);
    }, 42);
    return () => window.clearInterval(id);
  }, [text]);
  return <span aria-label={text}>{display}</span>;
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <a className="brand-lockup" href={routePath("home")}>
          <ShieldIcon className="brand-shield" />
          <span><strong><DecodeText text="AUCTORAIL" /></strong><small>Authorization rails</small></span>
        </a>
        <p>Prove authority before execution · Base Sepolia testnet build</p>
        <nav aria-label="Footer">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a>
          <a href={routePath("docs")}>Docs</a>
          <a href={routePath("trust")}>Trust</a>
        </nav>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Check surface (idle form)                                          */
/* ------------------------------------------------------------------ */

interface CheckSurfaceProps {
  authorityActive: boolean;
  limit: number;
  durationSeconds: number;
  amount: number;
  reason: string;
  reference: string;
  requestDetailsOpen: boolean;
  requestEditMode: boolean;
  canCheck: boolean;
  statusMessage: string;
  onToggleDetails: () => void;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
  onAdjustLimit: (delta: number) => void;
  onAdjustDuration: (delta: number) => void;
  onAdjustAmount: (delta: number) => void;
  onAmountInput: (value: number) => void;
  onReasonChange: (value: string) => void;
  onReferenceChange: (value: string) => void;
  onCheck: () => void;
}

function CheckFormSurface(props: CheckSurfaceProps) {
  const {
    authorityActive, limit, durationSeconds, amount, reason, reference,
    requestDetailsOpen, requestEditMode, canCheck, statusMessage,
    onToggleDetails, onEnterEditMode, onExitEditMode,
    onAdjustLimit, onAdjustDuration, onAdjustAmount, onAmountInput,
    onReasonChange, onReferenceChange, onCheck
  } = props;

  return (
    <>
      <section className="check-heading">
        <h1>Control what an agent can do.</h1>
        <p>Set the permission, give it a request. Auctorail enforces the decision automatically.</p>
      </section>

      <section className="card card-pad" aria-label="Agent permission">
        <div className="agent-row">
          <div className="agent-id">
            <span>AGENT PERMISSION</span>
            <strong>{AGENT_ID}</strong>
          </div>
          <span className={`badge ${authorityActive ? "ok" : "block"}`}>{authorityActive ? "ACTIVE" : "REVOKED"}</span>
        </div>

        <div className="form-row">
          <div className="form-row-head"><span>MAX PAYMENT</span><span className="mono">{formatUsdc(limit)} USDC</span></div>
          <div className="stepper" role="group" aria-label="Maximum payment">
            <button type="button" aria-label="Decrease maximum payment" onClick={() => onAdjustLimit(-1)} disabled={limit <= 0.01}>−</button>
            <output data-testid="limit-value">{formatUsdc(limit)} USDC</output>
            <button type="button" aria-label="Increase maximum payment" onClick={() => onAdjustLimit(1)} disabled={limit >= MAX_USDC}>+</button>
          </div>
        </div>

        <div className="form-row">
          <div className="form-row-head"><span>ALLOWED RECIPIENT</span><span className="badge muted">PINNED</span></div>
          <div className="recipient-row-body" data-testid="locked-recipient">
            <div className="recipient-id">
              <strong>{VENDOR_LABEL}</strong>
              <small title={VENDOR_ADDRESS}>{shortAddress(VENDOR_ADDRESS)} · Base Sepolia test recipient</small>
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-row-head"><span>PERMISSION WINDOW</span></div>
          <div className="stepper" role="group" aria-label="Permission duration">
            <button type="button" aria-label="Shorten permission duration" onClick={() => onAdjustDuration(-1)} disabled={durationSeconds === DURATION_STEPS[0]}>−</button>
            <output data-testid="duration-value">{durationLabel(durationSeconds)}</output>
            <button type="button" aria-label="Extend permission duration" onClick={() => onAdjustDuration(1)} disabled={durationSeconds === DURATION_STEPS[DURATION_STEPS.length - 1]}>+</button>
          </div>
        </div>
      </section>

      <section className="card card-pad" aria-label="Current request">
        <button className="request-summary" type="button" aria-expanded={requestDetailsOpen} onClick={onToggleDetails}>
          <div className="rs-copy">
            <span className="eyebrow">CURRENT REQUEST</span>
            <strong>{formatUsdc(amount)} USDC → {VENDOR_LABEL}</strong>
            <small>{reason} · Ref: {reference || "—"}</small>
          </div>
          <FileIcon className="rs-icon" />
        </button>

        {requestDetailsOpen && (
          <div className="request-editor" data-testid="request-editor">
            <p className="editor-note">
              <strong>Agent request.</strong> In an integration, {AGENT_ID} supplies this action automatically. Editing below is only a hackathon/test control.
            </p>
            <div className="editor-grid">
              <div className="field">
                <label htmlFor="request-amount">AMOUNT (USDC)</label>
                <div className="stepper">
                  <button type="button" aria-label="Decrease request amount" onClick={() => onAdjustAmount(-1)} disabled={amount <= 0.01}>−</button>
                  <input
                    id="request-amount"
                    className="input"
                    inputMode="decimal"
                    value={Number.isFinite(amount) ? amount.toFixed(2) : ""}
                    onChange={(event) => { const next = Number(event.target.value); onAmountInput(Number.isFinite(next) ? next : 0); }}
                  />
                  <button type="button" aria-label="Increase request amount" onClick={() => onAdjustAmount(1)} disabled={amount >= MAX_USDC}>+</button>
                </div>
              </div>
              <label className="field full">
                <span>REASON</span>
                <input className="input" value={reason} maxLength={256} onChange={(event) => onReasonChange(event.target.value)} />
              </label>
              <label className="field full">
                <span>REFERENCE</span>
                <input className="input" value={reference} maxLength={200} onChange={(event) => onReferenceChange(event.target.value)} />
              </label>
            </div>
            {requestEditMode ? (
              <button className="btn btn-block" type="button" onClick={onExitEditMode}>DONE EDITING</button>
            ) : (
              <button className="btn btn-ghost btn-block" type="button" onClick={onEnterEditMode} data-testid="edit-test-request">EDIT TEST REQUEST</button>
            )}
          </div>
        )}
      </section>

      <div className="request-check-actions">
        <button className="btn btn-primary btn-lg btn-block" type="button" onClick={onCheck} disabled={!canCheck}>
          <span>CHECK THIS REQUEST</span><span className="arrow" aria-hidden="true">→</span>
        </button>
        <div className={`note ${authorityActive ? "" : "block"}`} role="status" aria-live="polite">
          <LockIcon />
          <div>
            <strong>{authorityActive ? "Nothing is sent yet." : "Permission revoked."}</strong>
            <p>{statusMessage}</p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Result rail (idle preview)                                         */
/* ------------------------------------------------------------------ */

function ResultPreview() {
  const steps = [
    "Request frozen & hashed",
    "Permission checked first",
    "Evidence bound to the action",
    "Decision: ALLOW · HOLD · BLOCK"
  ];
  return (
    <div className="result-empty">
      <ShieldIcon />
      <strong>The decision appears here.</strong>
      <p>Run the check and every stage — rules, evidence, decision — is shown exactly as it happens.</p>
      <div className="result-preview">
        {steps.map((step, index) => (
          <div className="result-preview-row" key={step}><i>{String(index + 1).padStart(2, "0")}</i><span>{step}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                 */
/* ------------------------------------------------------------------ */

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  const [authorityActive, setAuthorityActive] = useState(true);
  const [limit, setLimit] = useState(5);
  const [durationIndex, setDurationIndex] = useState(2);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("Supplier invoice #4471");
  const [reference, setReference] = useState("INV-4471");
  const [requestDetailsOpen, setRequestDetailsOpen] = useState(false);
  const [requestEditMode, setRequestEditMode] = useState(false);
  const [phase, setPhase] = useState<CheckDecisionPhase>("idle");
  const [checkStage, setCheckStage] = useState<CheckStage>("rules");
  const [eventTimes, setEventTimes] = useState<EventTimes | null>(null);
  const [checkSnapshot, setCheckSnapshot] = useState<RequestSnapshot | null>(null);
  const [result, setResult] = useState<AuthorizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const requestIdRef = useRef<string | null>(null);
  const executionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<RequestSnapshot | null>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [route]);

  const durationSeconds = DURATION_STEPS[durationIndex];
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= MAX_USDC;
  const limitValid = Number.isFinite(limit) && limit > 0 && limit <= MAX_USDC;
  const withinLimit = amountValid && limitValid && amount <= limit;
  const canCheck = authorityActive && amountValid && limitValid && reason.trim().length > 0 && phase === "idle";

  const statusMessage = useMemo(() => {
    if (!authorityActive) return "Agent permission is revoked. Restore it in Permissions before starting a new request.";
    if (!withinLimit) return "This request is above the current maximum. Auctorail will block it locally before any Miner is paid.";
    return "The request is normally supplied by the agent. This hackathon UI lets you trigger the same automated authorization path manually.";
  }, [authorityActive, withinLimit]);

  function pushActivity(item: ActivityItem) {
    setActivities((current) => current.some((entry) => entry.id === item.id) ? current : [item, ...current].slice(0, 20));
  }

  function clearCheckState() {
    setPhase("idle");
    setCheckStage("rules");
    setEventTimes(null);
    setCheckSnapshot(null);
    setResult(null);
    setError(null);
    setErrorCode(null);
    setExecutionResult(null);
    setExecutionError(null);
    setProofOpen(false);
    requestIdRef.current = null;
    executionIdRef.current = null;
    abortRef.current = null;
    snapshotRef.current = null;
  }

  function resetDecision() {
    if (phase !== "idle") return;
    setResult(null);
    setError(null);
    setErrorCode(null);
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
  function setControlLimit(next: number) {
    setLimit(Math.min(MAX_USDC, Math.max(0.01, Number(next.toFixed(2)))));
    resetDecision();
  }
  function adjustDuration(delta: number) {
    setDurationIndex((current) => Math.min(DURATION_STEPS.length - 1, Math.max(0, current + delta)));
    resetDecision();
  }
  function setControlDuration(next: number) {
    const index = DURATION_STEPS.indexOf(next as typeof DURATION_STEPS[number]);
    if (index >= 0) setDurationIndex(index);
    resetDecision();
  }
  function adjustAmount(delta: number) {
    setAmount((current) => Math.min(MAX_USDC, Math.max(0.01, Number((current + delta).toFixed(2)))));
    resetDecision();
  }

  function bodyFor(snapshot: RequestSnapshot, mode: "policy" | "live", freezeFingerprint?: string) {
    return {
      mode,
      agentId: AGENT_ID,
      limit: formatUsdc(snapshot.limit),
      amount: formatUsdc(snapshot.amount),
      destination: VENDOR_ADDRESS,
      durationSeconds: snapshot.durationSeconds,
      reason: snapshot.reason,
      reference: snapshot.reference,
      ...(freezeFingerprint ? { freezeFingerprint } : {})
    };
  }

  async function parseAuthorization(response: Response): Promise<AuthorizationResponse> {
    const body = await response.json() as AuthorizationResponse & ApiError;
    if (!response.ok) throw new Error(body.error ?? "authorization_failed");
    return body;
  }

  async function executeAuthorized(liveResult: AuthorizationResponse, snapshot: RequestSnapshot): Promise<void> {
    if (
      liveResult.decision !== "ALLOW" || liveResult.executionAuthorized !== true || !liveResult.permit || !liveResult.execution ||
      liveResult.execution.status !== "READY" || liveResult.execution.endpoint !== "/api/execute" || liveResult.permit.actionHash !== liveResult.action.hash ||
      liveResult.evidence.status !== "COMPLETE" || !isSha256Hex(liveResult.evidence.bundleHash) || !isSha256Hex(liveResult.action.hash) ||
      !isSha256Hex(liveResult.permit.hash) || liveResult.action.chainId !== BASE_SEPOLIA_CHAIN_ID || liveResult.action.asset !== "USDC" ||
      liveResult.action.recipient.toLowerCase() !== VENDOR_ADDRESS.toLowerCase()
    ) throw new Error("permit_issuance_failed");

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
        headers: { "content-type": "application/json", "idempotency-key": executionId },
        body: JSON.stringify({ executionToken: liveResult.execution.token })
      });
      const body = await response.json() as ExecutionResponse & ApiError;

      if (!response.ok) {
        const code = body.error ?? "execution_failed";
        const preBroadcast = executionHttpFailureIsDefinitelyPreBroadcast(code);
        const message = friendlyExecutionError(code);
        setExecutionError(message);
        setPhase(preBroadcast ? "execution_failed" : "execution_ambiguous");
        pushActivity({
          id: `execution:${executionId}`, status: preBroadcast ? "FAILED" : "UNCERTAIN", amount: formatUsdc(snapshot.amount), recipient: VENDOR_LABEL,
          detail: preBroadcast ? `${message} No vendor transaction was started by this attempt.` : `${message} Auctorail will not broadcast a replacement transaction automatically.`,
          time: activityTime(), technical: executionTechnical(liveResult, null, code)
        });
        return;
      }

      const bindingsMatch = body.actionHash === liveResult.action.hash && body.freezeFingerprint === liveResult.freezeFingerprint &&
        body.permit.id === liveResult.permit.id && body.permit.hash === liveResult.permit.hash && body.network.chainId === BASE_SEPOLIA_CHAIN_ID &&
        body.network.asset === "USDC" && body.payment.amount === liveResult.action.amount &&
        body.payment.recipient.toLowerCase() === liveResult.action.recipient.toLowerCase();

      if (!bindingsMatch) {
        const message = friendlyExecutionError("execution_response_mismatch");
        setExecutionError(message);
        setPhase("execution_ambiguous");
        pushActivity({ id: `execution:${executionId}`, status: "UNCERTAIN", amount: formatUsdc(snapshot.amount), recipient: VENDOR_LABEL,
          detail: message, time: activityTime(), technical: executionTechnical(liveResult, body, "execution_response_mismatch") });
        return;
      }

      setExecutionResult(body);
      if (body.status === "EXECUTED" && body.transaction.status === "CONFIRMED" && body.transaction.transactionHash && body.receipt.hash) {
        setPhase("executed");
        pushActivity({
          id: `executed:${body.receipt.hash}`, status: "EXECUTED", amount: body.payment.amount, recipient: VENDOR_LABEL,
          detail: "Auctorail authorized the exact request, executed it once on Base Sepolia, confirmed the transaction, and recorded a verifiable receipt.",
          time: activityTime(), proofAvailable: true, technical: executionTechnical(liveResult, body)
        });
      } else if (body.status === "AMBIGUOUS") {
        const message = body.error ?? friendlyExecutionError("execution_ambiguous");
        setExecutionError(message);
        setPhase("execution_ambiguous");
        pushActivity({ id: `execution:${executionId}`, status: "UNCERTAIN", amount: body.payment.amount, recipient: VENDOR_LABEL,
          detail: "Execution was dispatched, but Auctorail could not establish a trustworthy final confirmation. Automatic retry is locked to avoid a duplicate payment.",
          time: activityTime(), technical: executionTechnical(liveResult, body, body.code) });
      } else {
        const message = body.error ?? "The protected executor did not complete the authorized payment.";
        setExecutionError(message);
        setPhase("execution_failed");
        pushActivity({ id: `execution:${executionId}`, status: "FAILED", amount: body.payment.amount, recipient: VENDOR_LABEL,
          detail: "The authorized execution did not complete with a confirmed receipt. Auctorail did not automatically retry it.",
          time: activityTime(), technical: executionTechnical(liveResult, body, body.code) });
      }
    } catch {
      if (requestDispatched) {
        const message = "The execution request lost its trustworthy response after dispatch. The payment may have reached Base Sepolia, so Auctorail will not retry automatically.";
        setExecutionError(message);
        setPhase("execution_ambiguous");
        pushActivity({
          id: `execution:${executionId}`, status: "UNCERTAIN", amount: formatUsdc(snapshot.amount), recipient: VENDOR_LABEL,
          detail: message, time: activityTime(), technical: executionTechnical(liveResult, null, "transport_response_lost")
        });
      } else {
        setExecutionError("The protected execution request could not be started.");
        setPhase("execution_failed");
      }
    }
  }

  async function checkRequest() {
    if (!canCheck) return;
    const snapshot: RequestSnapshot = { limit, amount, durationSeconds, reason: reason.trim(), reference: reference.trim() };
    snapshotRef.current = snapshot;
    setCheckSnapshot(snapshot);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("checking");
    setCheckStage("rules");
    setEventTimes({ request: timeLabel() });
    setError(null);
    setErrorCode(null);
    setResult(null);
    setExecutionResult(null);
    setExecutionError(null);
    setProofOpen(false);
    setRequestEditMode(false);

    try {
      const policyResponse = await fetch(`${API_BASE}/api/authorize`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyFor(snapshot, "policy")), signal: controller.signal
      });
      const policyResult = await parseAuthorization(policyResponse);
      setResult(policyResult);
      const rulesAt = timeLabel();
      setEventTimes((current) => current ? { ...current, rules: rulesAt } : { request: rulesAt, rules: rulesAt });

      if (policyResult.status === "BLOCKED" || policyResult.decision === "BLOCK") {
        setCheckStage("decision");
        setEventTimes((current) => current ? { ...current, decision: timeLabel() } : { request: rulesAt, rules: rulesAt, decision: timeLabel() });
        setPhase("ready");
        abortRef.current = null;
        pushActivity({ id: `auth:${policyResult.action.hash}:${policyResult.freezeFingerprint}`, status: "BLOCKED", amount: policyResult.action.amount, recipient: VENDOR_LABEL,
          detail: describeAuthorizationOutcome(policyResult), time: activityTime(), technical: buildAuthorizationTechnical(policyResult, VENDOR_LABEL) });
        return;
      }

      if (policyResult.status !== "REQUIRES_INTELLIGENCE") throw new Error("policy_preflight_unexpected");
      if (!isSha256Hex(policyResult.freezeFingerprint)) throw new Error("frozen_request_mismatch");

      setCheckStage("miners");
      setEventTimes((current) => current ? { ...current, miners: timeLabel() } : { request: rulesAt, rules: rulesAt, miners: timeLabel() });
      const idempotencyKey = requestIdRef.current ?? crypto.randomUUID();
      requestIdRef.current = idempotencyKey;
      const liveResponse = await fetch(`${API_BASE}/api/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(bodyFor(snapshot, "live", policyResult.freezeFingerprint)), signal: controller.signal
      });
      const liveResult = await parseAuthorization(liveResponse);
      if (liveResult.freezeFingerprint !== policyResult.freezeFingerprint) throw new Error("frozen_request_mismatch");

      setResult(liveResult);
      setCheckStage("decision");
      setEventTimes((current) => current ? { ...current, decision: timeLabel() } : { request: timeLabel(), decision: timeLabel() });
      abortRef.current = null;

      if (liveResult.decision === "ALLOW") {
        await executeAuthorized(liveResult, snapshot);
        return;
      }

      setPhase("ready");
      pushActivity({
        id: `auth:${liveResult.action.hash}:${liveResult.freezeFingerprint}`,
        status: liveResult.decision === "BLOCK" ? "BLOCKED" : "HELD",
        amount: liveResult.action.amount, recipient: VENDOR_LABEL, detail: describeAuthorizationOutcome(liveResult), time: activityTime(), technical: buildAuthorizationTechnical(liveResult, VENDOR_LABEL)
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const code = caught instanceof Error ? caught.message : "authorization_failed";
      const message = friendlyError(code);
      setError(message);
      setErrorCode(code);
      setCheckStage("decision");
      setEventTimes((current) => current ? { ...current, decision: timeLabel() } : { request: timeLabel(), decision: timeLabel() });
      setPhase("error");
      requestIdRef.current = null;
      abortRef.current = null;
      const minerCallStarted = code === "live_rate_limited" || code === "live_daily_budget_exhausted" ? "NO" : checkStage === "miners" ? "ATTEMPTED" : "NO";
      pushActivity({
        id: `error:${code}:${Date.now()}`, status: "FAILED", amount: formatUsdc(snapshot.amount), recipient: VENDOR_LABEL,
        detail: message, time: activityTime(), technical: [
          { label: "Result", value: "STOPPED SAFELY" }, { label: "Error code", value: code, mono: true },
          { label: "Stage", value: checkStage === "miners" ? "LIVE INTELLIGENCE" : "LOCAL RULES" },
          { label: "Telegraph call", value: minerCallStarted }, { label: "Permit issued", value: "NO" }, { label: "Vendor execution", value: "NO" },
          ...(code === "live_rate_limited" ? [{ label: "Limit source", value: "Auctorail deployment hourly safety quota" }] : [])
        ]
      });
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
  const shownSnapshot = checkSnapshot ?? { limit, amount, durationSeconds, reason, reference };
  const executionAuthorization = result?.permit && result.decision === "ALLOW" ? {
    decision: result.decision,
    policyId: result.policyId,
    riskTier: result.riskTier,
    routing: result.routing,
    action: { hash: result.action.hash, amount: result.action.amount, recipient: result.action.recipient, reason: result.action.reason, reference: result.action.reference },
    permit: result.permit,
    evidence: { spendRaw: result.evidence.spendRaw, bundleHash: result.evidence.bundleHash, sources: result.evidence.sources }
  } : null;

  const checkSurface = phase === "idle" ? (
    <div className="check-layout" data-testid="checking-screen">
      <div className="check-form-col">
        <CheckFormSurface
          authorityActive={authorityActive}
          limit={limit}
          durationSeconds={durationSeconds}
          amount={amount}
          reason={reason}
          reference={reference}
          requestDetailsOpen={requestDetailsOpen}
          requestEditMode={requestEditMode}
          canCheck={canCheck}
          statusMessage={statusMessage}
          onToggleDetails={() => { setRequestDetailsOpen((open) => !open); if (requestDetailsOpen) setRequestEditMode(false); }}
          onEnterEditMode={() => setRequestEditMode(true)}
          onExitEditMode={() => setRequestEditMode(false)}
          onAdjustLimit={adjustLimit}
          onAdjustDuration={adjustDuration}
          onAdjustAmount={adjustAmount}
          onAmountInput={(value) => { setAmount(value); resetDecision(); }}
          onReasonChange={(value) => { setReason(value); resetDecision(); }}
          onReferenceChange={(value) => { setReference(value); resetDecision(); }}
          onCheck={checkRequest}
        />
      </div>
      <aside className="result-col" aria-label="Decision panel">
        <ResultPreview />
      </aside>
    </div>
  ) : isExecutionPhase(phase) && executionAuthorization ? (
    <ExecutionScreen phase={phase} authorization={executionAuthorization} response={executionResult} error={executionError} proofOpen={proofOpen} onToggleProof={() => setProofOpen((open) => !open)} onNewRequest={clearCheckState} />
  ) : (
    <CheckingScreen
      snapshot={shownSnapshot}
      phase={phase as CheckPhase}
      stage={checkStage}
      times={eventTimes}
      result={result}
      error={error}
      errorCode={errorCode}
      secondaryLabel={secondaryLabel}
      secondaryDisabled={secondaryDisabled}
      onSecondaryAction={onSecondaryAction}
      agentId={AGENT_ID}
      recipientLabel={VENDOR_LABEL}
      recipientAddress={VENDOR_ADDRESS}
    />
  );

  return (
    <div id="auctorail-home-root" className="app">
      <TopNav route={route} />
      <div className="page">
        <div className={`page-inner ${route === "trust" || route === "content" || route === "verify" || route === "docs" ? "narrow" : ""}`}>
          {route === "home" && (
            <HomeLandingScreen
              onDemo={() => { window.location.hash = routePath("demo"); }}
              onLive={() => { window.location.hash = routePath("check"); }}
              onContent={() => { window.location.hash = routePath("content"); }}
              onVerify={() => { window.location.hash = routePath("verify"); }}
              onSecurity={() => { window.location.hash = routePath("security"); }}
            />
          )}
          {route === "check" && checkSurface}
          {route === "activity" && <ActivityScreen activities={activities} />}
          {route === "permissions" && (
            <PermissionsScreen
              agentId={AGENT_ID}
              active={authorityActive}
              limit={limit}
              durationSeconds={durationSeconds}
              recipientLabel={VENDOR_LABEL}
              recipientAddress={VENDOR_ADDRESS}
              onLimitChange={setControlLimit}
              onDurationChange={setControlDuration}
              onToggleActive={() => setAuthorityActive((current) => !current)}
            />
          )}
          {route === "security" && <SecurityLabScreen apiBase={API_BASE} />}
          {route === "trust" && <TrustScreen initialTab="content" />}
          {route === "content" && <TrustScreen initialTab="content" />}
          {route === "verify" && <TrustScreen initialTab="verify" />}
          {route === "demo" && (
            <GuidedDemoScreen
              onBack={() => { window.location.hash = routePath("home"); }}
              onLive={() => { window.location.hash = routePath("check"); }}
              onActivity={() => { window.location.hash = routePath("activity"); }}
              onPermissions={() => { window.location.hash = routePath("permissions"); }}
              onSecurityLab={() => { window.location.hash = routePath("security"); }}
            />
          )}
          {route === "docs" && <SdkScreen />}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
