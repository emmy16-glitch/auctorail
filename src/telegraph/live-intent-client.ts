import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  wrapFetchWithPayment,
  x402Client
} from "@x402/fetch";
import {
  ExactEvmScheme,
  toClientEvmSigner
} from "@x402/evm";
import {
  privateKeyToAccount
} from "viem/accounts";

import {
  normalizeTelegraphEvidence,
  type TelegraphEvidenceRecord
} from "../evidence/telegraph.js";
import {
  planDirectDiversity,
  type DirectDiversityCandidate
} from "./diversity-planner.js";
import {
  buildTelegraphEngineAskBody
} from "./engine-ask.js";
import {
  servingMinerSupportsIntent
} from "./intent-route.js";
import {
  adaptBoundMinerResultForPolicy,
  resolveServingMiner,
  validateExplicitEvidenceBinding,
  type TelegraphMinerRecord
} from "./routed-evidence.js";
import {
  TELEGRAPH_X402_POLICY,
  classifyPaymentResponseHeader,
  parsePaymentRequiredHeader,
  selectApprovedTelegraphPaymentLane,
  type X402PaymentLane,
  type X402SettlementResult
} from "./x402-policy.js";
import {
  createIntentVerificationPlan
} from "./verification-planner.js";
import {
  RetryableEvidenceAcquisitionError,
  type IntentAcquisitionContext,
  type IntentAcquisitionResult
} from "./adaptive-orchestrator.js";

export interface LiveIntentClientOptions {
  privateKey: `0x${string}`;
  miners: TelegraphMinerRecord[];
  engineUrl?: string;
  evidenceDirectory?: string;
  fetchImpl?: typeof fetch;
}

export interface LiveIntentAcquisitionResult
  extends IntentAcquisitionResult {
  evidencePath: string;
  servingMiner: {
    id: string;
    name: string;
    slug: string;
  };
  settlement: X402SettlementResult | null;
}

