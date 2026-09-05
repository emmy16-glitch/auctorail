import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ExecutionScreen,
  type ExecutionIntelligenceSource,
  type ExecutionPermitSummary,
  type ExecutionResponse,
  type ExecutionUiPhase
} from "./ExecutionScreen";
import {
  ActivityScreen,
  type ActivityItem,
  type ActivityTechnicalDetail
} from "./ActivityScreen";
import { PermissionsScreen } from "./PermissionsScreen";
import { SecurityLabScreen } from "./SecurityLabScreen";
import { CheckingScreen } from "./CheckingScreen";
import {
  buildAuthorizationTechnical,
  describeAuthorizationOutcome,
  type AuthorizationCheck
} from "./authorization-presenter";
import "./styles.css";
import "./checking-screen.css";
import "./mobile-readability.css";
import "./surface-router.css";
import "./ui-fixes.css";

const API_BASE = (import.meta.env.VITE_PROOFGATE_API_URL ?? "").replace(/\/$/, "");
const VENDOR_ADDRESS = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const VENDOR_LABEL = "ProofGate Vendor";
const AGENT_ID = "invoice-bot";
const MAX_USDC = 10;
const BASE_SEPOLIA_CHAIN_ID = 84532;
const DURATION_STEPS = [900, 1800, 3600, 7200, 14400, 28800, 86400] as const;

type Surface = "check" | "activity" | "permissions" | "security";
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
  checks?: AuthorizationCheck[];
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
type EventTimes = { request: string; rules?: string; miners?: string; decision?: string };
type SvgProps = React.SVGProps<SVGSVGElement>;
type RequestSnapshot = {
  limit: number;
  amount: number;
  durationSeconds: number;
  reason: string;
  reference: string;
};

function ShieldIcon(props: SvgProps) {
  return <svg viewBox="0 0 48 56" aria-hidden="true" {...props}><path d="M24 3 43 10v15c0 12-7.6 22.4-19 28C12.6 47.4 5 37 5 25V10L24 3Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="miter" /></svg>;
}
function MenuIcon(props: SvgProps) {
  return <svg viewBox="0 0 28 28" aria-hidden="true" {...props}><path d="M4 7h20M4 14h20M4 21h20" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}
function FileIcon(props: SvgProps) {
  return <svg viewBox="0 0 38 44" aria-hidden="true" {...props}><path d="M7 2h16l8 8v32H7V2Z" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M23 2v9h8M12 21h14M12 27h14M12 33h10" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}
function LockIcon(props: SvgProps) {
  return <svg viewBox="0 0 40 44" aria-hidden="true" {...props}><path d="M11 18v-6a9 9 0 0 1 18 0v6M6 18h28v23H6V18Z" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M20 27v7" stroke="currentColor" strokeWidth="2.5" /></svg>;
}

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
    case "permit_issuance_failed": return "ProofGate could not issue a valid execution permit. The vendor payment was not started.";
    case "executor_credentials_unavailable": return "The protected Base Sepolia executor is unavailable. No Miner or vendor payment was started.";
    case "live_rate_limited": return "ProofGate paused new live Miner calls because this deployment reached its hourly safety quota. Telegraph was not called for this attempt.";
    case "policy_rate_limited": return "The local rules service is receiving too many requests. Try again in a moment.";
    case "live_daily_budget_exhausted": return "ProofGate reached this deployment's daily budget for real x402 evidence. No new Miner call was started.";
    case "live_verification_failed": return "The real Miner check did not finish safely. Nothing was approved.";
    case "frozen_request_mismatch": return "The request changed after the rules check. ProofGate rejected the changed request before using the old authorization.";
    case "frozen_request_required":
    case "frozen_request_invalid":
    case "frozen_request_expired":
    case "frozen_request_consumed": return "The verified preflight is no longer valid. Start a new check before any live Miner request.";
    case "origin_not_allowed": return "This page is not allowed to use the ProofGate API.";
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
    case "execution_rate_limited": return "ProofGate reached its protected execution safety quota. No transaction was started by this request.";
    case "executor_credentials_unavailable": return "The protected Base Sepolia executor is unavailable. No transaction was started by this request.";
    case "proof_receipt_verification_failed": return "Execution may have occurred, but ProofGate could not verify its receipt. Automatic retry is locked.";
    case "execution_response_mismatch": return "The execution response did not match the exact authorized request. Automatic retry is locked.";
    default: return "The execution request did not return a trustworthy final receipt. Automatic retry is locked.";
  }
}

