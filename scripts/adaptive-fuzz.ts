import {
  BASE_SEPOLIA_USDC,
  canonicalize,
  createActionContract,
  hashCanonicalPayload,
  type ActionContract
} from "../src/core/action-contract.js";
import {
  evaluatePaymentsAdaptiveV1
} from "../src/policy/payments-adaptive-v1.js";
import {
  createAdaptiveEvidencePlan,
  type AdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  createEvidenceBundle,
  verifyEvidenceBundle,
  type EvidenceBundle,
  type EvidenceBundleItemInput
} from "../src/telegraph/evidence-bundle.js";
import {
  ADAPTIVE_TEST_AGENT,
  ADAPTIVE_TEST_NOW,
  ADAPTIVE_TEST_VENDOR,
  adaptiveAction,
  adaptiveEvidence,
  adaptiveMandate,
  adaptiveQuorumInputs
} from "../tests/helpers/adaptive-fixtures.js";

const CASES_PER_FAMILY = 100;

function mutateHash(current: string | null): string {
  if (!current || !/^0x[0-9a-fA-F]{64}$/.test(current)) {
    return `0x${"f".repeat(64)}`;
  }
  const body = current.slice(2).toLowerCase();
  const replacement = body[0] === "0" ? "1" : "0";
  return `0x${replacement}${body.slice(1)}`;
}

function evaluate(input: {
  action: ActionContract;
  plan: AdaptiveEvidencePlan;
  bundle: EvidenceBundle;
  mandate?: ReturnType<typeof adaptiveMandate>;
}) {
  return evaluatePaymentsAdaptiveV1(
    input.mandate ?? adaptiveMandate(),
    input.action,
    input.plan,
    input.bundle,
    {
      agentId: ADAPTIVE_TEST_AGENT,
      now: ADAPTIVE_TEST_NOW
    }
  );
}

function rehash(bundle: EvidenceBundle): void {
  const { bundleHash: _oldHash, ...body } = bundle;
  bundle.bundleHash = hashCanonicalPayload(
    canonicalize(body)
  );
}

function mediumBaseline() {
  const action = adaptiveAction("7000000");
  const plan = createAdaptiveEvidencePlan(action);
  const bundle = createEvidenceBundle(
    action,
    plan,
    adaptiveQuorumInputs(action, plan),
    { now: ADAPTIVE_TEST_NOW }
  );
  return { action, plan, bundle };
}

function lowBaseline() {
  const action = adaptiveAction("5000000");
  const plan = createAdaptiveEvidencePlan(action);
  const bundle = createEvidenceBundle(
    action,
    plan,
    adaptiveQuorumInputs(action, plan),
    { now: ADAPTIVE_TEST_NOW }
  );
  return { action, plan, bundle };
}

function bundleFromInputs(
  action: ActionContract,
  plan: AdaptiveEvidencePlan,
  inputs: EvidenceBundleItemInput[]
): EvidenceBundle {
  return createEvidenceBundle(
    action,
    plan,
    inputs,
    { now: ADAPTIVE_TEST_NOW }
  );
}

function contained(
  action: ActionContract,
  plan: AdaptiveEvidencePlan,
  bundle: EvidenceBundle,
  mandate = adaptiveMandate()
): boolean {
  return evaluate({ action, plan, bundle, mandate }).decision !== "ALLOW";
}

interface Family {
  id: string;
  run(index: number): boolean;
}

function planMutation(
  id: string,
  mutate: (plan: AdaptiveEvidencePlan) => void
): Family {
  return {
    id,
    run() {
      const { action, plan } = mediumBaseline();
      const changed = structuredClone(plan);
      mutate(changed);
      const changedBundle = bundleFromInputs(
        action,
        changed,
        adaptiveQuorumInputs(action, changed)
      );
      return contained(action, changed, changedBundle);
    }
  };
}

function partialMedium(
  omitIntent: "FRAUD_DETECTION" | "ONCHAIN_TX_LOOKUP"
) {
  const { action, plan } = mediumBaseline();
  const inputs = adaptiveQuorumInputs(action, plan).filter(
    (item) => item.evidence.intent !== omitIntent
  );
  return {
    action,
    plan,
    bundle: bundleFromInputs(action, plan, inputs)
  };
}

function mutateFraudAttempt(
  indexToMutate: number,
  mutate: (input: EvidenceBundleItemInput) => void
) {
  const { action, plan } = mediumBaseline();
  const inputs = adaptiveQuorumInputs(action, plan);
  const fraud = inputs.filter(
    (item) => item.evidence.intent === "FRAUD_DETECTION"
  );
  mutate(fraud[indexToMutate]);
  return {
    action,
    plan,
    bundle: bundleFromInputs(action, plan, inputs)
  };
}

