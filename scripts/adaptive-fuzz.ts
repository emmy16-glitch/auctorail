import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  canonicalize,
  createActionContract,
  hashCanonicalPayload,
  type ActionContract
} from "../src/core/action-contract.js";
import {
  createMandateContract,
  type MandateContract
} from "../src/core/mandate-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";
import {
  evaluatePaymentsAdaptiveV1
} from "../src/policy/payments-adaptive-v1.js";
import {
  mintPermit,
  verifyPermit
} from "../src/permit/permit.js";
import {
  createAdaptiveEvidencePlan,
  type AdaptiveEvidenceIntent,
  type AdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  createEvidenceBundle,
  verifyEvidenceBundle,
  type EvidenceBundle,
  type EvidenceBundleItemInput
} from "../src/telegraph/evidence-bundle.js";

const NOW = new Date("2026-09-02T18:00:00.000Z");
const AGENT = "adaptive-fuzz-agent";
const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const SECRET = "proofgate-adaptive-fuzz-secret-" + "x".repeat(64);
const CASES_PER_FAMILY = 100;

type EvidenceOverride =
  Omit<Partial<TelegraphEvidenceRecord>, "miner"> & {
    miner?: Partial<TelegraphEvidenceRecord["miner"]>;
  };

function mutateHash(current: string | null): string {
  if (!current || !/^0x[0-9a-fA-F]{64}$/.test(current)) {
    return `0x${"f".repeat(64)}`;
  }
  const body = current.slice(2).toLowerCase();
  const replacement = body[0] === "0" ? "1" : "0";
  return `0x${replacement}${body.slice(1)}`;
}

function rehash(bundle: EvidenceBundle): void {
  const { bundleHash: _old, ...body } = bundle;
  bundle.bundleHash = hashCanonicalPayload(canonicalize(body));
}

function action(amountRaw = "7000000"): ActionContract {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw,
    destination: VENDOR,
    reason: "Adaptive quorum fuzz baseline",
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });
}

function mandate(
  requiredIntents: string[] = [
    "FRAUD_DETECTION",
    "ONCHAIN_TX_LOOKUP",
    "WALLET_BALANCE_CHECK"
  ]
): MandateContract {
  return createMandateContract({
    mandateId: "adaptive-fuzz-mandate",
    principalId: "adaptive-fuzz-principal",
    agentId: AGENT,
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    allowedDestinations: [VENDOR],
    maxPerActionRaw: "10000000",
    requiredIntents,
    policyId: "payments.adaptive.v1",
    policyVersion: 1,
    status: "ACTIVE",
    issuedAt: "2026-09-02T17:00:00.000Z",
    expiresAt: "2026-09-02T20:00:00.000Z",
    version: 1
  });
}

function evidence(
  proposed: ActionContract,
  intent: AdaptiveEvidenceIntent,
  caseIndex: number,
  attempt: number,
  override: EvidenceOverride = {}
): TelegraphEvidenceRecord {
  const intentCode =
    intent === "FRAUD_DETECTION"
      ? 1
      : intent === "ONCHAIN_TX_LOOKUP"
        ? 2
        : 3;
  const signalDigit =
    ((intentCode + attempt + caseIndex) % 15 + 1).toString(16);
  const rawDigit =
    ((intentCode + attempt + caseIndex + 7) % 15 + 1).toString(16);
  const baseMiner = {
    id: `${intent.toLowerCase()}-miner-${attempt}`,
    name: `${intent} Miner ${attempt}`,
    slug: `${intent.toLowerCase()}-miner-${attempt}`
  };

  const base: TelegraphEvidenceRecord = {
    source: "telegraph",
    intent,
    miner: baseMiner,
    subject: proposed.payload.destination,
    chainId: proposed.payload.chainId,
    label: intent === "FRAUD_DETECTION" ? "ALLOW" : null,
    confidence: intent === "FRAUD_DETECTION" ? 0.91 : null,
    reason: `fuzz-${caseIndex}-${attempt}`,
    applicability: "APPLICABLE",
    signalHash: `0x${signalDigit.repeat(64)}`,
    costUsd: 0.01,
    durationMs: 10 + attempt,
    rawResponseHash: `0x${rawDigit.repeat(64)}`,
    receivedAt: "2026-09-02T17:59:30.000Z",
    rawResponse: {
      synthetic: true,
      caseIndex,
      attempt,
      intent
    }
  };

  return {
    ...base,
    ...override,
    miner: {
      ...baseMiner,
      ...(override.miner ?? {})
    }
  };
}

