import React, { useState } from "react";
import { ReceiptIcon } from "./icons";

export type ActivityStatus =
  | "EXECUTED"
  | "BLOCKED"
  | "HELD"
  | "FAILED"
  | "UNCERTAIN"
  | "UPDATED"
  | "REVOKED";

export interface ActivityTechnicalDetail {
  label: string;
  value: string;
  mono?: boolean;
}

export interface ActivityItem {
  id: string;
  status: ActivityStatus;
  amount?: string;
  recipient?: string;
  detail: string;
  time: string;
  technical: ActivityTechnicalDetail[];
  proofAvailable?: boolean;
}

interface ActivityScreenProps {
  activities: ActivityItem[];
}

function activityMark(status: ActivityStatus) {
  return status === "EXECUTED" || status === "UPDATED"
    ? "✓"
    : status === "UNCERTAIN" || status === "HELD"
      ? "?"
      : "!";
}

function normalizedTechnical(item: ActivityItem): ActivityTechnicalDetail[] {
  const errorCode = item.technical.find(
    (detail) => detail.label === "Error code"
  )?.value;
  if (!errorCode) return item.technical;

  const liveAuthorizationCodes = new Set([
    "live_authorization_disabled",
    "telegraph_credentials_unavailable",
    "permit_signer_unavailable",
    "executor_credentials_unavailable",
    "live_rate_limited",
    "live_daily_budget_exhausted",
    "live_verification_failed",
    "frozen_request_mismatch",
    "frozen_request_required",
    "frozen_request_invalid",
    "frozen_request_expired",
    "frozen_request_consumed"
  ]);
  const noMinerCallCodes = new Set([
    "live_authorization_disabled",
    "telegraph_credentials_unavailable",
    "permit_signer_unavailable",
    "executor_credentials_unavailable",
    "live_rate_limited",
    "live_daily_budget_exhausted",
    "frozen_request_required",
    "frozen_request_invalid",
    "frozen_request_expired",
    "frozen_request_consumed"
  ]);

  const normalizedStage = liveAuthorizationCodes.has(errorCode)
    ? "LIVE AUTHORIZATION"
    : "LOCAL RULES";
  const normalizedTelegraph = noMinerCallCodes.has(errorCode)
    ? "NOT SENT"
    : errorCode === "live_verification_failed"
      ? "ATTEMPTED · NO TRUSTED RESULT"
      : errorCode === "frozen_request_mismatch"
        ? "NOT RELIED ON"
        : "NOT SENT";

  return item.technical.map((detail) => {
    if (detail.label === "Stage") {
      return { ...detail, value: normalizedStage };
    }
    if (detail.label === "Telegraph call") {
      return { ...detail, value: normalizedTelegraph };
    }
    return detail;
  });
}

export function ActivityScreen({ activities }: ActivityScreenProps) {
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [technicalActivity, setTechnicalActivity] = useState<string | null>(null);

  return (
    <main data-testid="activity-screen">
      <div className="screen-head">
        <span className="eyebrow">REQUEST HISTORY</span>
        <h1>What happened.</h1>
        <p>Authorization and execution outcomes from this browser session, in order.</p>
      </div>

      {activities.length === 0 ? (
        <div className="card">
          <div className="activity-empty">
            <ReceiptIcon style={{ width: 30, height: 35, opacity: 0.5 }} />
            <strong>No activity yet.</strong>
            <span>Check a request and its real result will appear here automatically.</span>
          </div>
        </div>
      ) : (
        <div className="activity-list">
          {activities.slice(0, 12).map((item) => {
            const expanded = expandedActivity === item.id;
            const technicalOpen = technicalActivity === item.id;
            const technicalDetails = normalizedTechnical(item);

            return (
              <div className={`activity-item status-${item.status.toLowerCase()}`} key={item.id}>
                <button
                  type="button"
                  className="activity-summary"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpandedActivity(expanded ? null : item.id);
                    if (expanded) setTechnicalActivity(null);
                  }}
                >
                  <span className="activity-icon" aria-hidden="true">{activityMark(item.status)}</span>
                  <span className="activity-main">
                    <strong>
                      {item.amount && item.recipient
                        ? `${item.amount} USDC → ${item.recipient}`
                        : item.detail}
                    </strong>
                    <small>
                      {item.amount && item.recipient
                        ? item.detail
                        : "Permission change"}
                    </small>
                  </span>
                  <span className="activity-meta">
                    <b className={`badge ${item.status === "EXECUTED" ? "ok" : item.status === "BLOCKED" || item.status === "FAILED" ? "block" : item.status === "HELD" || item.status === "UNCERTAIN" ? "hold" : "muted"}`}>{item.status}</b>
                    <time>{item.time}</time>
                  </span>
                </button>

                {expanded && (
                  <div className="activity-detail">
                    <div className="plain-explanation">{item.detail}</div>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-expanded={technicalOpen}
                      onClick={() => setTechnicalActivity(technicalOpen ? null : item.id)}
                    >
                      {technicalOpen ? "HIDE TECHNICAL DETAILS ↑" : "VIEW TECHNICAL DETAILS ↓"}
                    </button>

                    {technicalOpen && (
                      <dl className="kv" data-testid={`activity-technical-${item.id}`}>
                        {technicalDetails.map((detail) => (
                          <div key={`${item.id}:${detail.label}`}>
                            <dt>{detail.label}</dt>
                            <dd className={detail.mono ? "mono" : ""} title={detail.value}>
                              {detail.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {item.proofAvailable && (
                      <span className="badge ok" style={{ justifyContent: "self-start" }}>VERIFIABLE RECEIPT RECORDED</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="note" style={{ marginTop: 18, maxWidth: 640 }}>
        <ReceiptIcon />
        <div>
          <strong>Session history is not the receipt store.</strong>
          <p>This list resets with the browser session. Confirmed Auctorail receipts are recorded separately by the trusted backend.</p>
        </div>
      </div>
    </main>
  );
}
