import {
  describe,
  expect,
  it
} from "vitest";

import {
  normalizeTelegraphEvidence
} from "../src/evidence/telegraph.js";
import {
  adaptBoundMinerResultForPolicy,
  validateExplicitEvidenceBinding,
  type TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

const SUBJECT =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const walletRiskMiner: TelegraphMinerRecord = {
  id: "94217603",
  slug: "telegraph-sentinel",
  name: "Telegraph Sentinel",
  activation_status: "active",
  output_schema: {
    properties: {
      wallet: { type: "string" },
      chain: { type: "string" },
      answer: { type: "string" },
      confidence: { type: "number" },
      label: { type: "string" },
      reason: { type: "string" },
      risk_score: { type: "number" }
    }
  },
  signal_mapping: {
    confidence_field: "confidence",
    label_field: "label",
    reason_field: "reason"
  }
};

describe(
  "wallet-risk routed evidence compatibility",
  () => {
    it(
      "accepts schema-declared wallet as an exact subject alias",
      () => {
        const binding =
          validateExplicitEvidenceBinding({
            result: {
              wallet: SUBJECT,
              chain: "base-sepolia",
              label: "SAFE",
              confidence: 0.93,
              risk_score: 0.08
            },
            miner: walletRiskMiner,
            expectedSubject: SUBJECT,
            expectedChainId: 84532
          });

        expect(binding).toMatchObject({
          valid: true,
          subjectField: "wallet",
          chainField: "chain"
        });
      }
    );

    it(
      "can prove chain from declared text after structured wallet is proven",
      () => {
        const miner: TelegraphMinerRecord = {
          ...walletRiskMiner,
          output_schema: {
            properties: {
              wallet: { type: "string" },
              answer: { type: "string" },
              confidence: { type: "number" },
              label: { type: "string" },
              reason: { type: "string" },
              risk_score: { type: "number" }
            }
          }
        };

        const binding =
          validateExplicitEvidenceBinding({
            result: {
              wallet: SUBJECT,
              answer:
                "Wallet risk assessment completed on exact chainId 84532.",
              label: "SAFE",
              confidence: 0.93,
              risk_score: 0.08
            },
            miner,
            expectedSubject: SUBJECT,
            expectedChainId: 84532
          });

        expect(binding).toMatchObject({
          valid: true,
          subjectField: "wallet",
          chainField: "answer:text"
        });
      }
    );

    it(
      "does not let ambiguous structured Base override exact-chain policy",
      () => {
        const binding =
          validateExplicitEvidenceBinding({
            result: {
              wallet: SUBJECT,
              chain: "base",
              answer:
                "Also mentions chainId 84532 in prose.",
              label: "SAFE",
              confidence: 0.93,
              risk_score: 0.08
            },
            miner: walletRiskMiner,
            expectedSubject: SUBJECT,
            expectedChainId: 84532
          });

        expect(binding).toMatchObject({
          valid: false,
          code: "evidence_chain_mismatch"
        });
      }
    );

    it(
      "canonicalizes structured wallet-risk evidence as applicable without creating ALLOW",
      () => {
        const result = {
          wallet: SUBJECT,
          chain: "base-sepolia",
          label: "SAFE",
          reason: "No bounded wallet-risk signals triggered.",
          confidence: 0.93,
          risk_score: 0.08
        };

        const binding =
          validateExplicitEvidenceBinding({
            result,
            miner: walletRiskMiner,
            expectedSubject: SUBJECT,
            expectedChainId: 84532
          });

        if (!binding.valid) {
          throw new Error(binding.code);
        }

        const adapted =
          adaptBoundMinerResultForPolicy(
            result,
            walletRiskMiner,
            binding
          );

        expect(adapted).toMatchObject({
          subject: SUBJECT.toLowerCase(),
          chainId: 84532,
          verdict: "SAFE",
          confidence: 0.93,
          applicability: "APPLICABLE"
        });
      }
    );

    it(
      "normalizes Auctorail-canonical applicability while preserving unknown evidence as fail-closed",
      () => {
        const base = {
          source: "telegraph",
          intent: "FRAUD_DETECTION",
          miner: {
            id: "94217603",
            name: "Telegraph Sentinel",
            slug: "telegraph-sentinel"
          },
          request: {
            endpoint: "/v1/ask",
            target: SUBJECT,
            chainId: 84532
          },
          telegraph: {
            signalHash: "0x" + "a".repeat(64),
            costUsd: 0.01,
            durationMs: 50,
            timestamp: "2026-09-01T22:30:00.000Z"
          },
          capturedAt: {
            startedAt: "2026-09-01T22:29:59.000Z",
            finishedAt: "2026-09-01T22:30:00.000Z"
          },
          rawResponse: {}
        };

        const applicable =
          normalizeTelegraphEvidence({
            ...base,
            result: {
              subject: SUBJECT,
              chainId: 84532,
              verdict: "SAFE",
              confidence: 0.93,
              applicability: "APPLICABLE"
            }
          });

        const unknown =
          normalizeTelegraphEvidence({
            ...base,
            result: {
              subject: SUBJECT,
              chainId: 84532,
              verdict: "SAFE",
              confidence: 0.93
            }
          });

        expect(applicable.applicability).toBe(
          "APPLICABLE"
        );
        expect(unknown.applicability).toBe(
          "UNKNOWN"
        );
      }
    );
  }
);
