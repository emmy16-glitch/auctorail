import React, { useMemo, useState } from "react";
import { ShieldIcon } from "./icons";

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
    <main data-testid="permissions-screen">
      <div className="screen-head">
        <span className="eyebrow">STANDING AUTHORITY</span>
        <h1>Bound {agentId}.</h1>
        <p>Standing authority for this agent. Changes apply to the next request — never to an action already frozen for authorization.</p>
      </div>

      <section className="card card-pad permissions-card" aria-label="Agent permission">
        <div className="agent-row" style={{ paddingTop: 0, borderTop: 0 }}>
          <div className="agent-id">
            <span>AGENT</span>
            <strong>{agentId}</strong>
          </div>
          <span className={`badge ${active ? "ok" : "block"}`}>{active ? "ACTIVE" : "REVOKED"}</span>
        </div>

        <div className="perm-row">
          <div className="perm-copy">
            <span>MAX PAYMENT</span>
            <strong>{limit.toFixed(2)} USDC</strong>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setEditing(editing === "limit" ? null : "limit")}
          >
            EDIT
          </button>
        </div>

        {editing === "limit" && (
          <div className="perm-editor" data-testid="permission-limit-editor">
            <div className="stepper">
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
          </div>
        )}

        <div className="perm-row">
          <div className="perm-copy">
            <span>ALLOWED RECIPIENT</span>
            <strong>{recipientLabel}</strong>
            <small title={recipientAddress}>{shortAddress(recipientAddress)}</small>
          </div>
          <span className="badge muted">PINNED</span>
        </div>

        <p className="editor-note" style={{ margin: "0 0 4px" }}>
          The current live hackathon policy is intentionally pinned to one Base Sepolia test recipient. Changing the address changes the action and requires fresh authority.
        </p>

        <div className="perm-row">
          <div className="perm-copy">
            <span>PERMISSION WINDOW</span>
            <strong>{durationLabel(durationSeconds)}</strong>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setEditing(editing === "duration" ? null : "duration")}
          >
            EDIT
          </button>
        </div>

        {editing === "duration" && (
          <div className="perm-editor" data-testid="permission-duration-editor">
            <div className="stepper">
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

      <div className="note" style={{ marginTop: 18, maxWidth: 640 }}>
        <ShieldIcon />
        <div>
          <strong>Authority is snapshotted before live checks.</strong>
          <p>Permission changes apply to the next request. They do not rewrite an action already frozen for authorization.</p>
        </div>
      </div>
    </main>
  );
}
