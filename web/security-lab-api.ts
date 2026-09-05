import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runAttackLab } from "../src/security/attack-lab.js";
import { canonicalize, hashCanonicalPayload } from "../src/core/action-contract.js";
import { createGeneralAction } from "../src/core/general-action.js";
import { createGeneralMandate } from "../src/core/general-mandate.js";
import {
  evaluateContentStrictV1,
  type AuthorshipClaim,
  type ContentEvidenceSignal,
  type ProposedContentAction
} from "../src/policy/content-strict-v1.js";
import {
  createContentDecisionReceipt,
  verifyContentDecisionReceipt,
  type ContentDecisionReceipt
} from "../src/receipt/content-receipt.js";
import {
  verifyProofReceipt,
  type ProofReceipt
} from "../src/receipt/proof-receipt.js";
import { acquireTextContentSignals } from "../src/telegraph/content-live-client.js";

const PORT = Number(
  process.env.AUCTORAIL_SECURITY_LAB_PORT ??
  process.env.PROOFGATE_SECURITY_LAB_PORT ??
  8788
);
const ALLOWED_ORIGINS = new Set(
  (
    process.env.AUCTORAIL_WEB_ORIGINS ??
    process.env.PROOFGATE_WEB_ORIGINS ??
    "http://localhost:5173"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const CONTENT_LIVE_ENABLED = process.env.AUCTORAIL_CONTENT_LIVE_ENABLED === "true";
const CONTENT_MAX_SPEND_RAW = unsignedEnv(process.env.AUCTORAIL_CONTENT_MAX_SPEND_RAW, 50_000n);
const CONTENT_PER_HOUR = positiveInteger(process.env.AUCTORAIL_CONTENT_REQUESTS_PER_HOUR, 5);
const contentRateWindows = new Map<string, number[]>();

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function unsignedEnv(value: string | undefined, fallback: bigint): bigint {
  if (!value || !/^\d+$/.test(value)) return fallback;
  try { return BigInt(value); } catch { return fallback; }
}

function headers(request: IncomingMessage): Record<string, string> {
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

function reply(request: IncomingMessage, response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, headers(request));
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage, limit = 256_000): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > limit) throw new Error("request_too_large");
  }
  const parsed = JSON.parse(raw || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("request_body_invalid");
  return parsed as Record<string, unknown>;
}

function consumeRate(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (contentRateWindows.get(key) ?? []).filter((stamp) => now - stamp < 60 * 60_000);
  if (recent.length >= limit) {
    contentRateWindows.set(key, recent);
    return false;
  }
  recent.push(now);
  contentRateWindows.set(key, recent);
  return true;
}

function clientKey(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? "unknown";
}

function receiptDirectories(): string[] {
  return [
    path.join(process.cwd(), "data", "receipts"),
    path.join(process.cwd(), "data", "content-receipts")
  ];
}

function receiptFiles(): string[] {
  const files: string[] = [];
  for (const directory of receiptDirectories()) {
    try {
      for (const name of fs.readdirSync(directory)) {
        if (/^[A-Za-z0-9._-]+\.json$/.test(name)) files.push(path.join(directory, name));
      }
    } catch {
      // Missing optional receipt directory is fine.
    }
  }
  return files;
}

function readReceiptFile(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function findStoredReceipt(token: string): Record<string, unknown> | null {
  const normalized = token.trim().toLowerCase();
  for (const file of receiptFiles()) {
    const receipt = readReceiptFile(file);
    if (!receipt) continue;
    const execution = receipt.execution && typeof receipt.execution === "object"
      ? receipt.execution as Record<string, unknown>
      : null;
    const candidates = [
      receipt.receiptId,
      receipt.receiptHash,
      execution?.transactionHash
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase());
    if (candidates.includes(normalized)) return receipt;
  }
  return null;
}

function normalizeVerifyInput(input: unknown): { receipt: Record<string, unknown> | null; source: string } {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return { receipt: input as Record<string, unknown>, source: "receipt_json" };
  }
  if (typeof input !== "string") return { receipt: null, source: "unsupported" };
  const trimmed = input.trim();
  if (!trimmed) return { receipt: null, source: "empty" };
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { receipt: parsed as Record<string, unknown>, source: "receipt_json" };
      }
    } catch {
      return { receipt: null, source: "invalid_json" };
    }
  }
  return { receipt: findStoredReceipt(trimmed), source: "receipt_store" };
}

