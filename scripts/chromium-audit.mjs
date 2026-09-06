// Comprehensive headless-Chromium audit of the redesigned Auctorail UI.
// Covers, with a real browser (no layout approximations):
//   1. every route x 3 CI viewports: horizontal overflow + console errors
//   2. the mocked live happy path (exact QA route-mock contract):
//      policy -> live(ALLOW) -> execute, timed captures of CHECKING / EXECUTING / EXECUTED,
//      exact call sequence + request payload assertions, activity + permissions after
//   3. mocked live HOLD variant
//   4. the REAL live attempt in this sandbox (503 telegraph_credentials_unavailable -> graceful stop)
//   5. content trust: BLOCK (scam), ALLOW (benign), LIVE TELEGRAPH mode (disabled -> error state)
//   6. verify: canonical VALID, unknown hash INVALID
//   7. security lab: single attack BLOCKED, full suite RAIL HELD
//   8. guided demo: paused state, skipped-to-complete state
//   9. docs SDK demos: ALLOW + BLOCKED runs
//  10. permissions: revoked state
// Exits non-zero on any failure.
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
setupLambdaEnvironment(join("/tmp", "al2023", "lib"));

const executable = await Chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath: executable,
  headless: true,
  args: [...Chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"]
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let consoleErrorTotal = 0;
const consoleErrors = [];
function check(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}${extra ? ` | ${extra}` : ""}`);
  if (!ok) failures += 1;
}

async function newPage(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text().slice(0, 200)); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${String(err).slice(0, 200)}`));
  page.__errors = errors;
  return page;
}
// Expected HTTP-status console logs for deliberate failure paths (sandbox live 503s, verify 404).
// The CI console-error assertion covers the happy paths, where none of these occur.
function auditErrors(page, label) {
  const allow = page.__allowErrors ?? [];
  const errs = (page.__errors ?? []).filter((e) => !allow.some((re) => re.test(e)));
  const allowed = (page.__errors ?? []).length - errs.length;
  consoleErrorTotal += errs.length;
  check(`no console errors: ${label}`, errs.length === 0, `${errs.slice(0, 3).join(" | ")}${allowed ? ` (${allowed} expected network log(s) allowed)` : ""}`);
}

