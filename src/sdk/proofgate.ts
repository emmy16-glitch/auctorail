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
import {
  collectAdaptiveEvidence,
  type AdaptiveCollectionResult,
  type IntentAcquirer
} from "../telegraph/adaptive-orchestrator.js";
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

export interface TrustedAdaptiveAuthorizationRun {
  action: ActionContract;
  plan: AdaptiveEvidencePlan;
  collection: AdaptiveCollectionResult;
  authorization: AdaptiveAuthorizationResult;
  permit: Permit | null;
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

/**
 * Recommended trusted-host integration.
 *
 * The autonomous agent supplies only its proposed payment. The host supplies
 * the principal-created Mandate, trusted Telegraph Intent acquirer and permit
 * signer. Risk planning, evidence collection, policy evaluation and permit
 * minting happen inside one boundary, so the agent is never asked to provide
 * its own risk tier, Evidence Bundle or ALLOW decision.
 */
export async function authorizePaymentWithEvidence(input: {
  proposal: AdaptivePaymentProposal;
  mandate: MandateContract;
  agentId: string;
  acquire: IntentAcquirer;
  signer: PermitSigner | string;
  policyNow?: Date;
  permitNow?: Date;
  ttlSeconds?: number;
  clock?: () => Date;
}): Promise<TrustedAdaptiveAuthorizationRun> {
  const { action, plan } =
    planPaymentAuthorization(input.proposal);

  const collection =
    await collectAdaptiveEvidence(
      action,
      plan,
      input.acquire,
      input.clock
        ? { now: input.clock }
        : undefined
    );

  const authorization =
    evaluatePaymentAuthorization({
      mandate: input.mandate,
      action,
      plan,
      bundle: collection.bundle,
      agentId: input.agentId,
      ...(input.policyNow
        ? { now: input.policyNow }
        : {})
    });

  let permit: Permit | null = null;

  if (
    collection.status === "COMPLETE" &&
    authorization.decision.decision === "ALLOW"
  ) {
    permit = mintPaymentPermit({
      mandate: input.mandate,
      action,
      bundle: collection.bundle,
      decision: authorization.decision,
      signer: input.signer,
      ...(input.permitNow
        ? { now: input.permitNow }
        : {}),
      ...(input.ttlSeconds !== undefined
        ? { ttlSeconds: input.ttlSeconds }
        : {})
    });
  }

  return {
    action,
    plan,
    collection,
    authorization,
    permit
  };
}