function verifyReceiptRecord(receipt: Record<string, unknown>): Record<string, unknown> {
  const schemaVersion = typeof receipt.schemaVersion === "string" ? receipt.schemaVersion : "unknown";

  if (schemaVersion === "auctorail.content-receipt.v1") {
    const content = receipt as unknown as ContentDecisionReceipt;
    const valid = verifyContentDecisionReceipt(content);
    return {
      valid,
      kind: "content",
      code: valid ? "content_receipt_valid" : "content_receipt_invalid",
      receiptId: content.receiptId,
      receiptHash: content.receiptHash,
      summaryLine: content.summaryLine,
      decision: content.decision?.decision ?? null,
      checks: [
        { label: "RECEIPT INTEGRITY", status: valid ? "PASS" : "FAIL" },
        { label: "CONTENT BINDING", status: content.subjectHash && content.action?.actionHash ? "PASS" : "FAIL" },
        { label: "EVIDENCE COMMITMENT", status: content.evidenceCommitmentHash === content.decision?.evidenceCommitmentHash ? "PASS" : "FAIL" },
        { label: "DECISION", status: content.decision?.decision ?? "UNKNOWN" }
      ],
      receipt: content
    };
  }

  if (schemaVersion === "proofgate.receipt.v2" || schemaVersion === "proofgate.receipt.v3") {
    const payment = receipt as unknown as ProofReceipt;
    const valid = verifyProofReceipt(payment);
    const tx = payment.execution?.transactionHash;
    const evidencePresent = Boolean(payment.evidence);
    const permitPresent = Boolean(payment.permit);
    const executionStatus = payment.execution?.status ?? "NOT_EXECUTED";
    return {
      valid,
      kind: "payment",
      code: valid ? "payment_receipt_valid" : "payment_receipt_invalid",
      receiptId: payment.receiptId,
      receiptHash: payment.receiptHash,
      summaryLine: `Auctorail payment receipt: ${payment.decision?.decision ?? "UNKNOWN"} — ${executionStatus}.`,
      decision: payment.decision?.decision ?? null,
      transactionHash: tx ?? null,
      explorerUrl: tx ? `https://sepolia.basescan.org/tx/${tx}` : null,
      checks: [
        { label: "RECEIPT INTEGRITY", status: valid ? "PASS" : "FAIL" },
        { label: "ACTION BINDING", status: payment.action?.actionHash ? "PASS" : "FAIL" },
        { label: "TELEGRAPH EVIDENCE", status: evidencePresent ? "BOUND" : "NONE" },
        { label: "DECISION", status: payment.decision?.decision ?? "UNKNOWN" },
        { label: "PERMIT", status: permitPresent ? "BOUND" : "NONE" },
        { label: "EXECUTION", status: executionStatus }
      ],
      receipt: payment
    };
  }

  return { valid: false, kind: "unknown", code: "receipt_schema_unsupported", schemaVersion };
}

function demoSignals(text: string, subjectHash: string, now: Date): ContentEvidenceSignal[] {
  const scamPattern = /\b(seed phrase|gift card|wire money|send crypto|verify your wallet|urgent payment|account suspended|click immediately)\b/i;
  const aiMarker = /\b(ai generated|generated by ai|language model|as an ai)\b/i;
  const scam = scamPattern.test(text);
  const ai = aiMarker.test(text);

  return [
    {
      source: "deterministic_demo",
      kind: "SCAM",
      minerId: "demo-scam",
      minerName: "Deterministic demo classifier",
      intent: "CONTENT_VERIFICATION",
      label: scam ? "scam" : "likely_safe",
      confidence: scam ? 0.94 : 0.91,
      subjectHash,
      signalHash: hashCanonicalPayload(canonicalize({ kind: "SCAM", text, scam })),
      receivedAt: now.toISOString()
    },
    {
      source: "deterministic_demo",
      kind: "AI_GENERATED",
      minerId: "demo-ai",
      minerName: "Deterministic demo classifier",
      intent: "AI_DETECTION",
      label: ai ? "ai_generated" : "human",
      confidence: ai ? 0.9 : 0.82,
      subjectHash,
      signalHash: hashCanonicalPayload(canonicalize({ kind: "AI_GENERATED", text, ai })),
      receivedAt: now.toISOString()
    }
  ];
}

