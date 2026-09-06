import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { setupLambdaEnvironment } from "@sparticuz/chromium";
import { default as Chromium } from "@sparticuz/chromium";
try { execSync("test -f /tmp/al2023/lib/libnss3.so || (mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))\" && tar -xf /tmp/al2023.tar -C /tmp/al2023)"); } catch {}
process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib" + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : "");
setupLambdaEnvironment("/tmp/al2023/lib");
const browser = await puppeteer.launch({ executablePath: await Chromium.executablePath(), headless: true, args: [...Chromium.args, "--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "playwright-artifacts");
async function shot(page, name, full = true) { await page.addStyleTag({ content: ".top-nav{position:static!important}" }); await page.screenshot({ path: join(OUT, name), fullPage: full }); console.log("saved", name); }
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/#/trust", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".trust-tabs", { timeout: 15000 });
  await sleep(500);
  await shot(page, "v6-trust-content-idle.png", false);
  // real live attempt (no wallet -> fail-closed) to capture the error terminal
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("LOAD SCAM SAMPLE"))?.click());
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "CHECK WITH TELEGRAPH")?.click());
  await page.waitForFunction(() => document.querySelector(".lab-error") || document.querySelector(".content-verdict > strong"), { timeout: 30000 });
  await sleep(300);
  await shot(page, "v6-trust-live-failclosed.png", false);
  // verify tab
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes("VERIFY RECEIPT"))?.click());
  await page.waitForSelector('[data-testid="verify-screen"]', { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("LOAD CANONICAL PROOF"))?.click());
  await page.waitForFunction(() => document.querySelector(".verify-verdict > strong")?.textContent === "VALID", { timeout: 15000 });
  await sleep(300);
  await shot(page, "v6-trust-verify-valid.png", false);
  await page.close();
}
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173/#/trust", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".trust-tabs", { timeout: 15000 });
  await sleep(400);
  console.log("trust 390 overflow:", await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "px");
  await shot(page, "v6-trust-390.png", false);
  await page.close();
}
console.log("done");
await browser.close();
