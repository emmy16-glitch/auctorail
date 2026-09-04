import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createActionContract,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  canonicalize,
  hashCanonicalPayload
} from "../src/core/action-contract.js";
import { createMandateContract, evaluateMandate } from "../src/core/mandate-contract.js";
import { evaluatePaymentsAdaptiveV1 } from "../src/policy/payments-adaptive-v1.js";
import { ADAPTIVE_EVIDENCE_INTENTS, createAdaptiveEvidencePlan } from "../src/telegraph/adaptive-evidence-plan.js";
import { collectAdaptiveEvidence } from "../src/telegraph/adaptive-orchestrator.js";
import { createAutoRoutedLiveIntentAcquirer } from "../src/telegraph/auto-route-acquirer.js";
import type { TelegraphMinerRecord } from "../src/telegraph/routed-evidence.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT_ID = "invoice-bot";
const PORT = Number(process.env.PROOFGATE_WEB_API_PORT ?? 8787);
const LIVE_ENABLED = process.env.PROOFGATE_LIVE_AUTHORIZATION_ENABLED === "true";
const TRUST_PROXY = process.env.PROOFGATE_TRUST_PROXY === "true";
const LIVE_PER_HOUR = positiveInteger(process.env.PROOFGATE_LIVE_REQUESTS_PER_HOUR, 3);
const POLICY_PER_MINUTE = positiveInteger(process.env.PROOFGATE_POLICY_REQUESTS_PER_MINUTE, 30);
const LIVE_DAILY_BUDGET_RAW = unsignedEnv(process.env.PROOFGATE_LIVE_DAILY_BUDGET_RAW, 500_000n);
const FROZEN_REQUEST_TTL_MS = 120_000;
const ALLOWED_ORIGINS = new Set(
  (process.env.PROOFGATE_WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

interface ApiReply {
  status: number;
  body: Record<string, unknown>;
}

interface IdempotentEntry {
  fingerprint: string;
  promise: Promise<ApiReply>;
  createdAt: number;
}

interface FrozenRequestEntry {
  fingerprint: string;
  issuedAt: string;
  expiresAt: string;
  createdAt: number;
  validUntil: number;
  consumedBy?: string;
}

const rateWindows = new Map<string, number[]>();
const idempotentLiveRequests = new Map<string, IdempotentEntry>();
const frozenRequests = new Map<string, FrozenRequestEntry>();
let budgetDay = utcDay();
let dailySpentRaw = 0n;
let dailyReservedRaw = 0n;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function unsignedEnv(value: string | undefined, fallback: bigint): bigint {
  if (!value || !/^\d+$/.test(value)) return fallback;
  try { return BigInt(value); } catch { return fallback; }
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetDailyBudgetIfNeeded(): void {
  const today = utcDay();
  if (today === budgetDay) return;
  budgetDay = today;
  dailySpentRaw = 0n;
  dailyReservedRaw = 0n;
}

function requestOriginAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function responseHeaders(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin;
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "vary": "Origin",
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "access-control-allow-origin": origin } : {})
  };
}

function json(request: IncomingMessage, response: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  response.writeHead(status, { ...responseHeaders(request), ...extraHeaders });
  response.end(JSON.stringify(body));
}

function clientKey(request: IncomingMessage): string {
  if (TRUST_PROXY) {
    const forwarded = request.headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    if (first?.trim()) return first.trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (rateWindows.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    rateWindows.set(key, recent);
    return false;
  }
  recent.push(now);
  rateWindows.set(key, recent);
  return true;
}

function cleanupIdempotencyCache(): void {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [key, entry] of idempotentLiveRequests) {
    if (entry.createdAt < cutoff) idempotentLiveRequests.delete(key);
  }
  if (idempotentLiveRequests.size <= 200) return;
  const oldest = [...idempotentLiveRequests.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [key] of oldest.slice(0, idempotentLiveRequests.size - 200)) idempotentLiveRequests.delete(key);
}

function cleanupFrozenRequests(): void {
  const now = Date.now();
  for (const [key, entry] of frozenRequests) {
    if (entry.validUntil < now) frozenRequests.delete(key);
  }
  if (frozenRequests.size <= 200) return;
  const oldest = [...frozenRequests.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [key] of oldest.slice(0, frozenRequests.size - 200)) frozenRequests.delete(key);
}

