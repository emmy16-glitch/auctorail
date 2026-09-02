export type SecurityAuditEventType =
  | "proposal_created"
  | "evidence_received"
  | "evidence_rejected"
  | "decision_created"
  | "permit_issued"
  | "permit_verification_failed"
  | "permit_claimed"
  | "replay_blocked"
  | "execution_created"
  | "submission_started"
  | "broadcast_observed"
  | "execution_ambiguous"
  | "reconciliation_started"
  | "execution_confirmed"
  | "execution_rejected"
  | "receipt_created"
  | "operator_intervention"
  | "key_rotated"
  | "key_revoked"
  | "provider_disagreement";

export interface SecurityAuditEvent {
  type: SecurityAuditEventType;
  occurredAt: string;
  executionId?: string;
  actionHash?: string;
  permitId?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AppendOnlyAuditSink {
  append(event: SecurityAuditEvent): Promise<void>;
}

/** Emits only structured, non-secret correlation data to an injected sink. */
export class SecurityAuditLog {
  constructor(private readonly sink: AppendOnlyAuditSink) {}

  async record(
    type: SecurityAuditEventType,
    correlation: Pick<SecurityAuditEvent, "executionId" | "actionHash" | "permitId"> = {},
    metadata?: SecurityAuditEvent["metadata"]
  ): Promise<void> {
    await this.sink.append({
      type,
      occurredAt: new Date().toISOString(),
      ...correlation,
      ...(metadata ? { metadata } : {})
    });
  }
}
