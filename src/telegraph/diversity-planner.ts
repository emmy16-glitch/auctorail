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

interface DirectEndpoint {
  path?: string;
  method?: string;
  description?: string;
}

interface InputSchema {
  properties?: Record<string, unknown>;
  required?: string[];
}

interface MinerScore {
  intent_id?: string;
  rank?: number;
  score?: number;
}

type ExtendedMinerRecord = TelegraphMinerRecord & {
  endpoints?: DirectEndpoint[];
  input_schema?: InputSchema;
  scores?: MinerScore[];
};

export interface DirectDiversityCandidate {
  miner: {
    id: string;
    name: string;
    slug: string;
  };
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  payload: Record<string, unknown>;
  officialRank: number | null;
  selectionHash: string;
}

export interface DiversityPlan {
  intent: AdaptiveEvidenceIntent;
  excludedMinerIds: string[];
  eligibleCount: number;
  selected: DirectDiversityCandidate[];
  skipped: Array<{
    minerId: string;
    slug: string;
    reason: string;
  }>;
}

const INTENT_KEYWORDS: Record<AdaptiveEvidenceIntent, string[]> = {
  FRAUD_DETECTION: [
    "fraud",
    "anomaly",
    "risk",
    "scam",
    "malicious",
    "abuse"
  ],
  ONCHAIN_TX_LOOKUP: [
    "transaction",
    "tx",
    "lookup",
    "receipt"
  ],
  WALLET_BALANCE_CHECK: [
    "wallet",
    "balance",
    "holdings"
  ]
};

const METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE"
]);

function normalizeMethod(value: string | undefined): DirectDiversityCandidate["method"] | null {
  const normalized = String(value ?? "").toUpperCase();
  return METHODS.has(normalized)
    ? normalized as DirectDiversityCandidate["method"]
    : null;
}

function endpointScore(
  endpoint: DirectEndpoint,
  intent: AdaptiveEvidenceIntent
): number {
  const text = [
    endpoint.path ?? "",
    endpoint.description ?? ""
  ].join(" ").toLowerCase();

  let score = text.includes(intent.toLowerCase()) ? 100 : 0;
  for (const keyword of INTENT_KEYWORDS[intent]) {
    if (text.includes(keyword)) score += 10;
  }
  return score;
}

function chooseEndpoint(
  miner: ExtendedMinerRecord,
  intent: AdaptiveEvidenceIntent
): DirectEndpoint | null {
  const endpoints = Array.isArray(miner.endpoints)
    ? miner.endpoints.filter(
        (endpoint) =>
          typeof endpoint?.path === "string" &&
          normalizeMethod(endpoint.method) !== null
      )
    : [];

  if (endpoints.length === 0) return null;

  const ranked = endpoints
    .map((endpoint) => ({
      endpoint,
      score: endpointScore(endpoint, intent)
    }))
    .sort((a, b) =>
      b.score - a.score ||
      String(a.endpoint.path).localeCompare(String(b.endpoint.path))
    );

  if (ranked[0].score > 0) return ranked[0].endpoint;
  return endpoints.length === 1 ? endpoints[0] : null;
}

function schemaProperties(schema: InputSchema | undefined): Record<string, unknown> {
  return schema?.properties && typeof schema.properties === "object"
    ? schema.properties
    : {};
}

function enumValues(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as { enum?: unknown[] };
  return Array.isArray(candidate.enum) ? candidate.enum : [];
}

function resolveChainValue(
  field: string,
  schemaProperty: unknown,
  chainId: number
): unknown | undefined {
  const values = enumValues(schemaProperty);
  const lower = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  if (field === "chainId" || field === "chain_id") {
    return chainId;
  }

  if (field === "network_id") {
    return `eip155:${chainId}`;
  }

  if (field === "chain" || field === "network") {
    if (chainId !== 84532) return undefined;
    const preferred = [
      "base-sepolia",
      "base_sepolia",
      "base sepolia",
      "base"
    ];
    const match = preferred.find((item) => lower.includes(item));
    if (match) {
      return values.find(
        (value) =>
          typeof value === "string" &&
          value.toLowerCase() === match
      );
    }
    return values.length === 0 ? "base-sepolia" : undefined;
  }

  return undefined;
}

