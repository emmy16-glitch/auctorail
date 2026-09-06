// v3 capture: wire terminal (live check), attack console (lab), verify trace, brand decode.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { setupLambdaEnvironment } from "@sparticuz/chromium";
import { default as Chromium } from "@sparticuz/chromium";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "playwright-artifacts");
mkdirSync(OUT, { recursive: true });

try {
  execSync("test -f /tmp/al2023/lib/libnss3.so || (mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))\" && tar -xf /tmp/al2023.tar -C /tmp/al2023)");
} catch {}
process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib" + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : "");
setupLambdaEnvironment("/tmp/al2023/lib");
const executable = await Chromium.executablePath();
const browser = await puppeteer.launch({ executablePath: executable, headless: true, args: [...Chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const FREEZE = "0x" + "f".repeat(64);
const ACTION_HASH = "0x" + "a".repeat(64);
const MANDATE_HASH = "0x" + "b".repeat(64);
const BUNDLE_HASH = "0x" + "c".repeat(64);
const PERMIT_ID = "permit_track3_qa";
const PERMIT_HASH = "0x" + "d".repeat(64);
const EXEC_TOKEN = "exec_" + "1".repeat(48);
const TX_HASH = "0x" + "e".repeat(64);

function authResponse({ status, decision, evidenceStatus = "NOT_REQUESTED", withExecution = false }) {
  const body = {
    status, decision,
    reason: decision === null ? "external_intelligence_required" : decision === "ALLOW" ? "adaptive_policy_allow" : decision === "HOLD" ? "adaptive_policy_hold" : "adaptive_policy_block",
    riskTier: "LOW", policyId: "payments.adaptive.v1", policyVersion: 1, freezeFingerprint: FREEZE,
    routing: { mode: "TELEGRAPH_AUTO_INTENT", endpoint: "/v1/ask" },
    action: { id: "act_track3_qa", hash: ACTION_HASH, amount: "1.00", amountRaw: "1000000", recipient: VENDOR, chainId: 84532, chain: "Base Sepolia", asset: "USDC", reason: "Supplier invoice #4471", reference: "INV-4471" },
    mandate: { id: "proofgate-live-mandate", hash: MANDATE_HASH, maxPerAction: "5.00", expiresAt: "2026-09-04T12:00:00.000Z" },
    evidence: { status: evidenceStatus, code: evidenceStatus === "COMPLETE" ? "adaptive_evidence_complete" : null, spendRaw: evidenceStatus === "COMPLETE" ? "1000" : "0", bundleHash: evidenceStatus === "COMPLETE" ? BUNDLE_HASH : null, rejectedAttempts: 0, completedIntents: evidenceStatus === "COMPLETE" ? ["FRAUD_DETECTION"] : [] },
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
  status: "EXECUTED", code: "executed", actionHash: ACTION_HASH, freezeFingerprint: FREEZE,
  permit: { id: PERMIT_ID, hash: PERMIT_HASH, expiresAt: "2026-09-04T10:15:00.000Z" },
  network: { chain: "Base Sepolia", chainId: 84532, asset: "USDC" },
  payment: { amount: "1.00", amountRaw: "1000000", recipient: VENDOR, recipientLabel: "Auctorail Vendor", reference: "INV-4471" },
  transaction: { status: "CONFIRMED", transactionHash: TX_HASH, blockNumber: 46310001, confirmedAt: "2026-09-04T09:35:22.000Z", confirmedVia: "https://sepolia.base.org", sender: "0x1111111111111111111111111111111111111111", nonce: 7, operationId: "op-track3-qa", automaticRetry: false },
  evidence: { bundleHash: BUNDLE_HASH, spendRaw: "1000" },
  receipt: { id: "receipt-track3-qa", hash: "0x" + "9".repeat(64), schemaVersion: "proofgate.receipt.v3", createdAt: "2026-09-04T09:35:22.000Z" }
};

async function installLiveMocks(page, { liveDelay = 1400, executeDelay = 900, liveDecision = "ALLOW" } = {}) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const respond = (body) => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.endsWith("/api/authorize") && request.method() === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      if (payload.mode === "policy") { setTimeout(() => respond(authResponse({ status: "REQUIRES_INTELLIGENCE", decision: null })), 500); return; }
      if (payload.mode === "live") { setTimeout(() => respond(authResponse({ status: "DECIDED", decision: liveDecision, evidenceStatus: "COMPLETE", withExecution: liveDecision === "ALLOW" })), liveDelay); return; }
    }
    if (url.endsWith("/api/execute") && request.method() === "POST") { setTimeout(() => respond(executionBody), executeDelay); return; }
    request.continue();
  });
}

async function shot(page, name, full = true) {
  await page.addStyleTag({ content: ".top-nav{position:static!important}" });
  await page.screenshot({ path: join(OUT, name), fullPage: full });
  console.log("saved", name);
}

// 1) wire terminal — mocked ALLOW, mid-run (policy done, miners running)
{
  const page = await browser.newPage();
  await installLiveMocks(page);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".request-check-actions .btn-primary", { timeout: 15000 });
  await page.evaluate(() => document.querySelector(".request-check-actions .btn-primary").click());
  await page.waitForSelector(".wire-console", { timeout: 15000 });
  // wait until the policy line is in and miners pending
  await page.waitForFunction(() => (document.querySelector(".wire-console")?.textContent ?? "").includes("policy preflight"), { timeout: 15000 });
  await sleep(300);
  await shot(page, "v3-wire-running.png", false);
  const wireText = await page.evaluate(() => document.querySelector(".wire-console")?.textContent ?? "");
  console.log("wire mid-run has bundle/pending:", wireText.includes("routing intent to real Miners"));
  await page.close();
}

