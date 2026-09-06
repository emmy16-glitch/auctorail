import {
  describe,
  expect,
  it
} from "vitest";

import {
  runAttackLab
} from "../src/security/attack-lab.js";

describe(
  "Auctorail deterministic Attack Lab",
  () => {
    it(
      "contains every locked mutation/replay/integrity attack without network or blockchain writes",
      async () => {
        const report =
          await runAttackLab();

        expect(
          report.baselineDecision
        ).toBe(
          "ALLOW"
        );

        expect(
          report.total
        ).toBe(
          10
        );

        expect(
          report.allPassed
        ).toBe(
          true
        );

        expect(
          report.scenarios.map(
            (item) => [
              item.id,
              item.observed
            ]
          )
        ).toEqual([
          [
            "baseline",
            "EXECUTED:1"
          ],
          [
            "permit_replay",
            "permit_already_consumed:1"
          ],
          [
            "amount_mutation",
            "action_hash_mismatch"
          ],
          [
            "evidence_subject_swap",
            "evidence_binding_mismatch"
          ],
          [
            "permit_forgery",
            "invalid_permit_signature"
          ],
          [
            "expired_permit",
            "permit_expired"
          ],
          [
            "decision_tamper",
            "decision_hash_mismatch"
          ],
          [
            "mandate_substitution",
            "mandate_hash_mismatch"
          ],
          [
            "negative_miner",
            "BLOCK:miner_result"
          ],
          [
            "runtime_attestation_tamper",
            "BLOCK:vendor_runtime_attestation"
          ],
          [
            "receipt_tamper",
            "false"
          ]
        ]);
      }
    );
  }
);
