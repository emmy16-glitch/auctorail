import { chromium as pw } from 'playwright-core';
import Chromium from '@sparticuz/chromium';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

try{
  execSync("mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');if(!fs.existsSync('/tmp/al2023/lib/libnss3.so')){fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br'))); require('child_process').execSync('tar -xf /tmp/al2023.tar -C /tmp/al2023')}\"");
}catch(e){ console.log('al23',e.message)}
process.env.LD_LIBRARY_PATH='/tmp/al2023/lib';
const exe = await Chromium.executablePath();
console.log("chromium", exe);
const outDir = '/tmp/record_full';
mkdirSync(outDir,{recursive:true});
// clean old
try{ execSync(`rm -f ${outDir}/*.webm ${outDir}/*.mp4`)}catch{}

const browser = await pw.launch({ executablePath: exe, args: [...Chromium.args,'--no-sandbox','--disable-dev-shm-usage','--window-size=1920,1080', '--disable-gpu'], headless: true });
const context = await browser.newContext({
  viewport:{width:1920,height:1080},
  deviceScaleFactor:1,
  recordVideo:{dir:outDir, size:{width:1920,height:1080}},
  // reducedMotion to keep animations predictable
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:5173/#/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-testid="home-landing-screen"]',{timeout:15000});
console.log("home loaded");

await page.evaluate(()=>{
  const style=document.createElement('style');
  style.textContent=`#__cursor{position:fixed;top:0;left:0;width:22px;height:22px;background:#3ecf8e;border:3px solid #fff;border-radius:50%;box-shadow:0 3px 12px rgba(0,0,0,0.5),0 0 0 1px rgba(0,0,0,0.2);pointer-events:none;z-index:99999;transition:transform 0.12s ease-out, background 0.12s; will-change:transform; transform:translate(-100px,-100px);}#__cursor.click{transform:translate(-100px,-100px) scale(0.78); background:#fff; border-color:#3ecf8e;}#__hl{position:fixed;pointer-events:none;z-index:99998;border:2px solid #3ecf8e;border-radius:10px;box-shadow:0 0 0 4px rgba(62,207,142,0.18);display:none;}#__hl.on{display:block;}`;
  document.head.appendChild(style);
  const c=document.createElement('div'); c.id='__cursor'; document.body.appendChild(c);
  const h=document.createElement('div'); h.id='__hl'; document.body.appendChild(h);
  window.__moveCursor=(x,y,click=false)=>{
    const el=document.getElementById('__cursor');
    if(!el) return;
    el.style.transform=`translate(${x-11}px,${y-11}px)${click?' scale(0.78)':''}`;
    el.style.background=click?'#fff':'#3ecf8e';
  };
  window.__highlight=(selector)=>{
    const el=document.querySelector(selector);
    const hl=document.getElementById('__hl');
    if(!el||!hl){ if(hl) hl.className=''; return; }
    const r=el.getBoundingClientRect();
    hl.style.left=(r.left-6)+'px'; hl.style.top=(r.top-6)+'px'; hl.style.width=(r.width+12)+'px'; hl.style.height=(r.height+12)+'px'; hl.className='on';
  };
  window.__clearHL=()=>{ const hl=document.getElementById('__hl'); if(hl) hl.className=''; };
  // force repaint loop to keep screencast frames coming during idle
  let rafId;
  function tick(){ document.documentElement.style.transform='translateZ(0)'; requestAnimationFrame(tick); }
  // tick(); // not needed, but keeps some activity
});
async function moveCursorTo(selector, click=false){
  try{
    const rect = await page.evaluate((sel)=>{
      const el=document.querySelector(sel);
      if(!el) return null;
      const r=el.getBoundingClientRect();
      return {x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height};
    }, selector);
    if(!rect){ console.log('moveCursor no el',selector); return; }
    await page.evaluate(({x,y,c})=> window.__moveCursor(x,y,c), {x:rect.x, y:rect.y, c:click});
    await page.waitForTimeout(180);
    if(click){
      await page.evaluate(({x,y})=> window.__moveCursor(x,y,true), {x:rect.x, y:rect.y});
      await page.waitForTimeout(120);
      await page.evaluate(({x,y})=> window.__moveCursor(x,y,false), {x:rect.x, y:rect.y});
    }
  }catch(e){ console.log('moveCursor err',e.message)}
}
async function clickSelector(selector){
  // move cursor then click via page
  await moveCursorTo(selector,false);
  await page.waitForTimeout(300);
  await moveCursorTo(selector,true);
  try{
    await page.click(selector,{timeout:4000});
  }catch(e){
    // fallback evaluate click
    await page.evaluate((sel)=>{ const el=document.querySelector(sel); if(el) el.click(); }, selector);
  }
  await page.waitForTimeout(400);
  await page.evaluate(()=> window.__clearHL());
}
async function smoothScrollTo(targetY, durationMs=1200){
  const start = await page.evaluate(()=> window.scrollY);
  const steps = Math.ceil(durationMs/16);
  for(let i=0;i<=steps;i++){
    const p=i/steps;
    const eased = p<0.5? 2*p*p : 1-Math.pow(-2*p+2,2)/2; // easeInOut
    const y = start + (targetY-start)*eased;
    await page.evaluate((yy)=> window.scrollTo(0,yy), y);
    await page.waitForTimeout(16);
  }
}
async function wait(ms){ await page.waitForTimeout(ms); }

console.log("start timeline 0:00");

// 0:00-12:00 HOME
console.log("Scene 1 HOME 0:00");
await page.evaluate(()=> window.__moveCursor(960,520));
await wait(800);
await smoothScrollTo(0, 400);
await wait(500);
// highlight hero
await page.evaluate(()=> window.__highlight('h1'));
await moveCursorTo('h1');
await wait(1200);
await page.evaluate(()=> window.__clearHL());
// gentle scroll down to show ladder
await smoothScrollTo(680, 2400);
await wait(800);
await moveCursorTo('button:has-text("WATCH THE RAIL HOLD")');
await wait(600);
// click WATCH THE RAIL HOLD -> should go to #/demo
try{
  await clickSelector('button:has-text("WATCH THE RAIL HOLD")');
}catch(e){ await page.goto('http://127.0.0.1:5173/#/demo',{waitUntil:'domcontentloaded'}); }
await wait(1200);
console.log("to demo", new Date().toISOString());

// 12-41 DEMO
await page.waitForSelector('[data-testid="guided-demo-screen"]',{timeout:8000}).catch(()=>{});
await wait(800);
// demo auto plays valid request, hover console
await moveCursorTo('.demo-console');
await wait(2500);
// wait for valid request steps to progress (first scenario 6 steps ~8 sec total from start, we already spent ~2s)
await wait(3500);
// SCN 02 Modified Amount
console.log("demo SCN02");
await clickSelector('button:has-text("Modified Amount")');
await wait(3800);
await moveCursorTo('.demo-console');
await wait(1200);
// SCN 03 Replay
console.log("demo SCN03");
await clickSelector('button:has-text("Replayed Permit")');
await wait(3800);
await wait(800);
// SCN 04 Missing Evidence
console.log("demo SCN04");
await clickSelector('button:has-text("Missing Evidence")');
await wait(4200);
await wait(600);

// 41-60 CHECK
console.log("Scene CHECK");
await page.goto('http://127.0.0.1:5173/#/check',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-testid="checking-screen"]',{timeout:8000}).catch(()=>{});
await wait(900);
await smoothScrollTo(0, 600);
await wait(400);
await moveCursorTo('button:has-text("CURRENT REQUEST")');
await wait(400);
await clickSelector('button:has-text("CURRENT REQUEST")');
await wait(700);
// editor open, highlight amount stepper
await moveCursorTo('#request-amount');
await page.evaluate(()=> window.__highlight('#request-amount'));
await wait(900);
await page.evaluate(()=> window.__clearHL());
await moveCursorTo('button:has-text("CHECK THIS REQUEST")');
await wait(500);
await clickSelector('button:has-text("CHECK THIS REQUEST")');
await wait(1200);
// checking screen - live disabled flow
await page.waitForSelector('text=Live checks are not enabled',{timeout:8000}).catch(()=>{});
await wait(2200);
await moveCursorTo('text=WHY IT DIDN');
await smoothScrollTo(420, 900);
await wait(1400);
await clickSelector('button:has-text("BACK TO REQUEST")');
await wait(800);

// 60-90 SECURITY LAB
console.log("Scene SECURITY LAB");
await page.goto('http://127.0.0.1:5173/#/security-lab',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-testid="security-lab-screen"]',{timeout:8000});
await wait(900);
await moveCursorTo('button:has-text("RUN SUITE")');
await wait(400);
await clickSelector('button:has-text("RUN SUITE")');
console.log("run suite clicked");
await wait(3000);
// wait for suite to finish - look for "SUITE SCORE" or "RAIL HELD"
await page.waitForFunction(()=> (document.body.textContent||'').includes('SUITE SCORE') || (document.body.textContent||'').includes('RAIL HELD'),{timeout:18000}).catch(()=>{});
await wait(2800);
await smoothScrollTo(360, 800);
await wait(600);
// click individual attacks quickly
for(const atk of ['ATK 01','ATK 03','ATK 07']){
  try{
    await clickSelector(`button:has-text("${atk}")`);
    await wait(1200);
  }catch(e){ console.log('atk fail',atk,e.message)}
  await wait(600);
}

// 84-110 VERIFY
console.log("Scene VERIFY");
await page.goto('http://127.0.0.1:5173/#/verify',{waitUntil:'domcontentloaded'});
await page.waitForSelector('text=Verify the proof',{timeout:8000});
await wait(800);
await moveCursorTo('button:has-text("LOAD CANONICAL PROOF")');
await wait(400);
await clickSelector('button:has-text("LOAD CANONICAL PROOF")');
await wait(900);
await moveCursorTo('button:has-text("VERIFY PROOF")');
await wait(300);
await clickSelector('button:has-text("VERIFY PROOF")');
await wait(1800);
await smoothScrollTo(320, 800);
await wait(1200);
// highlight canonical tx
await page.evaluate(()=>{
  const el=[...document.querySelectorAll('*')].find(x=> (x.textContent||'').includes('0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8'));
  if(el){ const r=el.getBoundingClientRect(); const hl=document.getElementById('__hl'); hl.style.left=(r.left-6)+'px'; hl.style.top=(r.top-6)+'px'; hl.style.width=(r.width+12)+'px'; hl.style.height=(r.height+12)+'px'; hl.className='on'; }
});
await wait(1800);
await page.evaluate(()=> window.__clearHL());
await smoothScrollTo(620, 900);
await wait(800);

// 100-108 ACTIVITY
console.log("Scene ACTIVITY");
await page.goto('http://127.0.0.1:5173/#/activity',{waitUntil:'domcontentloaded'});
await wait(800);
await smoothScrollTo(180, 700);
await wait(1200);

// 108-116 PERMISSIONS
console.log("Scene PERMISSIONS");
await page.goto('http://127.0.0.1:5173/#/permissions',{waitUntil:'domcontentloaded'});
await wait(800);
await moveCursorTo('text=MAX PAYMENT');
await wait(600);
await smoothScrollTo(320, 800);
await wait(1200);

// 116-130 HOME FINAL
console.log("Scene HOME FINAL");
await page.goto('http://127.0.0.1:5173/#/',{waitUntil:'domcontentloaded'});
await wait(900);
await smoothScrollTo(0, 600);
await wait(600);
await smoothScrollTo(1200, 2600);
await wait(800);
await smoothScrollTo(1800, 1800);
await wait(2000);
await smoothScrollTo(0, 1200);
await wait(1200);
console.log("timeline end, closing");

await context.close();
await browser.close();
console.log("browser closed");

// find video
try{
  const files=readdirSync(outDir);
  console.log("files",files);
  for(const f of files){
    if(f.endsWith('.webm')){
      const src=join(outDir,f);
      const dest='/tmp/real-demo-raw.webm';
      copyFileSync(src,dest);
      console.log("copied",src,"->",dest, "size", execSync(`ls -lh ${dest}`).toString().trim());
      const info=execSync(`/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2 -hide_banner -i ${dest} 2>&1 | head -n 20`).toString();
      console.log(info);
    }
  }
}catch(e){ console.log(e.message)}