type RoutePlan =
  | {
      mode: "TELEGRAPH_AUTO_ROUTE";
      url: string;
      body: ReturnType<typeof buildTelegraphEngineAskBody>;
      engineEndpoint: "/v1/ask";
      expectedMiner: null;
      directTarget: null;
    }
  | {
      mode: "TELEGRAPH_DIRECT_CORROBORATION";
      url: string;
      body: {
        method: DirectDiversityCandidate["method"];
        endpoint: string;
        payload: Record<string, unknown>;
      };
      engineEndpoint: string;
      expectedMiner: TelegraphMinerRecord;
      directTarget: DirectDiversityCandidate;
    };

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function unsigned(
  value: string,
  field: string
): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field}_invalid`);
  }
  return BigInt(value);
}

function toPaymentLane(requirement: {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: unknown;
}): X402PaymentLane {
  return {
    scheme: requirement.scheme,
    network: requirement.network,
    asset: requirement.asset,
    amount: requirement.amount,
    payTo: requirement.payTo,
    ...(requirement.maxTimeoutSeconds !== undefined
      ? { maxTimeoutSeconds: requirement.maxTimeoutSeconds }
      : {}),
    ...(requirement.extra !== undefined
      ? { extra: requirement.extra }
      : {})
  };
}

function actualRequirementAllowed(
  x402Version: number,
  requirement: {
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds?: number;
    extra?: unknown;
  },
  remainingBudget: bigint
): boolean {
  const decision =
    selectApprovedTelegraphPaymentLane({
      x402Version,
      accepts: [toPaymentLane(requirement)]
    });

  if (!decision.approved) return false;

  try {
    return (
      unsigned(
        decision.lane.amount,
        "payment_amount"
      ) <= remainingBudget
    );
  } catch {
    return false;
  }
}

async function preflightWithReadRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Response> {
  const delays = [0, 350, 800];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise(
        (resolve) => setTimeout(resolve, delays[attempt])
      );
    }

    try {
      return await fetchImpl(url, init);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `telegraph_preflight_unavailable:${errorMessage(lastError)}`
  );
}

function requireDeadline(deadlineAt: string): void {
  const deadline = new Date(deadlineAt).getTime();
  if (!Number.isFinite(deadline) || Date.now() > deadline) {
    throw new Error("adaptive_evidence_deadline_exceeded");
  }
}

function saveEvidenceArtifact(
  directory: string,
  intent: string,
  savedEvidence: unknown
): string {
  fs.mkdirSync(directory, { recursive: true });

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const file = path.join(
    directory,
    `${intent.toLowerCase()}-${stamp}-${randomUUID().slice(0, 8)}.json`
  );

  fs.writeFileSync(
    file,
    JSON.stringify(savedEvidence, null, 2),
    { mode: 0o600 }
  );

  return file;
}

function paymentRecord(
  lane: X402PaymentLane | null,
  settlement: X402SettlementResult | null
): Record<string, unknown> {
  return lane
    ? {
        network: lane.network,
        asset: lane.asset,
        amountRaw: lane.amount,
        payTo: lane.payTo,
        settlement
      }
    : {
        mode: "free",
        amountRaw: "0",
        settlement: null
      };
}

function routedQuery(
  context: IntentAcquisitionContext
): string {
  const verificationPlan =
    createIntentVerificationPlan(
      context.action,
      context.requirement.intent
    );

  const prior = context.priorMinerIds ?? [];
  if (prior.length === 0) {
    return verificationPlan.query;
  }

  return [
    verificationPlan.query,
    `This is independent corroboration attempt ${context.attemptNumber ?? 1}.`,
    `Previously served Miner IDs: ${prior.join(", ")}.`,
    "When another capable Miner is available, prefer a different Miner for provider diversity regardless of the expected verdict. Do not change the requested Intent, subject, or chain."
  ].join(" ");
}

function requestBody(
  context: IntentAcquisitionContext
): ReturnType<typeof buildTelegraphEngineAskBody> {
  const verificationPlan =
    createIntentVerificationPlan(
      context.action,
      context.requirement.intent
    );

  return buildTelegraphEngineAskBody({
    ...verificationPlan,
    query: routedQuery(context)
  });
}

function resolveRoutePlan(input: {
  context: IntentAcquisitionContext;
  engineUrl: string;
  miners: TelegraphMinerRecord[];
}): RoutePlan {
  const prior = input.context.priorMinerIds ?? [];
  const needsIndependentProviders =
    input.context.requirement.quorum.minimumDistinctMiners > 1;

  if (needsIndependentProviders && prior.length > 0) {
    const diversity = planDirectDiversity({
      action: input.context.action,
      intent: input.context.requirement.intent,
      miners: input.miners,
      excludeMinerIds: prior,
      count: 1
    });
    const directTarget = diversity.selected[0];

    if (directTarget) {
      const expectedMiner = input.miners.find(
        (miner) =>
          String(miner.id) === directTarget.miner.id
      );

      if (!expectedMiner) {
        throw new Error(
          `direct_route_selected_miner_missing:${directTarget.miner.id}`
        );
      }

      const encodedMiner =
        encodeURIComponent(directTarget.miner.slug);
      const engineEndpoint =
        `/v1/ask/${encodedMiner}`;

      return {
        mode: "TELEGRAPH_DIRECT_CORROBORATION",
        url: `${input.engineUrl}${engineEndpoint}`,
        body: {
          method: directTarget.method,
          endpoint: directTarget.endpoint,
          payload: directTarget.payload
        },
        engineEndpoint,
        expectedMiner,
        directTarget
      };
    }
  }

  return {
    mode: "TELEGRAPH_AUTO_ROUTE",
    url: `${input.engineUrl}/v1/ask`,
    body: requestBody(input.context),
    engineEndpoint: "/v1/ask",
    expectedMiner: null,
    directTarget: null
  };
}

function routeRequestRecord(
  route: RoutePlan,
  context: IntentAcquisitionContext
): Record<string, unknown> {
  return {
    endpoint: route.engineEndpoint,
    routeMode: route.mode,
    target: context.action.payload.destination,
    chainId: context.action.payload.chainId,
    actionHash: context.action.actionHash,
    requiredIntent: context.requirement.intent,
    attemptNumber: context.attemptNumber ?? 1,
    priorMinerIds: context.priorMinerIds ?? [],
    remainingBudgetRaw: context.remainingBudgetRaw,
    ...(route.directTarget
      ? {
          directCorroboration: {
            minerId: route.directTarget.miner.id,
            minerSlug: route.directTarget.miner.slug,
            minerEndpoint: route.directTarget.endpoint,
            minerMethod: route.directTarget.method,
            officialRank: route.directTarget.officialRank,
            selectionHash: route.directTarget.selectionHash
          }
        }
      : {})
  };
}

function assertDirectMinerIdentity(
  body: Record<string, unknown>,
  expectedMiner: TelegraphMinerRecord | null
): void {
  if (!expectedMiner) return;

  const token =
    typeof body.miner_used === "string" && body.miner_used.trim()
      ? body.miner_used.trim()
      : body.miner_id !== undefined && body.miner_id !== null
        ? String(body.miner_id)
        : null;

  if (
    token &&
    token !== expectedMiner.slug &&
    token !== String(expectedMiner.id)
  ) {
    throw new Error(
      `direct_route_miner_mismatch:expected_${expectedMiner.slug}:returned_${token}`
    );
  }
}

function parseSuccessfulEvidence(input: {
  body: Record<string, unknown>;
  context: IntentAcquisitionContext;
  miners: TelegraphMinerRecord[];
  route: RoutePlan;
  paymentLane: X402PaymentLane | null;
  settlement: X402SettlementResult | null;
  startedAt: string;
  evidenceDirectory: string;
}): LiveIntentAcquisitionResult {
  if (!isObject(input.body.result)) {
    throw new Error("miner_result_missing");
  }

  assertDirectMinerIdentity(
    input.body,
    input.route.expectedMiner
  );

  const servingMiner =
    resolveServingMiner(
      input.body,
      input.route.expectedMiner,
      input.miners
    );

  if (!servingMiner) {
    throw new Error("serving_miner_identity_missing");
  }

  const returnedIntent =
    typeof input.body.intent === "string"
      ? input.body.intent
      : input.context.requirement.intent;

  if (returnedIntent !== input.context.requirement.intent) {
    const finishedAt = new Date().toISOString();
    const rejectionPath =
      saveEvidenceArtifact(
        path.join(input.evidenceDirectory, "rejected"),
        input.context.requirement.intent,
        {
          schemaVersion: "proofgate.telegraph-evidence-rejection.v1",
          source: "telegraph",
          intent: returnedIntent,
          miner: {
            id: servingMiner.id,
            name: servingMiner.name,
            slug: servingMiner.slug
          },
          request: routeRequestRecord(
            input.route,
            input.context
          ),
          rejection: {
            code: "routed_intent_mismatch",
            detail:
              `expected ${input.context.requirement.intent}, returned ${returnedIntent}`
          },
          payment:
            paymentRecord(
              input.paymentLane,
              input.settlement
            ),
          capturedAt: {
            startedAt: input.startedAt,
            finishedAt
          },
          rawResponse: input.body
        }
      );

    throw new RetryableEvidenceAcquisitionError({
      code: "routed_intent_mismatch",
      detail:
        `expected ${input.context.requirement.intent}, returned ${returnedIntent}`,
      paymentAmountRaw:
        input.paymentLane?.amount ?? "0",
      artifactPath: rejectionPath,
      minerId: servingMiner.id
    });
  }

  if (
    !servingMinerSupportsIntent(
      servingMiner.record,
      input.context.requirement.intent
    )
  ) {
    throw new Error(
      `serving_miner_intent_mismatch:${servingMiner.slug}:${input.context.requirement.intent}`
    );
  }

  const binding =
    validateExplicitEvidenceBinding({
      result: input.body.result,
      miner: servingMiner.record,
      expectedSubject:
        input.context.action.payload.destination,
      expectedChainId:
        input.context.action.payload.chainId
    });

  if (!binding.valid) {
    const finishedAt = new Date().toISOString();
    const rejectionPath =
      saveEvidenceArtifact(
        path.join(input.evidenceDirectory, "rejected"),
        returnedIntent,
        {
          schemaVersion: "proofgate.telegraph-evidence-rejection.v1",
          source: "telegraph",
          intent: returnedIntent,
          miner: {
            id: servingMiner.id,
            name: servingMiner.name,
            slug: servingMiner.slug
          },
          request: routeRequestRecord(
            input.route,
            input.context
          ),
          rejection: {
            code: binding.code,
            detail: binding.detail
          },
          payment:
            paymentRecord(
              input.paymentLane,
              input.settlement
            ),
          capturedAt: {
            startedAt: input.startedAt,
            finishedAt
          },
          rawResponse: input.body
        }
      );

    if (
      binding.code === "evidence_subject_not_asserted" ||
      binding.code === "evidence_chain_not_asserted"
    ) {
      throw new RetryableEvidenceAcquisitionError({
        code: binding.code,
        detail: binding.detail,
        paymentAmountRaw:
          input.paymentLane?.amount ?? "0",
        artifactPath: rejectionPath,
        minerId: servingMiner.id
      });
    }

    throw new Error(
      `${binding.code}:${binding.detail};artifact:${rejectionPath}`
    );
  }

  const canonicalResult =
    adaptBoundMinerResultForPolicy(
      input.body.result,
      servingMiner.record,
      binding
    );

  const finishedAt = new Date().toISOString();
  const savedEvidence = {
    schemaVersion: "proofgate.telegraph-evidence.v1",
    source: "telegraph" as const,
    intent: returnedIntent,
    miner: {
      id: servingMiner.id,
      name: servingMiner.name,
      slug: servingMiner.slug
    },
    request: routeRequestRecord(
      input.route,
      input.context
    ),
    result: canonicalResult,
    telegraph: {
      signalHash:
        typeof input.body.signal_hash === "string"
          ? input.body.signal_hash
          : null,
      costUsd:
        typeof input.body.cost_usd === "number"
          ? input.body.cost_usd
          : null,
      durationMs:
        typeof input.body.duration_ms === "number"
          ? input.body.duration_ms
          : null,
      timestamp:
        typeof input.body.timestamp === "string"
          ? input.body.timestamp
          : null,
      binding: {
        subjectField: binding.subjectField,
        chainField: binding.chainField
      }
    },
    payment:
      paymentRecord(
        input.paymentLane,
        input.settlement
      ),
    capturedAt: {
      startedAt: input.startedAt,
      finishedAt
    },
    rawResponse: input.body
  };

  const evidence: TelegraphEvidenceRecord =
    normalizeTelegraphEvidence(savedEvidence);

  const evidencePath =
    saveEvidenceArtifact(
      input.evidenceDirectory,
      returnedIntent,
      savedEvidence
    );

  return {
    evidence,
    paymentAmountRaw:
      input.paymentLane?.amount ?? "0",
    paymentNetwork:
      input.paymentLane?.network ?? null,
    paymentAsset:
      input.paymentLane?.asset ?? null,
    evidencePath,
    servingMiner: {
      id: servingMiner.id,
      name: servingMiner.name,
      slug: servingMiner.slug
    },
    settlement: input.settlement
  };
}

export function createLiveIntentAcquirer(
  options: LiveIntentClientOptions
): (
  context: IntentAcquisitionContext
) => Promise<LiveIntentAcquisitionResult> {
  const engineUrl =
    options.engineUrl ??
    process.env.TELEGRAPH_ENGINE_URL ??
    "https://devnode.telegraphprotocol.com/engine";

  const evidenceDirectory =
    options.evidenceDirectory ??
    path.join("data", "evidence", "adaptive");

  const fetchImpl = options.fetchImpl ?? fetch;

  const account = privateKeyToAccount(options.privateKey);
  const signer = toClientEvmSigner(account);

  return async (
    context: IntentAcquisitionContext
  ): Promise<LiveIntentAcquisitionResult> => {
    requireDeadline(context.deadlineAt);

    const route = resolveRoutePlan({
      context,
      engineUrl,
      miners: options.miners
    });

    const url = route.url;
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(route.body)
    };

    const startedAt = new Date().toISOString();

    const preflight =
      await preflightWithReadRetry(
        fetchImpl,
        url,
        init
      );

    if (preflight.ok) {
      const parsed = await preflight.json();
      if (!isObject(parsed)) {
        throw new Error("miner_response_not_object");
      }

      return parseSuccessfulEvidence({
        body: parsed,
        context,
        miners: options.miners,
        route,
        paymentLane: null,
        settlement: null,
        startedAt,
        evidenceDirectory
      });
    }

    if (preflight.status !== 402) {
      throw new Error(
        `telegraph_preflight_http_${preflight.status}`
      );
    }

    const paymentRequired =
      preflight.headers.get("payment-required");

    if (!paymentRequired) {
      throw new Error("payment_challenge_missing");
    }

    const challenge =
      parsePaymentRequiredHeader(paymentRequired);
    const laneDecision =
      selectApprovedTelegraphPaymentLane(challenge);

    if (!laneDecision.approved) {
      throw new Error(laneDecision.code);
    }

    const preflightLane = laneDecision.lane;
    const remaining = unsigned(
      context.remainingBudgetRaw,
      "remaining_evidence_budget"
    );
    const preflightPrice = unsigned(
      preflightLane.amount,
      "payment_amount"
    );

    if (preflightPrice > remaining) {
      throw new Error(
        `adaptive_payment_exceeds_remaining_budget:${preflightPrice}:${remaining}`
      );
    }

    requireDeadline(context.deadlineAt);

    let replayValidatedPreflight = true;
    const boundFetch: typeof fetch = async (
      input,
      requestInit
    ) => {
      if (replayValidatedPreflight) {
        replayValidatedPreflight = false;
        return preflight.clone();
      }
      return fetchImpl(input, requestInit);
    };

    const client =
      x402Client.fromConfig({
        schemes: [
          {
            network: TELEGRAPH_X402_POLICY.network,
            client: new ExactEvmScheme(signer)
          }
        ],
        spendControls: false
      });

    client.registerPolicy(
      (version, requirements) =>
        requirements.filter(
          (requirement) =>
            actualRequirementAllowed(
              version,
              requirement,
              remaining
            )
        )
    );

    let actualLane: X402PaymentLane | null = null;
    let paymentPayloadCreated = false;

    client.onBeforePaymentCreation(
      async ({
        paymentRequired: actualChallenge,
        selectedRequirements
      }) => {
        const selected =
          toPaymentLane(selectedRequirements);
        const decision =
          selectApprovedTelegraphPaymentLane({
            x402Version: actualChallenge.x402Version,
            accepts: [selected]
          });

        if (!decision.approved) {
          return {
            abort: true as const,
            reason:
              `proofgate_x402_actual_lane_rejected:${decision.code}`
          };
        }

        const amount = unsigned(
          decision.lane.amount,
          "payment_amount"
        );

        if (amount > remaining) {
          return {
            abort: true as const,
            reason:
              `adaptive_payment_exceeds_remaining_budget:${amount}:${remaining}`
          };
        }

        actualLane = decision.lane;
      }
    );

    client.onAfterPaymentCreation(async () => {
      paymentPayloadCreated = true;
    });

    const paidFetch =
      wrapFetchWithPayment(boundFetch, client);

    let response: Response;

    try {
      response = await paidFetch(url, init);
    } catch (error) {
      if (paymentPayloadCreated) {
        throw new Error(
          `adaptive_x402_transport_ambiguous:${errorMessage(error)}`
        );
      }

      throw new Error(
        `adaptive_x402_pre_payment_failure:${errorMessage(error)}`
      );
    }

    if (!actualLane || !paymentPayloadCreated) {
      throw new Error(
        "adaptive_x402_payment_payload_not_created"
      );
    }

    const settlement =
      classifyPaymentResponseHeader(
        response.headers.get("payment-response") ??
        response.headers.get("x-payment-response") ??
        null
      );

    if (!settlement.success) {
      throw new Error(
        `adaptive_x402_settlement_unproven:${settlement.code}:${settlement.errorReason ?? "no_reason"}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `adaptive_miner_failed_after_payment:http_${response.status}`
      );
    }

    const parsed = await response.json();
    if (!isObject(parsed)) {
      throw new Error("miner_response_not_object");
    }

    return parseSuccessfulEvidence({
      body: parsed,
      context,
      miners: options.miners,
      route,
      paymentLane: actualLane,
      settlement,
      startedAt,
      evidenceDirectory
    });
  };
}
