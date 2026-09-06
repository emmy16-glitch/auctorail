import React, { useMemo, useState } from "react";
import {
  buildAuthorizationTechnical,
  describeAuthorizationOutcome,
  evidenceExplanation,
  evidenceTechnical,
  type AuthorizationPresentationResult,
  type PresentationDetail
} from "./authorization-presenter";
import { FileIcon, LockIcon, CheckIcon, ShieldIcon } from "./icons";

export type CheckPhase = "checking" | "ready" | "error";
export type CheckStage = "rules" | "miners" | "decision";
export type EventTimes = { request: string; rules?: string; miners?: string; decision?: string };

export interface CheckingSnapshot {
  limit: number;
  amount: number;
  durationSeconds: number;
  reason: string;
  reference: string;
}

interface CheckingScreenProps {
  snapshot: CheckingSnapshot;
  phase: CheckPhase;
  stage: CheckStage;
  times: EventTimes | null;
  result: AuthorizationPresentationResult | null;
  error: string | null;
  errorCode: string | null;
  secondaryLabel: string;
  secondaryDisabled: boolean;
  onSecondaryAction: () => void;
  agentId: string;
  recipientLabel: string;
  recipientAddress: string;
}

type TimelineState = "done" | "running" | "pending" | "skipped" | "warning" | "error";
type TimelineId = "01" | "02" | "03" | "04";

interface TimelineDisclosure {
  id: TimelineId;
  title: string;
  copy: string;
  state: TimelineState;
  time?: string;
  badge?: string;
  detailLabel: string;
  explanation: string;
  technical: PresentationDetail[];
}

function formatUsdc(value: number): string { return value.toFixed(2); }
function durationLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds === 3600) return "1 hour";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return "24 hours";
}

function stageSymbol(state: TimelineState) {
  if (state === "done") return <CheckIcon style={{ width: 13, height: 13 }} />;
  if (state === "running") return <span className="status-spinner" />;
  if (state === "warning") return <span className="status-symbol warn">!</span>;
  if (state === "error") return <span className="status-symbol err">×</span>;
  return <span className="status-dash">−</span>;
}

function isQuotaStop(errorCode: string | null): boolean {
  return errorCode === "live_rate_limited" || errorCode === "live_daily_budget_exhausted";
}

function stopsBeforeTelegraph(errorCode: string | null): boolean {
  if (!errorCode) return false;
  return isQuotaStop(errorCode) || [
    "live_authorization_disabled",
    "telegraph_credentials_unavailable",
    "permit_signer_unavailable",
    "executor_credentials_unavailable",
    "frozen_request_required",
    "frozen_request_invalid",
    "frozen_request_expired",
    "frozen_request_consumed",
    "idempotency_key_required",
    "idempotency_key_conflict",
    "request_too_large",
    "request_body_invalid",
    "invalid_authorization_request"
  ].includes(errorCode);
}

function errorTechnical(errorCode: string | null, minerAttempted: boolean): PresentationDetail[] {
  if (!errorCode) return [{ label: "Result", value: "STOPPED SAFELY" }];
  return [
    { label: "Result", value: "STOPPED SAFELY" },
    { label: "Error code", value: errorCode, mono: true },
    { label: "Source", value: errorCode === "live_rate_limited" ? "Auctorail deployment safety quota" : errorCode === "live_daily_budget_exhausted" ? "Auctorail deployment evidence budget" : errorCode.startsWith("live_") ? "Live authorization path" : "Auctorail authorization path" },
    { label: "Telegraph call", value: minerAttempted ? "ATTEMPTED" : "NOT SENT" },
    { label: "Permit issued", value: "NO" },
    { label: "Vendor execution", value: "NO" }
  ];
}

