import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createActionContract, BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_USDC } from "../src/core/action-contract.js";
import { createMandateContract } from "../src/core/mandate-contract.js";
import { evaluatePaymentsAdaptiveV1 } from "../src/policy/payments-adaptive-v1.js";
import { ADAPTIVE_EVIDENCE_INTENTS, createAdaptiveEvidencePlan } from "../src/telegraph/adaptive-evidence-plan.js";
import { collectAdaptiveEvidence } from "../src/telegraph/adaptive-orchestrator.js";
import { createLiveIntentAcquirer } from "../src/telegraph/live-intent-client.js";
import type { TelegraphMinerRecord } from "../src/telegraph/routed-evidence.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT_ID = "demo-agent";
const PORT = Number(process.env.PROOFGATE_WEB_API_PORT ?? 8787);

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "http://localhost:5173", "access-control-allow-headers": "content-type" });
  response.end(JSON.stringify(body));
}

function readMiners(): TelegraphMinerRecord[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "miners.json"), "utf8"));
    return Array.isArray(parsed) ? parsed as TelegraphMinerRecord[] : [];
  } catch { return []; }
}

function parseUsdc(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(value)) throw new Error(`${field}_invalid`);
  const [whole, fraction = ""] = value.split(".");
  const raw = BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
  if (raw <= 0n || raw > 10_000_000n) throw new Error(`${field}_out_of_range`);
  return raw.toString();
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, null);
  if (request.method !== "POST" || request.url !== "/api/authorize") return json(response, 404, { error: "not_found" });
  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 16_000) return json(response, 413, { error: "request_too_large" });
    }
    const input = JSON.parse(raw) as { limit: unknown; amount: unknown; reason: unknown; reference?: unknown };
    const limitRaw = parseUsdc(input.limit, "limit");
    const amountRaw = parseUsdc(input.amount, "amount");
    const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 500) : "Unspecified payment";
    const reference = typeof input.reference === "string" ? input.reference.slice(0, 200) : "";
    const privateKey = process.env.TELEGRAPH_EVM_PRIVATE_KEY as `0x${string}` | undefined;
    if (!privateKey) return json(response, 503, { error: "telegraph_credentials_unavailable", decision: "HOLD", reason: "telegraph_credentials_unavailable", executionAuthorized: false, permit: null });
    const now = new Date();
    const action = createActionContract({ type: "payment", chainId: BASE_SEPOLIA_CHAIN_ID, token: BASE_SEPOLIA_USDC, amountRaw, destination: VENDOR, reason, policyId: "payments.adaptive.v1", policyVersion: 1 });
    const plan = createAdaptiveEvidencePlan(action);
    const mandate = createMandateContract({ mandateId: "try-proofgate-mandate", principalId: "proofgate-user", agentId: AGENT_ID, allowedActionTypes: ["payment"], allowedChainIds: [BASE_SEPOLIA_CHAIN_ID], allowedAssets: [BASE_SEPOLIA_USDC], allowedDestinations: [VENDOR], maxPerActionRaw: limitRaw, requiredIntents: [...ADAPTIVE_EVIDENCE_INTENTS], policyId: "payments.adaptive.v1", policyVersion: 1, issuedAt: new Date(now.getTime() - 60_000).toISOString(), expiresAt: new Date(now.getTime() + 86_400_000).toISOString(), version: 1 });

    if (BigInt(amountRaw) > BigInt(limitRaw)) {
      const decision = evaluatePaymentsAdaptiveV1(mandate, action, plan, null, { agentId: AGENT_ID, now });
      return json(response, 200, { decision: decision.decision, reason: decision.reason, policyId: decision.policyId, policyVersion: decision.policyVersion, action: { amount: (Number(amountRaw) / 1_000_000).toFixed(2), recipient: VENDOR, chain: "Base Sepolia", reference }, checks: decision.checks, executionAuthorized: false, permit: null, evidence: { status: "NOT_REQUESTED", spendRaw: "0" } });
    }

    const acquire = createLiveIntentAcquirer({ privateKey, miners: readMiners(), engineUrl: process.env.TELEGRAPH_ENGINE_URL, evidenceDirectory: path.join(process.cwd(), "data", "evidence", "adaptive") });
    const collection = await collectAdaptiveEvidence(action, plan, acquire);
    const decision = evaluatePaymentsAdaptiveV1(mandate, action, plan, collection.bundle, { agentId: AGENT_ID, now: new Date() });
    return json(response, 200, { decision: decision.decision, reason: decision.reason, policyId: decision.policyId, policyVersion: decision.policyVersion, action: { amount: (Number(amountRaw) / 1_000_000).toFixed(2), recipient: VENDOR, chain: "Base Sepolia", reference }, checks: decision.checks, executionAuthorized: false, permit: null, evidence: { status: collection.status, code: collection.code, completedIntents: collection.completedIntents, spendRaw: collection.actualEvidenceSpendRaw, bundleHash: collection.bundle.bundleHash, rejectedAttempts: collection.rejectedAttempts.length } });
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : "invalid_authorization_request" });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`ProofGate web API listening on ${PORT}`));
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
