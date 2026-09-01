import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findLatestMatchingTelegraphEvidence
} from "../src/evidence/evidence-store.js";

const directories: string[] = [];

function makeDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "proofgate-evidence-"));
  directories.push(directory);
  return directory;
}

function savedEvidence(target: string, finishedAt: string) {
  return {
    schemaVersion: "proofgate.telegraph-evidence.v1",
    source: "telegraph",
    intent: "FRAUD_DETECTION",
    miner: {
      id: "95822412",
      name: "Refut On-Chain Risk",
      slug: "refut-onchain-risk"
    },
    request: {
      endpoint: "/assess",
      target,
      chainId: 84532
    },
    result: {
      chainId: 84532,
      confidence: 0.9,
      reasoning: "contract assessment",
      subject: target,
      verdict: "ALLOW",
      signals: [
        { key: "isContract", present: true }
      ]
    },
    telegraph: {
      signalHash: "0x" + "a".repeat(64),
      costUsd: 0.01,
      durationMs: 100,
      timestamp: finishedAt
    },
    capturedAt: {
      startedAt: finishedAt,
      finishedAt
    },
    rawResponse: {
      signal_hash: "0x" + "a".repeat(64)
    }
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("exact-target Telegraph evidence lookup", () => {
  it("never substitutes newer evidence for a different target", () => {
    const directory = makeDirectory();
    const oldTarget = "0xaFb077A0869c6B5bD3DC2aAF7aBb2f971Eb53d08";
    const vendor = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

    fs.writeFileSync(
      path.join(directory, "telegraph-2026-09-01T17-00-00.json"),
      JSON.stringify(savedEvidence(vendor, "2026-09-01T17:00:00.000Z"))
    );

    fs.writeFileSync(
      path.join(directory, "telegraph-2026-09-01T18-00-00.json"),
      JSON.stringify(savedEvidence(oldTarget, "2026-09-01T18:00:00.000Z"))
    );

    const match = findLatestMatchingTelegraphEvidence(
      directory,
      vendor,
      84532
    );

    expect(match?.evidence.subject.toLowerCase()).toBe(vendor.toLowerCase());
    expect(match?.filePath.endsWith("17-00-00.json")).toBe(true);
  });

  it("returns null when no evidence is bound to the requested target", () => {
    const directory = makeDirectory();

    fs.writeFileSync(
      path.join(directory, "telegraph.json"),
      JSON.stringify(
        savedEvidence(
          "0xaFb077A0869c6B5bD3DC2aAF7aBb2f971Eb53d08",
          "2026-09-01T17:00:00.000Z"
        )
      )
    );

    expect(
      findLatestMatchingTelegraphEvidence(
        directory,
        "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
        84532
      )
    ).toBeNull();
  });
});
