import React, { useState } from "react";
import "./control-screen.css";

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

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 48 56" aria-hidden="true">
      <path d="M10 4h28v48l-7-4-7 4-7-4-7 4V4Z" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M16 17h16M16 26h16M16 35h10" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
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
    <main className="control-shell" data-testid="activity-screen">
      <section className="control-hero">
        <div>
          <span className="control-kicker">REQUEST HISTORY</span>
          <h1>What<br />happened.</h1>
          <p>Authorization and execution outcomes from this browser session, in order.</p>
        </div>
        <div className="control-hero-mark" aria-hidden="true">
          <i className="cc c1" /><i className="cc c2" /><i className="cc c3" /><i className="cc c4" />
          <ReceiptIcon />
        </div>
      </section>

      <section className="activity-card hard-shadow" aria-label="Recent activity">
        <div className="activity-head">
          <div>
            <span>RECENT ACTIVITY</span>
            <small>Real outcomes created by this UI session</small>
          </div>
          <small>THIS SESSION</small>
        </div>

        {activities.length === 0 ? (
          <div className="activity-empty">
            <strong>No activity yet.</strong>
            <span>Check a request and its real result will appear here automatically.</span>
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
                      <b>{item.status}</b>
                      <time>{item.time}</time>
                    </span>
                  </button>

                  {expanded && (
                    <div className="activity-detail">
                      <div className="plain-explanation">
                        <strong>WHAT HAPPENED</strong>
                        <span>{item.detail}</span>
                      </div>

                      <button
                        type="button"
                        className="technical-toggle"
                        aria-expanded={technicalOpen}
                        onClick={() => setTechnicalActivity(technicalOpen ? null : item.id)}
                      >
                        {technicalOpen
                          ? "HIDE TECHNICAL DETAILS ↑"
                          : "VIEW TECHNICAL DETAILS ↓"}
                      </button>

                      {technicalOpen && (
                        <dl className="activity-technical" data-testid={`activity-technical-${item.id}`}>
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
                        <span className="proof-note">VERIFIABLE RECEIPT RECORDED</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="control-note">
        <div><ReceiptIcon /></div>
        <p>
          <strong>Session history is not the receipt store.</strong><br />
          This list resets with the browser session. Confirmed ProofGate receipts are recorded separately by the trusted backend.
        </p>
      </section>
    </main>
  );
}
