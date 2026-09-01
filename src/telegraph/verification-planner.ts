import type { ActionContract } from "../core/action-contract.js";

export const PAYMENT_FRAUD_INTENT = "FRAUD_DETECTION" as const;

export interface TelegraphVerificationPlan {
  schemaVersion: "proofgate.verification-plan.v1";
  routeMode: "AUTO_ROUTE";
  actionId: string;
  actionHash: string;
  requiredIntent: typeof PAYMENT_FRAUD_INTENT;
  subject: string;
  chainId: number;
  query: string;
  requiredBindings: {
    subject: true;
    chainId: true;
    signalHash: true;
  };
}

export function createPaymentVerificationPlan(
  action: ActionContract
): TelegraphVerificationPlan {
  if (action.type !== "payment") {
    throw new Error("unsupported_action_type");
  }

  const subject = action.payload.destination;
  const chainId = action.payload.chainId;

  const query = [
    `Intent: ${PAYMENT_FRAUD_INTENT}.`,
    "Assess the proposed payment destination before autonomous execution.",
    `Exact EVM subject: ${subject}.`,
    `Exact chainId: ${chainId}.`,
    "Return verifiable fraud/risk intelligence that is explicitly bound to this exact subject and chain.",
    "For contract destinations, assess contract-control risk including whether it is a contract and whether privileged upgrade, admin, owner, or pause controls are present when your capability supports those checks.",
    "Do not assess a different address or chain."
  ].join(" ");

  return {
    schemaVersion: "proofgate.verification-plan.v1",
    routeMode: "AUTO_ROUTE",
    actionId: action.id,
    actionHash: action.actionHash,
    requiredIntent: PAYMENT_FRAUD_INTENT,
    subject,
    chainId,
    query,
    requiredBindings: {
      subject: true,
      chainId: true,
      signalHash: true
    }
  };
}
