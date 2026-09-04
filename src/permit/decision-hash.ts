import { createHash } from "node:crypto";

import {
  canonicalize,
  type ActionContract
} from "../core/action-contract.js";
import type { MandateContract } from "../core/mandate-contract.js";
import {
  evidenceCommitmentForHash,
  type AuthorizationEvidence
} from "../telegraph/evidence-bundle.js";
import type { DecisionRecord } from "../policy/payments-strict-v1.js";

export function createDecisionHash(
  mandate: MandateContract,
  action: ActionContract,
  evidence: AuthorizationEvidence,
  decision: DecisionRecord
): string {
  const commitment = {
    mandate: {
      mandateId: mandate.mandateId,
      mandateHash: mandate.mandateHash,
      principalId: mandate.principalId,
      agentId: mandate.agentId,
      version: mandate.version
    },
    action: {
      id: action.id,
      actionHash: action.actionHash
    },
    evidence:
      evidenceCommitmentForHash(evidence),
    policy: {
      id: decision.policyId,
      version: decision.policyVersion,
      agentId: decision.agentId,
      mandate: decision.mandate,
      decision: decision.decision,
      reason: decision.reason,
      checks: decision.checks,
      evidenceRefs:
        decision.evidenceRefs ?? null,
      decidedAt: decision.decidedAt
    }
  };

  return (
    "0x" +
    createHash("sha256")
      .update(canonicalize(commitment), "utf8")
      .digest("hex")
  );
}
