import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  canonicalize,
  hashCanonicalPayload,
  type ActionContract
} from "../core/action-contract.js";
import {
  evaluateMandate,
  type MandateContract
} from "../core/mandate-contract.js";
import {
  verifyEvidenceBundle,
  hashAdaptiveEvidencePlan,
  type EvidenceBundle
} from "../telegraph/evidence-bundle.js";
import {
  type AdaptiveEvidencePlan,
  type AdaptiveEvidenceRequirement
} from "../telegraph/adaptive-evidence-plan.js";
import {
  classifyMinerLabel,
  type CheckStatus,
  type DecisionRecord,
  type PolicyCheck
} from "./payments-strict-v1.js";

export const PAYMENTS_ADAPTIVE_V1 = {
  id: "payments.adaptive.v1" as const,
  version: 1,
  allowedChainId: BASE_SEPOLIA_CHAIN_ID,
  allowedToken: BASE_SEPOLIA_USDC,
  maxAutonomousAmountRaw: 10_000_000n,
  maxEvidenceAgeSeconds: 300,
  conflictRule: "EXPLICIT_NEGATIVE_BLOCKS" as const,
  missingEvidenceRule: "HOLD" as const,
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

function addressesEqual(
  a: string,
  b: string
): boolean {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(a) &&
    /^0x[0-9a-fA-F]{40}$/.test(b) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

function fresh(
  timestamp: string,
  now: Date
): boolean {
  const at = new Date(timestamp).getTime();
  const age = now.getTime() - at;

  return (
    Number.isFinite(at) &&
    age >= 0 &&
    age <=
      PAYMENTS_ADAPTIVE_V1.maxEvidenceAgeSeconds *
        1000
  );
}

function explicitNegative(
  label: string | null
): boolean {
  if (!label) return false;

  const normalized =
    label.trim().toUpperCase();

  return [
    "BLOCK",
    "DENY",
    "DENIED",
    "REJECT",
    "REJECTED",
    "MALICIOUS",
    "FRAUD",
    "FRAUDULENT",
    "RISKY",
    "HIGH_RISK",
    "FAIL",
    "FAILED"
  ].includes(normalized);
}

function planMatchesAction(
  plan: AdaptiveEvidencePlan,
  action: ActionContract
): boolean {
  return (
    plan.actionId === action.id &&
    plan.actionHash === action.actionHash &&
    addressesEqual(
      plan.subject,
      action.payload.destination
    ) &&
    plan.chainId === action.payload.chainId &&
    plan.amountRaw === action.payload.amountRaw
  );
}

function bundleMatchesPlan(
  bundle: EvidenceBundle,
  plan: AdaptiveEvidencePlan,
  action: ActionContract
): boolean {
  return (
    verifyEvidenceBundle(bundle) &&
    bundle.actionId === action.id &&
    bundle.actionHash === action.actionHash &&
    bundle.planHash ===
      hashAdaptiveEvidencePlan(plan) &&
    bundle.riskTier === plan.riskTier &&
    bundle.amountRaw === action.payload.amountRaw &&
    addressesEqual(
      bundle.subject,
      action.payload.destination
    ) &&
    bundle.chainId === action.payload.chainId
  );
}

function requirementChecks(
  mandate: MandateContract,
  requirement: AdaptiveEvidenceRequirement,
  bundle: EvidenceBundle,
  now: Date
): PolicyCheck[] {
  const item = bundle.items.find(
    (candidate) =>
      candidate.intent === requirement.intent
  );

  const prefix =
    requirement.intent.toLowerCase();

  const checks: PolicyCheck[] = [];

  checks.push(
    check(
      `${prefix}_mandate_intent`,
      mandate.requiredIntents.includes(
        requirement.intent
      )
        ? "PASS"
        : "BLOCK",
      mandate.requiredIntents.includes(
        requirement.intent
      )
        ? `Mandate authorizes required Intent ${requirement.intent}.`
        : `Mandate does not authorize required Intent ${requirement.intent}.`,
      mandate.requiredIntents.includes(
        requirement.intent
      )
        ? undefined
        : "adaptive_intent_not_delegated"
    )
  );

  if (!item) {
    checks.push(
      check(
        `${prefix}_evidence`,
        "HOLD",
        `Required ${requirement.intent} evidence is missing.`,
        "adaptive_required_evidence_missing"
      )
    );
    return checks;
  }

  checks.push(
    check(
      `${prefix}_evidence`,
      "PASS",
      `Required ${requirement.intent} evidence is present from routed Miner ${item.miner.slug}.`
    )
  );

  checks.push(
    check(
      `${prefix}_subject`,
      addressesEqual(
        item.subject,
        bundle.subject
      )
        ? "PASS"
        : "BLOCK",
      addressesEqual(
        item.subject,
        bundle.subject
      )
        ? "Evidence is bound to the exact action subject."
        : "Evidence subject does not match the exact action subject.",
      addressesEqual(
        item.subject,
        bundle.subject
      )
        ? undefined
        : "adaptive_evidence_subject_mismatch"
    ),
    check(
      `${prefix}_chain`,
      item.chainId === bundle.chainId
        ? "PASS"
        : "BLOCK",
      item.chainId === bundle.chainId
        ? "Evidence is bound to the exact action chain."
        : "Evidence chain does not match the exact action chain.",
      item.chainId === bundle.chainId
        ? undefined
        : "adaptive_evidence_chain_mismatch"
    )
  );

  checks.push(
    check(
      `${prefix}_signal_hash`,
      requirement.requireSignalHash &&
      !item.signalHash
        ? "HOLD"
        : "PASS",
      item.signalHash
        ? "Telegraph signal hash is present."
        : "Required Telegraph signal hash is missing.",
      item.signalHash
        ? undefined
        : "adaptive_signal_hash_missing"
    )
  );

  checks.push(
    check(
      `${prefix}_applicability`,
      requirement.requireApplicable &&
      item.applicability !== "APPLICABLE"
        ? "HOLD"
        : "PASS",
      item.applicability === "APPLICABLE"
        ? "Evidence is applicable to the exact target."
        : `Evidence applicability is ${item.applicability}.`,
      item.applicability === "APPLICABLE"
        ? undefined
        : "adaptive_evidence_not_applicable"
    )
  );

  if (
    requirement.minimumConfidence !==
    undefined
  ) {
    const confidencePass =
      item.confidence !== null &&
      item.confidence >=
        requirement.minimumConfidence;

    checks.push(
      check(
        `${prefix}_confidence`,
        confidencePass
          ? "PASS"
          : "HOLD",
        confidencePass
          ? `Confidence ${item.confidence} meets required floor ${requirement.minimumConfidence}.`
          : `Confidence ${item.confidence ?? "missing"} is below required floor ${requirement.minimumConfidence}.`,
        confidencePass
          ? undefined
          : "adaptive_confidence_below_floor"
      )
    );
  }

  checks.push(
    check(
      `${prefix}_freshness`,
      fresh(item.receivedAt, now)
        ? "PASS"
        : "HOLD",
      fresh(item.receivedAt, now)
        ? "Evidence is fresh."
        : "Evidence is stale or has an invalid timestamp.",
      fresh(item.receivedAt, now)
        ? undefined
        : "adaptive_evidence_stale"
    )
  );

  if (explicitNegative(item.label)) {
    checks.push(
      check(
        `${prefix}_conflict`,
        "BLOCK",
        `Routed evidence returned explicit negative label ${item.label}; negative evidence cannot be averaged away.`,
        "adaptive_explicit_negative"
      )
    );
  } else if (
    requirement.intent ===
    "FRAUD_DETECTION"
  ) {
    const status =
      classifyMinerLabel(item.label);

    checks.push(
      check(
        `${prefix}_verdict`,
        status,
        status === "PASS"
          ? `Fraud-detection verdict ${item.label} is acceptable.`
          : `Fraud-detection verdict ${item.label ?? "missing"} does not establish a positive result.`,
        status === "PASS"
          ? undefined
          : "adaptive_fraud_verdict_not_positive"
      )
    );
  } else {
    checks.push(
      check(
        `${prefix}_conflict`,
        "PASS",
        item.label
          ? `No explicit negative conflict was found in label ${item.label}.`
          : "Informational evidence has no explicit negative label."
      )
    );
  }

  return checks;
}

export function evaluatePaymentsAdaptiveV1(
  mandate: MandateContract,
  action: ActionContract,
  plan: AdaptiveEvidencePlan,
  bundle: EvidenceBundle | null,
  options: {
    agentId: string;
    now?: Date;
  }
): DecisionRecord {
  const now =
    options.now ?? new Date();

  const checks: PolicyCheck[] = [];

  const mandateEvaluation =
    evaluateMandate(
      mandate,
      action,
      options.agentId,
      now
    );

  checks.push(
    ...mandateEvaluation.checks.map(
      (item) => ({
        name: item.name,
        status: item.status,
        reason: item.reason,
        ...(item.code
          ? { code: item.code }
          : {})
      })
    )
  );

  checks.push(
    check(
      "adaptive_policy_id",
      action.policyId ===
        PAYMENTS_ADAPTIVE_V1.id &&
      action.policyVersion ===
        PAYMENTS_ADAPTIVE_V1.version
        ? "PASS"
        : "BLOCK",
      action.policyId ===
        PAYMENTS_ADAPTIVE_V1.id
        ? "Action uses payments.adaptive.v1."
        : "Action does not use payments.adaptive.v1.",
      action.policyId ===
        PAYMENTS_ADAPTIVE_V1.id
        ? undefined
        : "adaptive_policy_mismatch"
    ),
    check(
      "adaptive_allowed_chain",
      action.payload.chainId ===
        PAYMENTS_ADAPTIVE_V1.allowedChainId
        ? "PASS"
        : "BLOCK",
      action.payload.chainId ===
        PAYMENTS_ADAPTIVE_V1.allowedChainId
        ? "Action uses Base Sepolia."
        : "Action uses a prohibited chain."
    ),
    check(
      "adaptive_allowed_asset",
      addressesEqual(
        action.payload.token,
        PAYMENTS_ADAPTIVE_V1.allowedToken
      )
        ? "PASS"
        : "BLOCK",
      addressesEqual(
        action.payload.token,
        PAYMENTS_ADAPTIVE_V1.allowedToken
      )
        ? "Action uses approved Base Sepolia USDC."
        : "Action uses an unauthorized asset."
    )
  );

  let amount = 0n;
  try {
    amount = BigInt(action.payload.amountRaw);
  } catch {
    amount = 0n;
  }

  checks.push(
    check(
      "adaptive_autonomous_amount_limit",
      amount > 0n &&
      amount <=
        PAYMENTS_ADAPTIVE_V1
          .maxAutonomousAmountRaw
        ? "PASS"
        : "BLOCK",
      amount > 0n &&
      amount <=
        PAYMENTS_ADAPTIVE_V1
          .maxAutonomousAmountRaw
        ? "Amount is within the adaptive autonomous payment ceiling."
        : "Amount is invalid or exceeds the adaptive autonomous payment ceiling."
    )
  );

  const planValid =
    planMatchesAction(plan, action) &&
    plan.schemaVersion ===
      "proofgate.adaptive-evidence-plan.v1" &&
    plan.routeMode ===
      "TELEGRAPH_INTENT_ROUTE";

  checks.push(
    check(
      "adaptive_evidence_plan",
      planValid ? "PASS" : "BLOCK",
      planValid
        ? `Adaptive evidence plan is bound to the exact action at risk tier ${plan.riskTier}.`
        : "Adaptive evidence plan is not cryptographically/semantically bound to the exact action.",
      planValid
        ? undefined
        : "adaptive_plan_action_mismatch"
    )
  );

  if (!bundle) {
    checks.push(
      check(
        "adaptive_evidence_bundle",
        "HOLD",
        "Required multi-Intent evidence bundle is missing.",
        "adaptive_bundle_missing"
      )
    );
  } else {
    const bundleValid =
      bundleMatchesPlan(
        bundle,
        plan,
        action
      );

    checks.push(
      check(
        "adaptive_evidence_bundle",
        bundleValid
          ? "PASS"
          : "BLOCK",
        bundleValid
          ? `Evidence bundle ${bundle.bundleHash} is intact and bound to the exact action/plan.`
          : "Evidence bundle integrity or action/plan binding failed.",
        bundleValid
          ? undefined
          : "adaptive_bundle_integrity_failed"
      )
    );

    let totalSpend = 0n;
    let budget = 0n;

    try {
      totalSpend =
        BigInt(bundle.totalEvidenceSpendRaw);
      budget =
        BigInt(plan.maxEvidenceSpendRaw);
    } catch {
      totalSpend = 1n;
      budget = 0n;
    }

    checks.push(
      check(
        "adaptive_evidence_budget",
        totalSpend <= budget
          ? "PASS"
          : "BLOCK",
        totalSpend <= budget
          ? `Evidence spend ${totalSpend} is within budget ${budget} raw USDC units.`
          : `Evidence spend ${totalSpend} exceeds budget ${budget} raw USDC units.`,
        totalSpend <= budget
          ? undefined
          : "adaptive_evidence_budget_exceeded"
      )
    );

    const expectedIntents =
      plan.requirements.map(
        (item) => item.intent
      );
    const actualIntents =
      bundle.items.map(
        (item) => item.intent
      );

    const extras =
      actualIntents.filter(
        (intent) =>
          !expectedIntents.includes(intent)
      );

    checks.push(
      check(
        "adaptive_no_unrequested_evidence",
        extras.length === 0
          ? "PASS"
          : "BLOCK",
        extras.length === 0
          ? "Evidence bundle contains only Intents required by the plan."
          : `Evidence bundle contains unrequested Intents: ${extras.join(", ")}.`,
        extras.length === 0
          ? undefined
          : "adaptive_unrequested_evidence"
      )
    );

    for (
      const requirement of
      plan.requirements
    ) {
      checks.push(
        ...requirementChecks(
          mandate,
          requirement,
          bundle,
          now
        )
      );
    }
  }

  const context:
    Omit<
      DecisionRecord,
      "decision" | "reason"
    > = {
      mandate: {
        mandateId:
          mandate.mandateId,
        mandateHash:
          mandate.mandateHash,
        principalId:
          mandate.principalId,
        agentId:
          mandate.agentId,
        version:
          mandate.version
      },
      agentId:
        options.agentId.trim(),
      actionId:
        action.id,
      policyId:
        PAYMENTS_ADAPTIVE_V1.id,
      policyVersion:
        PAYMENTS_ADAPTIVE_V1.version,
      checks,
      decidedAt:
        now.toISOString()
    };

  const blocked =
    checks.find(
      (item) => item.status === "BLOCK"
    );

  if (blocked) {
    return {
      ...context,
      decision: "BLOCK",
      reason:
        blocked.code ?? blocked.name
    };
  }

  const held =
    checks.find(
      (item) => item.status === "HOLD"
    );

  if (held) {
    return {
      ...context,
      decision: "HOLD",
      reason:
        held.code ?? held.name
    };
  }

  const policyCommitment =
    hashCanonicalPayload(
      canonicalize({
        policy:
          PAYMENTS_ADAPTIVE_V1.id,
        version:
          PAYMENTS_ADAPTIVE_V1.version,
        actionHash:
          action.actionHash,
        planHash:
          hashAdaptiveEvidencePlan(plan),
        bundleHash:
          bundle?.bundleHash ?? null
      })
    );

  return {
    ...context,
    decision: "ALLOW",
    reason:
      `adaptive_evidence_checks_passed:${policyCommitment}`
  };
}
