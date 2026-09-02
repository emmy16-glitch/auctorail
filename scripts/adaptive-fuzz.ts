import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract,
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
  type EvidenceBundle
} from "../src/telegraph/evidence-bundle.js";

const NOW = new Date("2026-09-02T18:00:00.000Z");
const AGENT = "adaptive-fuzz-agent";
const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const SECRET = "proofgate-adaptive-fuzz-secret-" + "x".repeat(64);
const CASES_PER_FAMILY = 100;

function differentHash(current: string | null): string {
  const candidate = `0x${"f".repeat(64)}`;
  return current?.toLowerCase() === candidate
    ? `0x${"e".repeat(64)}`
    : candidate;
}

function action(amountRaw = "7000000"): ActionContract {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw,
    destination: VENDOR,
    reason: "Adaptive fuzz baseline",
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
  index = 0,
  overrides?: Partial<TelegraphEvidenceRecord>
): TelegraphEvidenceRecord {
  const intentCode =
    intent === "FRAUD_DETECTION"
      ? 1
      : intent === "ONCHAIN_TX_LOOKUP"
        ? 2
        : 3;
  const nibble = ((intentCode + index) % 15 + 1).toString(16);
  const rawNibble = ((intentCode + index + 6) % 15 + 1).toString(16);

  const base: TelegraphEvidenceRecord = {
    source: "telegraph",
    intent,
    miner: {
      id: `fuzz-miner-${intentCode}`,
      name: `Fuzz Miner ${intentCode}`,
      slug: `fuzz-miner-${intentCode}`
    },
    subject: proposed.payload.destination,
    chainId: proposed.payload.chainId,
    label: intent === "FRAUD_DETECTION" ? "ALLOW" : null,
    confidence: intent === "FRAUD_DETECTION" ? 0.91 : null,
    reason: `fuzz-${index}`,
    applicability: "APPLICABLE",
    signalHash: `0x${nibble.repeat(64)}`,
    costUsd: 0.01,
    durationMs: 10 + index,
    rawResponseHash: `0x${rawNibble.repeat(64)}`,
    receivedAt: "2026-09-02T17:59:30.000Z",
    rawResponse: { synthetic: true, index, intent }
  };

  return {
    ...base,
    ...overrides,
    miner: {
      ...base.miner,
      ...(overrides?.miner ?? {})
    }
  };
}

function bundle(
  proposed: ActionContract,
  plan: AdaptiveEvidencePlan,
  index = 0,
  options?: {
    omit?: AdaptiveEvidenceIntent;
    paymentRaw?: string;
    overrides?: Partial<
      Record<AdaptiveEvidenceIntent, Partial<TelegraphEvidenceRecord>>
    >;
  }
): EvidenceBundle {
  return createEvidenceBundle(
    proposed,
    plan,
    plan.requirements
      .filter((requirement) => requirement.intent !== options?.omit)
      .map((requirement) => ({
        evidence: evidence(
          proposed,
          requirement.intent,
          index,
          options?.overrides?.[requirement.intent]
        ),
        paymentAmountRaw: options?.paymentRaw ?? "10000",
        paymentNetwork: "eip155:84532",
        paymentAsset: BASE_SEPOLIA_USDC
      })),
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
  throw new Error(`adaptive_fuzz_baseline_not_allow:${baselineDecision.reason}`);
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

const families: Family[] = [
  {
    id: "risk_tier_downgrade",
    run(index) {
      const downgraded: AdaptiveEvidencePlan = {
        ...baselinePlan,
        riskTier: "LOW",
        requirements: [baselinePlan.requirements[0]],
        maxEvidenceSpendRaw: "15000",
        maxEvidenceLatencyMs: 15000
      };
      return decisionContained(
        baselineMandate,
        baselineAction,
        downgraded,
        bundle(baselineAction, downgraded, index)
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
        bundle(baselineAction, baselinePlan, index, { omit: "FRAUD_DETECTION" })
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
        bundle(baselineAction, baselinePlan, index, { omit: "ONCHAIN_TX_LOOKUP" })
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
        bundle(baselineAction, baselinePlan, index, { omit: "WALLET_BALANCE_CHECK" })
      );
    }
  },
  {
    id: "negative_fraud_signal",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          overrides: { FRAUD_DETECTION: { label: "MALICIOUS" } }
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
          overrides: { ONCHAIN_TX_LOOKUP: { label: "SUSPICIOUS" } }
        })
      );
    }
  },
  {
    id: "fraud_confidence_below_floor",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, {
          overrides: { FRAUD_DETECTION: { confidence: 0.79 } }
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
          overrides: { ONCHAIN_TX_LOOKUP: { signalHash: null } }
        })
      );
    }
  },
  {
    id: "evidence_budget_overrun",
    run(index) {
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        bundle(baselineAction, baselinePlan, index, { paymentRaw: "20000" })
      );
    }
  },
  {
    id: "bundle_signal_tamper",
    run(index) {
      const mutated = structuredClone(bundle(baselineAction, baselinePlan, index));
      mutated.items[0].signalHash = differentHash(mutated.items[0].signalHash);
      return decisionContained(
        baselineMandate,
        baselineAction,
        baselinePlan,
        mutated
      );
    }
  },
  {
    id: "bundle_raw_response_hash_tamper",
    run(index) {
      const mutated = structuredClone(bundle(baselineAction, baselinePlan, index));
      mutated.items[1].rawResponseHash = differentHash(mutated.items[1].rawResponseHash);
      return decisionContained(
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
              subject: "0x1111111111111111111111111111111111111111"
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
      const alternate = bundle(baselineAction, baselinePlan, index + 20);
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
      const candidate = `0x${nibble.repeat(64)}`;
      forged.signature =
        candidate.toLowerCase() === baselinePermit.signature.toLowerCase()
          ? `0x${"f".repeat(64)}`
          : candidate;
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
  }
];

let adversarialContained = 0;
let unauthorized = 0;
let uncaught = 0;

console.log("");
console.log("PROOFGATE ADAPTIVE FUZZ");
console.log("=======================");
console.log("Mode: OFFLINE_DETERMINISTIC");
console.log("Policy: payments.adaptive.v1");
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

const total = families.length * CASES_PER_FAMILY;

console.log("");
console.log(`Adversarial cases contained: ${adversarialContained}/${total}`);
console.log(`Valid controls passed: ${validControls}/${CASES_PER_FAMILY}`);
console.log("Unauthorized authorizations:", unauthorized);
console.log("Uncaught errors:", uncaught);
console.log("Telegraph requests: 0");
console.log("x402 payments: 0");
console.log("Blockchain writes: 0");

if (
  adversarialContained !== total ||
  validControls !== CASES_PER_FAMILY ||
  unauthorized !== 0 ||
  uncaught !== 0
) {
  process.exitCode = 1;
}
