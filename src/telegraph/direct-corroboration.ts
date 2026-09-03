import { createHash } from "node:crypto";

import type {
  ActionContract
} from "../core/action-contract.js";
import type {
  AdaptiveEvidenceIntent
} from "./adaptive-evidence-plan.js";
import type {
  TelegraphMinerRecord
} from "./routed-evidence.js";
import {
  createIntentVerificationPlan
} from "./verification-planner.js";

export type DirectMinerMethod =
  | "GET"
  | "POST";

export interface TelegraphMinerEndpoint {
  path: string;
  method: string;
  description?: string;
  param_map?: Record<string, string>;
}

export type DirectCapableMiner = TelegraphMinerRecord & {
  endpoints?: TelegraphMinerEndpoint[];
};

export interface DirectCorroborationTarget {
  miner: DirectCapableMiner;
  endpoint: {
    path: string;
    method: DirectMinerMethod;
  };
  payload: Record<string, unknown>;
  selectionHash: string;
}

function endpointDeclaresIntent(
  endpoint: TelegraphMinerEndpoint,
  intent: AdaptiveEvidenceIntent
): boolean {
  const description =
    (endpoint.description ?? "").toUpperCase();

  return (
    description.includes(intent) &&
    !description.includes("NOT AN INTENT TARGET") &&
    !description.includes("DO NOT ROUTE")
  );
}

function baseChainName(chainId: number): string | null {
  return chainId === 84532
    ? "base"
    : null;
}

function directPayloadForEndpoint(input: {
  endpoint: TelegraphMinerEndpoint;
  action: ActionContract;
  intent: AdaptiveEvidenceIntent;
}): Record<string, unknown> | null {
  const { endpoint, action, intent } = input;
  const description =
    (endpoint.description ?? "").toLowerCase();
  const path = endpoint.path.toLowerCase();

  // The first live quorum use case is FRAUD_DETECTION. We deliberately
  // support only endpoint shapes that can be derived deterministically from
  // the public Telegraph Miner registry. Unknown shapes are not guessed.
  if (intent !== "FRAUD_DETECTION") {
    return null;
  }

  const verificationPlan =
    createIntentVerificationPlan(
      action,
      intent
    );

  // DegenLens-style anomaly endpoints explicitly ask for the natural-language
  // query. The query already commits the exact subject + chainId.
  if (
    path === "/anomaly/check" ||
    description.includes("required natural-language query")
  ) {
    return {
      query: verificationPlan.query
    };
  }

  // Address-risk endpoints such as ChainSight /fraud accept an address.
  // Only add a chain parameter when the public endpoint description declares
  // one; never guess unsupported request fields.
  if (
    path.includes("fraud") ||
    description.includes("risk assessment of an address") ||
    /params?:[^.]*address/.test(description)
  ) {
    const payload: Record<string, unknown> = {
      address: action.payload.destination
    };

    const chain = baseChainName(
      action.payload.chainId
    );
    if (
      chain &&
      /params?:[^.]*chain/.test(description)
    ) {
      payload.chain = chain;
    }

    return payload;
  }

  return null;
}

function compatibleEndpoints(
  miner: DirectCapableMiner,
  action: ActionContract,
  intent: AdaptiveEvidenceIntent
): Array<{
  path: string;
  method: DirectMinerMethod;
  payload: Record<string, unknown>;
}> {
  const endpoints = Array.isArray(miner.endpoints)
    ? miner.endpoints
    : [];

  return endpoints
    .filter(
      (endpoint) =>
        endpointDeclaresIntent(endpoint, intent) &&
        (endpoint.method === "GET" || endpoint.method === "POST")
    )
    .map((endpoint) => ({
      endpoint,
      payload:
        directPayloadForEndpoint({
          endpoint,
          action,
          intent
        })
    }))
    .filter(
      (entry): entry is {
        endpoint: TelegraphMinerEndpoint;
        payload: Record<string, unknown>;
      } => Boolean(entry.payload)
    )
    .sort((a, b) => {
      // Prefer GET for direct corroboration when both forms exist. Telegraph
      // defines direct-route payload as query params for GET, which avoids
      // accidentally relying on an upstream JSON-body convention.
      const methodOrder =
        (a.endpoint.method === "GET" ? 0 : 1) -
        (b.endpoint.method === "GET" ? 0 : 1);
      if (methodOrder !== 0) return methodOrder;
      return a.endpoint.path.localeCompare(b.endpoint.path);
    })
    .map((entry) => ({
      path: entry.endpoint.path,
      method:
        entry.endpoint.method as DirectMinerMethod,
      payload: entry.payload
    }));
}

function selectionHash(input: {
  actionHash: string;
  intent: AdaptiveEvidenceIntent;
  miner: DirectCapableMiner;
}): string {
  return createHash("sha256")
    .update(
      [
        "proofgate.direct-corroboration.v1",
        input.actionHash,
        input.intent,
        String(input.miner.id),
        input.miner.slug
      ].join("|")
    )
    .digest("hex");
}

export function selectDirectCorroborationTarget(input: {
  miners: TelegraphMinerRecord[];
  action: ActionContract;
  intent: AdaptiveEvidenceIntent;
  excludedMinerIds: string[];
}): DirectCorroborationTarget | null {
  const excluded = new Set(
    input.excludedMinerIds.map(String)
  );

  const candidates =
    (input.miners as DirectCapableMiner[])
      .filter(
        (miner) =>
          miner.activation_status === "active" &&
          miner.supported_intents?.includes(input.intent) &&
          !excluded.has(String(miner.id))
      )
      .map((miner) => {
        const endpoints = compatibleEndpoints(
          miner,
          input.action,
          input.intent
        );
        if (endpoints.length === 0) {
          return null;
        }

        return {
          miner,
          endpoint: endpoints[0],
          selectionHash: selectionHash({
            actionHash: input.action.actionHash,
            intent: input.intent,
            miner
          })
        };
      })
      .filter(
        (candidate): candidate is {
          miner: DirectCapableMiner;
          endpoint: {
            path: string;
            method: DirectMinerMethod;
            payload: Record<string, unknown>;
          };
          selectionHash: string;
        } => Boolean(candidate)
      )
      .sort((a, b) => {
        const hashOrder =
          a.selectionHash.localeCompare(b.selectionHash);
        if (hashOrder !== 0) return hashOrder;
        return String(a.miner.id).localeCompare(
          String(b.miner.id)
        );
      });

  const selected = candidates[0];
  if (!selected) return null;

  return {
    miner: selected.miner,
    endpoint: {
      path: selected.endpoint.path,
      method: selected.endpoint.method
    },
    payload: selected.endpoint.payload,
    selectionHash: selected.selectionHash
  };
}
