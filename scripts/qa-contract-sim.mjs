// Simulates the updated QA contract flows against the live dev server:
//  1. content: landing CHECK CONTENT -> trust(content tab) -> mocked live content-check -> BLOCK -> VERIFY RECEIPT tab -> VERIFY PROOF -> VALID + CONTENT RECEIPT
//  2. canonical: nav TRUST -> trust page -> switch to VERIFY RECEIPT tab -> LOAD CANONICAL PROOF -> VALID + PAYMENT RECEIPT + EXECUTED + OPEN BASESCAN
import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import { setupLambdaEnvironment } from "@sparticuz/chromium";
import { default as Chromium } from "@sparticuz/chromium";
import { readFileSync } from "node:fs";

try {
  execSync("test -f /tmp/al2023/lib/libnss3.so || (mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))\" && tar -xf /tmp/al2023.tar -C /tmp/al2023)");
} catch {}
process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib" + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : "");
setupLambdaEnvironment("/tmp/al2023/lib");
const browser = await puppeteer.launch({ executablePath: await Chromium.executablePath(), headless: true, args: [...Chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fixture = JSON.parse(readFileSync("/tmp/fixture-live.json", "utf8"));

let failures = 0;
function check(label, ok, extra = "") { console.log(`${ok ? "PASS" : "FAIL"} | ${label}${extra ? " | " + extra : ""}`); if (!ok) failures++; }

// ---- 1. content flow (mocked live) ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/content-check")) {
      request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
      return;
    }
    if (url.includes("/api/authorize") || url.includes("/api/execute")) { console.log("forbidden hit:", url); request.abort(); return; }
    request.continue();
  });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('[data-testid="home-landing-screen"]', { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /CHECK CONTENT/i.test(b.textContent))?.click());
  await page.waitForSelector('[data-testid="content-trust-screen"]', { timeout: 15000 });
  check("content screen visible on trust page", true);
  const heading = await page.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.textContent));
  check("content H1 present", heading.some((t) => t === "Check the evidence before you act."), JSON.stringify(heading));
  const tabCount = await page.evaluate(() => document.querySelectorAll('[role="tab"]').length);
  check("trust tabs = 2", tabCount === 2, String(tabCount));
  const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()));
  check("CHECK WITH TELEGRAPH visible", btns.includes("CHECK WITH TELEGRAPH"));
  check("no demo button left", !btns.some((t) => t === "DEMO · FREE" || t === "RUN CONTENT CHECK" || t === "LIVE TELEGRAPH"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("LOAD SCAM SAMPLE"))?.click());
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "CHECK WITH TELEGRAPH")?.click());
  await page.waitForFunction(() => document.querySelector(".content-verdict > strong")?.textContent, { timeout: 15000 });
  const verdict = await page.evaluate(() => document.querySelector(".content-verdict > strong")?.textContent);
  check("content verdict BLOCK", verdict === "BLOCK", verdict ?? "");
  const bodyText = await page.evaluate(() => document.body.textContent);
  check("REAL TELEGRAPH · x402 SPEND RAW 1000", bodyText.includes("REAL TELEGRAPH · x402 SPEND RAW 1000"));
  check("SCAM signal visible", await page.evaluate(() => [...document.querySelectorAll(".signal-kind")].some((el) => el.textContent === "SCAM")));
  const wire = await page.evaluate(() => document.querySelector(".content-wire")?.textContent ?? "");
  check("wire logged run", wire.includes("content --action") && wire.includes("decision BLOCK"), wire.slice(0, 120));
  // VERIFY RECEIPT button (scoped to content screen)
  await page.evaluate(() => {
    const scope = document.querySelector('[data-testid="content-trust-screen"]');
    [...scope.querySelectorAll("button")].find((b) => b.textContent.includes("VERIFY RECEIPT"))?.click();
  });
  await page.waitForSelector('[data-testid="verify-screen"]', { timeout: 15000 });
  check("verify tab opened after VERIFY RECEIPT", true);
  const prefill = await page.evaluate(() => document.querySelector('[data-testid="verify-screen"] input, [data-testid="verify-screen"] textarea')?.value ?? "");
  check("receipt prefilled", prefill.length > 40, `${prefill.slice(0, 30)}…`);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "VERIFY PROOF")?.click());
  await page.waitForFunction(() => document.querySelector(".verify-verdict > strong")?.textContent, { timeout: 15000 });
  const v = await page.evaluate(() => document.querySelector(".verify-verdict > strong")?.textContent);
  check("verify VALID (content receipt)", v === "VALID", v ?? "");
  check("CONTENT RECEIPT label", await page.evaluate(() => document.body.textContent.includes("CONTENT RECEIPT")));
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no overflow", ovf <= 1, `${ovf}px`);
  await page.close();
}

// ---- 2. canonical verify via nav TRUST ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('[data-testid="home-landing-screen"]', { timeout: 15000 });
  const navTrust = await page.evaluate(() => {
    const side = document.querySelector(".nav-side");
    return [...side.querySelectorAll("button")].map((b) => b.textContent.trim());
  });
  check("nav has TRUST", navTrust.includes("TRUST"), JSON.stringify(navTrust));
  await page.evaluate(() => {
    const side = document.querySelector(".nav-side");
    [...side.querySelectorAll("button")].find((b) => b.textContent.trim() === "TRUST")?.click();
  });
  await page.waitForSelector('[data-testid="trust-screen"]', { timeout: 15000 });
  check("trust page opened from nav", true);
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    tabs.find((t) => t.textContent.includes("VERIFY RECEIPT"))?.click();
  });
  await page.waitForSelector('[data-testid="verify-screen"]', { timeout: 15000 });
  const heading = await page.evaluate(() => [...document.querySelectorAll("h1")].map((h) => h.textContent));
  check("verify H1 present", heading.some((t) => t === "Verify the proof, not the screenshot."), JSON.stringify(heading));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("LOAD CANONICAL PROOF"))?.click());
  await page.waitForFunction(() => document.querySelector(".verify-verdict > strong")?.textContent, { timeout: 15000 });
  const v = await page.evaluate(() => document.querySelector(".verify-verdict > strong")?.textContent);
  check("canonical VALID", v === "VALID", v ?? "");
  const bodyText = await page.evaluate(() => document.body.textContent);
  check("PAYMENT RECEIPT label", bodyText.includes("PAYMENT RECEIPT"));
  check("EXECUTED visible", bodyText.includes("EXECUTED"));
  check("OPEN BASESCAN link", await page.evaluate(() => [...document.querySelectorAll("a, button")].some((el) => /OPEN BASESCAN/i.test(el.textContent))));
  await page.close();
}

console.log(failures === 0 ? "ALL QA-CONTRACT FLOWS PASSED" : `${failures} FLOW CHECKS FAILED`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
