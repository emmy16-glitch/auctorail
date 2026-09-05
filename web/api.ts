import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createActionContract,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  canonicalize,
  hashCanonicalPayload,
  type ActionContract
} from "../src/core/action-contract.js";
import { createMandateContract, evaluateMandate, type MandateContract } from "../src/core/mandate-contract.js";
import { evaluatePaymentsAdaptiveV1 } from "../src/policy/payments-adaptive-v1.js";
import type { DecisionRecord } from "../src/policy/payments-strict-v1.js";
import { ADAPTIVE_EVIDENCE_INTENTS, createAdaptiveEvidencePlan } from "../src/telegraph/adaptive-evidence-plan.js";
import { collectAdaptiveEvidence } from "../src/telegraph/adaptive-orchestrator.js";
import { createAutoRoutedLiveIntentAcquirer } from "../src/telegraph/auto-route-acquirer.js";
import type { EvidenceBundle } from "../src/telegraph/evidence-bundle.js";
import type { TelegraphMinerRecord } from "../src/telegraph/routed-evidence.js";
import { mintPermit, type Permit } from "../src/permit/permit.js";
import { Ed25519PermitSigner } from "../src/permit/signer.js";
import { executeProtectedAction } from "../src/executor/controlled-executor.js";
import { FilePermitConsumptionStore } from "../src/executor/permit-store.js";
import { executeBaseSepoliaUsdcTransfer } from "../src/executor/base-sepolia-usdc.js";
import type { PaymentExecutionArtifact } from "../src/gateway/payment-gateway.js";
import { createProofReceipt, verifyProofReceipt, type ReceiptExecution } from "../src/receipt/proof-receipt.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT_ID = "invoice-bot";
const PORT = Number(process.env.PROOFGATE_WEB_API_PORT ?? 8787);
const LIVE_ENABLED = process.env.PROOFGATE_LIVE_AUTHORIZATION_ENABLED === "true";
const TRUST_PROXY = process.env.PROOFGATE_TRUST_PROXY === "true";
const LIVE_PER_HOUR = positiveInteger(process.env.PROOFGATE_LIVE_REQUESTS_PER_HOUR, 3);
const EXECUTIONS_PER_HOUR = positiveInteger(process.env.PROOFGATE_EXECUTIONS_PER_HOUR, 3);
const POLICY_PER_MINUTE = positiveInteger(process.env.PROOFGATE_POLICY_REQUESTS_PER_MINUTE, 30);
const LIVE_DAILY_BUDGET_RAW = unsignedEnv(process.env.PROOFGATE_LIVE_DAILY_BUDGET_RAW, 500_000n);
const FROZEN_REQUEST_TTL_MS = 120_000;
const EXECUTION_SESSION_TTL_MS = 120_000;
const PERMIT_TTL_SECONDS = 120;
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
  issuedAt: string;
  expiresAt: string;
  createdAt: number;
  validUntil: number;
  consumedBy?: string;
}

interface PendingExecution {
  token: string;
  action: ActionContract;
  mandate: MandateContract;
  evidence: EvidenceBundle;
  decision: DecisionRecord;
  permit: Permit;
  signer: Ed25519PermitSigner;
  freezeFingerprint: string;
  reference: string;
  evidenceSpendRaw: string;
  createdAt: number;
  validUntil: number;
  claimedBy?: string;
}

interface IdempotentExecutionEntry {
  token: string;
  promise: Promise<ApiReply>;
  createdAt: number;
}