function readMiners(): TelegraphMinerRecord[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "miners.json"), "utf8"));
    return Array.isArray(parsed) ? parsed as TelegraphMinerRecord[] : [];
  } catch {
    return [];
  }
}

function parseUsdc(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) throw new Error(`${field}_invalid`);
  const [whole, fraction = ""] = value.split(".");
  const raw = BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
  if (raw <= 0n || raw > 10_000_000n) throw new Error(`${field}_out_of_range`);
  return raw.toString();
}

function parseAddress(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("destination_invalid");
  return value;
}

function parseDurationSeconds(value: unknown): number {
  if (value === undefined) return 3_600;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("duration_invalid");
  if (value < 900 || value > 86_400) throw new Error("duration_out_of_range");
  return value;
}

function requirementLabel(intent: string): string {
  if (intent === "FRAUD_DETECTION") return "Fraud intelligence";
  if (intent === "ONCHAIN_TX_LOOKUP") return "Transaction intelligence";
  if (intent === "WALLET_BALANCE_CHECK") return "Wallet intelligence";
  return intent;
}

function summarizeRequirements(plan: ReturnType<typeof createAdaptiveEvidencePlan>) {
  return plan.requirements.map((requirement) => ({
    intent: requirement.intent,
    label: requirementLabel(requirement.intent),
    minimumDistinctMiners: requirement.quorum.minimumDistinctMiners,
    minimumPositiveResults: requirement.quorum.minimumPositiveResults,
    minimumPositiveConfidence: requirement.quorum.minimumPositiveConfidence
  }));
}

function createFreezeFingerprint(input: {
  actionHash: string;
  limitRaw: string;
  destination: string;
  durationSeconds: number;
  reference: string;
}): string {
  return hashCanonicalPayload(canonicalize({
    agentId: AGENT_ID,
    actionHash: input.actionHash,
    maxPerActionRaw: input.limitRaw,
    destination: input.destination.toLowerCase(),
    durationSeconds: input.durationSeconds,
    reference: input.reference
  }));
}

function commonRecord(input: {
  action: ReturnType<typeof createActionContract>;
  mandate: ReturnType<typeof createMandateContract>;
  plan: ReturnType<typeof createAdaptiveEvidencePlan>;
  reference: string;
  freezeFingerprint: string;
  freezeId?: string;
}) {
  return {
    freezeFingerprint: input.freezeFingerprint,
    ...(input.freezeId ? { freezeId: input.freezeId } : {}),
    riskTier: input.plan.riskTier,
    routing: {
      mode: "TELEGRAPH_AUTO_INTENT",
      endpoint: "/v1/ask"
    },
    action: {
      id: input.action.id,
      hash: input.action.actionHash,
      amount: (Number(input.action.payload.amountRaw) / 1_000_000).toFixed(2),
      amountRaw: input.action.payload.amountRaw,
      recipient: input.action.payload.destination,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      chain: "Base Sepolia",
      asset: "USDC",
      reason: input.action.payload.reason,
      reference: input.reference
    },
    mandate: {
      id: input.mandate.mandateId,
      hash: input.mandate.mandateHash,
      maxPerAction: (Number(input.mandate.maxPerActionRaw) / 1_000_000).toFixed(2),
      expiresAt: input.mandate.expiresAt
    },
    requirements: summarizeRequirements(input.plan),
    executionAuthorized: false as const,
    permit: null
  };
}

