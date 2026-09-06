import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_USDC
} from "../src/core/action-contract.js";
import {
  authorizePaymentWithEvidence,
  createAdaptivePaymentMandate,
  evaluatePaymentAuthorization,
  mintPaymentPermit,
  planPaymentAuthorization
} from "../src/sdk/proofgate.js";
import {
  createEvidenceBundle
} from "../src/telegraph/evidence-bundle.js";
import {
  adaptiveEvidence,
  adaptiveQuorumInputs
} from "./helpers/adaptive-fixtures.js";

const NOW = new Date(
  "2026-09-02T18:00:00.000Z"
);
const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const SECRET =
  "sdk-test-secret-" + "x".repeat(64);

function mandateFor(destination: string) {
  return createAdaptivePaymentMandate({
    mandateId: "sdk-mandate",
    principalId: "sdk-principal",
    agentId: "sdk-agent",
    allowedDestinations: [destination],
    maxPerActionRaw: "10000000",
    requiredIntents: [
      "FRAUD_DETECTION",
      "ONCHAIN_TX_LOOKUP",
      "WALLET_BALANCE_CHECK"
    ],
    status: "ACTIVE",
    issuedAt:
      "2026-09-02T17:00:00.000Z",
    expiresAt:
      "2026-09-02T20:00:00.000Z",
    version: 1
  });
}

function routedEvidence(
  action: Parameters<typeof adaptiveEvidence>[0],
  intent: Parameters<typeof adaptiveEvidence>[1],
  attemptNumber = 1
) {
  return adaptiveEvidence(
    action,
    intent,
    {
      miner: {
        id: `${intent}-sdk-miner-${attemptNumber}`,
        name: `${intent} SDK Miner ${attemptNumber}`,
        slug: `${intent.toLowerCase()}-sdk-miner-${attemptNumber}`
      }
    }
  );
}

describe("Auctorail developer SDK", () => {
  it("plans the strongest evidence tier automatically for a high-consequence proposal", () => {
    const planned = planPaymentAuthorization({
      amountRaw: "70000000",
      destination: VENDOR,
      reason: "External agent purchase"
    });

    expect(planned.action.policyId).toBe(
      "payments.adaptive.v1"
    );
    expect(planned.plan.riskTier).toBe("HIGH");
    expect(
      planned.plan.requirements.map(
        (item) => item.intent
      )
    ).toEqual([
      "FRAUD_DETECTION",
      "ONCHAIN_TX_LOOKUP",
      "WALLET_BALANCE_CHECK"
    ]);
    expect(
      planned.plan.requirements[0].quorum
        .minimumDistinctMiners
    ).toBe(3);
    expect(
      planned.plan.requirements[0].quorum
        .minimumPositiveResults
    ).toBe(2);
  });

  it("lets a host evaluate and mint authority without giving Auctorail direct execution power", () => {
    const planned = planPaymentAuthorization({
      amountRaw: "1000000",
      destination: VENDOR,
      reason: "SDK authorization"
    });
    const mandate = mandateFor(
      planned.action.payload.destination
    );
    const bundle = createEvidenceBundle(
      planned.action,
      planned.plan,
      adaptiveQuorumInputs(
        planned.action,
        planned.plan
      ),
      { now: NOW }
    );

    const result = evaluatePaymentAuthorization({
      mandate,
      action: planned.action,
      plan: planned.plan,
      bundle,
      agentId: "sdk-agent",
      now: NOW
    });

    expect(result.decision.decision).toBe("ALLOW");
    expect(result.counterfactual).toBeNull();
    expect(result.evidenceBundleHash).toBe(
      bundle.bundleHash
    );

    const permit = mintPaymentPermit({
      mandate,
      action: planned.action,
      bundle,
      decision: result.decision,
      signer: SECRET,
      now: NOW,
      ttlSeconds: 30
    });

    expect(permit.payload.actionHash).toBe(
      planned.action.actionHash
    );
  });

  it("returns a deterministic counterfactual after required medium-risk fraud quorum but missing secondary evidence", () => {
    const planned = planPaymentAuthorization({
      amountRaw: "7000000",
      destination: VENDOR,
      reason: "SDK hold"
    });
    const mandate = mandateFor(
      planned.action.payload.destination
    );
    const partial = createEvidenceBundle(
      planned.action,
      planned.plan,
      adaptiveQuorumInputs(
        planned.action,
        planned.plan
      ).filter(
        (input) =>
          input.evidence.intent ===
          "FRAUD_DETECTION"
      ),
      { now: NOW }
    );

    const result = evaluatePaymentAuthorization({
      mandate,
      action: planned.action,
      plan: planned.plan,
      bundle: partial,
      agentId: "sdk-agent",
      now: NOW
    });

    expect(result.decision.decision).toBe("HOLD");
    expect(result.counterfactual).toContain(
      "Required ONCHAIN_TX_LOOKUP evidence is missing"
    );
  });

  it("offers a trusted one-call authorization path where the agent supplies only the proposal", async () => {
    const mandate = mandateFor(VENDOR);

    const result = await authorizePaymentWithEvidence({
      proposal: {
        amountRaw: "7000000",
        destination: VENDOR,
        reason: "Trusted SDK path"
      },
      mandate,
      agentId: "sdk-agent",
      acquire: async ({
        action,
        requirement,
        attemptNumber = 1
      }) => ({
        evidence: routedEvidence(
          action,
          requirement.intent,
          attemptNumber
        ),
        paymentAmountRaw: "10000",
        paymentNetwork: "eip155:84532",
        paymentAsset: BASE_SEPOLIA_USDC
      }),
      signer: SECRET,
      policyNow: NOW,
      permitNow: NOW,
      ttlSeconds: 30,
      clock: () => NOW
    });

    expect(result.plan.riskTier).toBe("MEDIUM");
    expect(result.collection.status).toBe("COMPLETE");
    expect(result.authorization.decision.decision).toBe("ALLOW");
    expect(result.permit).not.toBeNull();
    expect(result.permit?.payload.actionHash).toBe(
      result.action.actionHash
    );
  });

  it("never mints a permit when the trusted medium-risk acquisition path is incomplete", async () => {
    const mandate = mandateFor(VENDOR);

    const result = await authorizePaymentWithEvidence({
      proposal: {
        amountRaw: "7000000",
        destination: VENDOR,
        reason: "Incomplete trusted path"
      },
      mandate,
      agentId: "sdk-agent",
      acquire: async ({
        action,
        requirement,
        attemptNumber = 1
      }) => {
        if (requirement.intent === "ONCHAIN_TX_LOOKUP") {
          throw new Error("provider_unavailable");
        }

        return {
          evidence: routedEvidence(
            action,
            requirement.intent,
            attemptNumber
          ),
          paymentAmountRaw: "10000",
          paymentNetwork: "eip155:84532",
          paymentAsset: BASE_SEPOLIA_USDC
        };
      },
      signer: SECRET,
      policyNow: NOW,
      permitNow: NOW,
      clock: () => NOW
    });

    expect(result.collection.status).toBe("HOLD");
    expect(result.authorization.decision.decision).not.toBe("ALLOW");
    expect(result.permit).toBeNull();
  });
});
