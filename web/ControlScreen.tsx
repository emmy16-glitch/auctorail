import React, { useMemo, useState } from "react";
import "./control-screen.css";

export type ControlActivityStatus =
  | "EXECUTED"
  | "BLOCKED"
  | "HELD"
  | "FAILED"
  | "UNCERTAIN"
  | "UPDATED"
  | "REVOKED";

export interface ControlActivityItem {
  id: string;
  status: ControlActivityStatus;
  amount?: string;
  recipient?: string;
  detail: string;
  time: string;
  proofAvailable?: boolean;
}

interface ControlScreenProps {
  agentId: string;
  active: boolean;
  limit: number;
  durationSeconds: number;
  activities: ControlActivityItem[];
  onLimitChange: (next: number) => void;
  onDurationChange: (next: number) => void;
  onToggleActive: () => void;
  onViewProof: (activityId: string) => void;
}

const DURATION_STEPS = [900, 1800, 3600, 7200, 14400, 28800, 86400] as const;

function ShieldIcon() {
  return (
    <svg viewBox="0 0 48 56" aria-hidden="true">
      <path d="M24 3 43 10v15c0 12-7.6 22.4-19 28C12.6 47.4 5 37 5 25V10L24 3Z" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function MoneyIcon() {
  return <span className="control-symbol" aria-hidden="true">$</span>;
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 25v-4c0-5 3.5-8 9-8s9 3 9 8v4H5Z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14 8v7l5 3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function activityMark(status: ControlActivityStatus) {
  return status === "EXECUTED" || status === "UPDATED" ? "✓" : status === "UNCERTAIN" ? "?" : "!";
}

function durationLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds === 3600) return "1 hour";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return "24 hours";
}

export function ControlScreen(props: ControlScreenProps) {
  const {
    agentId,
    active,
    limit,
    durationSeconds,
    activities,
    onLimitChange,
    onDurationChange,
    onToggleActive,
    onViewProof
  } = props;

  const [editing, setEditing] = useState<"limit" | "duration" | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);

  const durationIndex = useMemo(() => {
    const exact = DURATION_STEPS.indexOf(durationSeconds as typeof DURATION_STEPS[number]);
    return exact >= 0 ? exact : 2;
  }, [durationSeconds]);

  return (
    <main className="control-shell" data-testid="control-screen">
      <section className="control-hero">
        <div>
          <h1>See and control<br />authority.</h1>
          <p>Manage what the agent can do<br />and review what it has done.</p>
        </div>
        <div className="control-hero-mark" aria-hidden="true">
          <i className="cc c1" /><i className="cc c2" /><i className="cc c3" /><i className="cc c4" />
          <ShieldIcon />
        </div>
      </section>

      <section className="control-authority hard-shadow" aria-label="Current authority">
        <div className="control-card-head">
          <div>
            <span>CURRENT AUTHORITY</span>
            <strong>{agentId}</strong>
          </div>
          <span className={`control-state ${active ? "active" : "revoked"}`}>{active ? "ACTIVE" : "REVOKED"}</span>
        </div>

        <div className="authority-row">
          <div className="authority-icon"><MoneyIcon /></div>
          <div className="authority-copy">
            <span>ALLOWED TO SEND</span>
            <strong>{limit.toFixed(2)} USDC</strong>
          </div>
          <button type="button" onClick={() => setEditing(editing === "limit" ? null : "limit")}>EDIT</button>
        </div>
        {editing === "limit" && (
          <div className="control-inline-editor" data-testid="control-limit-editor">
            <button type="button" aria-label="Decrease control limit" onClick={() => onLimitChange(Math.max(1, Number((limit - 1).toFixed(2))))}>−</button>
            <output>{limit.toFixed(2)} USDC</output>
            <button type="button" aria-label="Increase control limit" onClick={() => onLimitChange(Math.min(10, Number((limit + 1).toFixed(2))))}>+</button>
          </div>
        )}

        <div className="authority-row">
          <div className="authority-icon"><PersonIcon /></div>
          <div className="authority-copy">
            <span>ONLY TO</span>
            <strong>ProofGate Vendor</strong>
          </div>
          <button type="button" disabled title="Recipient is pinned for the live hackathon flow">LOCKED</button>
        </div>

        <div className="authority-row">
          <div className="authority-icon"><ClockIcon /></div>
          <div className="authority-copy">
            <span>PERMISSION LASTS</span>
            <strong>{durationLabel(durationSeconds)}</strong>
          </div>
          <button type="button" onClick={() => setEditing(editing === "duration" ? null : "duration")}>EDIT</button>
        </div>
        {editing === "duration" && (
          <div className="control-inline-editor" data-testid="control-duration-editor">
            <button type="button" aria-label="Shorten control duration" disabled={durationIndex === 0} onClick={() => onDurationChange(DURATION_STEPS[Math.max(0, durationIndex - 1)])}>−</button>
            <output>{durationLabel(durationSeconds)}</output>
            <button type="button" aria-label="Extend control duration" disabled={durationIndex === DURATION_STEPS.length - 1} onClick={() => onDurationChange(DURATION_STEPS[Math.min(DURATION_STEPS.length - 1, durationIndex + 1)])}>+</button>
          </div>
        )}

        <button type="button" className={`revoke-button ${active ? "" : "restore"}`} onClick={onToggleActive}>
          {active ? "REVOKE AUTHORITY" : "RESTORE AUTHORITY"}
        </button>
      </section>

      <section className="activity-card hard-shadow" aria-label="Recent activity">
        <div className="activity-head">
          <span>RECENT ACTIVITY</span>
          <small>THIS SESSION</small>
        </div>

        {activities.length === 0 ? (
          <div className="activity-empty">
            <strong>No activity yet.</strong>
            <span>Requests you check will appear here automatically.</span>
          </div>
        ) : (
          <div className="activity-list">
            {activities.slice(0, 5).map((item) => {
              const expanded = expandedActivity === item.id;
              return (
                <div className={`activity-item status-${item.status.toLowerCase()}`} key={item.id}>
                  <button
                    type="button"
                    className="activity-summary"
                    aria-expanded={expanded}
                    onClick={() => setExpandedActivity(expanded ? null : item.id)}
                  >
                    <span className="activity-icon" aria-hidden="true">{activityMark(item.status)}</span>
                    <span className="activity-main">
                      <strong>{item.amount && item.recipient ? `${item.amount} USDC → ${item.recipient}` : item.detail}</strong>
                      <small>{item.amount && item.recipient ? item.detail : "Authority change"}</small>
                    </span>
                    <span className="activity-meta">
                      <b>{item.status}</b>
                      <time>{item.time}</time>
                    </span>
                  </button>
                  {expanded && (
                    <div className="activity-detail">
                      <span>{item.detail}</span>
                      {item.proofAvailable && (
                        <button type="button" onClick={() => onViewProof(item.id)}>VIEW PROOF →</button>
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
        <div><ShieldIcon /></div>
        <p><strong>You remain in control.</strong><br />Changes here affect the next request. Active checks keep the exact authority they started with.</p>
      </section>
    </main>
  );
}
