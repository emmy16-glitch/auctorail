import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import Chromium from "@sparticuz/chromium";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "video-assets", "nav_frames");
mkdirSync(OUT, { recursive: true });

// Setup chromium libs
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
  const p = await browser.newPage();
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  return p;
}
const sleep = ms=>new Promise(r=>setTimeout(r,ms));

async function captureFrames(page, dir, prefix, durationMs, fps=12) {
  mkdirSync(dir, { recursive: true });
  const interval = 1000/fps;
  const frames = Math.ceil(durationMs/interval);
  console.log(`Capturing ${frames} frames for ${prefix} over ${durationMs}ms @${fps}fps`);
  for(let i=0;i<frames;i++){
    const t0 = Date.now();
    await page.screenshot({ path: join(dir, `${prefix}-${String(i).padStart(4,"0")}.png`), type:"png" });
    const elapsed = Date.now()-t0;
    const wait = interval - elapsed;
    if(wait>0) await sleep(wait);
  }
}

async function findButton(page, name){
  return page.evaluateHandle((nm)=>{
    const clean=(el)=>{const c=el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(n=>n.remove()); return c.textContent.trim().replace(/\s+/g," ");};
    return [...document.querySelectorAll("button, a")].find(el=>clean(el)===nm) ?? null;
  }, name);
}
async function clickButton(page, name){
  const h = await findButton(page,name);
  const el = h.asElement();
  if(!el) throw new Error("button not found: "+name);
  await el.click();
  console.log("clicked",name);
}

// Main navigation recording
const page = await newPage();

// Record in segments, each segment's frames saved separately for later stitching
// We'll do continuous capture with actions interleaved

async function recordSegment(name, durationMs, action=null){
  const dir = join(OUT, name);
  mkdirSync(dir, {recursive:true});
  console.log(`--- Segment ${name} ${durationMs}ms ---`);
  // Start capture in background
  const capturePromise = captureFrames(page, dir, name, durationMs, 12);
  if(action){
    // Wait a bit then do action mid-capture
    await sleep(600);
    try{ await action(); }catch(e){ console.log("action error",e.message)}
  }
  await capturePromise;
  console.log(`Segment ${name} done`);
}

// 1. Home - 8s
await page.goto(BASE+"/#/", {waitUntil:"domcontentloaded"});
await page.waitForSelector('[data-testid="home-landing-screen"]', {timeout:15000});
await sleep(800);
await recordSegment("01-home", 8000);

// 2. Click CHECK -> Check screen - 8s
await recordSegment("02-to-check", 8000, async()=>{
  await clickButton(page, "CHECK");
  await page.waitForSelector('[data-testid="checking-screen"]', {timeout:10000}).catch(()=>{});
});

// 3. Check form idle - 6s
await recordSegment("03-check", 6000);

// 4. Click CHECK THIS REQUEST -> Checking progress - capture 12s of progress
await recordSegment("04-checking", 12000, async()=>{
  // Find and click CHECK THIS REQUEST
  const h = await page.evaluateHandle(()=>{
    return [...document.querySelectorAll("button")].find(b=>b.textContent.includes("CHECK THIS REQUEST")) ?? null;
  });
  const el = h.asElement();
  if(el) await el.click();
  // Wait for checking stages to appear
  await sleep(400);
});

// 5. After checking, go to Demo - 6s transition + 7s demo
await recordSegment("05-to-demo", 6000, async()=>{
  await page.goto(BASE+"/#/demo", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="guided-demo-screen"]', {timeout:15000});
});
await recordSegment("06-demo", 7000);

// 6. To Security Lab - 5s + 8s run
await recordSegment("07-to-security", 5000, async()=>{
  await page.goto(BASE+"/#/security-lab", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="security-lab-screen"]', {timeout:15000});
});
await recordSegment("08-security-run", 10000, async()=>{
  await page.waitForSelector('[data-testid="security-lab-screen"]', {timeout:10000});
  await clickButton(page, "RUN SUITE");
  await sleep(3000);
});

// 7. To Verify - 5s + 8s
await recordSegment("09-to-verify", 5000, async()=>{
  await page.goto(BASE+"/#/verify", {waitUntil:"domcontentloaded"});
  await page.waitForSelector('[data-testid="verify-screen"]', {timeout:15000});
});
await recordSegment("10-verify", 9000, async()=>{
  await page.waitForSelector('[data-testid="verify-screen"]', {timeout:10000});
  try{ await clickButton(page, "LOAD CANONICAL PROOF"); await page.waitForFunction(()=> document.querySelector(".verify-verdict > strong")?.textContent==="VALID", {timeout:15000}); }catch{}
});

// 8. To Permissions/Activity - 4s
await recordSegment("11-permissions", 6000, async()=>{
  await page.goto(BASE+"/#/permissions", {waitUntil:"domcontentloaded"});
});

await browser.close();
console.log("Navigation capture done");
