// v5 capture: cardless lab (dropdown-only picker) — desktop idle/ran + mobile
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
const browser = await puppeteer.launch({ executablePath: await Chromium.executablePath(), headless: true, args: [...Chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(page, name, full = true) {
  await page.addStyleTag({ content: ".top-nav{position:static!important}" });
  await page.screenshot({ path: join(OUT, name), fullPage: full });
  console.log("saved", name);
}
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(BASE + "/#/security-lab", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".lab-attack-select", { timeout: 15000 });
  await sleep(500);
  await shot(page, "v5-lab-cardless-idle.png", false);
  await page.select(".lab-attack-select", "permit_forgery");
  await page.waitForFunction(() => (document.querySelector(".verdict-zone")?.textContent ?? "").includes("ATTACK BLOCKED"), { timeout: 15000 });
  await sleep(300);
  await shot(page, "v5-lab-cardless-ran.png", false);
  console.log("attack-cards remaining:", await page.evaluate(() => document.querySelectorAll(".attack-cards").length));
  await page.close();
}
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE + "/#/security-lab", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".lab-attack-select", { timeout: 15000 });
  await sleep(400);
  console.log("lab 390 overflow:", await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "px");
  await shot(page, "v5-lab-cardless-390.png", false);
  await page.close();
}
console.log("done");
await browser.close();