async function performLiveAuthorization(input: {
  action: ReturnType<typeof createActionContract>;
  mandate: ReturnType<typeof createMandateContract>;
  plan: ReturnType<typeof createAdaptiveEvidencePlan>;
  reference: string;
  freezeFingerprint: string;
  freezeId: string;
  privateKey: `0x${string}`;
  now: Date;
}): Promise<ApiReply> {
  resetDailyBudgetIfNeeded();
  const plannedSpend = BigInt(input.plan.maxEvidenceSpendRaw);
  if (dailySpentRaw + dailyReservedRaw + plannedSpend > LIVE_DAILY_BUDGET_RAW) {
    return { status: 429, body: { error: "live_daily_budget_exhausted" } };
  }

  dailyReservedRaw += plannedSpend;
  try {
    const acquire = createAutoRoutedLiveIntentAcquirer({
      privateKey: input.privateKey,
      miners: readMiners(),
      engineUrl: process.env.TELEGRAPH_ENGINE_URL,
      evidenceDirectory: path.join(process.cwd(), "data", "evidence", "adaptive")
    });
    const collection = await collectAdaptiveEvidence(input.action, input.plan, acquire);
    const decision = evaluatePaymentsAdaptiveV1(input.mandate, input.action, input.plan, collection.bundle, { agentId: AGENT_ID, now: new Date() });
    const actualSpend = BigInt(collection.actualEvidenceSpendRaw);
    dailyReservedRaw -= plannedSpend;
    dailySpentRaw += actualSpend;

    return {
      status: 200,
      body: {
        status: "DECIDED",
        decision: decision.decision,
        reason: decision.reason,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion,
        ...commonRecord(input),
        checks: decision.checks,
        evidence: {
          status: collection.status,
          code: collection.code,
          completedIntents: collection.completedIntents,
          spendRaw: collection.actualEvidenceSpendRaw,
          bundleHash: collection.bundle.bundleHash,
          rejectedAttempts: collection.rejectedAttempts.length
        }
      }
    };
  } catch (error) {
    dailyReservedRaw -= plannedSpend;
    dailySpentRaw += plannedSpend;
    return {
      status: 503,
      body: {
        error: "live_verification_failed",
        detail: error instanceof Error ? error.message : "unknown_live_error"
      }
    };
  }
}