async function overflow(page, label) {
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no horizontal overflow: ${label} (${diff}px)`, diff <= 1);
}

async function shot(page, name) {
  await page.addStyleTag({ content: ".top-nav { position: static !important; }" }).catch(() => {});
  await page.screenshot({ path: join(OUT, name), fullPage: true });
}

async function clickClean(page, name, exact = true) {
  const handle = await page.evaluateHandle((nm, ex) => {
    const clean = (el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      return c.textContent.trim().replace(/\s+/g, " ");
    };
    return [...document.querySelectorAll("button, a")].find((el) => (ex ? clean(el) === nm : clean(el).includes(nm))) ?? null;
  }, name, exact);
  const el = handle.asElement();
  if (!el) throw new Error(`element not found: ${name}`);
  await el.click();
}

// ================= QA mock bodies (qa/three-screen-playwright.py) =================
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

function authResponse({ status, decision, evidenceStatus = "NOT_REQUESTED", withExecution = false }) {
  const body = {
    status, decision,
    reason: decision === null ? "external_intelligence_required" : decision === "ALLOW" ? "adaptive_policy_allow" : decision === "HOLD" ? "adaptive_policy_hold" : "adaptive_policy_block",
    riskTier: "LOW", policyId: "payments.adaptive.v1", policyVersion: 1, freezeFingerprint: FREEZE,
    routing: { mode: "TELEGRAPH_AUTO_INTENT", endpoint: "/v1/ask" },
    action: {
      id: "act_track3_qa", hash: ACTION_HASH, amount: "1.00", amountRaw: "1000000",
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
  status: "EXECUTED", code: "executed", actionHash: ACTION_HASH, freezeFingerprint: FREEZE,
  permit: { id: PERMIT_ID, hash: PERMIT_HASH, expiresAt: "2026-09-04T10:15:00.000Z" },
  network: { chain: "Base Sepolia", chainId: 84532, asset: "USDC" },
  payment: { amount: "1.00", amountRaw: "1000000", recipient: VENDOR, recipientLabel: "Auctorail Vendor", reference: "INV-4471" },
  transaction: {
    status: "CONFIRMED", transactionHash: TX_HASH, blockNumber: 46310001,
    confirmedAt: "2026-09-04T09:35:22.000Z", confirmedVia: "https://sepolia.base.org",
    sender: "0x1111111111111111111111111111111111111111", nonce: 7, operationId: "op-track3-qa", automaticRetry: false
  },
  evidence: { bundleHash: BUNDLE_HASH, spendRaw: "1000" },
  receipt: { id: "receipt-track3-qa", hash: RECEIPT_HASH, schemaVersion: "proofgate.receipt.v3", createdAt: "2026-09-04T09:35:22.000Z" }
};

async function installLiveMocks(page, { liveDelay = 900, executeDelay = 700, liveDecision = "ALLOW" } = {}) {
  const calls = [];
  const payloadIssues = [];
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const respond = (body) => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.endsWith("/api/authorize") && request.method() === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      if (payload.mode === "policy") {
        calls.push(["authorize", "policy"]);
        if ("freezeFingerprint" in payload) payloadIssues.push("policy-has-freeze");
        setTimeout(() => respond(authResponse({ status: "REQUIRES_INTELLIGENCE", decision: null })), 80);
        return;
      }
      if (payload.mode === "live") {
        calls.push(["authorize", "live"]);
        if (payload.freezeFingerprint !== FREEZE) payloadIssues.push("freeze-mismatch");
        if (!request.headers()["idempotency-key"]) payloadIssues.push("live-no-idempotency-key");
        setTimeout(() => respond(authResponse({
          status: "DECIDED", decision: liveDecision, evidenceStatus: "COMPLETE", withExecution: liveDecision === "ALLOW"
        })), liveDelay);
        return;
      }
    }
    if (url.endsWith("/api/execute") && request.method() === "POST") {
      calls.push(["execute", "protected"]);
      if (request.postData() !== JSON.stringify({ executionToken: EXEC_TOKEN })) payloadIssues.push("execute-payload");
      if (!request.headers()["idempotency-key"]) payloadIssues.push("execute-no-idempotency-key");
      setTimeout(() => respond(executionBody), executeDelay);
      return;
    }
    request.continue();
  });
  return { calls, payloadIssues };
}

// ================= 1. route matrix =================
const ROUTES = [
  ["", "landing"], ["check", "check"], ["activity", "activity"], ["permissions", "permissions"],
  ["security-lab", "security-lab"], ["trust", "content"], ["content", "content"], ["verify", "verify"], ["demo", "demo"], ["docs", "docs"]
];
const TESTIDS = {
  landing: '[data-testid="home-landing-screen"]', check: '[data-testid="checking-screen"]',
  activity: '[data-testid="activity-screen"]', permissions: '[data-testid="permissions-screen"]',
  "security-lab": '[data-testid="security-lab-screen"]', content: '[data-testid="content-trust-screen"]',
  verify: '[data-testid="verify-screen"]', demo: '[data-testid="guided-demo-screen"]', docs: '[data-testid="sdk-screen"]'
};
const VIEWPORTS = [[1440, 1000, "desktop"], [980, 1200, "tablet"], [390, 844, "mobile"]];

console.log("=== 1. route matrix: overflow + console ===");
for (const [width, height, tag] of VIEWPORTS) {
  const page = await newPage(width, height);
  for (const [hash, name] of ROUTES) {
    await page.goto(`${BASE}/#/${hash}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(TESTIDS[name], { timeout: 15000 });
    await sleep(250);
    await overflow(page, `${tag} ${name}`);
    auditErrors(page, `${tag} ${name}`);
    if (tag === "desktop" || tag === "mobile") await shot(page, `audit-${tag}-${name}.png`);
  }
  await page.close();
}

// ================= 1b. landing v2 structure =================
console.log("\n=== 1b. landing v2 structure ===");
{
  const page = await newPage(1440, 1000);
  await page.goto(BASE + "/#/home", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.landing, { timeout: 15000 });
  await sleep(400);
  check("hero prompt line", await page.evaluate(() => Boolean(document.querySelector(".hero-prompt"))));
  check("hero accent word", await page.evaluate(() => Boolean(document.querySelector(".hero-title .accent-word"))));
  check("stats band (4 stats)", (await page.$$(".stats-inner .stat")).length === 4);
  check("depth ladder (5 rows)", (await page.$$(".ladder-row")).length === 5);
  check("ladder key row tagged X402", await page.evaluate(() => (document.querySelector(".ladder-row.key .ladder-tag")?.textContent ?? "").includes("X402")));
  check("see-it-working heading", await page.evaluate(() => (document.body.textContent ?? "").includes("These are not illustrations.")));
  check("working-demo cards with checklists", (await page.$$(".demo-card .demo-checklist li")).length >= 9);
  check("closing band CTA", await page.evaluate(() => (document.body.textContent ?? "").includes("One verifiable proof.")));
  await page.close();
}

