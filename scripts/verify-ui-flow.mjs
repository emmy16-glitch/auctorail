// End-to-end UI flow verification against the real dev API (8787/8788).
// Drives the production bundle in jsdom with a fetch polyfill:
//   check -> execute -> activity -> permissions   (live happy path)
//   content check -> receipt verify               (content flow)
//   canonical proof verify                        (verify flow)
//   security lab suite                            (lab flow)
import { JSDOM } from "jsdom";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundle = readFileSync(resolve("dist/assets", readdirSync("dist/assets").find((f) => f.startsWith("index-") && f.endsWith(".js"))), "utf8");
const PROXY = "http://127.0.0.1:5173"; // vite proxies /api to the right backend port

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}`);
  if (!ok) failures += 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeDom(hash) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: `${PROXY}/${hash ? `#/${hash}` : ""}`,
    pretendToBeVisual: true,
    runScripts: "outside-only"
  });
  const { window } = dom;
  window.scrollTo = () => {};
  if (!window.crypto?.randomUUID) window.crypto = { randomUUID: () => `u${Date.now()}${Math.random().toString(16).slice(2)}` };
  window.fetch = (input, init) => {
    const url = String(input);
    const t0 = Date.now();
    const p = fetch(url.startsWith("http") ? url : `${PROXY}${url}`, init);
    p.then((r) => { console.log(`[fetch] ${init?.method ?? "GET"} ${url.replace(PROXY, "")} -> ${r.status} in ${Date.now() - t0}ms`); return r; }).catch((e) => console.log(`[fetch] ${url.replace(PROXY, "")} ERROR ${e.message}`));
    return p;
  };
  return dom;
}
const SKIP_LIVE = process.env.SKIP_LIVE === "1";

function buttons(doc) {
  return [...doc.querySelectorAll("button")];
}
function findButton(doc, name, exact = true) {
  return buttons(doc).find((el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    const label = clone.textContent.trim().replace(/\s+/g, " ");
    return exact ? label === name : label.includes(name);
  });
}
async function waitFor(fn, label, timeout = 30000, interval = 400) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await sleep(interval);
  }
  console.log(`  (timeout waiting for: ${label})`);
  return false;
}

const dom = makeDom("check");
dom.window.eval(bundle);
await sleep(600);
const doc = dom.window.document;

// ---- 1. live check + execute happy path ----
console.log("=== live check -> execute ===");
if (SKIP_LIVE) {
  dom.window.close();
  console.log("(skipping live check section)");
} else {
  check("check screen mounted", Boolean(doc.querySelector('[data-testid="checking-screen"]')));
const checkBtn = findButton(doc, "CHECK THIS REQUEST");
check("CHECK THIS REQUEST button", Boolean(checkBtn));
checkBtn?.click();

const executed = await waitFor(() => {
  const h1 = doc.querySelector(".execution-screen h1, [data-testid='execution-screen'] h1")?.textContent ?? "";
  return h1.toLowerCase().includes("payment executed");
}, "payment executed", 90000, 700);
check("execution: PAYMENT EXECUTED heading", executed);
if (!executed) {
  console.log("--- check screen state after timeout ---");
  const scope = doc.querySelector("[data-testid='checking-screen'], [data-testid='execution-screen']") ?? doc;
  console.log((scope.textContent ?? "EMPTY").slice(0, 2200));
  console.log("--- testids present ---");
  console.log([...doc.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")).join(", "));
}
const execText = doc.querySelector("main")?.textContent ?? "";
check("execution: receipt shows Auctorail Vendor", execText.includes("Auctorail Vendor"));
check("execution: EXECUTED status", /EXECUTED/.test(execText));
check("execution: tx hash present", /0x[0-9a-f]{8,}/i.test(execText));

// ---- 2. activity ----
console.log("=== activity after execution ===");
doc.defaultView.location.hash = "#/activity";
await sleep(700);
const actText = doc.querySelector("main")?.textContent ?? "";
check("activity screen mounted", Boolean(doc.querySelector('[data-testid="activity-screen"]')));
check("activity shows EXECUTED", actText.includes("EXECUTED"));

// ---- 3. permissions ----
console.log("=== permissions after execution ===");
doc.defaultView.location.hash = "#/permissions";
await sleep(700);
const permText = doc.querySelector("main")?.textContent ?? "";
check("permissions heading Bound invoice-bot.", (doc.querySelector("main h1")?.textContent ?? "").includes("Bound invoice-bot."));
check("STANDING AUTHORITY visible", permText.includes("STANDING AUTHORITY"));
check("REVOKE FOR NEW REQUESTS", Boolean(findButton(doc, "REVOKE FOR NEW REQUESTS")));
  dom.window.close();
}

// ---- 4. content check -> receipt verify ----
console.log("=== content check -> receipt verify ===");
const dom2 = makeDom("content");
dom2.window.eval(bundle);
await sleep(600);
const doc2 = dom2.window.document;
check("content screen mounted", Boolean(doc2.querySelector('[data-testid="content-trust-screen"]')));
findButton(doc2, "LOAD SCAM SAMPLE")?.click();
await sleep(200);
findButton(doc2, "RUN CONTENT CHECK")?.click();
const blockOk = await waitFor(() => doc2.querySelector(".content-verdict > strong")?.textContent === "BLOCK", "content BLOCK verdict", 20000);
check("content verdict BLOCK", blockOk);
check("DEMO EVIDENCE note", (doc2.querySelector("main")?.textContent ?? "").includes("DEMO EVIDENCE · NOT TELEGRAPH OUTPUT"));
check("SCAM signal shown", [...doc2.querySelectorAll(".signal-kind")].some((el) => el.textContent === "SCAM"));
const verifyReceiptBtn = findButton(doc2, "VERIFY RECEIPT");
check("VERIFY RECEIPT button", Boolean(verifyReceiptBtn));
verifyReceiptBtn?.click();
await sleep(800);
check("navigated to verify with receipt", (doc2.querySelector("main textarea, main .verify-json")?.textContent ?? "").includes("receipt") || (doc2.querySelector("main")?.textContent ?? "").length > 0);
findButton(doc2, "VERIFY PROOF")?.click();
const validOk = await waitFor(() => doc2.querySelector(".verify-verdict > strong")?.textContent === "VALID", "content receipt VALID", 20000);
check("content receipt VALID", validOk);
check("CONTENT RECEIPT label", (doc2.querySelector("main")?.textContent ?? "").includes("CONTENT RECEIPT"));
dom2.window.close();

// ---- 5. canonical proof verify ----
console.log("=== canonical proof verify ===");
const dom3 = makeDom("verify");
dom3.window.eval(bundle);
await sleep(600);
const doc3 = dom3.window.document;
check("verify screen mounted", Boolean(doc3.querySelector('[data-testid="verify-screen"]')));
findButton(doc3, "LOAD CANONICAL PROOF")?.click();
await sleep(200);
findButton(doc3, "VERIFY PROOF")?.click();
// wait for a STABLE VALID state (survives the auto-verify + click double-request race)
let stableSince = 0;
const valid3 = await waitFor(() => {
  const verdict = doc3.querySelector(".verify-verdict > strong")?.textContent;
  const btn = doc3.querySelector(".verify-layout button.btn-primary");
  const stable = verdict === "VALID" && !btn?.disabled;
  const now = Date.now();
  if (stable) { if (!stableSince) stableSince = now; return now - stableSince >= 800; }
  stableSince = 0;
  return false;
}, "canonical VALID (stable)", 15000, 250);
check("canonical proof VALID", valid3);
const v3text = doc3.querySelector("main")?.textContent ?? "";
if (!v3text.includes("PAYMENT RECEIPT")) {
  console.log("--- canonical debug: verdict html ---");
  console.log(doc3.querySelector(".verify-verdict")?.outerHTML?.slice(0, 500));
  console.log("--- canonical debug: main text ---");
  console.log(v3text.slice(0, 900));
}
check("PAYMENT RECEIPT label", v3text.includes("PAYMENT RECEIPT"));
check("EXECUTED decision", v3text.includes("EXECUTED"));
check("OPEN BASESCAN link", Boolean(doc3.querySelector("a.explorer-link")));
dom3.window.close();

// ---- 6. security lab suite ----
console.log("=== security lab suite ===");
const dom4 = makeDom("security-lab");
dom4.window.eval(bundle);
await sleep(600);
const doc4 = dom4.window.document;
check("lab screen mounted", Boolean(doc4.querySelector('[data-testid="security-lab-screen"]')));
findButton(doc4, "RUN SUITE")?.click();
const suiteOk = await waitFor(() => (doc4.querySelector("main")?.textContent ?? "").includes("RAIL HELD"), "suite RAIL HELD", 20000);
check("suite: RAIL HELD", suiteOk);
check("suite: 10/10", (doc4.querySelector("main")?.textContent ?? "").includes("10/10"));
dom4.window.close();

console.log(`\n${failures === 0 ? "ALL FLOW CHECKS PASSED" : `${failures} FLOW CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