function ruleTechnical(
  snapshot: CheckingSnapshot,
  result: AuthorizationPresentationResult | null,
  agentId: string,
  recipientLabel: string,
  recipientAddress: string,
  passed: boolean
): PresentationDetail[] {
  return [
    { label: "Agent", value: agentId, mono: true },
    { label: "Permission", value: passed ? "PASS" : "CHECKING" },
    { label: "Requested", value: `${formatUsdc(snapshot.amount)} USDC` },
    { label: "Maximum", value: `${formatUsdc(snapshot.limit)} USDC` },
    { label: "Amount within maximum", value: snapshot.amount <= snapshot.limit ? "PASS" : "BLOCK" },
    { label: "Allowed recipient", value: `${recipientLabel} · ${recipientAddress}`, mono: true },
    { label: "Recipient match", value: "PASS" },
    { label: "Permission window", value: durationLabel(snapshot.durationSeconds) },
    { label: "Policy", value: result ? `${result.policyId} · v${result.policyVersion}` : "payments.adaptive.v1 · v1", mono: true },
    { label: "Action hash", value: result?.action.hash ?? "Created by policy preflight", mono: true },
    { label: "Freeze fingerprint", value: result?.freezeFingerprint ?? "Created by policy preflight", mono: true }
  ];
}

function requestTechnical(
  snapshot: CheckingSnapshot,
  result: AuthorizationPresentationResult | null,
  agentId: string,
  recipientLabel: string,
  recipientAddress: string
): PresentationDetail[] {
  return [
    { label: "Agent", value: agentId, mono: true },
    { label: "Amount", value: `${formatUsdc(snapshot.amount)} USDC` },
    { label: "Recipient", value: `${recipientLabel} · ${recipientAddress}`, mono: true },
    { label: "Reason", value: snapshot.reason },
    { label: "Reference", value: snapshot.reference || "—", mono: true },
    { label: "Action hash", value: result?.action.hash ?? "Pending policy preflight", mono: true },
    { label: "Freeze fingerprint", value: result?.freezeFingerprint ?? "Pending policy preflight", mono: true }
  ];
}