// 2) wire terminal — mocked HOLD, complete (all lines incl decision)
{
  const page = await browser.newPage();
  await installLiveMocks(page, { liveDecision: "HOLD" });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".request-check-actions .btn-primary", { timeout: 15000 });
  await page.evaluate(() => document.querySelector(".request-check-actions .btn-primary").click());
  await page.waitForFunction(() => (document.querySelector(".wire-console")?.textContent ?? "").includes("decision HOLD"), { timeout: 20000 });
  await sleep(500);
  await shot(page, "v3-wire-hold-complete.png", false);
  const wireText = await page.evaluate(() => document.querySelector(".wire-console")?.textContent ?? "");
  console.log("wire HOLD complete:", {
    hasFreeze: wireText.includes("0x" + "f".repeat(6)),
    hasBundle: wireText.includes("0x" + "c".repeat(6)),
    hasPolicy: wireText.includes("payments.adaptive.v1"),
    hasDecision: wireText.includes("decision HOLD")
  });
  await page.close();
}

// 3) wire terminal — real 503 stop
{
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) console.log("console err:", m.text()); });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".request-check-actions .btn-primary", { timeout: 15000 });
  await page.evaluate(() => document.querySelector(".request-check-actions .btn-primary").click());
  await page.waitForFunction(() => (document.querySelector(".check-status strong")?.textContent ?? "") === "Stopped safely.", { timeout: 20000 });
  await sleep(400);
  await shot(page, "v3-wire-503.png", false);
  const wireText = await page.evaluate(() => document.querySelector(".wire-console")?.textContent ?? "");
  console.log("wire 503 lines:", wireText.split("\n").filter(Boolean).length, "has errorCode:", wireText.includes("telegraph_credentials_unavailable"));
  await page.close();
}

// 4) lab attack console — single attack
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/security-lab", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('[data-testid="security-lab-screen"]', { timeout: 15000 });
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("RUN ATTACK"))?.click());
  await page.waitForFunction(() => (document.querySelector(".verdict-display")?.textContent ?? "").includes("ATTACK BLOCKED"), { timeout: 15000 });
  await sleep(300);
  await shot(page, "v3-lab-attack.png", false);
  const labText = await page.evaluate(() => document.body.textContent ?? "");
  console.log("lab attack:", { blocked: labText.includes("ATTACK BLOCKED"), code: labText.includes("action_hash_mismatch") });
  const wire = await page.evaluate(() => [...document.querySelectorAll(".console-body .console-line")].map((l) => l.textContent));
  console.log("lab console lines:", JSON.stringify(wire, null, 1));
  await page.close();
}

// 5) lab suite run
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/security-lab", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('[data-testid="security-lab-screen"]', { timeout: 15000 });
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("RUN SUITE"))?.click());
  await page.waitForFunction(() => (document.querySelector(".verdict-display")?.textContent ?? "").includes("RAIL HELD"), { timeout: 20000 });
  await sleep(400);
  await shot(page, "v3-lab-suite.png", false);
  const text = await page.evaluate(() => document.body.textContent ?? "");
  console.log("lab suite:", { railHeld: text.includes("RAIL HELD"), score10: text.includes("10/10") });
  await page.close();
}

// 6) verify recompute trace
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/verify", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('[data-testid="verify-screen"]', { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("LOAD CANONICAL PROOF"))?.click());
  await page.waitForFunction(() => (document.querySelector(".verify-verdict strong")?.textContent ?? "") === "VALID", { timeout: 15000 });
  await sleep(400);
  await shot(page, "v3-verify-trace.png", false);
  const trace = await page.evaluate(() => [...document.querySelectorAll(".verify-trace .wire-line")].map((l) => l.textContent));
  console.log("verify trace lines:", JSON.stringify(trace, null, 1));
  await page.close();
}

// 7) landing: brand decode + new buttons (early frame + settled)
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/home", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('[data-testid="home-landing-screen"]', { timeout: 15000 });
  await sleep(260); // mid-decode
  await page.screenshot({ path: join(OUT, "v3-brand-decoding.png"), clip: { x: 0, y: 0, width: 500, height: 70 } });
  console.log("saved v3-brand-decoding.png");
  await sleep(1600);
  const brand = await page.evaluate(() => document.querySelector(".brand-lockup strong")?.textContent ?? "");
  console.log("brand settled:", brand);
  await shot(page, "v3-landing-1440.png");
  await page.close();
}

// 8) mobile: check wire + lab
{
  const page = await browser.newPage();
  await installLiveMocks(page, { liveDecision: "HOLD" });
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".request-check-actions .btn-primary", { timeout: 15000 });
  await page.evaluate(() => document.querySelector(".request-check-actions .btn-primary").click());
  await page.waitForFunction(() => (document.querySelector(".wire-console")?.textContent ?? "").includes("decision HOLD"), { timeout: 20000 });
  await sleep(400);
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("check 390 overflow:", ovf, "px");
  await shot(page, "v3-wire-390.png");
  await page.goto(BASE + "/#/security-lab", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="security-lab-screen"]', { timeout: 15000 });
  await sleep(400);
  const ovf2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("lab 390 overflow:", ovf2, "px");
  await shot(page, "v3-lab-390.png");
  await page.close();
}

console.log("capture done");
await browser.close();
