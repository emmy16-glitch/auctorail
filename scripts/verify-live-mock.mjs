// Replicates qa/auctorail-final-playwright.py live_happy_path with the exact
// route mocks from qa/three-screen-playwright.py install_happy_routes():
//   policy authorize (REQUIRES_INTELLIGENCE) -> live authorize (ALLOW) -> execute (EXECUTED)
// and asserts the same observable UI states + call sequence.
import { JSDOM } from "jsdom";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundle = readFileSync(resolve("dist/assets", readdirSync("dist/assets").find((f) => f.startsWith("index-") && f.endsWith(".js"))), "utf8");

// ---- mock constants (mirrors qa/three-screen-playwright.py) ----
const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const FREEZE = "0x" + "f".repeat(64);
const ACTION_HASH = "0x" + "a".repeat(64);
const MANDATE_HASH = "0x" + "b".repeat(64);
const BUNDLE_HASH = "0x" + "c".repeat(64);
const PERMIT_HASH = "0x" + "d".repeat(64);
const TX_HASH = "0x" + "e".repeat(64);
const RECEIPT_HASH = "0x" + "9".repeat(64);
const EXEC_TOKEN = "exec_" + "1".repeat(48);
const PERMIT_ID = "permit-qa-001";

function authResponse({ status, decision, evidenceStatus = "NOT_REQUESTED", amount = "1.00", withExecution = false }) {
  const body = {
    status, decision,
    reason: decision === null ? "external_intelligence_required" : decision === "ALLOW" ? "adaptive_policy_allow" : "adaptive_policy_block",
    riskTier: "LOW", policyId: "payments.adaptive.v1", policyVersion: 1,
    freezeFingerprint: FREEZE,
    routing: { mode: "TELEGRAPH_AUTO_INTENT", endpoint: "/v1/ask" },
    action: {
      id: "act_track3_qa", hash: ACTION_HASH, amount,
      amountRaw: String(Math.round(parseFloat(amount) * 1_000_000)),
      recipient: VENDOR, chainId: 84532, chain: "Base Sepolia", asset: "USDC",
      reason: "Supplier invoice #4471", reference: "INV-4471"
    },
    mandate: { id: "proofgate-live-mandate", hash: MANDATE_HASH, maxPerAction: "5.00", expiresAt: "2026-09-04T12:00:00.000Z" },
    evidence: {
      status: evidenceStatus,
      code: evidenceStatus === "COMPLETE" ? "adaptive_evidence_complete" : null,
      spendRaw: evidenceStatus === "COMPLETE" ? "1000" : "0",
      bundleHash: evidenceStatus === "COMPLETE" ? BUNDLE_HASH : null,
      rejectedAttempts: 0,
      completedIntents: evidenceStatus === "COMPLETE" ? ["FRAUD_DETECTION"] : []
    },
    executionAuthorized: false, permit: null, execution: null
  };
  if (withExecution) {
    body.executionAuthorized = true;
    body.permit = { id: PERMIT_ID, hash: PERMIT_HASH, actionHash: ACTION_HASH, expiresAt: "2026-09-04T10:15:00.000Z", keyId: "proofgate-web-v1", algorithm: "Ed25519" };
    body.execution = { status: "READY", token: EXEC_TOKEN, endpoint: "/api/execute" };
  }
  return body;
}

const executionBody = {
  status: "EXECUTED", code: "executed",
  actionHash: ACTION_HASH, freezeFingerprint: FREEZE,
  permit: { id: PERMIT_ID, hash: PERMIT_HASH, expiresAt: "2026-09-04T10:15:00.000Z" },
  network: { chain: "Base Sepolia", chainId: 84532, asset: "USDC" },
  payment: { amount: "1.00", amountRaw: "1000000", recipient: VENDOR, recipientLabel: "ProofGate Vendor", reference: "INV-4471" },
  transaction: {
    status: "CONFIRMED", transactionHash: TX_HASH, blockNumber: 46310001,
    confirmedAt: "2026-09-04T09:35:22.000Z", confirmedVia: "https://sepolia.base.org",
    sender: "0x1111111111111111111111111111111111111111", nonce: 7,
    operationId: "op-track3-qa", automaticRetry: false
  },
  evidence: { bundleHash: BUNDLE_HASH, spendRaw: "1000" },
  receipt: { id: "receipt-track3-qa", hash: RECEIPT_HASH, schemaVersion: "proofgate.receipt.v3", createdAt: "2026-09-04T09:35:22.000Z" }
};

