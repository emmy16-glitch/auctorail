import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_USDC,
  canonicalize,
  hashCanonicalPayload
} from "../src/core/action-contract.js";
import {
  createAdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import {
  createEvidenceBundle,
  verifyEvidenceBundle,
  type EvidenceBundle
} from "../src/telegraph/evidence-bundle.js";
import {
  adaptiveAction,
  adaptiveEvidence
} from "./helpers/adaptive-fixtures.js";

function rehash(bundle: EvidenceBundle): void {
  const {
    bundleHash: _oldHash,
    ...body
  } = bundle;
  bundle.bundleHash = hashCanonicalPayload(
    canonicalize(body)
  );
}

describe("adaptive EvidenceBundle", () => {
  it("creates a deterministic tamper-evident bundle", () => {
    const action = adaptiveAction("3000000");
    const plan = createAdaptiveEvidencePlan(action);
    const inputs = plan.requirements.map(
      (requirement) => ({
        evidence:
          adaptiveEvidence(
            action,
            requirement.intent
          ),
        paymentAmountRaw: "10000",
        paymentNetwork: "eip155:84532",
        paymentAsset: BASE_SEPOLIA_USDC
      })
    );

    const first = createEvidenceBundle(
      action,
      plan,
      inputs,
      {
        now: new Date(
          "2026-09-02T18:00:00.000Z"
        )
      }
    );
    const second = createEvidenceBundle(
      action,
      plan,
      [...inputs].reverse(),
      {
        now: new Date(
          "2026-09-02T18:00:00.000Z"
        )
      }
    );

    expect(first.bundleHash).toBe(
      second.bundleHash
    );
    expect(first.totalEvidenceSpendRaw).toBe(
      "20000"
    );
    expect(verifyEvidenceBundle(first)).toBe(true);
  });

  it("rejects duplicate Intent evidence", () => {
    const action = adaptiveAction("3000000");
    const plan = createAdaptiveEvidencePlan(action);
    const evidence = adaptiveEvidence(
      action,
      "FRAUD_DETECTION"
    );

    expect(() =>
      createEvidenceBundle(
        action,
        plan,
        [
          { evidence },
          { evidence }
        ]
      )
    ).toThrow(/duplicate_evidence_intent/);
  });

  it("rejects exact subject and chain substitution", () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);

    expect(() =>
      createEvidenceBundle(
        action,
        plan,
        [
          {
            evidence: adaptiveEvidence(
              action,
              "FRAUD_DETECTION",
              {
                subject:
                  "0x1111111111111111111111111111111111111111"
              }
            )
          }
        ]
      )
    ).toThrow("evidence_bundle_subject_mismatch");

    expect(() =>
      createEvidenceBundle(
        action,
        plan,
        [
          {
            evidence: adaptiveEvidence(
              action,
              "FRAUD_DETECTION",
              { chainId: 1 }
            )
          }
        ]
      )
    ).toThrow("evidence_bundle_chain_mismatch");
  });

  it("detects item and total-spend tampering", () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    const bundle = createEvidenceBundle(
      action,
      plan,
      [
        {
          evidence: adaptiveEvidence(
            action,
            "FRAUD_DETECTION"
          ),
          paymentAmountRaw: "10000",
          paymentNetwork: "eip155:84532",
          paymentAsset: BASE_SEPOLIA_USDC
        }
      ]
    );

    const itemTamper = structuredClone(bundle);
    itemTamper.items[0].signalHash =
      `0x${"f".repeat(64)}`;
    expect(
      verifyEvidenceBundle(itemTamper)
    ).toBe(false);

    const spendTamper = structuredClone(bundle);
    spendTamper.totalEvidenceSpendRaw = "1";
    rehash(spendTamper);

    expect(
      verifyEvidenceBundle(
        spendTamper as EvidenceBundle
      )
    ).toBe(false);
  });

  it("rejects self-consistent paid evidence outside the approved x402 lane", () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    const bundle = createEvidenceBundle(
      action,
      plan,
      [
        {
          evidence: adaptiveEvidence(
            action,
            "FRAUD_DETECTION"
          ),
          paymentAmountRaw: "10000",
          paymentNetwork: "eip155:84532",
          paymentAsset: BASE_SEPOLIA_USDC
        }
      ]
    );

    const wrongNetwork = structuredClone(bundle);
    wrongNetwork.items[0].payment.network = "eip155:1";
    rehash(wrongNetwork);
    expect(verifyEvidenceBundle(wrongNetwork)).toBe(false);

    const wrongAsset = structuredClone(bundle);
    wrongAsset.items[0].payment.asset =
      "0x1111111111111111111111111111111111111111";
    rehash(wrongAsset);
    expect(verifyEvidenceBundle(wrongAsset)).toBe(false);

    const overPerRequestCap = structuredClone(bundle);
    overPerRequestCap.items[0].payment.amountRaw = "10001";
    overPerRequestCap.totalEvidenceSpendRaw = "10001";
    rehash(overPerRequestCap);
    expect(verifyEvidenceBundle(overPerRequestCap)).toBe(false);
  });

  it("rejects malformed evidence hashes even when the bundle is rehashed", () => {
    const action = adaptiveAction("1000000");
    const plan = createAdaptiveEvidencePlan(action);
    const bundle = createEvidenceBundle(
      action,
      plan,
      [
        {
          evidence: adaptiveEvidence(
            action,
            "FRAUD_DETECTION"
          ),
          paymentAmountRaw: "10000",
          paymentNetwork: "eip155:84532",
          paymentAsset: BASE_SEPOLIA_USDC
        }
      ]
    );

    const malformedSignal = structuredClone(bundle);
    malformedSignal.items[0].signalHash = "not-a-hash";
    rehash(malformedSignal);
    expect(verifyEvidenceBundle(malformedSignal)).toBe(false);

    const malformedRaw = structuredClone(bundle);
    malformedRaw.items[0].rawResponseHash = "0x1234";
    rehash(malformedRaw);
    expect(verifyEvidenceBundle(malformedRaw)).toBe(false);
  });
});
