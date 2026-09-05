import {
  createLiveIntentAcquirer,
  type LiveIntentAcquisitionResult,
  type LiveIntentClientOptions
} from "./live-intent-client.js";
import type {
  IntentAcquisitionContext
} from "./adaptive-orchestrator.js";

/**
 * Keep the public/hackathon path on Telegraph's ranked automatic Intent route.
 *
 * The existing live client switches to a direct Miner endpoint when a quorum
 * asks for more than one distinct provider. For the public ProofGate flow we
 * deliberately avoid that Miner selection. We preserve prior Miner IDs in the
 * request context (so Telegraph can prefer a different provider) but give the
 * transport a routing-only copy of the quorum with minimumDistinctMiners=1.
 *
 * IMPORTANT: this does NOT weaken ProofGate's quorum. collectAdaptiveEvidence
 * still evaluates the original plan and still requires the original number of
 * distinct Miners before an Intent is considered satisfied.
 */
export function createAutoRoutedLiveIntentAcquirer(
  options: LiveIntentClientOptions
): (
  context: IntentAcquisitionContext
) => Promise<LiveIntentAcquisitionResult> {
  const acquire = createLiveIntentAcquirer(options);

  return (context) => {
    const hasPriorMiner =
      (context.priorMinerIds?.length ?? 0) > 0;

    return acquire({
      ...context,
      requirement: {
        ...context.requirement,
        quorum: {
          ...context.requirement.quorum,

          // Attempt one remains on Telegraph's ranked /v1/ask route.
          // After an accepted or rejected provider has already been seen,
          // transport may directly target another ranked unused Miner.
          //
          // This is routing-only. collectAdaptiveEvidence still evaluates
          // the untouched original requirement and therefore does not
          // weaken Auctorail's authorization quorum.
          minimumDistinctMiners:
            hasPriorMiner
              ? Math.max(
                  2,
                  context.requirement.quorum.minimumDistinctMiners
                )
              : 1
        }
      }
    });
  };
}
