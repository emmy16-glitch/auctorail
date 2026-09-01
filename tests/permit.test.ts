import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";

import {
  loadTelegraphEvidence,
  type TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";

import {
  evaluatePaymentsStrictV1,
  type DecisionRecord
} from "../src/policy/payments-strict-v1.js";

import {
  mintPermit,
  verifyPermit
} from "../src/permit/permit.js";

const SECRET =
  "proofgate-unit-test-secret-" +
  "a".repeat(64);

function latestEvidence():
  TelegraphEvidenceRecord {
  const directory =
    path.join(
      process.cwd(),
      "data",
      "evidence"
    );

  const file =
    fs.readdirSync(directory)
      .filter(
        (name) =>
          name.endsWith(".json")
      )
      .sort()
      .at(-1);

  if (!file) {
    throw new Error(
      "Real Telegraph evidence missing"
    );
  }

  return loadTelegraphEvidence(
    path.join(
      directory,
      file
    )
  );
}

function createAction(
  destination: string,
  amountRaw =
    "5000000"
) {
  return createActionContract({
    type: "payment",

    chainId:
      BASE_SEPOLIA_CHAIN_ID,

    token:
      BASE_SEPOLIA_USDC,

    amountRaw,

    destination,

    reason:
      "Invoice INV-1042",

    policyId:
      "payments.strict.v1"
  });
}

function unitAllowDecision(
  actionId: string,
  now: Date
): DecisionRecord {
  // Cryptographic unit-test fixture only.
  // This is NOT presented as real Telegraph evidence.
  return {
    actionId,

    decision:
      "ALLOW",

    reason:
      "all_required_checks_passed",

    policyId:
      "payments.strict.v1",

    checks: [
      {
        name:
          "unit_test_policy",
        status:
          "PASS",
        reason:
          "Cryptographic permit test."
      }
    ],

    decidedAt:
      now.toISOString()
  };
}

describe(
  "ProofGate exact-action permits",
  () => {
    it(
      "does not mint a permit for the real HOLD decision",
      () => {
        const evidence =
          latestEvidence();

        const action =
          createAction(
            evidence.subject
          );

        const now =
          new Date(
            new Date(
              evidence.receivedAt
            ).getTime() +
              1000
          );

        const decision =
          evaluatePaymentsStrictV1(
            action,
            evidence,
            { now }
          );

        expect(
          decision.decision
        ).toBe("HOLD");

        expect(() =>
          mintPermit(
            action,
            evidence,
            decision,
            SECRET,
            { now }
          )
        ).toThrow(
          "decision_not_allow"
        );
      }
    );

    it(
      "mints and verifies an exact-action permit for ALLOW",
      () => {
        const evidence =
          latestEvidence();

        const now =
          new Date(
            "2026-09-01T18:30:00.000Z"
          );

        const action =
          createAction(
            evidence.subject
          );

        const decision =
          unitAllowDecision(
            action.id,
            now
          );

        const permit =
          mintPermit(
            action,
            evidence,
            decision,
            SECRET,
            {
              now,
              ttlSeconds: 30
            }
          );

        const result =
          verifyPermit(
            permit,
            action,
            evidence,
            decision,
            SECRET,
            {
              now:
                new Date(
                  now.getTime() +
                    5000
                )
            }
          );

        expect(
          result
        ).toEqual({
          valid: true,
          code:
            "permit_valid"
        });

        expect(
          permit.payload.actionHash
        ).toBe(
          action.actionHash
        );
      }
    );

    it(
      "blocks amount mutation",
      () => {
        const evidence =
          latestEvidence();

        const now =
          new Date(
            "2026-09-01T18:30:00.000Z"
          );

        const approved =
          createAction(
            evidence.subject,
            "5000000"
          );

        const decision =
          unitAllowDecision(
            approved.id,
            now
          );

        const permit =
          mintPermit(
            approved,
            evidence,
            decision,
            SECRET,
            { now }
          );

        const tampered =
          createAction(
            evidence.subject,
            "15000000"
          );

        const result =
          verifyPermit(
            permit,
            tampered,
            evidence,
            decision,
            SECRET,
            {
              now:
                new Date(
                  now.getTime() +
                    1000
                )
            }
          );

        expect(
          result.code
        ).toBe(
          "action_hash_mismatch"
        );
      }
    );

    it(
      "rejects an expired permit",
      () => {
        const evidence =
          latestEvidence();

        const now =
          new Date(
            "2026-09-01T18:30:00.000Z"
          );

        const action =
          createAction(
            evidence.subject
          );

        const decision =
          unitAllowDecision(
            action.id,
            now
          );

        const permit =
          mintPermit(
            action,
            evidence,
            decision,
            SECRET,
            {
              now,
              ttlSeconds: 30
            }
          );

        const result =
          verifyPermit(
            permit,
            action,
            evidence,
            decision,
            SECRET,
            {
              now:
                new Date(
                  now.getTime() +
                    31_000
                )
            }
          );

        expect(
          result.code
        ).toBe(
          "permit_expired"
        );
      }
    );

    it(
      "detects evidence or decision mutation",
      () => {
        const evidence =
          latestEvidence();

        const now =
          new Date(
            "2026-09-01T18:30:00.000Z"
          );

        const action =
          createAction(
            evidence.subject
          );

        const decision =
          unitAllowDecision(
            action.id,
            now
          );

        const permit =
          mintPermit(
            action,
            evidence,
            decision,
            SECRET,
            { now }
          );

        const changedEvidence = {
          ...evidence,
          signalHash:
            "0x" +
            "f".repeat(64)
        };

        const result =
          verifyPermit(
            permit,
            action,
            changedEvidence,
            decision,
            SECRET,
            {
              now:
                new Date(
                  now.getTime() +
                    1000
                )
            }
          );

        expect(
          result.code
        ).toBe(
          "decision_hash_mismatch"
        );
      }
    );
  }
);