const families: Family[] = [
  planMutation("risk_tier_downgrade", (plan) => {
    plan.riskTier = "LOW";
  }),
  planMutation("required_intent_removal", (plan) => {
    plan.requirements = [plan.requirements[0]];
  }),
  planMutation("quorum_distinct_miner_downgrade", (plan) => {
    plan.requirements[0].quorum.minimumDistinctMiners = 1;
    plan.requirements[0].quorum.minimumPositiveResults = 1;
    plan.requirements[0].quorum.maxAttempts = 1;
  }),
  planMutation("quorum_positive_vote_downgrade", (plan) => {
    plan.requirements[0].quorum.minimumPositiveResults = 1;
  }),
  planMutation("quorum_confidence_floor_downgrade", (plan) => {
    plan.requirements[0].minimumConfidence = 0.1;
    plan.requirements[0].quorum.minimumPositiveConfidence = 0.1;
  }),
  planMutation("quorum_negative_veto_disable", (plan) => {
    plan.requirements[0].quorum.negativeVetoConfidence = null;
  }),
  planMutation("quorum_attempt_limit_expand", (plan) => {
    plan.requirements[0].quorum.maxAttempts = 20;
  }),
  planMutation("evidence_budget_expand", (plan) => {
    plan.maxEvidenceSpendRaw = "999999999";
  }),
  planMutation("evidence_latency_expand", (plan) => {
    plan.maxEvidenceLatencyMs = 600_000;
  }),
  {
    id: "duplicate_miner_sybil_count",
    run() {
      const { action, plan } = mediumBaseline();
      const inputs = adaptiveQuorumInputs(action, plan);
      for (const item of inputs) {
        if (item.evidence.intent === "FRAUD_DETECTION") {
          item.evidence.miner = {
            id: "same-fraud-miner",
            name: "Same Fraud Miner",
            slug: "same-fraud-miner"
          };
        }
      }
      return contained(
        action,
        plan,
        bundleFromInputs(action, plan, inputs)
      );
    }
  },
  {
    id: "insufficient_positive_quorum",
    run() {
      const candidate = mutateFraudAttempt(1, (input) => {
        input.evidence.label = null;
        input.evidence.confidence = null;
      });
      return contained(candidate.action, candidate.plan, candidate.bundle);
    }
  },
  {
    id: "below_confidence_positive_votes",
    run() {
      const { action, plan } = mediumBaseline();
      const inputs = adaptiveQuorumInputs(action, plan, {
        FRAUD_DETECTION: { confidence: 0.74 }
      });
      return contained(
        action,
        plan,
        bundleFromInputs(action, plan, inputs)
      );
    }
  },
  {
    id: "high_confidence_negative_veto",
    run() {
      const candidate = mutateFraudAttempt(1, (input) => {
        input.evidence.label = "MALICIOUS";
        input.evidence.confidence = 0.97;
      });
      return contained(candidate.action, candidate.plan, candidate.bundle);
    }
  },
  {
    id: "explicit_negative_not_averaged_away",
    run() {
      const candidate = mutateFraudAttempt(1, (input) => {
        input.evidence.label = "SUSPICIOUS";
        input.evidence.confidence = 0.40;
      });
      return contained(candidate.action, candidate.plan, candidate.bundle);
    }
  },
  {
    id: "missing_fraud_intent",
    run() {
      const candidate = partialMedium("FRAUD_DETECTION");
      return contained(candidate.action, candidate.plan, candidate.bundle);
    }
  },
  {
    id: "missing_tx_lookup_intent",
    run() {
      const candidate = partialMedium("ONCHAIN_TX_LOOKUP");
      return contained(candidate.action, candidate.plan, candidate.bundle);
    }
  },
  {
    id: "stale_required_evidence",
    run() {
      const { action, plan } = mediumBaseline();
      const inputs = adaptiveQuorumInputs(action, plan, {
        ONCHAIN_TX_LOOKUP: {
          receivedAt: "2026-09-02T17:00:00.000Z"
        }
      });
      return contained(
        action,
        plan,
        bundleFromInputs(action, plan, inputs)
      );
    }
  },
  {
    id: "missing_signal_hash",
    run() {
      const { action, plan } = mediumBaseline();
      const inputs = adaptiveQuorumInputs(action, plan);
      const target = inputs.find(
        (item) => item.evidence.intent === "ONCHAIN_TX_LOOKUP"
      );
      if (!target) return false;
      target.evidence.signalHash = null;
      return contained(
        action,
        plan,
        bundleFromInputs(action, plan, inputs)
      );
    }
  },
  {
    id: "negative_secondary_signal",
    run() {
      const { action, plan } = mediumBaseline();
      const inputs = adaptiveQuorumInputs(action, plan, {
        ONCHAIN_TX_LOOKUP: { label: "SUSPICIOUS" }
      });
      return contained(
        action,
        plan,
        bundleFromInputs(action, plan, inputs)
      );
    }
  },
  {
    id: "x402_wrong_network",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].payment.network = "eip155:1";
      rehash(changed);
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "x402_asset_swap",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].payment.asset =
        "0x1111111111111111111111111111111111111111";
      rehash(changed);
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "x402_per_request_overcap",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].payment.amountRaw = "10001";
      changed.totalEvidenceSpendRaw = (
        BigInt(changed.totalEvidenceSpendRaw) + 1n
      ).toString();
      rehash(changed);
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "bundle_signal_tamper",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].signalHash = mutateHash(
        changed.items[0].signalHash
      );
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "quorum_summary_tamper",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.quorums[0].distinctMinerIds = ["fake-miner"];
      rehash(changed);
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "quorum_miner_identity_substitution",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].miner.id = "substituted-miner";
      rehash(changed);
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "evidence_subject_substitution",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].subject =
        "0x1111111111111111111111111111111111111111";
      rehash(changed);
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "evidence_chain_substitution",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].chainId = 1;
      rehash(changed);
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "raw_response_hash_tamper",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      const changed = structuredClone(bundle);
      changed.items[0].rawResponseHash = `0x${"f".repeat(64)}`;
      return !verifyEvidenceBundle(changed) &&
        contained(action, plan, changed);
    }
  },
  {
    id: "undelegated_intent",
    run() {
      const { action, plan, bundle } = mediumBaseline();
      return contained(
        action,
        plan,
        bundle,
        adaptiveMandate({
          requiredIntents: ["FRAUD_DETECTION"]
        })
      );
    }
  },
  {
    id: "action_semantic_mutation",
    run(index) {
      const { action, plan, bundle } = mediumBaseline();
      const changedAction = createActionContract({
        type: "payment",
        chainId: action.payload.chainId,
        token: action.payload.token,
        amountRaw: (7_000_001n + BigInt(index)).toString(),
        destination: action.payload.destination,
        reason: action.payload.reason,
        policyId: "payments.adaptive.v1",
        policyVersion: 1
      });
      return contained(changedAction, plan, bundle);
    }
  },
  {
    id: "valid_bundle_substitution_from_other_action",
    run() {
      const { action, plan } = mediumBaseline();
      const other = adaptiveAction("8000000");
      const otherPlan = createAdaptiveEvidencePlan(other);
      const otherBundle = bundleFromInputs(
        other,
        otherPlan,
        adaptiveQuorumInputs(other, otherPlan)
      );
      return contained(action, plan, otherBundle);
    }
  },
  {
    id: "high_consequence_cannot_bypass_autonomous_ceiling",
    run(index) {
      const amount = (50_000_001n + BigInt(index)).toString();
      const action = adaptiveAction(amount);
      const plan = createAdaptiveEvidencePlan(action);
      const bundle = bundleFromInputs(
        action,
        plan,
        adaptiveQuorumInputs(action, plan)
      );
      return contained(
        action,
        plan,
        bundle,
        adaptiveMandate({ maxPerActionRaw: "100000000" })
      );
    }
  }
];