const rateWindows = new Map<string, number[]>();
const idempotentLiveRequests = new Map<string, IdempotentEntry>();
const idempotentExecutions = new Map<string, IdempotentExecutionEntry>();
const frozenRequests = new Map<string, FrozenRequestEntry>();
const pendingExecutions = new Map<string, PendingExecution>();
let cachedPermitSigner: Ed25519PermitSigner | null | undefined;
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

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16_000) throw new Error("request_too_large");
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("request_body_invalid");
  return parsed as Record<string, unknown>;
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
  for (const [key, entry] of idempotentExecutions) {
    if (entry.createdAt < cutoff) idempotentExecutions.delete(key);
  }
  if (idempotentLiveRequests.size > 200) {
    const oldest = [...idempotentLiveRequests.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [key] of oldest.slice(0, idempotentLiveRequests.size - 200)) idempotentLiveRequests.delete(key);
  }
  if (idempotentExecutions.size > 200) {
    const oldest = [...idempotentExecutions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [key] of oldest.slice(0, idempotentExecutions.size - 200)) idempotentExecutions.delete(key);
  }
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

function cleanupPendingExecutions(): void {
  const now = Date.now();
  for (const [token, entry] of pendingExecutions) {
    if (entry.validUntil < now) pendingExecutions.delete(token);
  }
  if (pendingExecutions.size <= 200) return;
  const oldest = [...pendingExecutions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [token] of oldest.slice(0, pendingExecutions.size - 200)) pendingExecutions.delete(token);
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

function summarizeEvidenceSources(bundle: EvidenceBundle) {
  const sources = new Map<string, {
    id: string;
    name: string;
    slug: string;
    intents: Set<string>;
  }>();

  for (const item of bundle.items) {
    const existing = sources.get(item.miner.id);
    if (existing) {
      existing.intents.add(item.intent);
      continue;
    }
    sources.set(item.miner.id, {
      id: item.miner.id,
      name: item.miner.name,
      slug: item.miner.slug,
      intents: new Set([item.intent])
    });
  }

  return [...sources.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((source) => ({
      id: source.id,
      name: source.name,
      slug: source.slug,
      intents: [...source.intents].sort()
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

function permitHash(permit: Permit): string {
  return hashCanonicalPayload(canonicalize(permit));
}

function loadPermitPem(): string | null {
  const fromEnv = process.env.PROOFGATE_PERMIT_ED25519_PRIVATE_KEY;
  if (fromEnv?.trim()) return fromEnv.replace(/\\n/g, "\n");

  const configuredPath = process.env.PROOFGATE_PERMIT_ED25519_PRIVATE_KEY_FILE;
  if (configuredPath?.trim()) {
    try { return fs.readFileSync(configuredPath, "utf8"); } catch { return null; }
  }

  if (process.env.NODE_ENV === "production") return null;

  const localPath = path.join(process.cwd(), ".proofgate", "web-permit-ed25519.pem");
  try {
    if (fs.existsSync(localPath)) return fs.readFileSync(localPath, "utf8");
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const pair = generateKeyPairSync("ed25519");
    const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    fs.writeFileSync(localPath, pem, { mode: 0o600 });
    return pem;
  } catch {
    return null;
  }
}

function getPermitSigner(): Ed25519PermitSigner | null {
  if (cachedPermitSigner !== undefined) return cachedPermitSigner;
  const pem = loadPermitPem();
  if (!pem) {
    cachedPermitSigner = null;
    return null;
  }
  try {
    cachedPermitSigner = new Ed25519PermitSigner(
      pem,
      process.env.PROOFGATE_PERMIT_KEY_ID ?? "proofgate-web-v1"
    );
    return cachedPermitSigner;
  } catch {
    cachedPermitSigner = null;
    return null;
  }
}

function executorPrivateKey(): `0x${string}` | null {
  const value = process.env.PROOFGATE_EXECUTOR_PRIVATE_KEY ?? process.env.TELEGRAPH_EVM_PRIVATE_KEY;
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? value as `0x${string}` : null;
}

function commonRecord(input: {
  action: ReturnType<typeof createActionContract>;
  mandate: ReturnType<typeof createMandateContract>;
  plan: ReturnType<typeof createAdaptiveEvidencePlan>;
  reference: string;
  freezeFingerprint: string;
}) {
  return {
    freezeFingerprint: input.freezeFingerprint,
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
    permit: null,
    execution: null
  };
}

async function performLiveAuthorization(input: {
  action: ReturnType<typeof createActionContract>;
  mandate: ReturnType<typeof createMandateContract>;
  plan: ReturnType<typeof createAdaptiveEvidencePlan>;
  reference: string;
  freezeFingerprint: string;
  privateKey: `0x${string}`;
  signer: Ed25519PermitSigner;
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

    const base = {
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
        rejectedAttempts: collection.rejectedAttempts.length,
        failedIntent: collection.failedIntent ?? null,
        error: collection.error ?? null,
        sources: summarizeEvidenceSources(collection.bundle)
      }
    };

    if (decision.decision !== "ALLOW") {
      return { status: 200, body: base };
    }

    let permit: Permit;
    try {
      permit = mintPermit(
        input.mandate,
        input.action,
        collection.bundle,
        decision,
        input.signer,
        { now: new Date(), ttlSeconds: PERMIT_TTL_SECONDS }
      );
    } catch (error) {
      return {
        status: 503,
        body: {
          error: "permit_issuance_failed",
          detail: error instanceof Error ? error.message : "unknown_permit_error"
        }
      };
    }

    const token = `exec_${randomBytes(24).toString("hex")}`;
    const now = Date.now();
    const validUntil = Math.min(Date.parse(permit.payload.expiresAt), now + EXECUTION_SESSION_TTL_MS);
    pendingExecutions.set(token, {
      token,
      action: input.action,
      mandate: input.mandate,
      evidence: collection.bundle,
      decision,
      permit,
      signer: input.signer,
      freezeFingerprint: input.freezeFingerprint,
      reference: input.reference,
      evidenceSpendRaw: collection.actualEvidenceSpendRaw,
      createdAt: now,
      validUntil
    });

    return {
      status: 200,
      body: {
        ...base,
        executionAuthorized: true,
        permit: {
          id: permit.payload.permitId,
          hash: permitHash(permit),
          actionHash: permit.payload.actionHash,
          expiresAt: permit.payload.expiresAt,
          keyId: permit.payload.keyId,
          algorithm: permit.payload.algorithm
        },
        execution: {
          status: "READY",
          token,
          endpoint: "/api/execute"
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

function saveReceipt(receipt: ReturnType<typeof createProofReceipt>): void {
  const directory = path.join(process.cwd(), "data", "receipts");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${receipt.receiptId}.json`),
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 }
  );
}

async function performPendingExecution(
  pending: PendingExecution,
  privateKey: `0x${string}`,
  executionId: string
): Promise<ApiReply> {
  const store = new FilePermitConsumptionStore(path.join(process.cwd(), ".proofgate", "consumed"));
  const outcome = await executeProtectedAction<PaymentExecutionArtifact>({
    mandate: pending.mandate,
    permit: pending.permit,
    action: pending.action,
    evidence: pending.evidence,
    decision: pending.decision,
    verifier: pending.signer,
    store,
    executionId,
    execute: (action) => executeBaseSepoliaUsdcTransfer({ action, privateKey })
  });

  const artifact = outcome.result as Partial<PaymentExecutionArtifact> | undefined;
  const receiptExecution: ReceiptExecution = {
    status: outcome.status === "EXECUTED" ? "EXECUTED" : outcome.status === "AMBIGUOUS" ? "AMBIGUOUS" : outcome.status === "BLOCKED" ? "BLOCKED" : "FAILED",
    code: outcome.code,
    ...(artifact?.transactionHash ? { transactionHash: artifact.transactionHash } : {}),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    ...(outcome.status === "EXECUTED" && artifact?.confirmedAt ? { executedAt: artifact.confirmedAt } : outcome.consumedAt ? { executedAt: outcome.consumedAt } : {}),
    ...(outcome.error ? { error: outcome.error } : {})
  };

  const receipt = createProofReceipt({
    mandate: pending.mandate,
    action: pending.action,
    evidence: pending.evidence,
    decision: pending.decision,
    permit: pending.permit,
    execution: receiptExecution,
    ...(artifact?.operationId ? { operationId: artifact.operationId } : {})
  });

  if (!verifyProofReceipt(receipt)) {
    return { status: 500, body: { error: "proof_receipt_verification_failed" } };
  }
  saveReceipt(receipt);

  return {
    status: 200,
    body: {
      status: outcome.status,
      code: outcome.code,
      actionHash: pending.action.actionHash,
      freezeFingerprint: pending.freezeFingerprint,
      permit: {
        id: pending.permit.payload.permitId,
        hash: permitHash(pending.permit),
        expiresAt: pending.permit.payload.expiresAt
      },
      network: {
        chain: "Base Sepolia",
        chainId: BASE_SEPOLIA_CHAIN_ID,
        asset: "USDC"
      },
      payment: {
        amount: (Number(pending.action.payload.amountRaw) / 1_000_000).toFixed(2),
        amountRaw: pending.action.payload.amountRaw,
        recipient: pending.action.payload.destination,
        recipientLabel: "ProofGate Vendor",
        reference: pending.reference
      },
      transaction: {
        status: outcome.status === "EXECUTED" ? "CONFIRMED" : outcome.status === "AMBIGUOUS" ? "CONFIRMATION_UNCERTAIN" : outcome.status,
        transactionHash: artifact?.transactionHash ?? null,
        blockNumber: artifact?.blockNumber ?? null,
        confirmedAt: artifact?.confirmedAt ?? null,
        confirmedVia: artifact?.confirmedVia ?? null,
        sender: artifact?.sender ?? null,
        nonce: artifact?.nonce ?? null,
        operationId: artifact?.operationId ?? null,
        automaticRetry: false
      },
      evidence: {
        bundleHash: pending.evidence.bundleHash,
        spendRaw: pending.evidenceSpendRaw,
        sources: summarizeEvidenceSources(pending.evidence)
      },
      receipt: {
        id: receipt.receiptId,
        hash: receipt.receiptHash,
        schemaVersion: receipt.schemaVersion,
        createdAt: receipt.createdAt
      },
      ...(outcome.error ? { error: outcome.error } : {})
    }
  };
}

async function handleExecute(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const identity = clientKey(request);
  try {
    const body = await readJsonBody(request);
    const token = body.executionToken;
    if (typeof token !== "string" || !/^exec_[0-9a-f]{48}$/.test(token)) {
      return json(request, response, 400, { error: "execution_token_invalid" });
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return json(request, response, 400, { error: "idempotency_key_required" });
    }

    cleanupPendingExecutions();
    cleanupIdempotencyCache();

    const existing = idempotentExecutions.get(idempotencyKey);
    if (existing) {
      if (existing.token !== token) return json(request, response, 409, { error: "idempotency_key_conflict" });
      const reply = await existing.promise;
      return json(request, response, reply.status, reply.body);
    }

    const pending = pendingExecutions.get(token);
    if (!pending) return json(request, response, 409, { error: "execution_session_invalid" });
    if (pending.validUntil <= Date.now()) {
      pendingExecutions.delete(token);
      return json(request, response, 409, { error: "execution_session_expired" });
    }
    if (pending.claimedBy && pending.claimedBy !== idempotencyKey) {
      return json(request, response, 409, { error: "execution_session_consumed" });
    }

    const privateKey = executorPrivateKey();
    if (!privateKey) return json(request, response, 503, { error: "executor_credentials_unavailable" });
    if (!consumeRateLimit(`execute:${identity}`, EXECUTIONS_PER_HOUR, 60 * 60_000)) {
      return json(request, response, 429, { error: "execution_rate_limited" }, { "retry-after": "3600" });
    }

    pending.claimedBy = idempotencyKey;
    const promise = performPendingExecution(pending, privateKey, idempotencyKey);
    idempotentExecutions.set(idempotencyKey, { token, promise, createdAt: Date.now() });
    const reply = await promise;
    return json(request, response, reply.status, reply.body);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_execution_request";
    return json(request, response, code === "request_too_large" ? 413 : 400, { error: code });
  }
}

async function handleAuthorize(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const identity = clientKey(request);
  if (!consumeRateLimit(`policy:${identity}`, POLICY_PER_MINUTE, 60_000)) {
    return json(request, response, 429, { error: "policy_rate_limited" }, { "retry-after": "60" });
  }

  try {
    const input = await readJsonBody(request) as {
      mode?: unknown;
      agentId?: unknown;
      limit: unknown;
      amount: unknown;
      destination?: unknown;
      durationSeconds?: unknown;
      reason: unknown;
      reference?: unknown;
      freezeFingerprint?: unknown;
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
    cleanupPendingExecutions();
    let issuedAt = new Date(now.getTime() - 60_000).toISOString();
    let expiresAt = new Date(now.getTime() + durationSeconds * 1_000).toISOString();
    let frozenEntry: FrozenRequestEntry | undefined;

    if (mode === "live") {
      if (typeof input.freezeFingerprint !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(input.freezeFingerprint)) {
        return json(request, response, 400, { error: "frozen_request_required" });
      }
      if (input.freezeFingerprint !== freezeFingerprint) {
        return json(request, response, 409, { error: "frozen_request_mismatch" });
      }
      frozenEntry = frozenRequests.get(freezeFingerprint);
      if (!frozenEntry) return json(request, response, 409, { error: "frozen_request_invalid" });
      if (frozenEntry.validUntil < now.getTime()) {
        frozenRequests.delete(freezeFingerprint);
        return json(request, response, 409, { error: "frozen_request_expired" });
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
    const common = commonRecord({ action, mandate, plan, reference, freezeFingerprint });

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
      const validUntil = Math.min(Date.parse(expiresAt), now.getTime() + FROZEN_REQUEST_TTL_MS);
      frozenRequests.set(freezeFingerprint, {
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
        ...common,
        evidence: { status: "NOT_REQUESTED", spendRaw: "0" }
      });
    }

    if (!frozenEntry) return json(request, response, 409, { error: "frozen_request_invalid" });
    if (!LIVE_ENABLED) return json(request, response, 503, { error: "live_authorization_disabled" });
    const privateKey = process.env.TELEGRAPH_EVM_PRIVATE_KEY as `0x${string}` | undefined;
    if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      return json(request, response, 503, { error: "telegraph_credentials_unavailable" });
    }

    // Fail before x402 evidence spend when automatic execution cannot be completed.
    const signer = getPermitSigner();
    if (!signer) return json(request, response, 503, { error: "permit_signer_unavailable" });
    if (!executorPrivateKey()) return json(request, response, 503, { error: "executor_credentials_unavailable" });

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return json(request, response, 400, { error: "idempotency_key_required" });
    }

    cleanupIdempotencyCache();
    const existing = idempotentLiveRequests.get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== freezeFingerprint) return json(request, response, 409, { error: "idempotency_key_conflict" });
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
    const promise = performLiveAuthorization({ action, mandate, plan, reference, freezeFingerprint, privateKey, signer, now });
    idempotentLiveRequests.set(idempotencyKey, { fingerprint: freezeFingerprint, promise, createdAt: Date.now() });
    const reply = await promise;
    return json(request, response, reply.status, reply.body);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_authorization_request";
    return json(request, response, code === "request_too_large" ? 413 : 400, { error: code });
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

  if (request.method === "POST" && request.url === "/api/authorize") return handleAuthorize(request, response);
  if (request.method === "POST" && request.url === "/api/execute") return handleExecute(request, response);
  return json(request, response, 404, { error: "not_found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ProofGate web API listening on ${PORT}`);
  console.log(`Live Telegraph auto-route authorization: ${LIVE_ENABLED ? "enabled" : "disabled"}`);
  console.log("Authorized Base Sepolia execution endpoint: /api/execute");
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
