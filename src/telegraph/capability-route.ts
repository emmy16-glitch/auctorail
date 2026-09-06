import type {
  TelegraphMinerRecord
} from "./routed-evidence.js";

export const CONTRACT_CONTROL_SELECTION_POLICY =
  "proofgate.contract-control.v1" as const;

export const CONTRACT_CONTROL_MINER_SLUG =
  "refut-onchain-risk" as const;

export type CapabilityMinerSelection =
  | {
      selected: true;
      policyId:
        typeof CONTRACT_CONTROL_SELECTION_POLICY;
      miner: TelegraphMinerRecord;
      reason: string;
    }
  | {
      selected: false;
      policyId:
        typeof CONTRACT_CONTROL_SELECTION_POLICY;
      code: "capability_miner_unavailable";
      reason: string;
    };

export function selectContractControlMiner(
  miners: TelegraphMinerRecord[]
): CapabilityMinerSelection {
  const miner =
    miners.find(
      (candidate) =>
        candidate.slug ===
          CONTRACT_CONTROL_MINER_SLUG &&
        candidate.activation_status ===
          "active" &&
        candidate.supported_intents?.includes(
          "FRAUD_DETECTION"
        )
    ) ?? null;

  if (!miner) {
    return {
      selected: false,
      policyId:
        CONTRACT_CONTROL_SELECTION_POLICY,
      code:
        "capability_miner_unavailable",
      reason:
        "No active Telegraph Miner satisfies Auctorail's locked v1 contract-control evidence profile."
    };
  }

  return {
    selected: true,
    policyId:
      CONTRACT_CONTROL_SELECTION_POLICY,
    miner,
    reason:
      "Selected by deterministic Auctorail evidence requirements: active FRAUD_DETECTION contract-control Miner with exact address + chainId request semantics."
  };
}
