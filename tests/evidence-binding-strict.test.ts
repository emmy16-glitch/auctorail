import { describe, expect, it } from "vitest";

import {
  normalizeTelegraphEvidence
} from "../src/evidence/telegraph.js";

const TARGET = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

function baseEvidence() {
  return {
    source: "telegraph",
    intent: "FRAUD_DETECTION",
    miner: {
      id: "10002",
      name: "Test Miner",
      slug: "test-miner"
    },
    request: {
      endpoint: "/v1/ask",
      target: TARGET,
      chainId: 84532
    },
    telegraph: {
      signalHash: "0x" + "1".repeat(64),
      costUsd: 0.01,
      durationMs: 10,
      timestamp: "2026-09-01T21:00:00.000Z"
    },
    capturedAt: {
      startedAt: "2026-09-01T20:59:59.000Z",
      finishedAt: "2026-09-01T21:00:00.000Z"
    },
    rawResponse: {}
  };
}

describe("strict Telegraph evidence binding", () => {
  it("refuses to turn request metadata into evidence binding", () => {
    expect(() =>
      normalizeTelegraphEvidence({
        ...baseEvidence(),
        result: {
          confidence: 0.95,
          verdict: "ALLOW"
        }
      })
    ).toThrow();
  });

  it("accepts explicit canonical Miner subject and chain", () => {
    const evidence = normalizeTelegraphEvidence({
      ...baseEvidence(),
      result: {
        subject: TARGET,
        chainId: 84532,
        confidence: 0.95,
        verdict: "ALLOW"
      }
    });

    expect(evidence.subject.toLowerCase()).toBe(TARGET.toLowerCase());
    expect(evidence.chainId).toBe(84532);
  });
});
