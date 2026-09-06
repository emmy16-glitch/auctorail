import type {
  TelegraphVerificationPlan
} from "./verification-planner.js";

export interface TelegraphEngineAskContext {
  query: string;
  intent: TelegraphVerificationPlan["requiredIntent"];
  address: string;
  wallet: string;
  target: string;
  chainId: number;
  network: "eip155:84532";
  amountRaw: string;
  actionHash: string;
  applicability: "EXACT_TARGET_AND_ACTION";
}

export interface TelegraphEngineAskBody {
  [key: string]: unknown;
  query: string;
  context: TelegraphEngineAskContext;
}

export function buildTelegraphEngineAskBody(
  plan: TelegraphVerificationPlan
): TelegraphEngineAskBody {
  return {
    query: plan.query,
    context: {
      // Telegraph's Engine merges caller context into the LLM-built Miner
      // request body. These values are routing/request hints only.
      //
      // CRITICAL: Auctorail never treats this context as returned evidence.
      // The selected Miner must still explicitly assert subject + chain in its
      // result before evidence can be normalized or authorize anything.
      query: plan.query,
      intent: plan.requiredIntent,
      address: plan.subject,
      wallet: plan.subject,
      target: plan.subject,
      chainId: plan.chainId,
      network: plan.network,
      amountRaw: plan.amountRaw,
      actionHash: plan.actionHash,
      applicability: "EXACT_TARGET_AND_ACTION"
    }
  };
}
