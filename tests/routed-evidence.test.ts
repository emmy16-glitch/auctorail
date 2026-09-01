import { describe, expect, it } from "vitest";

import {
  canonicalizeBoundMinerResult,
  proofExitCode,
  resolveServingMiner,
  validateExplicitEvidenceBinding,
  type TelegraphMinerRecord
} from "../src/telegraph/routed-evidence.js";

const SUBJECT = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const miner: TelegraphMinerRecord = {
  id: "10002",
  slug: "degenlens-onchain",
  name: "DegenLens On-Chain Intelligence",
  activation_status: "active",
  output_schema: {
    properties: {
      address: { type: "string" },
      chain: { type: "string" },
      confidence: { type: "number" }
    }
  }
};

describe("Telegraph routed evidence hardening", () => {
  it("resolves official Engine miner_used provenance", () => {
    const resolved = resolveServingMiner(
      {
        miner_used: "degenlens-onchain",
        miner_name: "DegenLens On-Chain Intelligence"
      },
      null,
      [miner]
    );

    expect(resolved).toMatchObject({
      id: "10002",
      slug: "degenlens-onchain",
      name: "DegenLens On-Chain Intelligence"
    });
  });

  it("supports legacy/direct miner_id provenance", () => {
    const resolved = resolveServingMiner(
      {
        miner_id: "10002",
        miner_name: "DegenLens On-Chain Intelligence"
      },
      null,
      [miner]
    );

    expect(resolved?.slug).toBe("degenlens-onchain");
  });

  it("accepts canonical explicit subject and chainId", () => {
    const binding = validateExplicitEvidenceBinding({
      result: { subject: SUBJECT, chainId: 84532 },
      miner: null,
      expectedSubject: SUBJECT,
      expectedChainId: 84532
    });

    expect(binding.valid).toBe(true);
  });

  it("accepts schema-declared address plus exact CAIP-2 network", () => {
    const withNetwork: TelegraphMinerRecord = {
      ...miner,
      output_schema: {
        properties: {
          address: { type: "string" },
          network: { type: "string" }
        }
      }
    };

    const binding = validateExplicitEvidenceBinding({
      result: {
        address: SUBJECT,
        network: "eip155:84532"
      },
      miner: withNetwork,
      expectedSubject: SUBJECT,
      expectedChainId: 84532
    });

    expect(binding).toMatchObject({
      valid: true,
      subjectField: "address",
      chainField: "network",
      chainId: 84532
    });
  });

  it("accepts explicit Base Sepolia when schema-declared", () => {
    const binding = validateExplicitEvidenceBinding({
      result: {
        address: SUBJECT,
        chain: "base-sepolia"
      },
      miner,
      expectedSubject: SUBJECT,
      expectedChainId: 84532
    });

    expect(binding.valid).toBe(true);
  });

  it("does not accept ambiguous base as proof of Base Sepolia", () => {
    const binding = validateExplicitEvidenceBinding({
      result: {
        address: SUBJECT,
        chain: "base"
      },
      miner,
      expectedSubject: SUBJECT,
      expectedChainId: 84532
    });

    expect(binding).toMatchObject({
      valid: false,
      code: "evidence_chain_mismatch"
    });
  });

  it("rejects a different explicit subject", () => {
    const binding = validateExplicitEvidenceBinding({
      result: {
        address: "0x1111111111111111111111111111111111111111",
        chain: "base-sepolia"
      },
      miner,
      expectedSubject: SUBJECT,
      expectedChainId: 84532
    });

    expect(binding).toMatchObject({
      valid: false,
      code: "evidence_subject_mismatch"
    });
  });

  it("does not trust undeclared aliases", () => {
    const undeclared: TelegraphMinerRecord = {
      ...miner,
      output_schema: {
        properties: {
          confidence: { type: "number" }
        }
      }
    };

    const binding = validateExplicitEvidenceBinding({
      result: {
        address: SUBJECT,
        chain: "base-sepolia"
      },
      miner: undeclared,
      expectedSubject: SUBJECT,
      expectedChainId: 84532
    });

    expect(binding).toMatchObject({
      valid: false,
      code: "evidence_subject_not_asserted"
    });
  });

  it("canonicalizes only an already-proven binding", () => {
    const binding = validateExplicitEvidenceBinding({
      result: {
        address: SUBJECT,
        chain: "base-sepolia",
        confidence: 0.95
      },
      miner,
      expectedSubject: SUBJECT,
      expectedChainId: 84532
    });

    if (!binding.valid) throw new Error(binding.code);

    const result = canonicalizeBoundMinerResult(
      {
        address: SUBJECT,
        chain: "base-sepolia",
        confidence: 0.95
      },
      binding
    );

    expect(result.subject).toBe(SUBJECT.toLowerCase());
    expect(result.chainId).toBe(84532);
    expect(result.address).toBe(SUBJECT);
  });

  it("uses non-zero exit codes for non-ALLOW outcomes", () => {
    expect(proofExitCode("ALLOW")).toBe(0);
    expect(proofExitCode("HOLD")).toBe(2);
    expect(proofExitCode("BLOCK")).toBe(3);
  });
});
