import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import Chromium from "@sparticuz/chromium";

const BASE = process.env.BASE_URL ?? "https://auctorail.vercel.app";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "video-assets", "frames_real");
mkdirSync(OUT, { recursive: true });

try {
  execSync("test -f /tmp/al2023/lib/libnss3.so || (mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))\" && tar -xf /tmp/al2023.tar -C /tmp/al2023) 2>&1 | tail -n 5");
} catch {}
process.env.LD_LIBRARY_PATH = "/tmp/al2023/lib" + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : "");
try { const { setupLambdaEnvironment } = await import("@sparticuz/chromium"); setupLambdaEnvironment(join("/tmp","al2023","lib")); } catch {}

const executable = await Chromium.executablePath();
console.log("Chromium:", executable);
const browser = await puppeteer.launch({
  executablePath: executable,
  headless: true,
  args: [...Chromium.args, "--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--force-color-profile=srgb","--window-size=1920,1080"]
});

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  return page;
}
async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false, type: "png" });
  console.log("shot", name);
}
async function findButton(page, name) {
  return page.evaluateHandle((nm)=>{
    const clean=(el)=>{const c=el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(n=>n.remove()); return c.textContent.trim().replace(/\s+/g," ");};
    return [...document.querySelectorAll("button, a")].find(el=>clean(el)===nm) ?? null;
  }, name);
}
async function clickButton(page, name) {
  const h = await findButton(page,name);
  const el = h.asElement();
  if(!el) throw new Error("button not found: "+name);
  await el.click();
}

const sleep = ms=>new Promise(r=>setTimeout(r,ms));

// 1920 capture sequence
// 1. Home
{
  const page = await newPage();
  await page.goto(BASE+"/#/", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="home-landing-screen"]', {timeout:15000});
  await sleep(1200);
  await shot(page, "real-home-1920.png");
  await page.close();
}
// 2. Check idle
{
  const page = await newPage();
  await page.goto(BASE+"/#/check", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="checking-screen"]', {timeout:10000}).catch(()=>{});
  await sleep(800);
  await shot(page, "real-check-1920.png");
  // open editor
  try{
    const h = await page.evaluateHandle(()=>{
      const clean=(el)=>{const c=el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(n=>n.remove()); return c.textContent.trim().replace(/\s+/g," ");};
      return [...document.querySelectorAll("button")].find(el=>clean(el).includes("CURRENT REQUEST")) ?? null;
    });
    const el = h.asElement();
    if(el){ await el.click(); await sleep(400); await shot(page, "real-check-editor-1920.png"); }
  }catch{}
  await page.close();
}
// 3. Guided demo
{
  const page = await newPage();
  await page.goto(BASE+"/#/demo", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="guided-demo-screen"]', {timeout:15000});
  await sleep(2600);
  await shot(page, "real-demo-1920.png");
  await page.close();
}
// 4. Security Lab
{
  const page = await newPage();
  await page.goto(BASE+"/#/security-lab", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="security-lab-screen"]', {timeout:15000});
  await sleep(800);
  await shot(page, "real-security-lab-1920.png");
  try{ await clickButton(page, "RUN SUITE"); await page.waitForFunction(()=> (document.body.textContent ?? "").includes("RAIL HELD"), {timeout:15000}); await sleep(400); await shot(page, "real-security-lab-run-1920.png"); }catch(e){ console.log("security run failed", e.message)}
  await page.close();
}
// 5. Verify canonical
{
  const page = await newPage();
  await page.goto(BASE+"/#/verify", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="verify-screen"]', {timeout:15000});
  try{ await clickButton(page, "LOAD CANONICAL PROOF"); await page.waitForFunction(()=> document.querySelector(".verify-verdict > strong")?.textContent==="VALID", {timeout:15000}); await sleep(400); await shot(page, "real-verify-valid-1920.png"); }catch(e){ console.log("verify failed", e.message); await shot(page, "real-verify-1920.png")}
  await page.close();
}
// 6. Content trust
{
  const page = await newPage();
  await page.goto(BASE+"/#/content", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="content-trust-screen"]', {timeout:15000}).catch(async()=>{ await page.goto(BASE+"/#/trust",{waitUntil:"domcontentloaded"}); await page.waitForSelector('[data-testid="content-trust-screen"]',{timeout:15000})});
  await sleep(800);
  await shot(page, "real-content-1920.png");
  try{ await clickButton(page, "LOAD SCAM SAMPLE"); await clickButton(page, "RUN CONTENT CHECK"); await page.waitForFunction(()=> document.querySelector(".content-verdict > strong")?.textContent==="BLOCK", {timeout:15000}); await sleep(400); await shot(page, "real-content-block-1920.png"); }catch(e){ console.log("content block failed", e.message)}
  await page.close();
}
// 7. Permissions
{
  const page = await newPage();
  await page.goto(BASE+"/#/permissions", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="permissions-screen"]', {timeout:15000});
  await sleep(600);
  await shot(page, "real-permissions-1920.png");
  await page.close();
}
// 8. Activity
{
  const page = await newPage();
  await page.goto(BASE+"/#/activity", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="activity-screen"]', {timeout:15000});
  await sleep(600);
  await shot(page, "real-activity-1920.png");
  await page.close();
}

await browser.close();
console.log("done real capture");
