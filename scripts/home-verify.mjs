// Focused verification of the home "simple version" explainer + auto-terminals.
// Captures desktop + mobile, checks console errors and horizontal overflow,
// and waits for the auto-terminal to have typed several lines.
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

let failures = 0;
const check = (label, ok) => { console.log(`${ok ? "PASS" : "FAIL"} | ${label}`); if (!ok) failures += 1; };

async function capture(width, height, name, waitMs) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  // wait for the auto-terminal to have typed a few lines
  await page.waitForFunction(
    (ms) => {
      const el = document.querySelector(".plain-section .auto-term-body");
      if (!el) return false;
      const t = el.textContent || "";
      const start = Date.now();
      return t.length > 40 || (Date.now() - window.__t0) > ms;
    },
    { timeout: 8000 },
    waitMs
  ).catch(() => {});
  await page.evaluate(() => { window.__t0 = Date.now(); });
  await new Promise((r) => setTimeout(r, 2600)); // let it type
  const diff = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name}: no horizontal overflow (${diff}px)`, diff <= 1);
  const realErrors = errors.filter((e) => !/404|ERR_ABORTED|net::/.test(e));
  check(`${name}: no console errors${realErrors.length ? ` (${realErrors[0]})` : ""}`, realErrors.length === 0);

  // element shots
  const plain = await page.$(".plain-section");
  if (plain) await plain.screenshot({ path: join(OUT, `${name}-plain.png`) });
  const closing = await page.$(".closing-band");
  if (closing) await closing.screenshot({ path: join(OUT, `${name}-closing.png`) });
  await page.addStyleTag({ content: ".top-nav { position: static !important; }" });
  await page.screenshot({ path: join(OUT, `${name}-full.png`), fullPage: true });
  console.log(`  shots: ${name}-plain/closing/full.png`);
  await page.close();
}

await capture(1440, 900, "home-desktop", 3000);
await capture(390, 844, "home-mobile", 3000);

await browser.close();
console.log(failures === 0 ? "ALL HOME CHECKS PASSED" : `${failures} HOME CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