export function CheckingScreen(props: CheckingScreenProps) {
  const {
    snapshot, phase, stage, times, result, error, errorCode, secondaryLabel, secondaryDisabled,
    onSecondaryAction, agentId, recipientLabel, recipientAddress
  } = props;
  const [expanded, setExpanded] = useState<TimelineId | null>(null);

  const rulesDone = Boolean(times?.rules);
  const rulesRunning = phase === "checking" && stage === "rules";
  const rulesStopped = phase === "error" && !rulesDone;
  const minersRunning = phase === "checking" && stage === "miners";
  const minerSkipped = stage === "decision" && phase !== "error" && result?.evidence.status === "NOT_REQUESTED";
  const minersStopped = phase === "error" && Boolean(times?.miners);
  const decision = result?.decision;

  const evidencePassed = stage === "decision" && result?.evidence.status === "COMPLETE" && decision === "ALLOW";
  const evidenceHeld = stage === "decision" && Boolean(result) && !minerSkipped && decision === "HOLD";
  const evidenceBlocked = stage === "decision" && Boolean(result) && !minerSkipped && decision === "BLOCK";
  const evidenceIncomplete = stage === "decision" && phase !== "error" && Boolean(result) && !minerSkipped && !evidencePassed && !evidenceHeld && !evidenceBlocked;

  const rows = useMemo<TimelineDisclosure[]>(() => {
    const requestRow: TimelineDisclosure = {
      id: "01",
      title: "REQUEST RECEIVED",
      copy: `Exact request snapshot captured from ${agentId}`,
      state: "done",
      time: times?.request,
      detailLabel: "WHAT HAPPENED",
      explanation: "Auctorail captured the exact proposed action before authorization. The amount, recipient, reason and reference now belong to the frozen request snapshot used by this check.",
      technical: requestTechnical(snapshot, result, agentId, recipientLabel, recipientAddress)
    };

    const rulesState: TimelineState = rulesRunning ? "running" : rulesDone ? "done" : rulesStopped ? "error" : "pending";
    const rulesRow: TimelineDisclosure = {
      id: "02",
      title: rulesRunning ? "RULES CHECKING" : rulesDone ? "RULES CHECKED" : rulesStopped ? "RULES STOPPED" : "RULES PENDING",
      copy: rulesRunning ? "Agent permission is being verified" : rulesDone ? "Agent permission allows this request to continue" : rulesStopped ? "Permission check did not complete" : "Waiting to verify agent permission",
      state: rulesState,
      time: times?.rules,
      detailLabel: rulesDone ? "WHY IT PASSED" : rulesStopped ? "WHY IT STOPPED" : "WHAT AUCTORAIL IS CHECKING",
      explanation: rulesDone
        ? `${formatUsdc(snapshot.amount)} USDC is within the ${formatUsdc(snapshot.limit)} USDC permission, the recipient matches the pinned Base Sepolia recipient, and the request was accepted by the real policy preflight.`
        : rulesStopped
          ? "Auctorail could not complete the local permission preflight, so it failed closed before granting authority."
          : "Auctorail first checks the delegated permission, exact recipient, amount, network, asset and permission window. No Miner needs to be paid until these local rules allow the request to continue.",
      technical: rulesStopped ? errorTechnical(errorCode, false) : ruleTechnical(snapshot, result, agentId, recipientLabel, recipientAddress, rulesDone)
    };

    let evidenceTitle = "REAL CHECKS PENDING";
    let evidenceCopy = "Waiting for permission rules";
    let evidenceState: TimelineState = "pending";
    let evidenceLabel = "WHAT AUCTORAIL WILL CHECK";
    let evidenceDetail = "If the local rules pass, Auctorail requests the consequence-derived intelligence through Telegraph /v1/ask and binds returned evidence to this exact action.";
    let evidenceDetails: PresentationDetail[] = [
      { label: "Telegraph route", value: "/v1/ask · TELEGRAPH_AUTO_INTENT", mono: true },
      { label: "x402 spend", value: "NOT STARTED" },
      { label: "Vendor payment", value: "NOT STARTED" }
    ];

    if (minerSkipped) {
      evidenceTitle = "REAL CHECKS NOT NEEDED";
      evidenceCopy = "Rules blocked this request before any Miner call";
      evidenceState = "skipped";
      evidenceLabel = "WHY NO MINER WAS CALLED";
      evidenceDetail = "The local permission decision was already blocking, so paying for external intelligence could not create authority and would only waste x402 budget.";
      evidenceDetails = result ? evidenceTechnical(result) : evidenceDetails;
    } else if (minersRunning) {
      evidenceTitle = "REAL CHECKS RUNNING";
      evidenceCopy = "Telegraph is routing required intelligence to real Miners";
      evidenceState = "running";
      evidenceLabel = "WHAT IS HAPPENING NOW";
      evidenceDetail = "Auctorail is requesting the required intelligence through Telegraph automatic Intent routing. Any bounded x402 evidence payment is for Miner intelligence only; the vendor payment has not started.";
      evidenceDetails = result ? evidenceTechnical(result) : evidenceDetails;
    } else if (evidencePassed && result) {
      evidenceTitle = "EVIDENCE VERIFIED";
      evidenceCopy = "Required Miner evidence passed the authorization policy and is bound to this action";
      evidenceState = "done";
      evidenceLabel = "WHY IT PASSED";
      evidenceDetail = evidenceExplanation(result);
      evidenceDetails = evidenceTechnical(result);
    } else if (evidenceHeld && result) {
      evidenceTitle = "EVIDENCE INCOMPLETE";
      evidenceCopy = "Required authorization evidence did not reach the policy threshold";
      evidenceState = "warning";
      evidenceLabel = "WHY IT DIDN'T PASS";
      evidenceDetail = evidenceExplanation(result);
      evidenceDetails = evidenceTechnical(result);
    } else if (evidenceBlocked && result) {
      evidenceTitle = "EVIDENCE BLOCKED";
      evidenceCopy = "A trusted evidence or policy check produced a blocking result";
      evidenceState = "error";
      evidenceLabel = "WHY THE EVIDENCE BLOCKS";
      evidenceDetail = evidenceExplanation(result);
      evidenceDetails = evidenceTechnical(result);
    } else if (evidenceIncomplete && result) {
      evidenceTitle = "EVIDENCE INCOMPLETE";
      evidenceCopy = "Auctorail did not obtain a complete authorization result from the evidence stage";
      evidenceState = "warning";
      evidenceLabel = "WHY IT DIDN'T PASS";
      evidenceDetail = evidenceExplanation(result);
      evidenceDetails = evidenceTechnical(result);
    } else if (minersStopped) {
      const preMinerStop = stopsBeforeTelegraph(errorCode);
      evidenceTitle = preMinerStop ? "LIVE CHECK NOT STARTED" : "REAL CHECKS STOPPED";
      evidenceCopy = preMinerStop ? "Auctorail stopped this attempt before a Miner call" : "Live verification did not produce a trusted result";
      evidenceState = preMinerStop ? "warning" : "error";
      evidenceLabel = preMinerStop ? "WHY IT DIDN'T START" : "WHY IT STOPPED";
      evidenceDetail = error ?? "Auctorail failed closed because the live intelligence step did not return a trustworthy result.";
      evidenceDetails = errorTechnical(errorCode, !preMinerStop);
    } else if (rulesStopped) {
      evidenceTitle = "REAL CHECKS NOT STARTED";
      evidenceCopy = "Rules did not complete, so no Miner call was made";
      evidenceState = "skipped";
      evidenceLabel = "WHY IT DIDN'T START";
      evidenceDetail = "Auctorail never spends on external intelligence when the local permission preflight has not completed successfully.";
      evidenceDetails = errorTechnical(errorCode, false);
    }

    const evidenceRow: TimelineDisclosure = {
      id: "03", title: evidenceTitle, copy: evidenceCopy, state: evidenceState, time: times?.miners,
      detailLabel: evidenceLabel, explanation: evidenceDetail, technical: evidenceDetails
    };

    let decisionState: TimelineState = "pending";
    let decisionCopy = "Waiting for all checks to complete";
    let decisionBadge: string | undefined;
    let decisionLabel = "WHAT THE DECISION WILL MEAN";
    let decisionDetail = "Auctorail will only create execution authority if every required check for the exact action reaches an ALLOW decision.";
    let decisionTechnical: PresentationDetail[] = [{ label: "Decision", value: "PENDING" }, { label: "Permit issued", value: "NO" }];

    if (phase === "error") {
      const minerAttempted = Boolean(times?.miners) && !stopsBeforeTelegraph(errorCode);
      decisionState = "error";
      decisionCopy = "The authorization stopped safely without execution authority";
      decisionBadge = "STOPPED";
      decisionLabel = "WHY IT STOPPED";
      decisionDetail = error ?? "The request stopped without granting execution authority.";
      decisionTechnical = errorTechnical(errorCode, minerAttempted);
    } else if (phase === "ready" && result) {
      decisionBadge = decision ?? "DONE";
      decisionState = decision === "HOLD" ? "warning" : decision === "BLOCK" ? "error" : "done";
      decisionCopy = decision === "HOLD"
        ? "Held because the required evidence or policy threshold was not satisfied"
        : decision === "BLOCK"
          ? "Blocked because a policy or trusted evidence check failed"
          : "All required checks passed for the exact action";
      decisionLabel = decision === "HOLD" ? "WHAT HOLD MEANS" : decision === "BLOCK" ? "WHY IT WAS BLOCKED" : "WHY IT PASSED";
      decisionDetail = describeAuthorizationOutcome(result);
      decisionTechnical = buildAuthorizationTechnical(result, recipientLabel);
    }

    return [requestRow, rulesRow, evidenceRow, {
      id: "04", title: "DECISION", copy: decisionCopy, state: decisionState, time: times?.decision,
      badge: decisionBadge, detailLabel: decisionLabel, explanation: decisionDetail, technical: decisionTechnical
    }];
  }, [agentId, decision, error, errorCode, evidenceBlocked, evidenceHeld, evidenceIncomplete, evidencePassed, minerSkipped, minersRunning, minersStopped, phase, recipientAddress, recipientLabel, result, rulesDone, rulesRunning, rulesStopped, snapshot, times]);

  const workingTitle = phase === "error"
    ? (errorCode === "live_rate_limited" ? "Live verification paused." : "Stopped safely.")
    : phase === "ready"
      ? `${decision ?? "DONE"}.`
      : minersRunning ? "Checking live evidence..." : "Checking permission...";

  const workingCopy = phase === "error"
    ? error ?? "The check stopped without granting permission."
    : phase === "ready" && result
      ? describeAuthorizationOutcome(result)
      : minersRunning
        ? "Telegraph is routing the required intelligence to real Miners. Bounded x402 evidence fees may be paid; the vendor payment has not started."
        : "The real policy engine is checking the delegated permission first. No Miner has been paid at this stage.";

  const statusClass = phase === "error"
    ? "error"
    : phase === "ready"
      ? (decision === "HOLD" ? "ready-hold" : decision === "BLOCK" ? "ready-block" : "ready-allow")
      : "";

  return (
    <div className="check-layout" data-testid="checking-screen">
      <section aria-label="Request being checked">
        <span className="eyebrow">LIVE AUTHORIZATION</span>
        <h1 style={{ margin: "10px 0 20px" }}>CHECKING REQUEST</h1>

        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 14, alignItems: "center" }}>
            <FileIcon style={{ width: 26, height: 30, color: "var(--text-3)" }} />
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 15, fontWeight: 650, overflowWrap: "anywhere", display: "block" }}>{formatUsdc(snapshot.amount)} USDC → {recipientLabel}</strong>
              <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{snapshot.reason} · Ref: {snapshot.reference || "—"}</span>
            </div>
          </div>
        </div>

        <div className={`check-status ${statusClass}`} role="status" aria-live="polite">
          <div className="cs-icon" aria-hidden="true">&gt;_</div>
          <div>
            <strong>{workingTitle}</strong>
            <p>{workingCopy}</p>
          </div>
        </div>

        <button className="btn btn-ghost" type="button" onClick={onSecondaryAction} disabled={secondaryDisabled} aria-label={secondaryLabel}
          title={secondaryDisabled ? "A real Miner request is already in flight, so the browser cannot safely promise cancellation." : undefined}
          style={{ marginTop: 14 }}>
          <span>{secondaryLabel}</span><span aria-hidden="true">{phase === "checking" ? "×" : "←"}</span>
        </button>
      </section>

      <aside aria-label="Live authorization progress">
        <div className="timeline">
          {rows.map((row) => {
            const open = expanded === row.id;
            return (
              <article className={`timeline-stage ${row.state} ${open ? "is-open" : ""}`} data-stage={row.id} key={row.id}>
                <button className="timeline-row" type="button" aria-expanded={open} aria-controls={`timeline-detail-${row.id}`} onClick={() => setExpanded(open ? null : row.id)}>
                  <div className="timeline-number">{row.id}</div>
                  <div className="timeline-copy">
                    <strong>{row.title}</strong>
                    <span>{row.copy}</span>
                    <i>{open ? "HIDE DETAILS ↑" : "SEE DETAILS ↓"}</i>
                  </div>
                  <div className="timeline-status-wrap">
                    <div className="timeline-status" aria-label={row.badge ?? row.state}>{stageSymbol(row.state)}</div>
                    <span className="timeline-time">{row.badge ?? (row.state === "skipped" ? "NOT NEEDED" : row.time ?? (row.state === "pending" ? "PENDING" : "—"))}</span>
                  </div>
                </button>
                {open && (
                  <div className="timeline-disclosure" id={`timeline-detail-${row.id}`} data-testid={`timeline-detail-${row.id}`}>
                    <span className="disc-label">{row.detailLabel}</span>
                    <p className="disc-copy">{row.explanation}</p>
                    <details className="technical">
                      <summary>VIEW TECHNICAL DETAILS ↓</summary>
                      <dl className="kv">{row.technical.map((detail, index) => <div key={`${row.id}:${detail.label}:${index}`}><dt>{detail.label}</dt><dd className={detail.mono ? "mono" : ""} title={detail.value}>{detail.value}</dd></div>)}</dl>
                    </details>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="note" style={{ marginTop: 16 }}>
          <LockIcon />
          <div>
            <strong>No vendor payment is made on this screen.</strong>
            <p>{phase === "checking"
              ? "Auctorail is deciding whether a signed execution permit can be issued."
              : phase === "error"
                ? "Nothing was executed and no permit was issued."
                : "Authority is issued only when every check allows the exact action."}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