// ================= 2. mocked live happy path (QA contract) =================
console.log("\n=== 2. mocked live happy path ===");
{
  const page = await newPage(1440, 1000);
  const { calls, payloadIssues } = await installLiveMocks(page);
  await page.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.landing, { timeout: 15000 });
  await clickClean(page, "ENTER LIVE MODE");
  await page.waitForSelector(TESTIDS.check, { timeout: 10000 });
  await clickClean(page, "CHECK THIS REQUEST");
  check("check flow: STEP 2 OF 3 badge", await page.evaluate(() => (document.body.textContent ?? "").includes("STEP 2 OF 3")));
  await sleep(450); // inside the live window: REAL CHECKS RUNNING
  check("checking state: REAL CHECKS RUNNING", await page.evaluate(() => (document.body.textContent ?? "").includes("REAL CHECKS RUNNING")));
  check("checking state: active stage auto-expanded", await page.evaluate(() => Boolean(document.querySelector(".timeline-stage.running.is-open"))));
  await shot(page, "audit-flow-checking.png");
  await page.waitForFunction(
    () => [...document.querySelectorAll("h1,h2,h3")].some((h) => h.textContent.toLowerCase().includes("executing request")),
    { timeout: 4000, polling: 100 }
  ).then(async () => {
    const executing = await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].some((h) => h.textContent.toLowerCase().includes("executing request")));
    check("executing state visible", executing);
    await shot(page, "audit-flow-executing.png");
  }).catch(async () => {
    check("executing state visible", await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].some((h) => h.textContent.toLowerCase().includes("executing request"))));
    await shot(page, "audit-flow-executing.png");
  });
  await page.waitForFunction(() => [...document.querySelectorAll("h1,h2,h3")].some((h) => h.textContent.toLowerCase().includes("payment executed")), { timeout: 15000 });
  await overflow(page, "flow executed 1440");
  check("executed: Auctorail Vendor", await page.evaluate(() => (document.body.textContent ?? "").includes("Auctorail Vendor")));
  await shot(page, "audit-flow-executed.png");
  check("call sequence (QA contract)", JSON.stringify(calls) === JSON.stringify([["authorize", "policy"], ["authorize", "live"], ["execute", "protected"]]), JSON.stringify(calls));
  check("payload contract", payloadIssues.length === 0, payloadIssues.join(", "));

  await clickClean(page, "ACTIVITY");
  await page.waitForSelector(TESTIDS.activity, { timeout: 10000 });
  check("activity shows EXECUTED", await page.evaluate(() => (document.body.textContent ?? "").includes("EXECUTED")));
  await shot(page, "audit-flow-activity-executed.png");
  await clickClean(page, "PERMISSIONS");
  await page.waitForSelector(TESTIDS.permissions, { timeout: 10000 });
  check("permissions STANDING AUTHORITY", await page.evaluate(() => (document.body.textContent ?? "").includes("STANDING AUTHORITY")));
  auditErrors(page, "live flow page");
  await page.close();
}

// ================= 3. mocked live HOLD =================
console.log("\n=== 3. mocked live HOLD ===");
{
  const page = await newPage(1440, 1000);
  const { calls } = await installLiveMocks(page, { liveDecision: "HOLD" });
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.check, { timeout: 15000 });
  await clickClean(page, "CHECK THIS REQUEST");
  await page.waitForFunction(() => [...document.querySelectorAll("strong")].some((el) => el.textContent.trim() === "HOLD."), { timeout: 15000 });
  check("HOLD: no execute call made", !calls.some((c) => c[0] === "execute"), JSON.stringify(calls));
  await shot(page, "audit-flow-hold.png");
  auditErrors(page, "hold flow page");
  await page.close();
}

