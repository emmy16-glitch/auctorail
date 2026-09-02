import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  createMandateContract,
  evaluateMandate,
  type MandateContractInput
} from "../src/core/mandate-contract.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const OTHER = "0x1111111111111111111111111111111111111111";
const OTHER_ASSET = "0x2222222222222222222222222222222222222222";
const NOW = new Date("2026-09-01T20:00:00.000Z");

function mandateInput(
  overrides: Partial<MandateContractInput> = {}
): MandateContractInput {
  return {
    mandateId: "treasury-demo-v1",
    principalId: "company-demo",
    agentId: "procurement-agent",
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    allowedDestinations: [VENDOR],
    maxPerActionRaw: "10000000",
    requiredIntents: ["FRAUD_DETECTION"],
    policyId: "payments.strict.v1",
    issuedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-08T01:00:00.000Z",
    version: 1,
    ...overrides
  };
}

function action(amountRaw = "1000000") {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw,
    destination: VENDOR,
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

describe("ProofGate Mandate Contract", () => {
  it("normalizes equivalent authority into the same mandateHash", () => {
    const first = createMandateContract(mandateInput());
    const second = createMandateContract(
      mandateInput({
        allowedActionTypes: ["payment", "payment"],
        allowedChainIds: [BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID],
        allowedAssets: [BASE_SEPOLIA_USDC.toLowerCase(), BASE_SEPOLIA_USDC],
        allowedDestinations: [VENDOR.toLowerCase(), VENDOR],
        requiredIntents: ["fraud_detection", "FRAUD_DETECTION"],
        issuedAt: "2026-09-01T00:00:00Z",
        expiresAt: "2026-09-08T01:00:00Z"
      })
    );

    expect(first.canonicalMandate).toBe(second.canonicalMandate);
    expect(first.mandateHash).toBe(second.mandateHash);
    expect(first.mandateHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes mandateHash for every authority-changing field", () => {
    const base = createMandateContract(mandateInput());
    const variants = [
      mandateInput({ allowedDestinations: [OTHER] }),
      mandateInput({ maxPerActionRaw: "9000000" }),
      mandateInput({ allowedChainIds: [1] }),
      mandateInput({ allowedAssets: [OTHER_ASSET] }),
      mandateInput({ agentId: "another-agent" }),
      mandateInput({ expiresAt: "2026-09-07T01:00:00.000Z" }),
      mandateInput({ requiredIntents: ["OTHER_INTENT"] }),
      mandateInput({ version: 2 })
    ];

    for (const input of variants) {
      expect(createMandateContract(input).mandateHash).not.toBe(base.mandateHash);
    }
  });

  it("rejects malformed addresses, decimal amounts and invalid time bounds", () => {
    expect(() =>
      createMandateContract(mandateInput({ allowedDestinations: ["not-an-address"] }))
    ).toThrow();

    expect(() =>
      createMandateContract(mandateInput({ maxPerActionRaw: "1.5" }))
    ).toThrow();

    expect(() =>
      createMandateContract(
        mandateInput({
          issuedAt: "2026-09-08T00:00:00.000Z",
          expiresAt: "2026-09-01T00:00:00.000Z"
        })
      )
    ).toThrow("mandate_expires_before_or_at_issue_time");
  });

  it("binds policy version and blocks mismatches", () => {
    const delegated = createMandateContract(mandateInput({ policyVersion: 2 }));
    const result = evaluateMandate(delegated, action(), "procurement-agent", NOW);
    expect(delegated.policyVersion).toBe(2);
    expect(result.valid).toBe(false);
    expect(result.checks.find((item) => item.code === "mandate_policy_version_violation")?.status).toBe("BLOCK");
  });

  it("fails closed for revoked and explicitly expired mandates", () => {
    const revoked = evaluateMandate(
      createMandateContract(mandateInput({ status: "REVOKED" })),
      action(),
      "procurement-agent",
      NOW
    );
    expect(revoked.valid).toBe(false);
    expect(revoked.checks[0].code).toBe("mandate_revoked");

    const expired = evaluateMandate(
      createMandateContract(mandateInput({ status: "EXPIRED" })),
      action(),
      "procurement-agent",
      NOW
    );
    expect(expired.valid).toBe(false);
    expect(expired.checks.find((item) => item.name === "mandate_active")?.code).toBe("mandate_expired");
  });

  it("passes an exact action inside delegated authority", () => {
    const result = evaluateMandate(
      createMandateContract(mandateInput()),
      action(),
      "procurement-agent",
      NOW
    );

    expect(result.valid).toBe(true);
    expect(result.checks.every((item) => item.status === "PASS")).toBe(true);
  });

  const violationCases: Array<[
    string,
    Partial<MandateContractInput>,
    string
  ]> = [
    ["wrong destination", { allowedDestinations: [OTHER] }, "mandate_destination_violation"],
    ["excessive amount", { maxPerActionRaw: "500000" }, "mandate_amount_violation"],
    ["wrong token", { allowedAssets: [OTHER_ASSET] }, "mandate_asset_violation"],
    ["wrong chain", { allowedChainIds: [1] }, "mandate_chain_violation"],
    ["wrong policy intent", { requiredIntents: ["OTHER_INTENT"] }, "mandate_required_intent_violation"]
  ];

  it.each(violationCases)("blocks %s", (_name, override, expectedCode) => {
    const result = evaluateMandate(
      createMandateContract(mandateInput(override)),
      action(),
      "procurement-agent",
      NOW
    );

    expect(result.valid).toBe(false);
    expect(result.checks.find((item) => item.code === expectedCode)?.status).toBe("BLOCK");
  });

  it("blocks a mandate object mutated after hashing", () => {
    const delegated = createMandateContract(mandateInput());
    const tampered = {
      ...delegated,
      allowedDestinations: [OTHER]
    };
    const result = evaluateMandate(
      tampered,
      action(),
      "procurement-agent",
      NOW
    );

    expect(result.valid).toBe(false);
    expect(result.checks[0].code).toBe("mandate_integrity_violation");
  });

  it("blocks the wrong agent and expired mandates", () => {
    const active = createMandateContract(mandateInput());
    const wrongAgent = evaluateMandate(active, action(), "attacker-agent", NOW);

    expect(
      wrongAgent.checks.find((item) => item.name === "mandate_agent")?.code
    ).toBe("mandate_agent_violation");

    const expired = evaluateMandate(
      active,
      action(),
      "procurement-agent",
      new Date("2026-09-09T00:00:00.000Z")
    );

    expect(
      expired.checks.find((item) => item.name === "mandate_active")?.code
    ).toBe("mandate_expired");
  });
});