async function handleContentCheck(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request, 64_000);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const mode = body.mode === "live" ? "live" : "demo";
    const proposedAction = ["view", "share", "publish"].includes(String(body.proposedAction))
      ? body.proposedAction as ProposedContentAction
      : "view";
    const authorshipClaim = ["unspecified", "human", "ai-assisted"].includes(String(body.authorshipClaim))
      ? body.authorshipClaim as AuthorshipClaim
      : "unspecified";

    if (!text || text.length > 8_000) return reply(request, response, 400, { error: "content_text_invalid" });

    if (mode === "live") {
      if (!CONTENT_LIVE_ENABLED) return reply(request, response, 503, { error: "content_live_disabled" });
      if (!consumeRate(`content:${clientKey(request)}`, CONTENT_PER_HOUR)) {
        return reply(request, response, 429, { error: "content_live_rate_limited" });
      }
    }

    const now = new Date();
    const subjectHash = hashCanonicalPayload(text);
    const action = createGeneralAction({
      type: "content.check",
      target: `content:${subjectHash}`,
      parameters: {
        contentKind: "text",
        proposedAction,
        authorshipClaim
      },
      policyId: "content.strict.v1",
      policyVersion: 1
    }, { now });
    const mandate = createGeneralMandate({
      mandateId: "auctorail-public-content-check-v1",
      principalId: "auctorail-user",
      agentId: "content-checker",
      allowedActionTypes: ["content.check"],
      allowedTargets: [action.target],
      requiredIntents: ["CONTENT_VERIFICATION"],
      policyId: "content.strict.v1",
      policyVersion: 1,
      status: "ACTIVE",
      issuedAt: new Date(now.getTime() - 1_000).toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
      version: 1
    });

    let signals: ContentEvidenceSignal[];
    let spendRaw = "0";
    if (mode === "live") {
      const privateKey = process.env.TELEGRAPH_EVM_PRIVATE_KEY as `0x${string}` | undefined;
      if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
        return reply(request, response, 503, { error: "telegraph_credentials_unavailable" });
      }
      const live = await acquireTextContentSignals({
        text,
        subjectHash,
        privateKey,
        maxSpendRaw: CONTENT_MAX_SPEND_RAW
      });
      signals = live.signals;
      spendRaw = live.spendRaw;
    } else {
      signals = demoSignals(text, subjectHash, now);
    }

    const result = evaluateContentStrictV1({
      mandate,
      action,
      agentId: "content-checker",
      contentKind: "text",
      proposedAction,
      authorshipClaim,
      subjectHash,
      signals,
      now
    });
    const receipt = createContentDecisionReceipt({
      receiptId: randomUUID(),
      subjectHash,
      contentKind: "text",
      proposedAction,
      authorshipClaim,
      action,
      evidence: result.signals,
      evidenceCommitmentHash: result.evidenceCommitmentHash,
      decision: result.decision,
      summaryLine: result.summaryLine,
      now
    });

    if (mode === "live") {
      const directory = path.join(process.cwd(), "data", "content-receipts");
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `${receipt.receiptId}.json`), JSON.stringify(receipt, null, 2), { mode: 0o600 });
    }

    return reply(request, response, 200, {
      mode: mode === "live" ? "LIVE_TELEGRAPH_X402" : "DETERMINISTIC_DEMO",
      realTelegraph: mode === "live",
      spendRaw,
      decision: result.decision.decision,
      reason: result.decision.reason,
      subjectHash,
      signals: result.signals,
      summaryLine: result.summaryLine,
      receipt
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "content_check_failed";
    return reply(request, response, code === "request_too_large" ? 413 : 502, { error: code });
  }
}

async function handleVerifyProof(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const body = await readJsonBody(request, 512_000);
    const candidate = normalizeVerifyInput(body.input ?? body.receipt ?? body);
    if (!candidate.receipt) {
      return reply(request, response, 404, { valid: false, code: candidate.source === "invalid_json" ? "receipt_json_invalid" : "receipt_not_found" });
    }
    return reply(request, response, 200, { source: candidate.source, ...verifyReceiptRecord(candidate.receipt) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "proof_verification_failed";
    return reply(request, response, code === "request_too_large" ? 413 : 400, { valid: false, error: code });
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(request, response, 403, { error: "origin_not_allowed" });

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...headers(request),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600"
    });
    return response.end();
  }

  if (request.method === "POST" && request.url === "/api/security-lab") {
    try {
      const report = await runAttackLab();
      return reply(request, response, 200, report);
    } catch (error) {
      return reply(request, response, 500, {
        error: "security_lab_failed",
        detail: error instanceof Error ? error.message : "unknown_security_lab_error"
      });
    }
  }

  if (request.method === "POST" && request.url === "/api/content-check") {
    return handleContentCheck(request, response);
  }

  if (request.method === "POST" && request.url === "/api/verify-proof") {
    return handleVerifyProof(request, response);
  }

  return reply(request, response, 404, { error: "not_found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Auctorail utility API listening on ${PORT}`);
  console.log("Security Lab: deterministic authorization attack harness");
  console.log(`Content Trust live Telegraph/x402: ${CONTENT_LIVE_ENABLED ? "enabled" : "disabled"}`);
  console.log("Proof verification: payment + content receipts");
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