const server = createServer(async (request, response) => {
  if (!requestOriginAllowed(request)) return json(request, response, 403, { error: "origin_not_allowed" });

  if (request.method === "OPTIONS") {
    return json(request, response, 204, null, {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, idempotency-key",
      "access-control-max-age": "600"
    });
  }

  if (request.method !== "POST" || request.url !== "/api/authorize") return json(request, response, 404, { error: "not_found" });

  const identity = clientKey(request);
  if (!consumeRateLimit(`policy:${identity}`, POLICY_PER_MINUTE, 60_000)) {
    return json(request, response, 429, { error: "policy_rate_limited" }, { "retry-after": "60" });
  }

  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 16_000) return json(request, response, 413, { error: "request_too_large" });
    }

    const input = JSON.parse(raw) as {
      mode?: unknown;
      agentId?: unknown;
      limit: unknown;
      amount: unknown;
      destination?: unknown;
      durationSeconds?: unknown;
      reason: unknown;
      reference?: unknown;
      freezeId?: unknown;
    };
    const mode = input.mode === undefined || input.mode === "policy" ? "policy" : input.mode === "live" ? "live" : null;
    if (!mode) return json(request, response, 400, { error: "mode_invalid" });
    if (input.agentId !== undefined && input.agentId !== AGENT_ID) return json(request, response, 400, { error: "agent_id_invalid" });

    const limitRaw = parseUsdc(input.limit, "limit");
    const amountRaw = parseUsdc(input.amount, "amount");
    const destination = parseAddress(input.destination, VENDOR);
    const durationSeconds = parseDurationSeconds(input.durationSeconds);
    const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 256) : "Unspecified payment";
    const reference = typeof input.reference === "string" ? input.reference.slice(0, 200) : "";
    const now = new Date();

    const action = createActionContract({
      type: "payment",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      token: BASE_SEPOLIA_USDC,
      amountRaw,
      destination,
      reason,
      policyId: "payments.adaptive.v1",
      policyVersion: 1
    });
    const freezeFingerprint = createFreezeFingerprint({
      actionHash: action.actionHash,
      limitRaw,
      destination: action.payload.destination,
      durationSeconds,
      reference
    });

    cleanupFrozenRequests();
    let freezeId: string | undefined;
    let issuedAt = new Date(now.getTime() - 60_000).toISOString();
    let expiresAt = new Date(now.getTime() + durationSeconds * 1_000).toISOString();
    let frozenEntry: FrozenRequestEntry | undefined;

    if (mode === "live") {
      if (typeof input.freezeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.freezeId)) {
        return json(request, response, 400, { error: "frozen_request_token_required" });
      }
      freezeId = input.freezeId;
      frozenEntry = frozenRequests.get(freezeId);
      if (!frozenEntry) return json(request, response, 409, { error: "frozen_request_invalid" });
      if (frozenEntry.validUntil < now.getTime()) {
        frozenRequests.delete(freezeId);
        return json(request, response, 409, { error: "frozen_request_expired" });
      }
      if (frozenEntry.fingerprint !== freezeFingerprint) {
        return json(request, response, 409, { error: "frozen_request_mismatch" });
      }
      issuedAt = frozenEntry.issuedAt;
      expiresAt = frozenEntry.expiresAt;
    }

    const plan = createAdaptiveEvidencePlan(action);
    const mandate = createMandateContract({
      mandateId: "proofgate-live-mandate",
      principalId: "proofgate-user",
      agentId: AGENT_ID,
      allowedActionTypes: ["payment"],
      allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
      allowedAssets: [BASE_SEPOLIA_USDC],
      allowedDestinations: [VENDOR],
      maxPerActionRaw: limitRaw,
      requiredIntents: [...ADAPTIVE_EVIDENCE_INTENTS],
      policyId: "payments.adaptive.v1",
      policyVersion: 1,
      issuedAt,
      expiresAt,
      version: 1
    });
    const common = commonRecord({ action, mandate, plan, reference, freezeFingerprint, ...(freezeId ? { freezeId } : {}) });

    const mandateEvaluation = evaluateMandate(mandate, action, AGENT_ID, now);
    if (!mandateEvaluation.valid) {
      const decision = evaluatePaymentsAdaptiveV1(mandate, action, plan, null, { agentId: AGENT_ID, now });
      return json(request, response, 200, {
        status: "BLOCKED",
        decision: "BLOCK",
        reason: decision.reason,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion,
        ...common,
        checks: mandateEvaluation.checks,
        evidence: { status: "NOT_REQUESTED", spendRaw: "0" }
      });
    }

    if (mode === "policy") {
      freezeId = randomUUID();
      const validUntil = Math.min(Date.parse(expiresAt), now.getTime() + FROZEN_REQUEST_TTL_MS);
      frozenRequests.set(freezeId, {
        fingerprint: freezeFingerprint,
        issuedAt,
        expiresAt,
        createdAt: now.getTime(),
        validUntil
      });
      return json(request, response, 200, {
        status: "REQUIRES_INTELLIGENCE",
        decision: null,
        reason: "external_intelligence_required",
        policyId: "payments.adaptive.v1",
        policyVersion: 1,
        ...commonRecord({ action, mandate, plan, reference, freezeFingerprint, freezeId }),
        evidence: { status: "NOT_REQUESTED", spendRaw: "0" }
      });
    }

    if (!freezeId || !frozenEntry) return json(request, response, 409, { error: "frozen_request_invalid" });
    if (!LIVE_ENABLED) return json(request, response, 503, { error: "live_authorization_disabled" });
    const privateKey = process.env.TELEGRAPH_EVM_PRIVATE_KEY as `0x${string}` | undefined;
    if (!privateKey) return json(request, response, 503, { error: "telegraph_credentials_unavailable" });

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return json(request, response, 400, { error: "idempotency_key_required" });
    }

    cleanupIdempotencyCache();
    const idempotencyFingerprint = `${freezeId}:${freezeFingerprint}`;
    const existing = idempotentLiveRequests.get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== idempotencyFingerprint) return json(request, response, 409, { error: "idempotency_key_conflict" });
      const reply = await existing.promise;
      return json(request, response, reply.status, reply.body);
    }

    if (frozenEntry.consumedBy && frozenEntry.consumedBy !== idempotencyKey) {
      return json(request, response, 409, { error: "frozen_request_consumed" });
    }

    if (!consumeRateLimit(`live:${identity}`, LIVE_PER_HOUR, 60 * 60_000)) {
      return json(request, response, 429, { error: "live_rate_limited" }, { "retry-after": "3600" });
    }

    frozenEntry.consumedBy = idempotencyKey;
    const promise = performLiveAuthorization({ action, mandate, plan, reference, freezeFingerprint, freezeId, privateKey, now });
    idempotentLiveRequests.set(idempotencyKey, { fingerprint: idempotencyFingerprint, promise, createdAt: Date.now() });
    const reply = await promise;
    return json(request, response, reply.status, reply.body);
  } catch (error) {
    return json(request, response, 400, { error: error instanceof Error ? error.message : "invalid_authorization_request" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ProofGate web API listening on ${PORT}`);
  console.log(`Live Telegraph auto-route authorization: ${LIVE_ENABLED ? "enabled" : "disabled"}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
