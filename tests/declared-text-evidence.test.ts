import {
  describe,
  expect,
  it
} from "vitest";

import {
  adaptBoundMinerResultForPolicy,
  validateExplicitEvidenceBinding,
  type TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

const SUBJECT =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const chainsight: TelegraphMinerRecord = {
  id: "302",
  slug: "chainsight-oracle",
  name:
    "ChainSight — On-Chain Intelligence Hub",
  activation_status:
    "active",
  output_schema: {
    properties: {
      signal: {
        type: "string"
      },
      source: {
        type: "string"
      }
    }
  },
  signal_mapping: {
    label_field:
      "signal",
    reason_field:
      "source"
  }
};

function signal(
  subject = SUBJECT,
  chainId = 84532
): string {
  return (
    "Probability of fraud or honeypot: 0.62 (62% risk). " +
    `The exact EVM subject ${subject.toLowerCase()} on chainId ${chainId} ` +
    "is treated as unverified/suspicious. High risk."
  );
}

describe(
  "schema-declared text evidence binding",
  () => {
    it(
      "binds exact subject and chain from a declared signal field",
      () => {
        const binding =
          validateExplicitEvidenceBinding({
            result: {
              signal:
                signal(),
              source:
                "llm"
            },
            miner:
              chainsight,
            expectedSubject:
              SUBJECT,
            expectedChainId:
              84532
          });

        expect(binding).toMatchObject({
          valid:
            true,
          subject:
            SUBJECT.toLowerCase(),
          chainId:
            84532,
          subjectField:
            "signal:text",
          chainField:
            "signal:text"
        });
      }
    );

    it(
      "rejects a different exact address in declared text",
      () => {
        const binding =
          validateExplicitEvidenceBinding({
            result: {
              signal:
                signal(
                  "0x1111111111111111111111111111111111111111"
                ),
              source:
                "llm"
            },
            miner:
              chainsight,
            expectedSubject:
              SUBJECT,
            expectedChainId:
              84532
          });

        expect(binding).toMatchObject({
          valid:
            false,
          code:
            "evidence_subject_mismatch"
        });
      }
    );

    it(
      "rejects a different exact chainId in declared text",
      () => {
        const binding =
          validateExplicitEvidenceBinding({
            result: {
              signal:
                signal(
                  SUBJECT,
                  1
                ),
              source:
                "llm"
            },
            miner:
              chainsight,
            expectedSubject:
              SUBJECT,
            expectedChainId:
              84532
          });

        expect(binding).toMatchObject({
          valid:
            false,
          code:
            "evidence_chain_mismatch"
        });
      }
    );

    it(
      "does not scan an undeclared arbitrary answer field",
      () => {
        const binding =
          validateExplicitEvidenceBinding({
            result: {
              answer:
                signal(),
              source:
                "llm"
            },
            miner:
              chainsight,
            expectedSubject:
              SUBJECT,
            expectedChainId:
              84532
          });

        expect(binding).toMatchObject({
          valid:
            false,
          code:
            "evidence_subject_not_asserted"
        });
      }
    );

    it(
      "maps a registered label field only after exact binding succeeds",
      () => {
        const result = {
          signal:
            signal(),
          source:
            "llm"
        };

        const binding =
          validateExplicitEvidenceBinding({
            result,
            miner:
              chainsight,
            expectedSubject:
              SUBJECT,
            expectedChainId:
              84532
          });

        if (!binding.valid) {
          throw new Error(binding.code);
        }

        const adapted =
          adaptBoundMinerResultForPolicy(
            result,
            chainsight,
            binding
          );

        expect(
          adapted.subject
        ).toBe(
          SUBJECT.toLowerCase()
        );
        expect(
          adapted.chainId
        ).toBe(84532);
        expect(
          adapted.verdict
        ).toBe(
          result.signal
        );
        expect(
          adapted.reasoning
        ).toBe("llm");
      }
    );
  }
);
