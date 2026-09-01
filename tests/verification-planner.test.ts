import { describe, expect, it } from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  PAYMENT_FRAUD_INTENT,
  createPaymentVerificationPlan
} from "../src/telegraph/verification-planner.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

function action() {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "1000000",
    destination: VENDOR,
    reason: "Invoice INV-1042",
    policyId: "payments.strict.v1"
  });
}

describe("Telegraph verification planner", () => {
  it("plans the flagship payment by intent instead of by miner", () => {
    const proposed = action();
    const plan = createPaymentVerificationPlan(proposed);

    expect(plan.routeMode).toBe("AUTO_ROUTE");
    expect(plan.requiredIntent).toBe(PAYMENT_FRAUD_INTENT);
    expect(plan).not.toHaveProperty("minerId");
    expect(plan).not.toHaveProperty("minerSlug");
  });

  it("binds the routed request to the exact action target and chain", () => {
    const proposed = action();
    const plan = createPaymentVerificationPlan(proposed);

    expect(plan.actionId).toBe(proposed.id);
    expect(plan.actionHash).toBe(proposed.actionHash);
    expect(plan.subject).toBe(proposed.payload.destination);
    expect(plan.chainId).toBe(proposed.payload.chainId);
    expect(plan.query).toContain(proposed.payload.destination);
    expect(plan.query).toContain(String(proposed.payload.chainId));
  });

  it("asks routed Telegraph for measurable machine-bindable evidence", () => {
    const plan = createPaymentVerificationPlan(action());

    expect(plan.query).toContain("live on-chain measurements");
    expect(plan.query).toContain("generic LLM-only speculation");
    expect(plan.query).toContain("schema-declared signal field");
    expect(plan.query).toContain("numeric confidence");
  });

  it("requires explicit evidence bindings and a Telegraph signal hash", () => {
    const plan = createPaymentVerificationPlan(action());

    expect(plan.requiredBindings).toEqual({
      subject: true,
      chainId: true,
      signalHash: true
    });
  });

  it("changes actionHash when the proposed destination changes", () => {
    const first = action();
    const second = createActionContract({
      type: "payment",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      token: BASE_SEPOLIA_USDC,
      amountRaw: "1000000",
      destination: "0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8",
      reason: "Invoice INV-1042",
      policyId: "payments.strict.v1"
    });

    expect(createPaymentVerificationPlan(first).actionHash).not.toBe(
      createPaymentVerificationPlan(second).actionHash
    );
  });
});
