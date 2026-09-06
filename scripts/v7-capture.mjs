// v7 capture/test: image upload -> on-device OCR -> textarea filled -> check flow
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { setupLambdaEnvironment } from "@sparticuz/chromium";
import { default as Chromium } from "@sparticuz/chromium";

try {
  execSync("test -f /tmp/al2023/lib/libnss3.so || (mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))\" && tar -xf /tmp/al2023.tar -C /tmp/al2023)");
} catch {}
process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib" + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : "");
setupLambdaEnvironment("/tmp/al2023/lib");
const browser = await puppeteer.launch({ executablePath: await Chromium.executablePath(), headless: true, args: [...Chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "playwright-artifacts");
mkdirSync(OUT, { recursive: true });
async function shot(page, name, full = true) {
  await page.addStyleTag({ content: ".top-nav{position:static!important}" });
  await page.screenshot({ path: join(OUT, name), fullPage: full });
  console.log("saved", name);
}

const TEXT = "URGENT: Your account is suspended. Verify your wallet immediately and send crypto to restore access.";

{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/#/content", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".ocr-drop", { timeout: 15000 });

  // 1) draw a "screenshot" of the scam message in the page, save as PNG
  const pngBase64 = await page.evaluate((text) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900; canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, 900, 240);
    ctx.fillStyle = "#e6edf3";
    ctx.font = "26px monospace";
    // wrap
    const words = text.split(" ");
    let line = "", y = 60;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > 820) { ctx.fillText(line, 40, y); line = w; y += 44; }
      else line = test;
    }
    ctx.fillText(line, 40, y);
    return new Promise((resolve) => canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    }, "image/png"));
  }, TEXT);
  const pngPath = join(OUT, "scam-screenshot-test.png");
  await import("node:fs").then((fs) => fs.writeFileSync(pngPath, Buffer.from(pngBase64, "base64")));
  console.log("wrote test screenshot", pngPath);

  // 2) upload it through the file input
  const input = await page.$(".ocr-drop-input");
  await input.uploadFile(pngPath);

  // 3) wait for OCR to finish (done state in the wire or preview meta)
  await page.waitForFunction(
    () => (document.querySelector(".ocr-preview-meta em")?.textContent ?? "").includes("extracted"),
    { timeout: 120000 }
  );
  const extracted = await page.evaluate(() => ({
    words: document.querySelector(".ocr-preview-meta em")?.textContent ?? "",
    text: document.querySelector("textarea")?.value ?? ""
  }));
  console.log("OCR words line:", extracted.words);
  console.log("textarea filled:", JSON.stringify(extracted.text.slice(0, 120)));
  const words = extracted.text.split(" ").filter(Boolean).length;
  const hits = ["URGENT", "account", "suspended", "wallet", "crypto"].filter((w) => extracted.text.toLowerCase().includes(w.toLowerCase())).length;
  console.log(`OCR quality: ${words} words, ${hits}/5 key terms recognized`);
  await shot(page, "v7-ocr-done.png", false);

  // 4) run the check with the extracted text (live -> fail-closed in sandbox)
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "CHECK WITH TELEGRAPH")?.click());
  await page.waitForFunction(() => document.querySelector(".lab-error") || document.querySelector(".content-verdict > strong"), { timeout: 40000 });
  await sleep(300);
  const wire = await page.evaluate(() => document.querySelector(".content-wire")?.textContent ?? "");
  console.log("wire has ocr line:", wire.includes("words extracted in-browser"));
  await shot(page, "v7-ocr-check-run.png", false);
  await page.close();
}

// mobile
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173/#/content", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".ocr-drop", { timeout: 15000 });
  await sleep(400);
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("content 390 overflow:", ovf, "px");
  await shot(page, "v7-ocr-390.png", false);
  await page.close();
}

console.log("done");
await browser.close();