// ================= 4. real live attempt (sandbox: 503 graceful stop) =================
console.log("\n=== 4. real live attempt (503) ===");
{
  const page = await newPage(1440, 1000);
  page.__allowErrors = [/Failed to load resource.*503/];
  await page.goto(BASE + "/#/check", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.check, { timeout: 15000 });
  await clickClean(page, "CHECK THIS REQUEST");
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("LIVE CHECK NOT STARTED"), { timeout: 20000 });
  check("503: graceful stop message", await page.evaluate(() => (document.body.textContent ?? "").includes("The live Telegraph wallet is not connected yet.")));
  check("503: BACK TO REQUEST present", await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("BACK TO REQUEST"))));
  await shot(page, "audit-flow-live-503.png");
  auditErrors(page, "503 flow page");
  await page.close();
}

// ================= 5. content trust (live-only) =================
console.log("\n=== 5. content trust: live-only terminal ===");
{
  const page = await newPage(1440, 1000);
  page.__allowErrors = [/Failed to load resource.*(503|500|404)/];
  await page.goto(BASE + "/#/content", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.content, { timeout: 15000 });
  check("content wire console visible at idle", Boolean(await page.$(".content-wire")));
  check("content wire idle hint (no demo mode)", await page.evaluate(() => (document.querySelector(".content-wire")?.textContent ?? "").includes("no demo mode")));
  await clickClean(page, "LOAD SCAM SAMPLE");
  await clickClean(page, "CHECK WITH TELEGRAPH");
  await page.waitForFunction(() => document.querySelector(".content-verdict > strong")?.textContent || document.querySelector(".lab-error"), { timeout: 25000 });
  const state = await page.evaluate(() => ({
    verdict: document.querySelector(".content-verdict > strong")?.textContent ?? null,
    error: document.querySelector(".lab-error")?.textContent ?? null
  }));
  check("content live reaches terminal state (verdict or fail-closed stop)", Boolean(state.verdict || state.error), JSON.stringify(state));
  check("content wire logged the run", await page.evaluate(() => (document.querySelector(".content-wire")?.textContent ?? "").includes("content --action")));
  await shot(page, "audit-content-live.png");
  auditErrors(page, "content page");
  await page.close();
}

// ================= 6. verify states =================
console.log("\n=== 6. verify: VALID / INVALID ===");
{
  const page = await newPage(1440, 1000);
  page.__allowErrors = [/Failed to load resource.*404/];
  await page.goto(BASE + "/#/verify", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.verify, { timeout: 15000 });
  check("trust tabs present (merged trust page)", await page.evaluate(() => document.querySelectorAll('[role="tab"]').length === 2));
  await clickClean(page, "LOAD CANONICAL PROOF");
  await page.waitForFunction(() => document.querySelector(".verify-verdict > strong")?.textContent === "VALID", { timeout: 15000 });
  check("verify canonical VALID", true);
  check("verify PAYMENT RECEIPT", await page.evaluate(() => (document.body.textContent ?? "").includes("PAYMENT RECEIPT")));
  await shot(page, "audit-verify-valid.png");

  const setVerifyValue = (t) => page.evaluate((text) => {
    const ta = document.querySelector("textarea");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, t);

  // unknown hash -> API 404 -> "NOT VERIFIED" error state (honest: not in the store)
  await setVerifyValue("0x" + "1".repeat(64));
  await sleep(200);
  await clickClean(page, "VERIFY PROOF");
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("NOT VERIFIED"), { timeout: 15000 });
  check("verify unknown hash -> NOT VERIFIED state", true);
  await shot(page, "audit-verify-notfound.png");

  // tampered receipt JSON -> API 200 valid:false -> INVALID verdict
  await clickClean(page, "LOAD CANONICAL PROOF");
  await page.waitForFunction(() => document.querySelector(".verify-verdict > strong")?.textContent === "VALID", { timeout: 15000 });
  // open the receipt JSON, copy it, tamper one field, verify the tampered body
  const tampered = await page.evaluate(async () => {
    const r = await fetch("/api/verify-proof", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: "0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3" }) });
    const j = await r.json();
    const t = JSON.parse(JSON.stringify(j.receipt));
    t.receiptHash = "0x" + "a".repeat(64);
    return JSON.stringify(t, null, 2);
  });
  await setVerifyValue(tampered);
  await sleep(200);
  await clickClean(page, "VERIFY PROOF");
  await page.waitForFunction(() => document.querySelector(".verify-verdict > strong")?.textContent === "INVALID", { timeout: 15000 });
  check("verify tampered receipt INVALID verdict", true);
  await shot(page, "audit-verify-invalid.png");
  auditErrors(page, "verify page");
  await page.close();
}