interface BundleOptions {
  omit?: AdaptiveEvidenceIntent;
  paymentRaw?: string;
  sameFraudMiner?: boolean;
  overrides?: Partial<Record<AdaptiveEvidenceIntent, EvidenceOverride>>;
  fraudAttemptOverride?: (attempt: number) => EvidenceOverride | undefined;
}

function inputsFor(
  proposed: ActionContract,
  plan: AdaptiveEvidencePlan,
  caseIndex: number,
  options: BundleOptions = {}
): EvidenceBundleItemInput[] {
  const inputs: EvidenceBundleItemInput[] = [];

  for (const requirement of plan.requirements) {
    if (requirement.intent === options.omit) continue;

    for (
      let attempt = 1;
      attempt <= requirement.quorum.minimumDistinctMiners;
      attempt++
    ) {
      const generic = options.overrides?.[requirement.intent] ?? {};
      const perAttempt =
        requirement.intent === "FRAUD_DETECTION"
          ? options.fraudAttemptOverride?.(attempt) ?? {}
          : {};
      const forcedMiner =
        options.sameFraudMiner &&
        requirement.intent === "FRAUD_DETECTION"
          ? {
              id: "repeated-fraud-miner",
              name: "Repeated Fraud Miner",
              slug: "repeated-fraud-miner"
            }
          : undefined;

      const override: EvidenceOverride = {
        ...generic,
        ...perAttempt,
        miner: forcedMiner ?? {
          ...(generic.miner ?? {}),
          ...(perAttempt.miner ?? {})
        }
      };

      inputs.push({
        evidence: evidence(
          proposed,
          requirement.intent,
          caseIndex,
          attempt,
          override
        ),
        attempt,
        paymentAmountRaw: options.paymentRaw ?? "10000",
        paymentNetwork: "eip155:84532",
        paymentAsset: BASE_SEPOLIA_USDC
      });
    }
  }

  return inputs;
}

function bundle(
  proposed: ActionContract,
  plan: AdaptiveEvidencePlan,
  caseIndex = 0,
  options: BundleOptions = {}
): EvidenceBundle {
  return createEvidenceBundle(
    proposed,
    plan,
    inputsFor(proposed, plan, caseIndex, options),
    { now: NOW }
  );
}

const baselineAction = action();
const baselineMandate = mandate();
const baselinePlan = createAdaptiveEvidencePlan(baselineAction);
const baselineBundle = bundle(baselineAction, baselinePlan);
const baselineDecision = evaluatePaymentsAdaptiveV1(
  baselineMandate,
  baselineAction,
  baselinePlan,
  baselineBundle,
  { agentId: AGENT, now: NOW }
);

if (baselineDecision.decision !== "ALLOW") {
  throw new Error(
    `adaptive_fuzz_baseline_not_allow:${baselineDecision.reason}`
  );
}

const baselinePermit = mintPermit(
  baselineMandate,
  baselineAction,
  baselineBundle,
  baselineDecision,
  SECRET,
  { now: NOW, ttlSeconds: 30 }
);

interface Family {
  id: string;
  run(index: number): boolean;
}

function decisionContained(
  proposedMandate: MandateContract,
  proposedAction: ActionContract,
  plan: AdaptiveEvidencePlan,
  evidenceBundle: EvidenceBundle
): boolean {
  return evaluatePaymentsAdaptiveV1(
    proposedMandate,
    proposedAction,
    plan,
    evidenceBundle,
    { agentId: AGENT, now: NOW }
  ).decision !== "ALLOW";
}

function changedPlan(
  mutate: (plan: AdaptiveEvidencePlan) => void
): AdaptiveEvidencePlan {
  const candidate = structuredClone(baselinePlan);
  mutate(candidate);
  return candidate;
}

const planAttack = (
  id: string,
  mutate: (plan: AdaptiveEvidencePlan) => void
): Family => ({
  id,
  run(index) {
    const plan = changedPlan(mutate);
    return decisionContained(
      baselineMandate,
      baselineAction,
      plan,
      bundle(baselineAction, plan, index)
    );
  }
});

