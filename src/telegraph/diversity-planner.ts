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

export type DirectOutputBindingMode =
  | "STRUCTURED_EXACT"
  | "DECLARED_TEXT";

export type DirectRequestBindingMode =
  | "STRUCTURED_SUBJECT_CHAIN"
  | "QUERY_ASSERTED";

export interface DirectDiversityCandidate {
  miner: {
    id: string;
    name: string;
    slug: string;
  };
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  payload: Record<string, unknown>;
  outputBindingMode: DirectOutputBindingMode;
  requestBindingMode: DirectRequestBindingMode;
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

const SUBJECT_OUTPUT_FIELDS = new Set([
  "subject",
  "address",
  "target",
  "destination",
  "wallet",
  "wallet_address",
  "entity_address"
]);

const CHAIN_OUTPUT_FIELDS = new Set([
  "chainId",
  "chain_id",
  "network",
  "network_id",
  "chain"
]);

const SUBJECT_INPUT_FIELDS = new Set([
  "subject",
  "address",
  "target",
  "destination",
  "wallet",
  "wallet_address",
  "entity_address"
]);

const CHAIN_INPUT_FIELDS = new Set([
  "chainId",
  "chain_id",
  "network",
  "network_id",
  "chain"
]);

const QUERY_INPUT_FIELDS = new Set([
  "query",
  "question",
  "prompt"
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

function endpointDeclaredFields(
  endpoint: DirectEndpoint
): Set<string> {
  const description = String(endpoint.description ?? "");
  const fields = new Set<string>();

  const paramsMatch = description.match(/\bParams:\s*([\s\S]*?)(?:\n|$)/i);
  if (paramsMatch?.[1]) {
    const params = paramsMatch[1];
    for (const match of params.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
      fields.add(match[1]);
    }
  }

  const bodyMatch = description.match(/\bJSON body:\s*\{([\s\S]*?)\}/i);
  if (bodyMatch?.[1]) {
    for (const match of bodyMatch[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']\s*:/g)) {
      fields.add(match[1]);
    }
  }

  return fields;
}

function requestBindingMode(
  payload: Record<string, unknown>
): DirectRequestBindingMode | null {
  const fields = Object.keys(payload);
  const hasSubject = fields.some(
    (field) => SUBJECT_INPUT_FIELDS.has(field)
  );
  const hasChain = fields.some(
    (field) => CHAIN_INPUT_FIELDS.has(field)
  );

  if (hasSubject && hasChain) {
    return "STRUCTURED_SUBJECT_CHAIN";
  }

  if (fields.some((field) => QUERY_INPUT_FIELDS.has(field))) {
    return "QUERY_ASSERTED";
  }

  return null;
}

function outputBindingMode(
  miner: ExtendedMinerRecord,
  requestMode: DirectRequestBindingMode
): DirectOutputBindingMode | null {
  const properties =
    miner.output_schema?.properties &&
    typeof miner.output_schema.properties === "object"
      ? Object.keys(miner.output_schema.properties)
      : [];
  const declared = new Set(properties);

  const hasSubject = properties.some(
    (field) => SUBJECT_OUTPUT_FIELDS.has(field)
  );
  const hasChain = properties.some(
    (field) => CHAIN_OUTPUT_FIELDS.has(field)
  );

  if (hasSubject && hasChain) {
    return "STRUCTURED_EXACT";
  }

  const mappedText = [
    miner.signal_mapping?.label_field,
    miner.signal_mapping?.reason_field
  ].filter((field): field is string => Boolean(field));

  const textCandidates = new Set([
    ...mappedText,
    "signal",
    "answer",
    "summary",
    "reasoning"
  ]);

  if (
    requestMode &&
    [...textCandidates].some(
      (field) => declared.has(field)
    )
  ) {
    return "DECLARED_TEXT";
  }

  return null;
}

function enumValues(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as {
    enum?: unknown[];
    const?: unknown;
  };
  if (Array.isArray(candidate.enum)) {
    return candidate.enum;
  }
  return candidate.const !== undefined
    ? [candidate.const]
    : [];
}

function resolveChainValue(
  field: string,
  schemaProperty: unknown,
  chainId: number
): unknown | undefined {
  const values = enumValues(schemaProperty);

  if (field === "chainId" || field === "chain_id") {
    if (values.length === 0) return chainId;
    return values.find(
      (value) =>
        value === chainId ||
        (typeof value === "string" && value.trim() === String(chainId))
    );
  }

  if (field === "network_id") {
    const expected = `eip155:${chainId}`;
    if (values.length === 0) return expected;
    return values.find(
      (value) =>
        typeof value === "string" &&
        value.trim().toLowerCase() === expected
    );
  }

  if (field === "chain" || field === "network") {
    if (chainId !== 84532) return undefined;

    const exactBaseSepoliaAliases = new Set([
      "base-sepolia",
      "base_sepolia",
      "base sepolia",
      "base-sepolia-testnet",
      "base sepolia testnet",
      "eip155:84532",
      "84532"
    ]);

    if (values.length === 0) {
      return "base-sepolia";
    }

    return values.find(
      (value) =>
        typeof value === "string" &&
        exactBaseSepoliaAliases.has(
          value.trim().toLowerCase()
        )
    );
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
  endpoint: DirectEndpoint,
  action: ActionContract,
  intent: AdaptiveEvidenceIntent
): {
  payload: Record<string, unknown>;
  unresolvedRequired: string[];
  unresolvedExactChainFields: string[];
} {
  const verification = createIntentVerificationPlan(action, intent);
  const properties = schemaProperties(miner.input_schema);
  const explicitEndpointFields = endpointDeclaredFields(endpoint);
  const required = Array.isArray(miner.input_schema?.required)
    ? miner.input_schema!.required!
    : [];
  const payload: Record<string, unknown> = {};
  const unresolvedExactChainFields: string[] = [];

  for (const [field, schemaProperty] of Object.entries(properties)) {
    if (
      explicitEndpointFields.size > 0 &&
      !explicitEndpointFields.has(field)
    ) {
      continue;
    }

    const value = resolveField(
      field,
      schemaProperty,
      action,
      verification.query
    );

    if (value !== undefined) {
      payload[field] = value;
      continue;
    }

    // If an endpoint exposes an explicit chain/network input, ProofGate must
    // be able to express the frozen chain exactly through that field. A
    // mainnet-only value such as "base" is not equivalent to Base Sepolia
    // chainId 84532, and silently omitting the field could make the upstream
    // fall back to the wrong network even when the natural-language query
    // names the correct chain.
    if (CHAIN_INPUT_FIELDS.has(field)) {
      unresolvedExactChainFields.push(field);
    }
  }

  // Some Telegraph Miners omit an input schema but still accept query.
  if (
    Object.keys(properties).length === 0 &&
    (
      explicitEndpointFields.size === 0 ||
      explicitEndpointFields.has("query")
    )
  ) {
    payload.query = verification.query;
  }

  const applicableRequired =
    explicitEndpointFields.size > 0
      ? required.filter((field) => explicitEndpointFields.has(field))
      : required;

  const unresolvedRequired = applicableRequired.filter(
    (field) => !(field in payload)
  );

  return {
    payload,
    unresolvedRequired,
    unresolvedExactChainFields: [
      ...new Set(unresolvedExactChainFields)
    ]
  };
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

function bindingPriority(
  mode: DirectOutputBindingMode
): number {
  return mode === "STRUCTURED_EXACT" ? 0 : 1;
}

function requestBindingPriority(
  mode: DirectRequestBindingMode
): number {
  return mode === "STRUCTURED_SUBJECT_CHAIN" ? 0 : 1;
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

    const {
      payload,
      unresolvedRequired,
      unresolvedExactChainFields
    } = buildPayload(
      miner,
      endpoint,
      input.action,
      input.intent
    );

    if (unresolvedExactChainFields.length > 0) {
      skipped.push({
        minerId: id,
        slug: miner.slug,
        reason:
          `cannot express exact chainId ${input.action.payload.chainId} ` +
          `through declared field(s): ${unresolvedExactChainFields.join(",")}`
      });
      continue;
    }

    if (unresolvedRequired.length > 0) {
      skipped.push({
        minerId: id,
        slug: miner.slug,
        reason: `unresolved required fields: ${unresolvedRequired.join(",")}`
      });
      continue;
    }

    const requestMode = requestBindingMode(payload);
    if (!requestMode) {
      skipped.push({
        minerId: id,
        slug: miner.slug,
        reason: "chosen endpoint cannot bind exact subject/chain through its declared request/output contract"
      });
      continue;
    }

    const bindingMode = outputBindingMode(miner, requestMode);
    if (!bindingMode) {
      skipped.push({
        minerId: id,
        slug: miner.slug,
        reason: "chosen endpoint cannot bind exact subject/chain through its declared request/output contract"
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
      outputBindingMode: bindingMode,
      requestBindingMode: requestMode,
      officialRank: officialRank(miner, input.intent),
      selectionHash: selectionHash(
        input.action.actionHash,
        input.intent,
        miner
      )
    });
  }

  candidates.sort((a, b) => {
    const binding =
      bindingPriority(a.outputBindingMode) -
      bindingPriority(b.outputBindingMode);
    if (binding !== 0) return binding;

    const requestBinding =
      requestBindingPriority(a.requestBindingMode) -
      requestBindingPriority(b.requestBindingMode);
    if (requestBinding !== 0) return requestBinding;

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
