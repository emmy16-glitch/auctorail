import type {
  AdaptiveEvidenceIntent,
  AdaptiveEvidencePlan
} from "./adaptive-evidence-plan.js";
import type {
  TelegraphMinerRecord
} from "./routed-evidence.js";

export interface IntentCoverage {
  intent: AdaptiveEvidenceIntent;
  activeMinerCount: number;
  minerSlugs: string[];
}

export function activeMinersForIntent(
  miners: TelegraphMinerRecord[],
  intent: AdaptiveEvidenceIntent
): TelegraphMinerRecord[] {
  return miners.filter(
    (miner) =>
      miner.activation_status === "active" &&
      miner.supported_intents?.includes(intent)
  );
}

export function describeIntentCoverage(
  miners: TelegraphMinerRecord[],
  plan: AdaptiveEvidencePlan
): IntentCoverage[] {
  return plan.requirements.map(
    (requirement) => {
      const active =
        activeMinersForIntent(
          miners,
          requirement.intent
        );

      return {
        intent: requirement.intent,
        activeMinerCount: active.length,
        minerSlugs:
          active.map((miner) => miner.slug)
      };
    }
  );
}

export function missingIntentCoverage(
  miners: TelegraphMinerRecord[],
  plan: AdaptiveEvidencePlan
): AdaptiveEvidenceIntent[] {
  return describeIntentCoverage(
    miners,
    plan
  )
    .filter(
      (item) => item.activeMinerCount === 0
    )
    .map((item) => item.intent);
}

export function servingMinerSupportsIntent(
  miner: TelegraphMinerRecord | null,
  intent: AdaptiveEvidenceIntent
): boolean {
  return Boolean(
    miner &&
    miner.activation_status === "active" &&
    miner.supported_intents?.includes(intent)
  );
}
