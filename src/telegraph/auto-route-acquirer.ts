import {
  createLiveIntentAcquirer,
  type LiveIntentAcquisitionResult,
  type LiveIntentClientOptions
} from "./live-intent-client.js";
import type {
  IntentAcquisitionContext
} from "./adaptive-orchestrator.js";

const CANONICAL_LOW_FRAUD_MINER_ID = "95822412";

/**
 * Acquire real Telegraph evidence while keeping Auctorail's policy separate
 * from transport routing.
 *
 * LOW-risk public payments use a direct Telegraph/x402 first hop to the
 * canonical Refut FRAUD_DETECTION Miner. Production testing showed that the
 * generic /v1/ask discovery layer can intermittently spend most of the LOW
 * evidence window before returning any usable provider, while Refut itself is
 * the repeatedly proven compatible provider for the exact Base Sepolia vendor
 * check. The direct hop still goes through Telegraph's engine and x402 gate;
 * Auctorail does not call the Miner behind Telegraph or trust it automatically.
 *
 * Returned evidence must still independently pass the untouched original
 * policy: exact subject/chain, required Intent, signal hash, confidence floor,
 * freshness, negative veto, spend, attempt and deadline rules. If a direct
 * provider is explicitly unusable, later bounded attempts can select another
 * eligible direct provider without counting duplicate Miner identities.
 *
 * MEDIUM/HIGH flows retain the established ranked auto-route-first behavior
 * and direct corroboration for provider diversity.
 */
export function createAutoRoutedLiveIntentAcquirer(
  options: LiveIntentClientOptions
): (
  context: IntentAcquisitionContext
) => Promise<LiveIntentAcquisitionResult> {
  const normalAcquire = createLiveIntentAcquirer(options);
  const lowAcquire = createLiveIntentAcquirer({
    ...options,
    preferDirectInitialRoute: true,
    preferredInitialMinerId: CANONICAL_LOW_FRAUD_MINER_ID
  });

  return (context) => {
    const isLowFraudCheck =
      context.plan.riskTier === "LOW" &&
      context.requirement.intent === "FRAUD_DETECTION";
    const hasPriorMiner =
      (context.priorMinerIds?.length ?? 0) > 0;
    const acquire = isLowFraudCheck
      ? lowAcquire
      : normalAcquire;

    return acquire({
      ...context,
      requirement: {
        ...context.requirement,
        quorum: {
          ...context.requirement.quorum,

          // For a later attempt, transport may directly choose another unused
          // Miner. This is routing-only; collectAdaptiveEvidence evaluates the
          // untouched original requirement and therefore does not weaken the
          // authorization quorum.
          minimumDistinctMiners:
            hasPriorMiner
              ? Math.max(
                  2,
                  context.requirement.quorum.minimumDistinctMiners
                )
              : context.requirement.quorum.minimumDistinctMiners
        }
      }
    });
  };
}
