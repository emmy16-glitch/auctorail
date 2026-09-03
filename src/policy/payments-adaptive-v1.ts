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
  createAdaptiveEvidencePlan,
  type AdaptiveEvidencePlan,
  type AdaptiveEvidenceRequirement
} from "../telegraph/adaptive-evidence-plan.js";
import {
  verifyEvidenceBundle,
  hashAdaptiveEvidencePlan,
  type EvidenceBundle
} from "../telegraph/evidence-bundle.js";
import {
  isExplicitNegativeEvidenceLabel
} from "../telegraph/evidence-quorum.js";
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
  providerDiversityRule: "DISTINCT_MINER_IDS" as const,
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
  return (
    /^0x[0-9a-fA-F]{40}$/.test(a) &&
    /^0x[0-9a-fA-F]{40}$/.test(b) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

function fresh(timestamp: string, now: Date): boolean {
  const at = new Date(timestamp).getTime();
  const age = now.getTime() - at;

  return (
    Number.isFinite(at) &&
    age >= 0 &&
    age <= PAYMENTS_ADAPTIVE_V1.maxEvidenceAgeSeconds * 1000
  );
}

function planMatchesAction(
  plan: AdaptiveEvidencePlan,
  action: ActionContract
): boolean {
  if (
    plan.actionId !== action.id ||
    plan.actionHash !== action.actionHash ||
    !addressesEqual(plan.subject, action.payload.destination) ||
    plan.chainId !== action.payload.chainId ||
    plan.amountRaw !== action.payload.amountRaw
  ) {
    return false;
  }

  const expected = createAdaptiveEvidencePlan(action);
  return canonicalize(plan) === canonicalize(expected);
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
    bundle.planHash === hashAdaptiveEvidencePlan(plan) &&
    bundle.riskTier === plan.riskTier &&
    bundle.amountRaw === action.payload.amountRaw &&
    addressesEqual(bundle.subject, action.payload.destination) &&
    bundle.chainId === action.payload.chainId
  );
}