function resolveField(
  field: string,
  schemaProperty: unknown,
  action: ActionContract,
  query: string
): unknown | undefined {
  if (["query", "question", "prompt"].includes(field)) {
    return query;
  }

  if ([
    "address",
    "wallet",
    "subject",
    "target",
    "destination",
    "entity_address",
    "wallet_address"
  ].includes(field)) {
    return action.payload.destination;
  }

  return resolveChainValue(
    field,
    schemaProperty,
    action.payload.chainId
  );
}

function buildPayload(
  miner: ExtendedMinerRecord,
  action: ActionContract,
  intent: AdaptiveEvidenceIntent
): { payload: Record<string, unknown>; unresolvedRequired: string[] } {
  const verification = createIntentVerificationPlan(action, intent);
  const properties = schemaProperties(miner.input_schema);
  const required = Array.isArray(miner.input_schema?.required)
    ? miner.input_schema!.required!
    : [];
  const payload: Record<string, unknown> = {};

  for (const [field, schemaProperty] of Object.entries(properties)) {
    const value = resolveField(
      field,
      schemaProperty,
      action,
      verification.query
    );
    if (value !== undefined) payload[field] = value;
  }

  // Some Telegraph Miners omit an input schema but still accept query.
  if (Object.keys(properties).length === 0) {
    payload.query = verification.query;
  }

  const unresolvedRequired = required.filter(
    (field) => !(field in payload)
  );

  return { payload, unresolvedRequired };
}

function officialRank(
  miner: ExtendedMinerRecord,
  intent: AdaptiveEvidenceIntent
): number | null {
  const score = Array.isArray(miner.scores)
    ? miner.scores.find((item) => item.intent_id === intent)
    : undefined;
  return Number.isInteger(score?.rank) && Number(score!.rank) > 0
    ? Number(score!.rank)
    : null;
}

function selectionHash(
  actionHash: string,
  intent: AdaptiveEvidenceIntent,
  miner: ExtendedMinerRecord
): string {
  return createHash("sha256")
    .update(
      `${actionHash}|${intent}|${String(miner.id)}|${miner.slug}`,
      "utf8"
    )
    .digest("hex");
}

export function planDirectDiversity(input: {
  action: ActionContract;
  intent: AdaptiveEvidenceIntent;
  miners: TelegraphMinerRecord[];
  excludeMinerIds?: string[];
  count: number;
}): DiversityPlan {
  const excluded = new Set(
    (input.excludeMinerIds ?? []).map(String)
  );
  const skipped: DiversityPlan["skipped"] = [];
  const candidates: DirectDiversityCandidate[] = [];

  for (const raw of input.miners) {
    const miner = raw as ExtendedMinerRecord;
    const id = String(miner.id);

    if (excluded.has(id)) continue;
    if ((miner.activation_status ?? "active").toLowerCase() !== "active") {
      skipped.push({ minerId: id, slug: miner.slug, reason: "inactive" });
      continue;
    }
    if (!miner.supported_intents?.includes(input.intent)) {
      continue;
    }

    const endpoint = chooseEndpoint(miner, input.intent);
    if (!endpoint) {
      skipped.push({ minerId: id, slug: miner.slug, reason: "no unambiguous direct endpoint" });
      continue;
    }

    const method = normalizeMethod(endpoint.method);
    if (!method || !endpoint.path) {
      skipped.push({ minerId: id, slug: miner.slug, reason: "invalid direct endpoint" });
      continue;
    }

    const { payload, unresolvedRequired } = buildPayload(
      miner,
      input.action,
      input.intent
    );
    if (unresolvedRequired.length > 0) {
      skipped.push({
        minerId: id,
        slug: miner.slug,
        reason: `unresolved required fields: ${unresolvedRequired.join(",")}`
      });
      continue;
    }

    candidates.push({
      miner: {
        id,
        name: miner.name,
        slug: miner.slug
      },
      method,
      endpoint: endpoint.path,
      payload,
      officialRank: officialRank(miner, input.intent),
      selectionHash: selectionHash(
        input.action.actionHash,
        input.intent,
        miner
      )
    });
  }

  candidates.sort((a, b) => {
    const ar = a.officialRank ?? Number.MAX_SAFE_INTEGER;
    const br = b.officialRank ?? Number.MAX_SAFE_INTEGER;
    return (
      ar - br ||
      a.selectionHash.localeCompare(b.selectionHash) ||
      a.miner.id.localeCompare(b.miner.id)
    );
  });

  return {
    intent: input.intent,
    excludedMinerIds: [...excluded].sort(),
    eligibleCount: candidates.length,
    selected: candidates.slice(0, Math.max(0, input.count)),
    skipped
  };
}
