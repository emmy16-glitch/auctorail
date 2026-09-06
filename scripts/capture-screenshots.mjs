// Captures screenshots of the redesigned Auctorail UI with the Lambda-bundled
// Chromium (npm @sparticuz/chromium — no CDN download needed) via puppeteer-core.
// Also runs the QA horizontal-overflow checks and landing target-size checks
// at the three CI viewports (390 / 980 / 1440).
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

// The al2023 NSS libs must be extracted for the bundled binary (see README of @sparticuz/chromium);
// inflate() extracts the binary itself but we extract the lib tar explicitly as a fallback.
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
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}`);
  if (!ok) failures += 1;
}

async function newPage(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  return page;
}

async function overflow(page, label) {
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`no horizontal overflow: ${label} (${diff}px)`, diff <= 1);
}

async function shot(page, name) {
  // sticky nav renders mid-page in stitched full-page captures; pin it for clean docs shots
  await page.addStyleTag({ content: ".top-nav { position: static !important; }" });
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  console.log(`  shot: ${name}`);
}

async function findByRoleButton(page, name) {
  return page.evaluateHandle((nm) => {
    const clean = (el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      return c.textContent.trim().replace(/\s+/g, " ");
    };
    return [...document.querySelectorAll("button, a")].find((el) => clean(el) === nm) ?? null;
  }, name);
}

async function clickButton(page, name) {
  const handle = await findByRoleButton(page, name);
  const el = handle.asElement();
  if (!el) throw new Error(`button not found: ${name}`);
  await el.click();
}

// ================= desktop 1440 =================
const page = await newPage(1440, 1000);

// 1. landing
await page.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="home-landing-screen"]', { timeout: 15000 });
await overflow(page, "landing 1440");
await shot(page, "auctorail-desktop-landing.png");

// landing target sizes (QA visible_target rule: >=40 at 1440)
for (const name of ["CHECK CONTENT", "WATCH DEMO", "ENTER LIVE MODE"]) {
  const el = (await findByRoleButton(page, name)).asElement();
  const box = el ? await el.boundingBox() : null;
  check(`landing target ${name} >=40px`, Boolean(box && box.width >= 40 && box.height >= 40), box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "missing");
}
const verifyEl = (await findByRoleButton(page, "VERIFY")).asElement();
const vbox = verifyEl ? await verifyEl.boundingBox() : null;
check("landing target VERIFY (exact) >=40px", Boolean(vbox && vbox.width >= 40 && vbox.height >= 40), vbox ? `${Math.round(vbox.width)}x${Math.round(vbox.height)}` : "missing");

// 2. check screen
await clickButton(page, "CHECK");
await page.waitForSelector('[data-testid="checking-screen"]', { timeout: 10000 });
await overflow(page, "check 1440");
await shot(page, "auctorail-desktop-check.png");
// open the request editor for the screenshot (row button name includes the summary line)
const current = await page.evaluateHandle(() => {
  const clean = (el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return c.textContent.trim().replace(/\s+/g, " ");
  };
  return [...document.querySelectorAll("button")].find((el) => clean(el).includes("CURRENT REQUEST")) ?? null;
});
const currentEl = current.asElement();
if (currentEl) await currentEl.click();
await sleep(400);
await shot(page, "auctorail-desktop-check-editor.png");

// 3. guided demo
await clickButton(page, "WATCH DEMO").catch(() => {});
await page.goto(BASE + "/#/demo", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="guided-demo-screen"]', { timeout: 15000 });
await sleep(2600); // let the autoplay advance
await overflow(page, "demo 1440");
await shot(page, "auctorail-desktop-demo.png");

// 4. content trust — run the deterministic scam check
await page.goto(BASE + "/#/content", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="content-trust-screen"]', { timeout: 15000 });
await clickButton(page, "LOAD SCAM SAMPLE");
await clickButton(page, "RUN CONTENT CHECK");
await page.waitForFunction(() => document.querySelector(".content-verdict > strong")?.textContent === "BLOCK", { timeout: 15000 });
await overflow(page, "content 1440");
await shot(page, "auctorail-desktop-content-block.png");

// 5. verify — canonical proof
await page.goto(BASE + "/#/verify", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="verify-screen"]', { timeout: 15000 });
await clickButton(page, "LOAD CANONICAL PROOF");
await page.waitForFunction(() => document.querySelector(".verify-verdict > strong")?.textContent === "VALID", { timeout: 15000 });
await overflow(page, "verify 1440");
await shot(page, "auctorail-desktop-verify-valid.png");

// 6. security lab — run the full suite
await page.goto(BASE + "/#/security-lab", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="security-lab-screen"]', { timeout: 15000 });
await clickButton(page, "RUN SUITE");
await page.waitForFunction(() => (document.body.textContent ?? "").includes("RAIL HELD"), { timeout: 15000 });
await sleep(400);
await overflow(page, "security lab 1440");
await shot(page, "auctorail-desktop-security-lab.png");

// 7. permissions
await page.goto(BASE + "/#/permissions", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="permissions-screen"]', { timeout: 15000 });
await overflow(page, "permissions 1440");
await shot(page, "auctorail-desktop-permissions.png");

// 8. docs
await page.goto(BASE + "/#/docs", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="sdk-screen"]', { timeout: 15000 });
await overflow(page, "docs 1440");
await shot(page, "auctorail-desktop-docs.png");

// 9. activity (empty state)
await page.goto(BASE + "/#/activity", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="activity-screen"]', { timeout: 15000 });
await shot(page, "auctorail-desktop-activity.png");

await page.close();

// ================= tablet 980 =================
const page980 = await newPage(980, 1200);
await page980.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
await page980.waitForSelector('[data-testid="home-landing-screen"]', { timeout: 15000 });
await overflow(page980, "landing 980");
const el980 = (await findByRoleButton(page980, "CHECK CONTENT")).asElement();
const box980 = el980 ? await el980.boundingBox() : null;
check("landing target CHECK CONTENT @980 >=26px", Boolean(box980 && box980.width >= 26 && box980.height >= 26), box980 ? `${Math.round(box980.width)}x${Math.round(box980.height)}` : "missing");
await shot(page980, "auctorail-tablet-landing.png");
await page980.close();

// ================= mobile 390 =================
const page390 = await newPage(390, 844);
await page390.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
await page390.waitForSelector('[data-testid="home-landing-screen"]', { timeout: 15000 });
await overflow(page390, "landing 390");
await shot(page390, "auctorail-mobile-landing.png");

// nav must be visible on mobile (QA asserts buttons at 390)
const navCheck = await page390.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return c.textContent.trim().replace(/\s+/g, " ") === "CHECK";
  });
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const visible = r.width >= 26 && r.height >= 26 && getComputedStyle(b).visibility !== "hidden";
  return { visible, w: Math.round(r.width), h: Math.round(r.height) };
});
check("mobile nav CHECK button visible >=26px", Boolean(navCheck?.visible), JSON.stringify(navCheck));
const navVerify = await page390.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return c.textContent.trim().replace(/\s+/g, " ") === "VERIFY";
  });
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { visible: r.width >= 26 && r.height >= 26 && getComputedStyle(b).visibility !== "hidden", w: Math.round(r.width), h: Math.round(r.height) };
});
check("mobile nav VERIFY button visible >=26px", Boolean(navVerify?.visible), JSON.stringify(navVerify));

// mobile check screen
await clickButton(page390, "CHECK");
await page390.waitForSelector('[data-testid="checking-screen"]', { timeout: 10000 });
await overflow(page390, "check 390");
await shot(page390, "auctorail-mobile-check.png");
await page390.close();

await browser.close();
console.log(`\n${failures === 0 ? "ALL CAPTURE CHECKS PASSED" : `${failures} CAPTURE CHECKS FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
