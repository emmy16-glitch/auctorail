import { getAddress } from "ethers";

import {
  type ActionContract,
  type PaymentPolicyId,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC
} from "../core/action-contract.js";
import {
  evaluateMandate,
  type MandateContract,
  type MandateViolationCode
} from "../core/mandate-contract.js";
import type { TelegraphEvidenceRecord } from "../evidence/telegraph.js";

export type AuctorailDecision = "ALLOW" | "HOLD" | "BLOCK";
export type CheckStatus = "PASS" | "HOLD" | "BLOCK";

export interface PolicyCheck {
  name: string;
  status: CheckStatus;
  reason: string;
  code?: string;
}

export interface DecisionMandateContext {
  mandateId: string;
  mandateHash: string;
  principalId: string;
  agentId: string;
  version: number;
}

export interface DecisionRecord {
  mandate: DecisionMandateContext;
  agentId: string;
  actionId: string;
  decision: AuctorailDecision;
  reason: string;
  policyId: PaymentPolicyId;
  policyVersion: number;
  checks: PolicyCheck[];
  evidenceRefs?: {
    vendorRuntimeAttestationHash?: string;
  };
  decidedAt: string;
}

export interface PaymentsStrictEvaluationOptions {
  agentId: string;
  now?: Date;
}

export const PAYMENTS_STRICT_V1 = {
  id: "payments.strict.v1" as const,
  version: 1,
  allowedChainId: BASE_SEPOLIA_CHAIN_ID,
  allowedToken: BASE_SEPOLIA_USDC,
  maxAutonomousAmountRaw: 10_000_000n,
  minimumEvidenceConfidence: 0.80,
  maxEvidenceAgeSeconds: 300,
  requireTelegraphEvidence: true,
  requireSignalHash: true,
  failClosed: true
};

function check(
  name: string,
  status: CheckStatus,
  reason: string,
  code?: string
): PolicyCheck {
  return {
    name,
    status,
    reason,
    ...(code ? { code } : {})
  };
}

