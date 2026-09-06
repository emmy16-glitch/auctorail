// DOM verification for the redesigned UI.
// Renders the production bundle in jsdom and checks the structural
// contracts the Playwright QA suite depends on.
import { JSDOM } from "jsdom";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve("dist");
const bundleFile = readdirSync(resolve(distDir, "assets")).find((file) => file.startsWith("index-") && file.endsWith(".js"));
if (!bundleFile) throw new Error("production bundle not found — run npm run web:build first");
const bundle = readFileSync(resolve(distDir, "assets", bundleFile), "utf8");

function makeDom(hash) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: `http://localhost:5173/${hash ? `#/${hash}` : ""}`,
    pretendToBeVisual: true,
    runScripts: "outside-only"
  });
  const { window } = dom;
  if (!window.crypto?.randomUUID) window.crypto = { randomUUID: () => `uuid-${Math.random().toString(16).slice(2)}` };
  window.scrollTo = () => {};
  return dom;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}`);
  if (!ok) failures += 1;
}

async function scenario(name, hash, assertsFn) {
  const dom = makeDom(hash);
  dom.window.eval(bundle);
  await sleep(500);
  const doc = dom.window.document;
  const q = (sel) => doc.querySelector(sel);
  const qa = (sel) => [...doc.querySelectorAll(sel)];
  // accessible-name approximation: aria-label if present, else textContent minus aria-hidden subtrees
  const a11yName = (el) => {
    const attr = el.getAttribute("aria-label");
    if (attr) return attr.trim().replace(/\s+/g, " ");
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return clone.textContent.trim().replace(/\s+/g, " ");
  };
  const btn = (name, exact = true) => {
    const nodes = qa("button, a");
    return nodes.find((el) => {
      const label = a11yName(el);
      return exact ? label === name : label.includes(name);
    });
  };
  const heading = (name) => qa("h1, h2, h3").find((el) => el.textContent.replace(/\s+/g, " ").includes(name));

  console.log(`\n=== ${name} (${hash || "home"}) ===`);
  try {
    const asserts = assertsFn({ q, qa, btn, heading, doc });
    await sleep(80); // allow React to re-render after any interaction in assertsFn
    for (const [label, fn] of asserts) check(label, Boolean(fn()));
  } finally {
    dom.window.close();
  }
}

await scenario("landing", "", ({ q, qa, btn, heading }) => [
  ["home root div", () => q("#auctorail-home-root")],
  ["brand lockup AUCTORAIL", () => q("#auctorail-home-root .home-brand strong")?.textContent === "AUCTORAIL"],
  ["heading: Prove authority before execution.", () => heading("Prove authority before execution.")],
  ["button: ENTER LIVE MODE", () => btn("ENTER LIVE MODE", false)],
  ["button: WATCH DEMO", () => btn("WATCH DEMO", false)],
  ["button: CHECK CONTENT", () => btn("CHECK CONTENT", false)],
  ["button: VERIFY (exact)", () => btn("VERIFY", true)],
  ["nav: CHECK", () => btn("CHECK", true)],
  ["nav: ACTIVITY", () => btn("ACTIVITY", true)],
  ["nav: PERMISSIONS", () => btn("PERMISSIONS", true)],
  ["nav: SECURITY LAB", () => btn("SECURITY LAB", true)],
  ["nav: DOCS", () => btn("DOCS", false)],
  ["status pill", () => q(".status-pill")?.textContent.includes("BASE SEPOLIA")]
]);

await scenario("check (idle)", "check", ({ q, qa, btn, heading }) => {
  // open the request editor so the amount steppers are mounted (mirrors the QA flow)
  const summary = qa("button").find((el) => (el.textContent || "").includes("CURRENT REQUEST"));
  summary?.click();
  return [
    ["#root .brand-lockup strong AUCTORAIL", () => q("#root .brand-lockup strong")?.textContent === "AUCTORAIL"],
    ["heading: Control what an agent can do.", () => heading("Control what an agent can do.")],
    ["button: CHECK THIS REQUEST", () => btn("CHECK THIS REQUEST")],
    ["button: CURRENT REQUEST", () => btn("CURRENT REQUEST", false)],
    ["limit stepper output", () => q('[data-testid="limit-value"]')?.textContent === "5.00 USDC"],
    ["duration output", () => q('[data-testid="duration-value"]')?.textContent === "1 hour"],
    ["locked recipient", () => q('[data-testid="locked-recipient"]')],
    ["aria: Decrease maximum payment", () => q('button[aria-label="Decrease maximum payment"]')],
    ["aria: Increase maximum payment", () => q('button[aria-label="Increase maximum payment"]')],
    ["aria: Shorten permission duration", () => q('button[aria-label="Shorten permission duration"]')],
    ["aria: Extend permission duration", () => q('button[aria-label="Extend permission duration"]')],
    ["request editor opened", () => q('[data-testid="request-editor"]')],
    ["aria: Decrease request amount", () => q('button[aria-label="Decrease request amount"]')],
    ["aria: Increase request amount", () => q('button[aria-label="Increase request amount"]')],
    ["button: EDIT TEST REQUEST", () => btn("EDIT TEST REQUEST")],
    ["result preview", () => q(".result-preview")]
  ];
});

await scenario("guided demo", "demo", ({ q, qa, heading }) => [
  ["guided-demo-screen testid", () => q('[data-testid="guided-demo-screen"]')],
  ["heading: Watch Auctorail in action.", () => heading("Watch Auctorail in action.")],
  ["text: No real payments.", () => (q("main")?.textContent || "").includes("No real payments.")],
  ["button: Pause demo", () => q('button[aria-label="Pause demo"]')],
  ["scenario cards", () => qa(".scenario-card").length === 4],
  ["console log lines", () => qa(".console-line").length >= 2]
]);

await scenario("content trust", "content", ({ q, qa, btn, heading }) => [
  ["content-trust-screen testid", () => q('[data-testid="content-trust-screen"]')],
  ["heading: Check the evidence before you act.", () => heading("Check the evidence before you act.")],
  ["text: DETERMINISTIC DEMO (exact element)", () => qa("*").some((el) => el.children.length === 0 && el.textContent === "DETERMINISTIC DEMO")],
  ["button: LOAD SCAM SAMPLE", () => btn("LOAD SCAM SAMPLE")],
  ["button: RUN CONTENT CHECK", () => btn("RUN CONTENT CHECK")],
  ["mode buttons", () => btn("DEMO · FREE") && btn("LIVE TELEGRAPH")]
]);

await scenario("verify", "verify", ({ q, btn, heading }) => [
  ["verify-screen testid", () => q('[data-testid="verify-screen"]')],
  ["heading: Verify the proof, not the screenshot.", () => heading("Verify the proof, not the screenshot.")],
  ["button: LOAD CANONICAL PROOF", () => btn("LOAD CANONICAL PROOF")],
  ["button: VERIFY PROOF", () => btn("VERIFY PROOF")],
  ["canonical tx shown", () => (q("main")?.textContent || "").includes("0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc")]
]);

await scenario("security lab", "security-lab", ({ q, qa, btn, heading }) => [
  ["security-lab-screen testid", () => q('[data-testid="security-lab-screen"]')],
  ["heading: Try to break Auctorail.", () => heading("Try to break Auctorail.")],
  ["button: RUN ATTACK", () => btn("RUN ATTACK", false)],
  ["button: RUN SUITE", () => btn("RUN SUITE", false)],
  ["categories", () => qa(".lab-category").length === 4],
  ["attack select", () => q("select.select")]
]);

await scenario("activity", "activity", ({ q, heading }) => [
  ["activity-screen testid", () => q('[data-testid="activity-screen"]')],
  ["heading: What happened.", () => heading("What happened.")],
  ["empty state", () => (q("main")?.textContent || "").includes("No activity yet.")]
]);

await scenario("permissions", "permissions", ({ q, btn, heading }) => [
  ["heading: Bound invoice-bot.", () => heading("Bound invoice-bot.")],
  ["button: REVOKE FOR NEW REQUESTS", () => btn("REVOKE FOR NEW REQUESTS")],
  ["button: EDIT", () => btn("EDIT", true)],
  ["pinned recipient", () => (q("main")?.textContent || "").includes("PINNED")]
]);

await scenario("docs/sdk", "docs", ({ q, btn, heading }) => [
  ["sdk-screen testid", () => q('[data-testid="sdk-screen"]')],
  ["heading: BUILD WITH AUCTORAIL", () => heading("BUILD WITH AUCTORAIL")],
  ["install command", () => (q("main")?.textContent || "").includes("npm install ./packages/sdk")],
  ["demo run buttons", () => btn("RUN REQUEST", false) && btn("RUN ATTACK", false)]
]);

console.log(`\n${failures === 0 ? "ALL DOM CHECKS PASSED" : `${failures} DOM CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