// ---- jsdom setup with the QA mocks installed ----
const calls = [];
const windowErrors = [];
const payloadIssues = [];
const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  url: "http://127.0.0.1:4173/", pretendToBeVisual: true, runScripts: "outside-only"
});
const w = dom.window;
w.scrollTo = () => {};
w.addEventListener("error", (e) => windowErrors.push(e.message));
if (!w.crypto?.randomUUID) w.crypto = { randomUUID: () => `u${Math.random().toString(16).slice(2)}` };
w.fetch = async (input, init) => {
  const url = String(input);
  const path = url.replace("http://127.0.0.1:4173", "");
  const method = init?.method ?? "GET";
  const payload = init?.body ? JSON.parse(init.body) : {};
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  if (path === "/api/authorize" && method === "POST") {
    // mirror the QA payload assertions
    if (payload.agentId !== "invoice-bot") payloadIssues.push("agentId");
    if ((payload.destination ?? "").toLowerCase() !== VENDOR.toLowerCase()) payloadIssues.push("destination");
    if (payload.amount !== "1.00") payloadIssues.push("amount");
    if (payload.limit !== "5.00") payloadIssues.push("limit");
    if (payload.durationSeconds !== 3600) payloadIssues.push("durationSeconds");
    if (payload.reason !== "Supplier invoice #4471") payloadIssues.push("reason");
    if (payload.reference !== "INV-4471") payloadIssues.push("reference");
    if (payload.mode === "policy") {
      if ("freezeFingerprint" in payload) payloadIssues.push("policy-has-freeze");
      calls.push(["authorize", "policy"]);
      await new Promise((r) => setTimeout(r, 80));
      return ok(authResponse({ status: "REQUIRES_INTELLIGENCE", decision: null }));
    }
    if (payload.freezeFingerprint !== FREEZE) payloadIssues.push("freeze-mismatch");
    if (!init?.headers?.["idempotency-key"]) payloadIssues.push("live-no-idempotency-key");
    calls.push(["authorize", "live"]);
    await new Promise((r) => setTimeout(r, 220));
    return ok(authResponse({ status: "DECIDED", decision: "ALLOW", evidenceStatus: "COMPLETE", withExecution: true }));
  }
  if (path === "/api/execute" && method === "POST") {
    if (JSON.stringify(payload) !== JSON.stringify({ executionToken: EXEC_TOKEN })) payloadIssues.push("execute-payload");
    if (!init?.headers?.["idempotency-key"]) payloadIssues.push("execute-no-idempotency-key");
    calls.push(["execute", "protected"]);
    await new Promise((r) => setTimeout(r, 350));
    return ok(executionBody);
  }
  return { ok: false, status: 404, json: async () => ({ error: "not_mocked" }) };
};
w.eval(bundle);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, okValue) {
  console.log(`${okValue ? "PASS" : "FAIL"} | ${label}`);
  if (!okValue) failures += 1;
}
const doc = w.document;
const btn = (name, exact = true) => [...doc.querySelectorAll("button")].find((el) => {
  const c = el.cloneNode(true);
  c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  const label = c.textContent.trim().replace(/\s+/g, " ");
  return exact ? label === name : label.includes(name);
});
const heading = (name) => [...doc.querySelectorAll("h1, h2, h3")].find((el) => el.textContent.replace(/\s+/g, " ").toLowerCase().includes(name.toLowerCase()));
async function waitFor(fn, label, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (fn()) return true; await sleep(150); }
  console.log(`  (timeout: ${label})`);
  return false;
}

// ---- enter live ----
await sleep(600);
check("landing visible", Boolean(doc.querySelector('[data-testid="home-landing-screen"]')));
btn("ENTER LIVE MODE", false)?.click();
const entered = await waitFor(() => Boolean(heading("Control what an agent can do.")), "check screen");
check("check screen after ENTER LIVE MODE", entered);
check("brand AUCTORAIL in #root", doc.querySelector("#root .brand-lockup strong")?.textContent === "AUCTORAIL");

// ---- click check ----
btn("CHECK THIS REQUEST")?.click();

// ---- checking state ----
const running = await waitFor(() => (doc.body.textContent ?? "").includes("REAL CHECKS RUNNING"), "REAL CHECKS RUNNING", 3000);
check("REAL CHECKS RUNNING visible", running);

// ---- executing + executed ----
const executing = await waitFor(() => Boolean(heading("EXECUTING REQUEST")), "EXECUTING REQUEST", 4000);
check("EXECUTING REQUEST heading", executing);
const executed = await waitFor(() => Boolean(heading("PAYMENT EXECUTED")), "PAYMENT EXECUTED", 6000);
check("PAYMENT EXECUTED heading", executed);
const execText = doc.querySelector("main")?.textContent ?? doc.body.textContent ?? "";
check("Auctorail Vendor visible", execText.includes("Auctorail Vendor"));
// the UI shows an abbreviated hash (0xeee…eee); QA only requires the receipt content
check("tx hash rendered (abbreviated)", /0xeee+\u2026|0xeee+…/.test(execText) || execText.includes(TX_HASH));
check("call sequence", JSON.stringify(calls) === JSON.stringify([["authorize", "policy"], ["authorize", "live"], ["execute", "protected"]]), JSON.stringify(calls));
check("request payload contract", payloadIssues.length === 0, payloadIssues.join(", "));

// ---- activity ----
btn("ACTIVITY")?.click();
await sleep(600);
check("activity screen", Boolean(doc.querySelector('[data-testid="activity-screen"]')));
check("activity EXECUTED", (doc.querySelector("main")?.textContent ?? "").includes("EXECUTED"));

// ---- permissions ----
btn("PERMISSIONS")?.click();
await sleep(600);
check("permissions screen", Boolean(doc.querySelector('[data-testid="permissions-screen"]')));
check("STANDING AUTHORITY", (doc.querySelector("main")?.textContent ?? "").includes("STANDING AUTHORITY"));

check("no window errors", windowErrors.length === 0, windowErrors.join("; "));

console.log(`\n${failures === 0 ? "ALL MOCK LIVE CHECKS PASSED" : `${failures} MOCK LIVE CHECKS FAILED`}`);
w.close();
process.exit(failures === 0 ? 0 : 1);