function requirementChecks(
  mandate: MandateContract,
  requirement: AdaptiveEvidenceRequirement,
  bundle: EvidenceBundle,
  now: Date
): PolicyCheck[] {
  const items = bundle.items.filter(
    (candidate) => candidate.intent === requirement.intent
  );
  const summary = bundle.quorums.find(
    (candidate) => candidate.intent === requirement.intent
  );
  const prefix = requirement.intent.toLowerCase();
  const checks: PolicyCheck[] = [];
  const delegated = mandate.requiredIntents.includes(requirement.intent);

  checks.push(
    check(
      `${prefix}_mandate_intent`,
      delegated ? "PASS" : "BLOCK",
      delegated
        ? `Mandate authorizes required Intent ${requirement.intent}.`
        : `Mandate does not authorize required Intent ${requirement.intent}.`,
      delegated ? undefined : "adaptive_intent_not_delegated"
    )
  );

  if (!summary) {
    checks.push(
      check(
        `${prefix}_quorum`,
        "HOLD",
        `Required ${requirement.intent} quorum summary is missing.`,
        "adaptive_quorum_missing"
      )
    );
    return checks;
  }

  const ruleMatch =
    canonicalize(summary.rule) ===
    canonicalize(requirement.quorum);

  checks.push(
    check(
      `${prefix}_quorum_rule`,
      ruleMatch ? "PASS" : "BLOCK",
      ruleMatch
        ? "Evidence quorum rule exactly matches the consequence-derived plan."
        : "Evidence quorum rule was changed from the consequence-derived plan.",
      ruleMatch ? undefined : "adaptive_quorum_rule_mismatch"
    )
  );

  if (items.length === 0) {
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
      `${items.length} routed ${requirement.intent} attempt(s) are committed in the Evidence Bundle.`
    )
  );

  const distinctPass =
    summary.distinctMinerIds.length >=
    requirement.quorum.minimumDistinctMiners;
  checks.push(
    check(
      `${prefix}_distinct_miners`,
      distinctPass ? "PASS" : "HOLD",
      distinctPass
        ? `${summary.distinctMinerIds.length} distinct Miner identities satisfy the required provider diversity of ${requirement.quorum.minimumDistinctMiners}.`
        : `Only ${summary.distinctMinerIds.length} distinct Miner identities were obtained; ${requirement.quorum.minimumDistinctMiners} are required. Duplicate routes never count as independent providers.`,
      distinctPass ? undefined : "adaptive_quorum_insufficient_diversity"
    )
  );

  const positivePass =
    summary.positiveMinerIds.length >=
    requirement.quorum.minimumPositiveResults;
  checks.push(
    check(
      `${prefix}_positive_quorum`,
      positivePass ? "PASS" : "HOLD",
      positivePass
        ? `${summary.positiveMinerIds.length} confidence-qualified positive Miner result(s) satisfy the required quorum of ${requirement.quorum.minimumPositiveResults}.`
        : `${summary.positiveMinerIds.length} confidence-qualified positive Miner result(s) are insufficient; ${requirement.quorum.minimumPositiveResults} are required.`,
      positivePass ? undefined : "adaptive_quorum_insufficient_positives"
    )
  );

  const attemptPass =
    summary.observedAttempts <= requirement.quorum.maxAttempts;
  checks.push(
    check(
      `${prefix}_attempt_limit`,
      attemptPass ? "PASS" : "BLOCK",
      attemptPass
        ? `${summary.observedAttempts} attempt(s) stay within the bounded routing limit ${requirement.quorum.maxAttempts}.`
        : `Evidence attempts exceed the bounded routing limit ${requirement.quorum.maxAttempts}.`,
      attemptPass ? undefined : "adaptive_quorum_attempt_limit_exceeded"
    )
  );

  if (summary.vetoMinerIds.length > 0) {
    checks.push(
      check(
        `${prefix}_negative_veto`,
        "BLOCK",
        `High-confidence negative evidence from Miner(s) ${summary.vetoMinerIds.join(", ")} vetoes authorization.`,
        "adaptive_quorum_negative_veto"
      )
    );
  } else {
    checks.push(
      check(
        `${prefix}_negative_veto`,
        "PASS",
        "No high-confidence negative quorum veto is present."
      )
    );
  }

  const subjectPass = items.every(
    (item) => addressesEqual(item.subject, bundle.subject)
  );
  const chainPass = items.every(
    (item) => item.chainId === bundle.chainId
  );

  checks.push(
    check(
      `${prefix}_subject`,
      subjectPass ? "PASS" : "BLOCK",
      subjectPass
        ? "Every routed evidence item is bound to the exact action subject."
        : "At least one routed evidence item targets a different subject.",
      subjectPass ? undefined : "adaptive_evidence_subject_mismatch"
    ),
    check(
      `${prefix}_chain`,
      chainPass ? "PASS" : "BLOCK",
      chainPass
        ? "Every routed evidence item is bound to the exact action chain."
        : "At least one routed evidence item targets a different chain.",
      chainPass ? undefined : "adaptive_evidence_chain_mismatch"
    )
  );

  const signalPass =
    !requirement.requireSignalHash ||
    items.every((item) => Boolean(item.signalHash));
  checks.push(
    check(
      `${prefix}_signal_hash`,
      signalPass ? "PASS" : "HOLD",
      signalPass
        ? "Every required routed result includes a Telegraph signal hash."
        : "At least one required routed result is missing its Telegraph signal hash.",
      signalPass ? undefined : "adaptive_signal_hash_missing"
    )
  );

  const applicable =
    !requirement.requireApplicable ||
    items.every((item) => item.applicability === "APPLICABLE");
  checks.push(
    check(
      `${prefix}_applicability`,
      applicable ? "PASS" : "HOLD",
      applicable
        ? "Every required routed result is applicable to the exact target."
        : "At least one required routed result is not applicable to the exact target.",
      applicable ? undefined : "adaptive_evidence_not_applicable"
    )
  );

  const freshPass = items.every(
    (item) => fresh(item.receivedAt, now)
  );
  checks.push(
    check(
      `${prefix}_freshness`,
      freshPass ? "PASS" : "HOLD",
      freshPass
        ? "All routed evidence used by the quorum is fresh."
        : "At least one routed evidence item is stale or has an invalid timestamp.",
      freshPass ? undefined : "adaptive_evidence_stale"
    )
  );

  const explicitNegatives = items.filter(
    (item) => isExplicitNegativeEvidenceLabel(item.label)
  );

  if (explicitNegatives.length > 0) {
    checks.push(
      check(
        `${prefix}_conflict`,
        "BLOCK",
        `Explicit negative evidence from Miner(s) ${[
          ...new Set(explicitNegatives.map((item) => item.miner.id))
        ].join(", ")} cannot be averaged away by a majority.`,
        "adaptive_explicit_negative"
      )
    );
  } else if (requirement.intent === "FRAUD_DETECTION") {
    checks.push(
      check(
        `${prefix}_verdict`,
        summary.status === "SATISFIED" ? "PASS" : "HOLD",
        summary.status === "SATISFIED"
          ? "Fraud-detection provider diversity and confidence-qualified positive quorum are satisfied."
          : `Fraud-detection quorum status is ${summary.status}.`,
        summary.status === "SATISFIED"
          ? undefined
          : "adaptive_fraud_quorum_not_satisfied"
      )
    );
  } else {
    const labeled = items.filter(
      (item) => item.label !== null
    );
    const uncertain = labeled.filter(
      (item) => classifyMinerLabel(item.label) !== "PASS"
    );

    checks.push(
      check(
        `${prefix}_conflict`,
        uncertain.length === 0 ? "PASS" : "HOLD",
        uncertain.length === 0
          ? "Secondary evidence contains no negative or uncertain status labels."
          : `Secondary evidence from Miner(s) ${uncertain.map((item) => item.miner.id).join(", ")} is uncertain and cannot establish authority.`,
        uncertain.length === 0
          ? undefined
          : "adaptive_secondary_result_uncertain"
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
  options: { agentId: string; now?: Date }
): DecisionRecord {
  const now = options.now ?? new Date();
  const checks: PolicyCheck[] = [];
  const mandateEvaluation = evaluateMandate(
    mandate,
    action,
    options.agentId,
    now
  );

  checks.push(
    ...mandateEvaluation.checks.map((item) => ({
      name: item.name,
      status: item.status,
      reason: item.reason,
      ...(item.code ? { code: item.code } : {})
    }))
  );

  const adaptivePolicy =
    action.policyId === PAYMENTS_ADAPTIVE_V1.id &&
    action.policyVersion === PAYMENTS_ADAPTIVE_V1.version;
  const allowedChain =
    action.payload.chainId === PAYMENTS_ADAPTIVE_V1.allowedChainId;
  const allowedAsset =
    addressesEqual(action.payload.token, PAYMENTS_ADAPTIVE_V1.allowedToken);

  checks.push(
    check(
      "adaptive_policy_id",
      adaptivePolicy ? "PASS" : "BLOCK",
      adaptivePolicy
        ? "Action uses payments.adaptive.v1."
        : "Action does not use the locked adaptive policy/version.",
      adaptivePolicy ? undefined : "adaptive_policy_mismatch"
    ),
    check(
      "adaptive_allowed_chain",
      allowedChain ? "PASS" : "BLOCK",
      allowedChain ? "Action uses Base Sepolia." : "Action uses a prohibited chain."
    ),
    check(
      "adaptive_allowed_asset",
      allowedAsset ? "PASS" : "BLOCK",
      allowedAsset
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

  const amountPass =
    amount > 0n && amount <= PAYMENTS_ADAPTIVE_V1.maxAutonomousAmountRaw;
  checks.push(
    check(
      "adaptive_autonomous_amount_limit",
      amountPass ? "PASS" : "BLOCK",
      amountPass
        ? "Amount is within the adaptive autonomous payment ceiling."
        : "Amount is invalid or exceeds the adaptive autonomous payment ceiling."
    )
  );

  const planValid =
    plan.schemaVersion === "proofgate.adaptive-evidence-plan.v1" &&
    plan.routeMode === "TELEGRAPH_INTENT_ROUTE" &&
    plan.providerDiversityRule === "DISTINCT_MINER_IDS" &&
    planMatchesAction(plan, action);

  checks.push(
    check(
      "adaptive_evidence_plan",
      planValid ? "PASS" : "BLOCK",
      planValid
        ? `Risk tier ${plan.riskTier}, required Intents, Miner quorum, confidence floors and evidence budget were deterministically derived from the exact action.`
        : "Adaptive evidence plan differs from the deterministic plan required for this exact action.",
      planValid ? undefined : "adaptive_plan_downgrade_or_mismatch"
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
    const bundleValid = bundleMatchesPlan(bundle, plan, action);
    checks.push(
      check(
        "adaptive_evidence_bundle",
        bundleValid ? "PASS" : "BLOCK",
        bundleValid
          ? `Evidence bundle ${bundle.bundleHash} is intact and bound to the exact action/plan/quorum.`
          : "Evidence bundle integrity or action/plan binding failed.",
        bundleValid ? undefined : "adaptive_bundle_integrity_failed"
      )
    );

    let totalSpend = 0n;
    let budget = 0n;
    try {
      totalSpend = BigInt(bundle.totalEvidenceSpendRaw);
      budget = BigInt(plan.maxEvidenceSpendRaw);
    } catch {
      totalSpend = 1n;
      budget = 0n;
    }

    const budgetPass = totalSpend <= budget;
    checks.push(
      check(
        "adaptive_evidence_budget",
        budgetPass ? "PASS" : "BLOCK",
        budgetPass
          ? `Evidence spend ${totalSpend} is within budget ${budget} raw USDC units.`
          : `Evidence spend ${totalSpend} exceeds budget ${budget} raw USDC units.`,
        budgetPass ? undefined : "adaptive_evidence_budget_exceeded"
      )
    );

    const expectedIntents = plan.requirements.map((item) => item.intent);
    const actualIntents = bundle.items.map((item) => item.intent);
    const extras = actualIntents.filter(
      (intent) => !expectedIntents.includes(intent)
    );

    checks.push(
      check(
        "adaptive_no_unrequested_evidence",
        extras.length === 0 ? "PASS" : "BLOCK",
        extras.length === 0
          ? "Evidence bundle contains only Intents required by the deterministic plan."
          : `Evidence bundle contains unrequested Intents: ${extras.join(", ")}.`,
        extras.length === 0 ? undefined : "adaptive_unrequested_evidence"
      )
    );

    const quorumShapePass =
      bundle.quorums.length === plan.requirements.length &&
      plan.requirements.every(
        (requirement) =>
          bundle.quorums.some(
            (summary) => summary.intent === requirement.intent
          )
      );

    checks.push(
      check(
        "adaptive_quorum_shape",
        quorumShapePass ? "PASS" : "BLOCK",
        quorumShapePass
          ? "Evidence Bundle contains exactly one quorum summary for every required Intent."
          : "Evidence Bundle quorum summaries do not match the required Intent set.",
        quorumShapePass ? undefined : "adaptive_quorum_shape_mismatch"
      )
    );

    for (const requirement of plan.requirements) {
      checks.push(...requirementChecks(mandate, requirement, bundle, now));
    }
  }

  const context: Omit<DecisionRecord, "decision" | "reason"> = {
    mandate: {
      mandateId: mandate.mandateId,
      mandateHash: mandate.mandateHash,
      principalId: mandate.principalId,
      agentId: mandate.agentId,
      version: mandate.version
    },
    agentId: options.agentId.trim(),
    actionId: action.id,
    policyId: PAYMENTS_ADAPTIVE_V1.id,
    policyVersion: PAYMENTS_ADAPTIVE_V1.version,
    checks,
    decidedAt: now.toISOString()
  };

  const blocked = checks.find((item) => item.status === "BLOCK");
  if (blocked) {
    return {
      ...context,
      decision: "BLOCK",
      reason: blocked.code ?? blocked.name
    };
  }

  const held = checks.find((item) => item.status === "HOLD");
  if (held) {
    return {
      ...context,
      decision: "HOLD",
      reason: held.code ?? held.name
    };
  }

  const policyCommitment = hashCanonicalPayload(
    canonicalize({
      policy: PAYMENTS_ADAPTIVE_V1.id,
      version: PAYMENTS_ADAPTIVE_V1.version,
      actionHash: action.actionHash,
      planHash: hashAdaptiveEvidencePlan(plan),
      bundleHash: bundle?.bundleHash ?? null,
      quorums: bundle?.quorums ?? null
    })
  );

  return {
    ...context,
    decision: "ALLOW",
    reason: `adaptive_evidence_checks_passed:${policyCommitment}`
  };
}
