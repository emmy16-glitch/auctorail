import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract,
  type ActionContract
} from "../../src/core/action-contract.js";
import {
  createMandateContract,
  type MandateContract
} from "../../src/core/mandate-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../../src/evidence/telegraph.js";
import {
  createAdaptiveEvidencePlan,
  type AdaptiveEvidenceIntent,
  type AdaptiveEvidencePlan
} from "../../src/telegraph/adaptive-evidence-plan.js";
import {
  createEvidenceBundle,
  type EvidenceBundle,
  type EvidenceBundleItemInput
} from "../../src/telegraph/evidence-bundle.js";

export const ADAPTIVE_TEST_NOW =
  new Date("2026-09-02T18:00:00.000Z");

export const ADAPTIVE_TEST_VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

export const ADAPTIVE_TEST_AGENT =
  "procurement-agent";

export function adaptiveAction(
  amountRaw = "7000000"
): ActionContract {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw,
    destination: ADAPTIVE_TEST_VENDOR,
    reason: "Adaptive test payment",
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });
}

export function adaptiveMandate(
  overrides?: Partial<{
    requiredIntents: string[];
    maxPerActionRaw: string;
  }>
): MandateContract {
  return createMandateContract({
    mandateId: "adaptive-test-mandate",
    principalId: "adaptive-test-principal",
    agentId: ADAPTIVE_TEST_AGENT,
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    allowedDestinations: [ADAPTIVE_TEST_VENDOR],
    maxPerActionRaw:
      overrides?.maxPerActionRaw ?? "10000000",
    requiredIntents:
      overrides?.requiredIntents ?? [
        "FRAUD_DETECTION",
        "ONCHAIN_TX_LOOKUP",
        "WALLET_BALANCE_CHECK"
      ],
    policyId: "payments.adaptive.v1",
    policyVersion: 1,
    status: "ACTIVE",
    issuedAt: "2026-09-02T17:00:00.000Z",
    expiresAt: "2026-09-02T20:00:00.000Z",
    version: 1
  });
}

export function adaptiveEvidence(
  action: ActionContract,
  intent: AdaptiveEvidenceIntent,
  overrides?: Partial<TelegraphEvidenceRecord>
): TelegraphEvidenceRecord {
  const suffix =
    intent === "FRAUD_DETECTION"
      ? "1"
      : intent === "ONCHAIN_TX_LOOKUP"
        ? "2"
        : "3";

  const base: TelegraphEvidenceRecord = {
    source: "telegraph",
    intent,
    miner: {
      id: `miner-${suffix}`,
      name: `Adaptive Miner ${suffix}`,
      slug: `adaptive-miner-${suffix}`
    },
    subject:
      action.payload.destination,
    chainId:
      action.payload.chainId,
    label:
      intent === "FRAUD_DETECTION"
        ? "ALLOW"
        : null,
    confidence:
      intent === "FRAUD_DETECTION"
        ? 0.91
        : null,
    reason:
      "Synthetic defensive test fixture",
    applicability:
      "APPLICABLE",
    signalHash:
      `0x${suffix.repeat(64)}`,
    costUsd:
      0.01,
    durationMs:
      50,
    rawResponseHash:
      `0x${(Number(suffix) + 3).toString().repeat(64).slice(0, 64)}`,
    receivedAt:
      "2026-09-02T17:59:30.000Z",
    rawResponse: {
      fixture: true,
      intent
    }
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

export function adaptiveQuorumInputs(
  action: ActionContract,
  plan: AdaptiveEvidencePlan,
  evidenceOverrides?: Partial<
    Record<
      AdaptiveEvidenceIntent,
      Partial<TelegraphEvidenceRecord>
    >
  >
): EvidenceBundleItemInput[] {
  const inputs: EvidenceBundleItemInput[] = [];

  for (const requirement of plan.requirements) {
    for (
      let attempt = 1;
      attempt <= requirement.quorum.minimumDistinctMiners;
      attempt++
    ) {
      const hashDigit =
        ((inputs.length + 1) % 9) + 1;
      const rawDigit =
        ((inputs.length + 5) % 9) + 1;
      const baseOverride =
        evidenceOverrides?.[requirement.intent] ?? {};

      inputs.push({
        evidence: adaptiveEvidence(
          action,
          requirement.intent,
          {
            ...baseOverride,
            miner: {
              id:
                `${requirement.intent.toLowerCase()}-miner-${attempt}`,
              name:
                `${requirement.intent} Miner ${attempt}`,
              slug:
                `${requirement.intent.toLowerCase()}-miner-${attempt}`,
              ...(baseOverride.miner ?? {})
            },
            signalHash:
              baseOverride.signalHash ??
              `0x${String(hashDigit).repeat(64)}`,
            rawResponseHash:
              baseOverride.rawResponseHash ??
              `0x${String(rawDigit).repeat(64)}`
          }
        ),
        attempt,
        paymentAmountRaw: "10000",
        paymentNetwork: "eip155:84532",
        paymentAsset: BASE_SEPOLIA_USDC
      });
    }
  }

  return inputs;
}

export function adaptiveContext(
  amountRaw = "7000000",
  evidenceOverrides?: Partial<
    Record<
      AdaptiveEvidenceIntent,
      Partial<TelegraphEvidenceRecord>
    >
  >
): {
  action: ActionContract;
  mandate: MandateContract;
  plan: AdaptiveEvidencePlan;
  bundle: EvidenceBundle;
} {
  const action = adaptiveAction(amountRaw);
  const mandate = adaptiveMandate();
  const plan = createAdaptiveEvidencePlan(action);

  const bundle = createEvidenceBundle(
    action,
    plan,
    adaptiveQuorumInputs(
      action,
      plan,
      evidenceOverrides
    ),
    { now: ADAPTIVE_TEST_NOW }
  );

  return {
    action,
    mandate,
    plan,
    bundle
  };
}