function addressesEqual(a: string, b: string): boolean {
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

export function classifyMinerLabel(label: string | null): CheckStatus {
  if (!label) {
    return "HOLD";
  }

  const trimmed = label.trim();
  const normalized = trimmed.toUpperCase();

  if (
    ["BLOCK", "DENY", "DENIED", "MALICIOUS", "SUSPICIOUS", "FAILED"].includes(
      normalized
    )
  ) {
    return "BLOCK";
  }

  if (["RECHECK", "UNKNOWN", "UNAVAILABLE", "PENDING"].includes(normalized)) {
    return "HOLD";
  }

  if (["ALLOW", "SAFE", "VALID", "SUCCESS"].includes(normalized)) {
    return "PASS";
  }

  const prose = trimmed.toLowerCase();

  if (
    /\b(suspicious|malicious|blacklisted|unsafe|scam)\b/.test(prose) ||
    /\bhigh[\s_-]+risk\b/.test(prose)
  ) {
    return "BLOCK";
  }

  // Positive free-form prose cannot create authority. Exact positive labels
  // above are still accepted; arbitrary prose remains HOLD.
  return "HOLD";
}

export function evaluatePaymentsStrictV1(
  mandate: MandateContract,
  action: ActionContract,
  evidence: TelegraphEvidenceRecord | null,
  options: PaymentsStrictEvaluationOptions
): DecisionRecord {
  const checks: PolicyCheck[] = [];
  const now = options.now ?? new Date();

  const mandateEvaluation = evaluateMandate(
    mandate,
    action,
    options.agentId,
    now
  );

  checks.push(
    ...mandateEvaluation.checks.map((item) =>
      check(item.name, item.status, item.reason, item.code)
    )
  );

  if (action.payload.chainId === PAYMENTS_STRICT_V1.allowedChainId) {
    checks.push(check("allowed_chain", "PASS", "Action uses Base Sepolia."));
  } else {
    checks.push(
      check("allowed_chain", "BLOCK", "Action uses a prohibited chain.")
    );
  }

  if (addressesEqual(action.payload.token, PAYMENTS_STRICT_V1.allowedToken)) {
    checks.push(
      check("allowed_asset", "PASS", "Action uses approved Base Sepolia USDC.")
    );
  } else {
    checks.push(
      check("allowed_asset", "BLOCK", "Action uses an unauthorized asset.")
    );
  }

  const amount = BigInt(action.payload.amountRaw);

  if (amount <= PAYMENTS_STRICT_V1.maxAutonomousAmountRaw) {
    checks.push(
      check(
        "autonomous_amount_limit",
        "PASS",
        "Amount is within autonomous spending policy."
      )
    );
  } else {
    checks.push(
      check(
        "autonomous_amount_limit",
        "BLOCK",
        "Amount exceeds autonomous spending limit."
      )
    );
  }

  if (!evidence) {
    checks.push(
      check(
        "telegraph_evidence",
        "HOLD",
        "Required Telegraph evidence is missing."
      )
    );

    return finalize(mandate, options.agentId, action, checks, now);
  }

  checks.push(
    check("telegraph_evidence", "PASS", "Real Telegraph evidence is present.")
  );

  if (evidence.intent === "FRAUD_DETECTION") {
    checks.push(
      check(
        "required_intent",
        "PASS",
        "Required FRAUD_DETECTION evidence is present."
      )
    );
  } else {
    checks.push(
      check(
        "required_intent",
        "HOLD",
        "Evidence does not satisfy the required intent."
      )
    );
  }

  if (addressesEqual(evidence.subject, action.payload.destination)) {
    checks.push(
      check(
        "evidence_subject_binding",
        "PASS",
        "Evidence subject matches the exact payment destination."
      )
    );
  } else {
    checks.push(
      check(
        "evidence_subject_binding",
        "BLOCK",
        "Evidence was produced for a different destination."
      )
    );
  }

  if (evidence.chainId === action.payload.chainId) {
    checks.push(
      check(
        "evidence_chain_binding",
        "PASS",
        "Evidence chain matches the Action Contract."
      )
    );
  } else {
    checks.push(
      check(
        "evidence_chain_binding",
        "BLOCK",
        "Evidence belongs to a different chain."
      )
    );
  }

  if (evidence.applicability === "APPLICABLE") {
    checks.push(
      check(
        "evidence_applicability",
        "PASS",
        "Miner assessment is applicable to this target."
      )
    );
  } else {
    checks.push(
      check(
        "evidence_applicability",
        "HOLD",
        "Miner completed the request, but Auctorail could not establish that the returned risk assessment is sufficiently applicable to this exact target."
      )
    );
  }

  if (
    evidence.confidence !== null &&
    evidence.confidence >= PAYMENTS_STRICT_V1.minimumEvidenceConfidence
  ) {
    checks.push(
      check(
        "minimum_confidence",
        "PASS",
        `Evidence confidence ${evidence.confidence} satisfies policy minimum ${PAYMENTS_STRICT_V1.minimumEvidenceConfidence}.`
      )
    );
  } else {
    checks.push(
      check(
        "minimum_confidence",
        "HOLD",
        `Evidence confidence ${evidence.confidence ?? "missing"} does not satisfy policy minimum ${PAYMENTS_STRICT_V1.minimumEvidenceConfidence}.`
      )
    );
  }

  const minerStatus = classifyMinerLabel(evidence.label);
  checks.push(
    check(
      "miner_result",
      minerStatus,
      `Telegraph Miner returned ${evidence.label ?? "no verdict"}.`
    )
  );

  if (evidence.signalHash) {
    checks.push(
      check("telegraph_signal_hash", "PASS", "Telegraph signal hash is present.")
    );
  } else {
    checks.push(
      check("telegraph_signal_hash", "HOLD", "Telegraph signal hash is missing.")
    );
  }

  const receivedAt = new Date(evidence.receivedAt).getTime();
  const ageMs = now.getTime() - receivedAt;
  const maximumAgeMs = PAYMENTS_STRICT_V1.maxEvidenceAgeSeconds * 1000;

  if (ageMs >= 0 && ageMs <= maximumAgeMs) {
    checks.push(check("evidence_freshness", "PASS", "Evidence is fresh."));
  } else {
    checks.push(
      check(
        "evidence_freshness",
        "HOLD",
        "Evidence is stale or has an invalid timestamp."
      )
    );
  }

  return finalize(mandate, options.agentId, action, checks, now);
}

function finalize(
  mandate: MandateContract,
  agentId: string,
  action: ActionContract,
  checks: PolicyCheck[],
  now: Date
): DecisionRecord {
  const context: Pick<DecisionRecord, "mandate" | "agentId" | "actionId" | "policyId" | "policyVersion" | "checks" | "decidedAt"> = {
    mandate: {
      mandateId: mandate.mandateId,
      mandateHash: mandate.mandateHash,
      principalId: mandate.principalId,
      agentId: mandate.agentId,
      version: mandate.version
    },
    agentId: agentId.trim(),
    actionId: action.id,
    policyId: "payments.strict.v1",
    policyVersion: PAYMENTS_STRICT_V1.version,
    checks,
    decidedAt: now.toISOString()
  };

  const blocked = checks.find((item) => item.status === "BLOCK");

  if (blocked) {
    return {
      ...context,
      policyVersion: PAYMENTS_STRICT_V1.version,
      decision: "BLOCK",
      reason: blocked.code ?? blocked.name
    };
  }

  const held = checks.find((item) => item.status === "HOLD");

  if (held) {
    return {
      ...context,
      policyVersion: PAYMENTS_STRICT_V1.version,
      decision: "HOLD",
      reason: held.code ?? held.name
    };
  }

  return {
    ...context,
    policyVersion: PAYMENTS_STRICT_V1.version,
    decision: "ALLOW",
    reason: "all_required_checks_passed"
  };
}

export type { MandateViolationCode };