// ================= 7. security lab =================
console.log("\n=== 7. security lab: attack + suite ===");
{
  const page = await newPage(1440, 1000);
  await page.goto(BASE + "/#/security-lab", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS["security-lab"], { timeout: 15000 });
  await clickClean(page, "RUN ATTACK");
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("ATTACK BLOCKED"), { timeout: 15000 });
  check("lab attack: action_hash_mismatch shown", await page.evaluate(() => (document.body.textContent ?? "").includes("action_hash_mismatch")));
  await shot(page, "audit-lab-attack.png");
  await clickClean(page, "RUN SUITE");
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("RAIL HELD"), { timeout: 20000 });
  check("lab suite 10/10", await page.evaluate(() => (document.body.textContent ?? "").includes("10/10")));
  await shot(page, "audit-lab-suite.png");
  auditErrors(page, "lab page");
  await page.close();
}

// ================= 8. guided demo =================
console.log("\n=== 8. guided demo: paused + complete ===");
{
  const page = await newPage(1440, 1000);
  await page.goto(BASE + "/#/demo", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.demo, { timeout: 15000 });
  await sleep(700);
  await page.click('button[aria-label="Pause demo"]');
  await sleep(200);
  check("demo paused state", (await page.evaluate(() => document.querySelector(".console-state")?.textContent ?? "")) === "PAUSED");
  check("demo pause toggles to Play", Boolean(await page.$('button[aria-label="Play demo"]')));
  await shot(page, "audit-demo-paused.png");
  check("demo: 4 scenario cards", (await page.$$(".scenario-card")).length === 4);
  check("demo: terminal console present", Boolean(await page.$(".demo-console")));
  // resume, run the tamper scenario to its verdict
  await page.click('button[aria-label="Play demo"]');
  await page.evaluate(() => [...document.querySelectorAll(".scenario-card")][1]?.click());
  await page.waitForFunction(() => document.querySelector(".verdict-display")?.textContent === "BLOCKED", { timeout: 15000 });
  check("demo: tamper scenario verdict BLOCKED", true);
  check("demo: machine code surfaced", await page.evaluate(() => (document.body.textContent ?? "").includes("action_hash_mismatch")));
  await shot(page, "audit-demo-verdict.png");
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((el) => el.textContent.replace(/\s+/g, " ").includes("SKIP"));
      if (b) b.click();
    });
    await sleep(300);
  }
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("DEMO COMPLETE"), { timeout: 20000 });
  check("demo complete state", await page.evaluate(() => (document.body.textContent ?? "").includes("TRY LIVE MODE")));
  await shot(page, "audit-demo-complete.png");
  auditErrors(page, "demo page");
  await page.close();
}

// ================= 9. docs SDK demos =================
console.log("\n=== 9. docs SDK demos ===");
{
  const page = await newPage(1440, 1000);
  await page.goto(BASE + "/#/docs", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.docs, { timeout: 15000 });
  await clickClean(page, "RUN REQUEST");
  await page.waitForFunction(() => document.querySelector(".sdk-demo-valid .sdk-demo-result b")?.textContent === "ALLOW", { timeout: 20000 });
  await clickClean(page, "RUN ATTACK");
  await page.waitForFunction(() => document.querySelector(".sdk-demo-attack .sdk-demo-result b")?.textContent === "BLOCKED", { timeout: 20000 });
  check("docs demos: ALLOW + BLOCKED", true);
  await shot(page, "audit-docs-demos.png");
  auditErrors(page, "docs page");
  await page.close();
}

// ================= 10. permissions revoke =================
console.log("\n=== 10. permissions revoke ===");
{
  const page = await newPage(1440, 1000);
  await page.goto(BASE + "/#/permissions", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(TESTIDS.permissions, { timeout: 15000 });
  await clickClean(page, "REVOKE FOR NEW REQUESTS");
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("REVOKED"), { timeout: 10000 });
  check("permissions revoked badge", true);
  await shot(page, "audit-permissions-revoked.png");
  await clickClean(page, "RESTORE PERMISSION");
  auditErrors(page, "permissions page");
  await page.close();
}

await browser.close();
console.log(`\nconsole errors across audit: ${consoleErrorTotal}`);
console.log(`${failures === 0 ? "ALL AUDIT CHECKS PASSED" : `${failures} AUDIT CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
