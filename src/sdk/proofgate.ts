import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract,
  type ActionContract
} from "../core/action-contract.js";
import {
  createMandateContract,
  type MandateContract,
  type MandateContractInput
} from "../core/mandate-contract.js";
import {
  evaluatePaymentsAdaptiveV1
} from "../policy/payments-adaptive-v1.js";
import type {
  DecisionRecord
} from "../policy/payments-strict-v1.js";
import {
  createAdaptiveEvidencePlan,
  type AdaptiveEvidencePlan
} from "../telegraph/adaptive-evidence-plan.js";
import type {
  EvidenceBundle
} from "../telegraph/evidence-bundle.js";
import {
  mintPermit,
  type Permit
} from "../permit/permit.js";
import type {
  PermitSigner
} from "../permit/signer.js";

export interface AdaptivePaymentProposal {
  amountRaw: string;
  destination: string;
  reason: string;
}

export interface PlannedAdaptivePayment {
  action: ActionContract;
  plan: AdaptiveEvidencePlan;
}

export interface AdaptiveAuthorizationResult {
  decision: DecisionRecord;
  counterfactual: string | null;
  evidenceBundleHash: string | null;
}

export function planPaymentAuthorization(
  proposal: AdaptivePaymentProposal
): PlannedAdaptivePayment {
  const action = createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: proposal.amountRaw,
    destination: proposal.destination,
    reason: proposal.reason,
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });

  return {
    action,
    plan:
      createAdaptiveEvidencePlan(action)
  };
}

export function createAdaptivePaymentMandate(
  input: Omit<
    MandateContractInput,
    | "allowedActionTypes"
    | "allowedChainIds"
    | "allowedAssets"
    | "policyId"
    | "policyVersion"
  >
): MandateContract {
  return createMandateContract({
    ...input,
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    policyId: "payments.adaptive.v1",
    policyVersion: 1
  });
}

function counterfactualFromDecision(
  decision: DecisionRecord
): string | null {
  if (decision.decision === "ALLOW") {
    return null;
  }

  const failing = decision.checks.find(
    (item) => item.status !== "PASS"
  );

  if (!failing) {
    return `${decision.decision}: ${decision.reason}`;
  }

  return `${decision.decision}: ${failing.reason}`;
}

export function evaluatePaymentAuthorization(input: {
  mandate: MandateContract;
  action: ActionContract;
  plan: AdaptiveEvidencePlan;
  bundle: EvidenceBundle | null;
  agentId: string;
  now?: Date;
}): AdaptiveAuthorizationResult {
  const decision = evaluatePaymentsAdaptiveV1(
    input.mandate,
    input.action,
    input.plan,
    input.bundle,
    {
      agentId: input.agentId,
      ...(input.now
        ? { now: input.now }
        : {})
    }
  );

  return {
    decision,
    counterfactual:
      counterfactualFromDecision(decision),
    evidenceBundleHash:
      input.bundle?.bundleHash ?? null
  };
}

export function mintPaymentPermit(input: {
  mandate: MandateContract;
  action: ActionContract;
  bundle: EvidenceBundle;
  decision: DecisionRecord;
  signer: PermitSigner | string;
  now?: Date;
  ttlSeconds?: number;
}): Permit {
  return mintPermit(
    input.mandate,
    input.action,
    input.bundle,
    input.decision,
    input.signer,
    {
      ...(input.now
        ? { now: input.now }
        : {}),
      ...(input.ttlSeconds !== undefined
        ? { ttlSeconds: input.ttlSeconds }
        : {})
    }
  );
}
