import type {
  TelegraphVerificationPlan
} from "./verification-planner.js";

export interface TelegraphEngineAskContext {
  query: string;
  address: string;
  wallet: string;
  chainId: number;
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
      // CRITICAL: ProofGate never treats this context as returned evidence.
      // The selected Miner must still explicitly assert subject + chain in its
      // result before evidence can be normalized or authorize anything.
      query: plan.query,
      address: plan.subject,
      wallet: plan.subject,
      chainId: plan.chainId
    }
  };
}