const low = lowBaseline();
const lowControl = evaluate(low);
const medium = mediumBaseline();
const mediumControl = evaluate(medium);

if (low.plan.riskTier !== "LOW" || lowControl.decision !== "ALLOW") {
  throw new Error(
    `adaptive_fuzz_low_control_failed:${low.plan.riskTier}:${lowControl.reason}`
  );
}

if (medium.plan.riskTier !== "MEDIUM" || mediumControl.decision !== "ALLOW") {
  throw new Error(
    `adaptive_fuzz_medium_control_failed:${medium.plan.riskTier}:${mediumControl.reason}`
  );
}

let containedCount = 0;
let unauthorizedAuthorizations = 0;
let uncaughtErrors = 0;

console.log("");
console.log("PROOFGATE ADAPTIVE + QUORUM FUZZ");
console.log("================================");
console.log("Mode: OFFLINE_DETERMINISTIC");
console.log("Policy: payments.adaptive.v1");
console.log("Low band: <= 5 USDC");
console.log("Medium band: > 5 to 50 USDC");
console.log("High evidence band: > 50 USDC (still blocked by v1 autonomous ceiling)");
console.log(`Mutation families: ${families.length}`);
console.log(`Cases per family: ${CASES_PER_FAMILY}`);
console.log("");

for (const family of families) {
  let familyContained = 0;

  for (let index = 0; index < CASES_PER_FAMILY; index++) {
    try {
      if (family.run(index)) {
        familyContained++;
        containedCount++;
      } else {
        unauthorizedAuthorizations++;
      }
    } catch {
      uncaughtErrors++;
    }
  }

  const prefix =
    familyContained === CASES_PER_FAMILY ? "PASS" : "FAIL";
  console.log(
    `${prefix} | ${family.id} | ${familyContained}/${CASES_PER_FAMILY}`
  );
}

const total = families.length * CASES_PER_FAMILY;
const validControlsPassed =
  Number(lowControl.decision === "ALLOW") * 50 +
  Number(mediumControl.decision === "ALLOW") * 50;

console.log("");
console.log(`Adversarial cases contained: ${containedCount}/${total}`);
console.log(`Valid controls passed: ${validControlsPassed}/100`);
console.log(`Unauthorized authorizations: ${unauthorizedAuthorizations}`);
console.log(`Uncaught errors: ${uncaughtErrors}`);
console.log("Telegraph requests: 0");
console.log("x402 payments: 0");
console.log("Blockchain writes: 0");

if (
  containedCount !== total ||
  validControlsPassed !== 100 ||
  unauthorizedAuthorizations !== 0 ||
  uncaughtErrors !== 0
) {
  process.exit(1);
}
