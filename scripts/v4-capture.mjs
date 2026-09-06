// v4 capture: execution wire (broadcasting + confirmed) + content wire (BLOCK).
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

function authResponse({ status, decision, withExecution = false }) {
  const body = {
    status, decision,
    reason: decision === "ALLOW" ? "adaptive_policy_allow" : "external_intelligence_required",
    riskTier: "LOW", policyId: "payments.adaptive.v1", policyVersion: 1, freezeFingerprint: FREEZE,
    routing: { mode: "TELEGRAPH_AUTO_INTENT", endpoint: "/v1/ask" },
    action: { id: "act_track3_qa", hash: ACTION_HASH, amount: "1.00", amountRaw: "1000000", recipient: VENDOR, chainId: 84532, chain: "Base Sepolia", asset: "USDC", reason: "Supplier invoice #4471", reference: "INV-4471" },
    mandate: { id: "proofgate-live-mandate", hash: MANDATE_HASH, maxPerAction: "5.00", expiresAt: "2026-09-04T12:00:00.000Z" },
    evidence: { status: "COMPLETE", code: "adaptive_evidence_complete", spendRaw: "1000", bundleHash: BUNDLE_HASH, rejectedAttempts: 0, completedIntents: ["FRAUD_DETECTION"] },
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

async function installLiveMocks(page, { executeDelay = 2600 } = {}) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const respond = (body) => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.endsWith("/api/authorize") && request.method() === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      if (payload.mode === "policy") { setTimeout(() => respond(authResponse({ status: "REQUIRES_INTELLIGENCE", decision: null })), 400); return; }
      if (payload.mode === "live") { setTimeout(() => respond(authResponse({ status: "DECIDED", decision: "ALLOW", withExecution: true })), 800); return; }
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

// 1) execution wire: broadcasting + confirmed
{
  const page = await browser.newPage();
  await installLiveMocks(page);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".request-check-actions .btn-primary", { timeout: 15000 });
  await page.evaluate(() => document.querySelector(".request-check-actions .btn-primary").click());
  await page.waitForFunction(() => (document.querySelector(".exec-wire .console-state")?.textContent ?? "") === "BROADCASTING", { timeout: 20000 });
  await sleep(300);
  await shot(page, "v4-exec-broadcasting.png", false);
  await page.waitForFunction(() => [...document.querySelectorAll("h1")].some((h) => h.textContent.includes("Payment executed")), { timeout: 20000 });
  await sleep(400);
  await shot(page, "v4-exec-confirmed.png", false);
  const wire = await page.evaluate(() => [...document.querySelectorAll(".exec-wire .wire-line")].map((l) => l.textContent));
  console.log("exec wire lines:", JSON.stringify(wire, null, 1));
  await page.close();
}

// 2) content wire: scam BLOCK with signals
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/content", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('[data-testid="content-trust-screen"]', { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("LOAD SCAM SAMPLE"))?.click());
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.replace(/\s+/g, " ").includes("RUN CONTENT CHECK"))?.click());
  await page.waitForFunction(() => (document.querySelector(".content-wire")?.textContent ?? "").includes("decision BLOCK"), { timeout: 15000 });
  await sleep(400);
  await shot(page, "v4-content-wire-block.png", false);
  const wire = await page.evaluate(() => [...document.querySelectorAll(".content-wire .wire-line")].map((l) => l.textContent));
  console.log("content wire lines:", JSON.stringify(wire, null, 1));
  await page.close();
}

// 3) mobile overflow: execution + content
{
  const page = await browser.newPage();
  await installLiveMocks(page, { executeDelay: 1200 });
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".request-check-actions .btn-primary", { timeout: 15000 });
  await page.evaluate(() => document.querySelector(".request-check-actions .btn-primary").click());
  await page.waitForFunction(() => [...document.querySelectorAll("h1")].some((h) => h.textContent.includes("Payment executed")), { timeout: 25000 });
  await sleep(400);
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("execution 390 overflow:", ovf, "px");
  await shot(page, "v4-exec-390.png");
  await page.goto(BASE + "/#/content", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="content-trust-screen"]', { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("LOAD SCAM SAMPLE"))?.click());
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.replace(/\s+/g, " ").includes("RUN CONTENT CHECK"))?.click());
  await page.waitForFunction(() => (document.querySelector(".content-wire")?.textContent ?? "").includes("decision BLOCK"), { timeout: 15000 });
  await sleep(300);
  const ovf2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("content 390 overflow:", ovf2, "px");
  await shot(page, "v4-content-390.png");
  await page.close();
}

console.log("capture done");
await browser.close();
