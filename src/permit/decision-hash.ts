import { createHash } from "node:crypto";

import {
  canonicalize,
  type ActionContract
} from "../core/action-contract.js";
import type { MandateContract } from "../core/mandate-contract.js";
import type { TelegraphEvidenceRecord } from "../evidence/telegraph.js";
import type { DecisionRecord } from "../policy/payments-strict-v1.js";

export function createDecisionHash(
  mandate: MandateContract,
  action: ActionContract,
  evidence: TelegraphEvidenceRecord,
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
    evidence: {
      source: evidence.source,
      intent: evidence.intent,
      miner: {
        id: evidence.miner.id,
        name: evidence.miner.name,
        slug: evidence.miner.slug
      },
      subject: evidence.subject,
      chainId: evidence.chainId,
      label: evidence.label,
      confidence: evidence.confidence,
      applicability: evidence.applicability,
      signalHash: evidence.signalHash,
      rawResponseHash: evidence.rawResponseHash,
      receivedAt: evidence.receivedAt
    },
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
