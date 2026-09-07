import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  runAttackLab
} from "../src/security/attack-lab.js";

describe(
  "Auctorail deterministic Attack Lab",
  () => {
    it("runs with production signer restrictions and no network", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Lab must stay offline"));
      try {
        expect((await runAttackLab()).allPassed).toBe(true);
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
        vi.unstubAllEnvs();
      }
    });
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
          13
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
          ],
          ["recipient_mutation", "BLOCK:mandate_destination_violation:no_permit"],
          ["expired_permission", "BLOCK:mandate_expired:no_permit"],
          ["missing_evidence", "HOLD:telegraph_evidence:no_permit"]
        ]);
      }
    );
  }
);