function executionHttpFailureIsDefinitelyPreBroadcast(code: string): boolean {
  return ["execution_token_invalid","idempotency_key_required","idempotency_key_conflict","execution_session_invalid","execution_session_expired","execution_session_consumed","executor_credentials_unavailable","execution_rate_limited","request_too_large","request_body_invalid","invalid_execution_request"].includes(code);
}
function isExecutionPhase(phase: Phase): phase is ExecutionUiPhase {
  return phase === "executing" || phase === "executed" || phase === "execution_failed" || phase === "execution_ambiguous";
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

function App() {
  const [surface, setSurface] = useState<Surface>("check");
  const [authorityActive, setAuthorityActive] = useState(true);
  const [limit, setLimit] = useState(5);
  const [durationIndex, setDurationIndex] = useState(2);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("Supplier invoice #4471");
  const [reference, setReference] = useState("INV-4471");
  const [requestDetailsOpen, setRequestDetailsOpen] = useState(false);
  const [requestEditMode, setRequestEditMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
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

  const durationSeconds = DURATION_STEPS[durationIndex];
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= MAX_USDC;
  const limitValid = Number.isFinite(limit) && limit > 0 && limit <= MAX_USDC;
  const withinLimit = amountValid && limitValid && amount <= limit;
  const canCheck = authorityActive && amountValid && limitValid && reason.trim().length > 0 && phase === "idle";

  const statusMessage = useMemo(() => {
    if (!authorityActive) return "Agent permission is revoked. Restore it in PERMISSIONS before starting a new request.";
    if (!withinLimit) return "This request is above the current maximum. ProofGate will block it locally before any Miner is paid.";
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
          id: `execution:${executionId}`,
          status: preBroadcast ? "FAILED" : "UNCERTAIN",
          amount: formatUsdc(snapshot.amount), recipient: VENDOR_LABEL,
          detail: preBroadcast ? `${message} No vendor transaction was started by this attempt.` : `${message} ProofGate will not broadcast a replacement transaction automatically.`,
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
          detail: "ProofGate authorized the exact request, executed it once on Base Sepolia, confirmed the transaction, and recorded a verifiable receipt.",
          time: activityTime(), proofAvailable: true, technical: executionTechnical(liveResult, body)
        });
      } else if (body.status === "AMBIGUOUS") {
        const message = body.error ?? friendlyExecutionError("execution_ambiguous");
        setExecutionError(message);
        setPhase("execution_ambiguous");
        pushActivity({ id: `execution:${executionId}`, status: "UNCERTAIN", amount: body.payment.amount, recipient: VENDOR_LABEL,
          detail: "Execution was dispatched, but ProofGate could not establish a trustworthy final confirmation. Automatic retry is locked to avoid a duplicate payment.",
          time: activityTime(), technical: executionTechnical(liveResult, body, body.code) });
      } else {
        const message = body.error ?? "The protected executor did not complete the authorized payment.";
        setExecutionError(message);
        setPhase("execution_failed");
        pushActivity({ id: `execution:${executionId}`, status: "FAILED", amount: body.payment.amount, recipient: VENDOR_LABEL,
          detail: "The authorized execution did not complete with a confirmed receipt. ProofGate did not automatically retry it.",
          time: activityTime(), technical: executionTechnical(liveResult, body, body.code) });
      }
    } catch {
      if (requestDispatched) {
        const message = "The execution request lost its trustworthy response after dispatch. The payment may have reached Base Sepolia, so ProofGate will not retry automatically.";
        setExecutionError(message);
        setPhase("execution_ambiguous");
        pushActivity({ id: `execution:${executionId}`, status: "UNCERTAIN", amount: formatUsdc(snapshot.amount), recipient: VENDOR_LABEL,
          detail: message, time: activityTime(), technical: executionTechnical(liveResult, null, "transport_response_lost") });
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
          ...(code === "live_rate_limited" ? [{ label: "Limit source", value: "ProofGate deployment hourly safety quota" }] : [])
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
    <main className="content-shell">
      <section className="hero-block">
        <div><h1>Control what an<br />agent can do.</h1><p>Set the permission. Give it a request.<br />ProofGate enforces the decision automatically.</p></div>
        <div className="hero-mark" aria-hidden="true"><span className="corner c1" /><span className="corner c2" /><span className="corner c3" /><span className="corner c4" /><ShieldIcon /></div>
      </section>

      <section className="authority-panel hard-shadow" aria-label="Agent permission">
        <div className="panel-heading"><div><span className="eyebrow">AGENT PERMISSION</span><strong className="agent-name">invoice-bot</strong></div><span className={`active-badge ${authorityActive ? "" : "revoked"}`}>{authorityActive ? "ACTIVE" : "REVOKED"}</span></div>
        <div className="control-section"><label>MAX PAYMENT</label><div className="stepper" role="group" aria-label="Maximum payment">
          <button type="button" aria-label="Decrease maximum payment" onClick={() => adjustLimit(-1)} disabled={limit <= 0.01}>−</button>
          <output data-testid="limit-value">{formatUsdc(limit)} USDC</output>
          <button type="button" aria-label="Increase maximum payment" onClick={() => adjustLimit(1)} disabled={limit >= MAX_USDC}>+</button>
        </div></div>
        <div className="control-section"><label>ALLOWED RECIPIENT</label><div className="locked-recipient" data-testid="locked-recipient"><div><strong>{VENDOR_LABEL}</strong><span title={VENDOR_ADDRESS}>{shortAddress(VENDOR_ADDRESS)} · Base Sepolia test recipient</span></div><b>PINNED</b></div></div>
        <div className="control-section"><label>PERMISSION WINDOW</label><div className="stepper" role="group" aria-label="Permission duration">
          <button type="button" aria-label="Shorten permission duration" onClick={() => adjustDuration(-1)} disabled={durationIndex === 0}>−</button>
          <output data-testid="duration-value">{durationLabel(durationSeconds)}</output>
          <button type="button" aria-label="Extend permission duration" onClick={() => adjustDuration(1)} disabled={durationIndex === DURATION_STEPS.length - 1}>+</button>
        </div></div>
      </section>

      <section className={`request-panel hard-shadow ${requestDetailsOpen ? "editing" : ""}`} aria-label="Current request">
        <button className="request-summary" type="button" aria-expanded={requestDetailsOpen} onClick={() => { setRequestDetailsOpen((open) => !open); if (requestDetailsOpen) setRequestEditMode(false); }}>
          <div><span className="eyebrow">CURRENT REQUEST</span><strong>{formatUsdc(amount)} USDC → {VENDOR_LABEL}</strong><span>{reason}</span><span>Ref: {reference || "—"}</span></div><FileIcon />
        </button>
        {requestDetailsOpen && (
          <div className="request-editor request-details" data-testid="request-editor">
            <div className="request-origin-note"><strong>AGENT REQUEST</strong><span>In an integration, {AGENT_ID} supplies this action automatically. Editing below is only a hackathon/test control.</span></div>
            <dl className="request-readout">
              <div><dt>Agent</dt><dd>{AGENT_ID}</dd></div><div><dt>Recipient</dt><dd>{VENDOR_LABEL}<br /><code>{VENDOR_ADDRESS}</code></dd></div>
              <div><dt>Amount</dt><dd>{formatUsdc(amount)} USDC</dd></div><div><dt>Reason</dt><dd>{reason}</dd></div><div><dt>Reference</dt><dd>{reference || "—"}</dd></div>
            </dl>
            {!requestEditMode ? (
              <button className="edit-test-request" type="button" onClick={() => setRequestEditMode(true)}>EDIT TEST REQUEST</button>
            ) : (
              <div className="test-request-editor" data-testid="test-request-editor">
                <div className="editor-row"><label htmlFor="request-amount">AMOUNT</label><div className="mini-stepper">
                  <button type="button" aria-label="Decrease request amount" onClick={() => adjustAmount(-1)} disabled={amount <= 0.01}>−</button>
                  <input id="request-amount" inputMode="decimal" value={Number.isFinite(amount) ? amount.toFixed(2) : ""} onChange={(event) => { const next = Number(event.target.value); setAmount(Number.isFinite(next) ? next : 0); resetDecision(); }} />
                  <span>USDC</span><button type="button" aria-label="Increase request amount" onClick={() => adjustAmount(1)} disabled={amount >= MAX_USDC}>+</button>
                </div></div>
                <label className="editor-field">REASON<input value={reason} maxLength={256} onChange={(event) => { setReason(event.target.value); resetDecision(); }} /></label>
                <label className="editor-field">REFERENCE<input value={reference} maxLength={200} onChange={(event) => { setReference(event.target.value); resetDecision(); }} /></label>
                <button className="done-editing" type="button" onClick={() => setRequestEditMode(false)}>DONE EDITING</button>
              </div>
            )}
          </div>
        )}
      </section>

      <button className="check-button" type="button" onClick={checkRequest} disabled={!canCheck}><span>CHECK THIS REQUEST</span><span className="arrow" aria-hidden="true">→</span></button>
      <div className="safety-note idle" role="status" aria-live="polite"><LockIcon /><div><strong>{authorityActive ? "Nothing is sent yet." : "Permission revoked."}</strong><p>{statusMessage}</p></div></div>
    </main>
  ) : isExecutionPhase(phase) && executionAuthorization ? (
    <ExecutionScreen phase={phase} authorization={executionAuthorization} response={executionResult} error={executionError} proofOpen={proofOpen} onToggleProof={() => setProofOpen((open) => !open)} onNewRequest={clearCheckState} />
  ) : (
    <CheckingScreen snapshot={shownSnapshot} phase={phase as CheckPhase} stage={checkStage} times={eventTimes} result={result} error={error} errorCode={errorCode} secondaryLabel={secondaryLabel} secondaryDisabled={secondaryDisabled} onSecondaryAction={onSecondaryAction} agentId={AGENT_ID} recipientLabel={VENDOR_LABEL} recipientAddress={VENDOR_ADDRESS} />
  );

  return (
    <div className="app-page">
      <div className="live-strip" aria-label="Live environment"><span className="live-dot" /><span>LIVE</span><i>·</i><span>BASE SEPOLIA</span><i>·</i><span>REAL MINERS</span></div>
      <header className="brand-row"><div className="brand-lockup"><ShieldIcon className="brand-shield" /><div><strong>PROOFGATE</strong><span>Real authorization</span></div></div><div className="menu-wrap">
        <button className="menu-button" type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MenuIcon /></button>
        {menuOpen && <div className="menu-popover" role="menu"><a href="https://github.com/emmy16-glitch/proof-gate" target="_blank" rel="noreferrer" role="menuitem">View source ↗</a><div className="menu-note">Real path<br />Telegraph /v1/ask + x402</div></div>}
      </div></header>
      <nav className="top-tabs pg-surface-tabs" aria-label="ProofGate sections">
        <button type="button" className={surface === "check" ? "active" : ""} aria-current={surface === "check" ? "page" : undefined} onClick={() => setSurface("check")}>CHECK</button>
        <button type="button" className={surface === "activity" ? "active" : ""} aria-current={surface === "activity" ? "page" : undefined} onClick={() => setSurface("activity")}>ACTIVITY</button>
        <button type="button" className={surface === "permissions" ? "active" : ""} aria-current={surface === "permissions" ? "page" : undefined} onClick={() => setSurface("permissions")}>PERMISSIONS</button>
        <button type="button" className={surface === "security" ? "active" : ""} aria-current={surface === "security" ? "page" : undefined} onClick={() => setSurface("security")}>SECURITY LAB</button>
      </nav>
      {surface === "check" ? checkSurface : surface === "activity" ? (
        <ActivityScreen activities={activities} />
      ) : surface === "permissions" ? (
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
      ) : <SecurityLabScreen apiBase={API_BASE} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
