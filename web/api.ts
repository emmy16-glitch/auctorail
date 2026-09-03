import { createServer } from "node:http";
import { createActionContract, BASE_SEPOLIA_USDC } from "../src/core/action-contract.js";
import { createMandateContract } from "../src/core/mandate-contract.js";
import { evaluatePaymentsStrictV1 } from "../src/policy/payments-strict-v1.js";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const PORT = Number(process.env.PROOFGATE_WEB_API_PORT ?? 8787);

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:5173",
    "access-control-allow-headers": "content-type"
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, null);
  if (request.method !== "POST" || request.url !== "/api/authorize") return json(response, 404, { error: "not_found" });
  try {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    if (raw.length > 16_000) return json(response, 413, { error: "request_too_large" });
    const input = JSON.parse(raw) as { limit: string; amount: string; reason: string; reference?: string };
    const limit = Number(input.limit);
    const amount = Number(input.amount);
    if (!Number.isFinite(limit) || !Number.isFinite(amount) || limit <= 0 || amount <= 0 || limit > 1_000_000 || amount > 1_000_000) {
      return json(response, 400, { error: "invalid_amount" });
    }
    const now = new Date();
    const mandate = createMandateContract({
      mandateId: "try-proofgate-mandate",
      principalId: "proofgate-user",
      agentId: "demo-agent",
      allowedActionTypes: ["payment"],
      allowedChainIds: [84532],
      allowedAssets: [BASE_SEPOLIA_USDC],
      allowedDestinations: [VENDOR],
      maxPerActionRaw: String(Math.round(limit * 1_000_000)),
      requiredIntents: ["FRAUD_DETECTION"],
      policyId: "payments.strict.v1",
      policyVersion: 1,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
      version: 1
    });
    const action = createActionContract({
      type: "payment",
      chainId: 84532,
      token: BASE_SEPOLIA_USDC,
      amountRaw: String(Math.round(amount * 1_000_000)),
      destination: VENDOR,
      reason: String(input.reason || "Unspecified payment").slice(0, 500),
      policyId: "payments.strict.v1"
    });
    const decision = evaluatePaymentsStrictV1(mandate, action, null as never, { agentId: "demo-agent", now });
    return json(response, 200, {
      decision: decision.decision,
      reason: decision.reason,
      policyId: decision.policyId,
      policyVersion: decision.policyVersion,
      action: { amount: amount.toFixed(2), recipient: VENDOR, chain: "Base Sepolia", reference: input.reference ?? "" },
      checks: decision.checks.map((check) => ({ name: check.name, status: check.status, reason: check.reason, code: check.code })),
      executionAuthorized: false,
      permit: null
    });
  } catch {
    return json(response, 400, { error: "invalid_authorization_request" });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`ProofGate web API listening on ${PORT}`));

