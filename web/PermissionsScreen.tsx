import React, { useMemo, useState } from "react";
import "./control-screen.css";

interface PermissionsScreenProps {
  agentId: string;
  active: boolean;
  limit: number;
  durationSeconds: number;
  recipientLabel: string;
  recipientAddress: string;
  onLimitChange: (next: number) => void;
  onDurationChange: (next: number) => void;
  onToggleActive: () => void;
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

function durationLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds === 3600) return "1 hour";
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return "24 hours";
}

function shortAddress(value: string): string {
  return value.length > 18
    ? `${value.slice(0, 10)}…${value.slice(-8)}`
    : value;
}

export function PermissionsScreen(props: PermissionsScreenProps) {
  const {
    agentId,
    active,
    limit,
    durationSeconds,
    recipientLabel,
    recipientAddress,
    onLimitChange,
    onDurationChange,
    onToggleActive
  } = props;

  const [editing, setEditing] = useState<"limit" | "duration" | null>(null);

  const durationIndex = useMemo(() => {
    const exact = DURATION_STEPS.indexOf(
      durationSeconds as typeof DURATION_STEPS[number]
    );
    return exact >= 0 ? exact : 2;
  }, [durationSeconds]);

  return (
    <main className="control-shell" data-testid="permissions-screen">
      <section className="control-hero">
        <div>
          <span className="control-kicker">STANDING AUTHORITY</span>
          <h1>Bound<br />{agentId}.</h1>
          <p>Define the maximum authority available to new requests before the agent proposes them.</p>
        </div>
        <div className="control-hero-mark" aria-hidden="true">
          <i className="cc c1" /><i className="cc c2" /><i className="cc c3" /><i className="cc c4" />
          <ShieldIcon />
        </div>
      </section>

      <section className="control-authority hard-shadow" aria-label="Agent permission">
        <div className="control-card-head">
          <div>
            <span>AGENT PERMISSION</span>
            <strong>{agentId}</strong>
          </div>
          <span className={`control-state ${active ? "active" : "revoked"}`}>
            {active ? "ACTIVE" : "REVOKED"}
          </span>
        </div>

        <div className="authority-row">
          <div className="authority-icon"><MoneyIcon /></div>
          <div className="authority-copy">
            <span>MAX PAYMENT</span>
            <strong>{limit.toFixed(2)} USDC</strong>
          </div>
          <button
            type="button"
            onClick={() => setEditing(editing === "limit" ? null : "limit")}
          >
            EDIT
          </button>
        </div>

        {editing === "limit" && (
          <div className="control-inline-editor" data-testid="permission-limit-editor">
            <button
              type="button"
              aria-label="Decrease permission limit"
              disabled={limit <= 0.01}
              onClick={() => onLimitChange(
                Math.max(0.01, Number((limit - 1).toFixed(2)))
              )}
            >
              −
            </button>
            <output>{limit.toFixed(2)} USDC</output>
            <button
              type="button"
              aria-label="Increase permission limit"
              disabled={limit >= 10}
              onClick={() => onLimitChange(
                Math.min(10, Number((limit + 1).toFixed(2)))
              )}
            >
              +
            </button>
          </div>
        )}

        <div className="authority-row recipient-row">
          <div className="authority-icon"><PersonIcon /></div>
          <div className="authority-copy">
            <span>ALLOWED RECIPIENT</span>
            <strong>{recipientLabel}</strong>
            <small title={recipientAddress}>{shortAddress(recipientAddress)}</small>
          </div>
          <span className="locked-badge">PINNED</span>
        </div>

        <div className="recipient-explainer">
          The current live hackathon policy is intentionally pinned to one Base Sepolia test recipient. Changing the address changes the action and requires fresh authority.
        </div>

        <div className="authority-row">
          <div className="authority-icon"><ClockIcon /></div>
          <div className="authority-copy">
            <span>PERMISSION WINDOW</span>
            <strong>{durationLabel(durationSeconds)}</strong>
          </div>
          <button
            type="button"
            onClick={() => setEditing(editing === "duration" ? null : "duration")}
          >
            EDIT
          </button>
        </div>

        {editing === "duration" && (
          <div className="control-inline-editor" data-testid="permission-duration-editor">
            <button
              type="button"
              aria-label="Shorten permission duration"
              disabled={durationIndex === 0}
              onClick={() => onDurationChange(
                DURATION_STEPS[Math.max(0, durationIndex - 1)]
              )}
            >
              −
            </button>
            <output>{durationLabel(durationSeconds)}</output>
            <button
              type="button"
              aria-label="Extend permission duration"
              disabled={durationIndex === DURATION_STEPS.length - 1}
              onClick={() => onDurationChange(
                DURATION_STEPS[Math.min(DURATION_STEPS.length - 1, durationIndex + 1)]
              )}
            >
              +
            </button>
          </div>
        )}

        <button
          type="button"
          className={`revoke-button ${active ? "" : "restore"}`}
          onClick={onToggleActive}
        >
          {active ? "REVOKE FOR NEW REQUESTS" : "RESTORE PERMISSION"}
        </button>
      </section>

      <section className="control-note">
        <div><ShieldIcon /></div>
        <p>
          <strong>Authority is snapshotted before live checks.</strong><br />
          Permission changes apply to the next request. They do not rewrite an action already frozen for authorization.
        </p>
      </section>
    </main>
  );
}