const families: Family[] = [
  planAttack("risk_tier_downgrade", (plan) => {
    plan.riskTier = "LOW";
    plan.requirements = [plan.requirements[0]];
    plan.maxEvidenceSpendRaw = "15000";
    plan.maxEvidenceLatencyMs = 15000;
  }),
  planAttack("quorum_distinct_miner_downgrade", (plan) => {
    plan.requirements[0].quorum.minimumDistinctMiners = 1;
    plan.requirements[0].quorum.minimumPositiveResults = 1;
    plan.requirements[0].quorum.maxAttempts = 1;
  }),
  planAttack("quorum_positive_vote_downgrade", (plan) => {
    plan.requirements[0].quorum.minimumPositiveResults = 1;
  }),
  planAttack("quorum_confidence_floor_downgrade", (plan) => {
    plan.requirements[0].minimumConfidence = 0.1;
    plan.requirements[0].quorum.minimumPositiveConfidence = 0.1;
  }),
  planAttack("quorum_negative_veto_disable", (plan) => {
    plan.requirements[0].quorum.negativeVetoConfidence = null;
  }),
  planAttack("quorum_attempt_limit_expand", (plan) => {
    plan.requirements[0].quorum.maxAttempts = 20;
  }),
  {
    id: "duplicate_miner_sybil_count",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          sameFraudMiner: true
        })
      );
    }
  },
  {
    id: "insufficient_positive_quorum",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          fraudAttemptOverride: (attempt) =>
            attempt === 1
              ? undefined
              : { label: null, confidence: null }
        })
      );
    }
  },
  {
    id: "below_confidence_positive_votes",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          overrides: {
            FRAUD_DETECTION: { confidence: 0.79 }
          }
        })
      );
    }
  },
  {
    id: "high_confidence_negative_veto",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          fraudAttemptOverride: (attempt) =>
            attempt === 2
              ? { label: "MALICIOUS", confidence: 0.97 }
              : undefined
        })
      );
    }
  },
  {
    id: "low_confidence_negative_still_blocks",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          fraudAttemptOverride: (attempt) =>
            attempt === 3
              ? { label: "SUSPICIOUS", confidence: 0.40 }
              : undefined
        })
      );
    }
  },
  {
    id: "missing_fraud_intent",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          omit: "FRAUD_DETECTION"
        })
      );
    }
  },
  {
    id: "missing_tx_lookup_intent",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          omit: "ONCHAIN_TX_LOOKUP"
        })
      );
    }
  },
  {
    id: "missing_wallet_balance_intent",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          omit: "WALLET_BALANCE_CHECK"
        })
      );
    }
  },
  {
    id: "negative_secondary_signal",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          overrides: {
            ONCHAIN_TX_LOOKUP: { label: "SUSPICIOUS" }
          }
        })
      );
    }
  },
  {
    id: "stale_required_evidence",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          overrides: {
            WALLET_BALANCE_CHECK: {
              receivedAt: "2026-09-02T17:00:00.000Z"
            }
          }
        })
      );
    }
  },
  {
    id: "missing_signal_hash",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          overrides: {
            ONCHAIN_TX_LOOKUP: { signalHash: null }
          }
        })
      );
    }
  },
  {
    id: "x402_wrong_network",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.items[0].payment.network = "eip155:1";
      rehash(mutated);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  },
  {
    id: "x402_asset_swap",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.items[0].payment.asset =
        "0x1111111111111111111111111111111111111111";
      rehash(mutated);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  },
  {
    id: "x402_per_request_overcap",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.items[0].payment.amountRaw = "10001";
      mutated.totalEvidenceSpendRaw = String(
        BigInt(mutated.totalEvidenceSpendRaw) + 1n
      );
      rehash(mutated);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  },
  {
    id: "bundle_signal_tamper",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.items[0].signalHash =
        mutateHash(mutated.items[0].signalHash);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  },
  {
    id: "quorum_summary_tamper",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.quorums[0].positiveMinerIds = ["fabricated-miner"];
      rehash(mutated);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  },
  {
    id: "quorum_miner_identity_substitution",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.items[0].miner.id = "substituted-miner";
      rehash(mutated);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  },
  {
    id: "quorum_attempt_collision",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.items[1].attempt = mutated.items[0].attempt;
      rehash(mutated);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  },
  {
    id: "evidence_subject_substitution",
    run(index) {
      try {
        bundle(baselineAction, baselinePlan, index, {
          overrides: {
            FRAUD_DETECTION: {
              subject:
                "0x1111111111111111111111111111111111111111"
            }
          }
        });
        return false;
      } catch {
        return true;
      }
    }
  },
  {
    id: "valid_bundle_substitution_after_permit",
    run(index) {
      const alternate = bundle(
        baselineAction,
        baselinePlan,
        index + 20
      );
      return !verifyPermit(
        baselineMandate,
        baselinePermit,
        baselineAction,
        alternate,
        baselineDecision,
        SECRET,
        { now: new Date(NOW.getTime() + 1000) }
      ).valid;
    }
  },
  {
    id: "permit_signature_forgery",
    run(index) {
      const forged = structuredClone(baselinePermit);
      const nibble = ((index % 15) + 1).toString(16);
      forged.signature = `0x${nibble.repeat(64)}`;
      if (
        forged.signature.toLowerCase() ===
        baselinePermit.signature.toLowerCase()
      ) {
        forged.signature = `0x${"f".repeat(64)}`;
      }
      return !verifyPermit(
        baselineMandate,
        forged,
        baselineAction,
        baselineBundle,
        baselineDecision,
        SECRET,
        { now: new Date(NOW.getTime() + 1000) }
      ).valid;
    }
  },
  {
    id: "expired_permit",
    run(index) {
      return !verifyPermit(
        baselineMandate,
        baselinePermit,
        baselineAction,
        baselineBundle,
        baselineDecision,
        SECRET,
        { now: new Date(NOW.getTime() + 31_000 + index) }
      ).valid;
    }
  },
  {
    id: "action_semantic_mutation",
    run(index) {
      const mutated = structuredClone(baselineAction);
      mutated.payload.amountRaw = String(6_000_000 + index);
      return !verifyPermit(
        baselineMandate,
        baselinePermit,
        mutated,
        baselineBundle,
        baselineDecision,
        SECRET,
        { now: new Date(NOW.getTime() + 1000) }
      ).valid;
    }
  },
  {
    id: "undelegated_intent",
    run(index) {
      void index;
      return decisionContained(
        mandate(["FRAUD_DETECTION"]),
        baselineAction,
        baselinePlan,
        baselineBundle
      );
    }
  },
  {
    id: "raw_response_hash_tamper",
    run(index) {
      const mutated = structuredClone(
        bundle(baselineAction, baselinePlan, index)
      );
      mutated.items[1].rawResponseHash =
        mutateHash(mutated.items[1].rawResponseHash);
      return !verifyEvidenceBundle(mutated) &&
        decisionContained(
          baselineMandate,
          baselineAction,
          baselinePlan,
          mutated
        );
    }
  }
];

let adversarialContained = 0;
let unauthorized = 0;
let uncaught = 0;

console.log("");
console.log("PROOFGATE ADAPTIVE + QUORUM FUZZ");
console.log("================================");
console.log("Mode: OFFLINE_DETERMINISTIC");
console.log("Policy: payments.adaptive.v1");
console.log("Provider diversity: DISTINCT_MINER_IDS");
console.log("Mutation families:", families.length);
console.log("Cases per family:", CASES_PER_FAMILY);
console.log("");

for (const family of families) {
  let passed = 0;
  for (let index = 0; index < CASES_PER_FAMILY; index++) {
    try {
      if (family.run(index)) {
        passed++;
        adversarialContained++;
      } else {
        unauthorized++;
      }
    } catch {
      uncaught++;
    }
  }

  console.log(
    `${passed === CASES_PER_FAMILY ? "PASS" : "FAIL"} | ${family.id} | ${passed}/${CASES_PER_FAMILY}`
  );
}

let validControls = 0;
for (let index = 0; index < CASES_PER_FAMILY; index++) {
  const verification = verifyPermit(
    baselineMandate,
    baselinePermit,
    baselineAction,
    baselineBundle,
    baselineDecision,
    SECRET,
    { now: new Date(NOW.getTime() + 1000 + index) }
  );
  if (verification.valid) validControls++;
}

console.log("");
console.log(
  `Adversarial cases contained: ${adversarialContained}/${families.length * CASES_PER_FAMILY}`
);
console.log(
  `Valid controls passed: ${validControls}/${CASES_PER_FAMILY}`
);
console.log(`Unauthorized authorizations: ${unauthorized}`);
console.log(`Uncaught errors: ${uncaught}`);
console.log("Telegraph requests: 0");
console.log("x402 payments: 0");
console.log("Blockchain writes: 0");

if (
  adversarialContained !== families.length * CASES_PER_FAMILY ||
  validControls !== CASES_PER_FAMILY ||
  unauthorized !== 0 ||
  uncaught !== 0
) {
  process.exitCode = 1;
}
