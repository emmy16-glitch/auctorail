import { chromium as pw } from 'playwright-core';
import Chromium from '@sparticuz/chromium';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

try{
  execSync("mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');if(!fs.existsSync('/tmp/al2023/lib/libnss3.so')){fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br'))); require('child_process').execSync('tar -xf /tmp/al2023.tar -C /tmp/al2023')}\"");
}catch(e){}
process.env.LD_LIBRARY_PATH='/tmp/al2023/lib';
const exe = await Chromium.executablePath();
console.log("chromium", exe);
const outDir = '/tmp/record_full';
mkdirSync(outDir,{recursive:true});
try{ execSync(`rm -f ${outDir}/*.webm`)}catch{}

const browser = await pw.launch({ executablePath: exe, args: [...Chromium.args,'--no-sandbox','--disable-dev-shm-usage','--window-size=1920,1080'], headless:true });
const context = await browser.newContext({
  viewport:{width:1920,height:1080},
  deviceScaleFactor:1,
  recordVideo:{dir:outDir, size:{width:1920,height:1080}},
});
const page = await context.newPage();

// Inject cursor + helpers once per navigation (need to re-inject after each goto because page reload)
async function injectCursor(){
  await page.evaluate(()=>{
    if(document.getElementById('__cursor')) return;
    const style=document.createElement('style');
    style.textContent=`#__cursor{position:fixed;top:0;left:0;width:22px;height:22px;background:#3ecf8e;border:3px solid #fff;border-radius:50%;box-shadow:0 3px 12px rgba(0,0,0,0.5);pointer-events:none;z-index:99999;transform:translate(-100px,-100px);transition:transform 0.12s ease-out, background 0.12s; will-change:transform;}#__cursor.click{transform:translate(-100px,-100px) scale(0.78); background:#fff;}#__hl{position:fixed;pointer-events:none;z-index:99998;border:2px solid #3ecf8e;border-radius:10px;box-shadow:0 0 0 4px rgba(62,207,142,0.18);display:none;}#__hl.on{display:block;}`;
    document.head.appendChild(style);
    const c=document.createElement('div'); c.id='__cursor'; document.body.appendChild(c);
    const h=document.createElement('div'); h.id='__hl'; document.body.appendChild(h);
    window.__moveCursor=(x,y,click=false)=>{
      const el=document.getElementById('__cursor');
      if(!el) return;
      el.style.transform=`translate(${x-11}px,${y-11}px)${click?' scale(0.78)':''}`;
      el.style.background=click?'#fff':'#3ecf8e';
    };
    window.__highlight=(sel)=>{
      try{
        const el=document.querySelector(sel);
        const hl=document.getElementById('__hl');
        if(!el||!hl) return;
        const r=el.getBoundingClientRect();
        hl.style.left=(r.left-6)+'px'; hl.style.top=(r.top-6)+'px'; hl.style.width=(r.width+12)+'px'; hl.style.height=(r.height+12)+'px'; hl.className='on';
      }catch{}
    };
    window.__clearHL=()=>{ const hl=document.getElementById('__hl'); if(hl) hl.className=''; };
    window.__findText=(txt)=>{
      const clean=(el)=> (el.textContent||'').trim().replace(/\s+/g,' ');
      const all=[...document.querySelectorAll('button, a, [role="button"]')];
      // exact match first, then includes
      let el=all.find(e=> clean(e)===txt);
      if(el) return el;
      el=all.find(e=> clean(e).includes(txt));
      return el||null;
    };
  });
}
async function moveCursorToText(txt){
  const pos = await page.evaluate((t)=>{
    const el=window.__findText(t);
    if(!el) return null;
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+r.height/2};
  }, txt);
  if(!pos){ console.log('moveCursor no text',txt); return null; }
  await page.evaluate(({x,y})=> window.__moveCursor(x,y,false), pos);
  await page.waitForTimeout(250);
  return pos;
}
async function clickText(txt){
  const pos = await moveCursorToText(txt);
  if(!pos){ 
    // try direct playwright click by text
    try{ await page.getByRole('button',{name:txt, exact:false}).click({timeout:3000}); console.log('clicked via getByRole',txt); return true;}catch{}
    try{ await page.getByText(txt,{exact:false}).first().click({timeout:3000}); console.log('clicked via getByText',txt); return true;}catch(e){ console.log('clickText failed',txt,e.message); return false; }
  }
  // cursor click anim
  await page.evaluate(({x,y})=> window.__moveCursor(x,y,true), pos);
  await page.waitForTimeout(140);
  // try clicking the element found by __findText
  try{
    await page.evaluate((t)=>{
      const el=window.__findText(t);
      if(el) el.click();
    }, txt);
    console.log('clicked via __findText',txt);
  }catch(e){
    try{ await page.mouse.click(pos.x,pos.y); }catch{}
  }
  await page.evaluate(({x,y})=> window.__moveCursor(x,y,false), pos);
  await page.waitForTimeout(380);
  return true;
}
async function smoothScrollTo(targetY, durationMs=900){
  const start = await page.evaluate(()=> window.scrollY);
  const steps = Math.ceil(durationMs/16);
  for(let i=0;i<=steps;i++){
    const p=i/steps;
    const eased = p<0.5? 2*p*p : 1-Math.pow(-2*p+2,2)/2;
    const y = start + (targetY-start)*eased;
    await page.evaluate((yy)=> window.scrollTo(0,yy), y);
    // keep cursor visible during scroll
    await page.waitForTimeout(16);
  }
}
async function wait(ms){ await page.waitForTimeout(ms); }
async function gotoHash(hash){
  await page.goto(`http://127.0.0.1:5173/#/${hash}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(900);
  await injectCursor();
}

await page.goto('http://127.0.0.1:5173/#/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-testid="home-landing-screen"]',{timeout:15000});
await injectCursor();
console.log("home loaded");

// Timeline aiming for ~130s = 130000ms
// Use wait() to pad exactly
let t0=Date.now();
function elapsed(){ return ((Date.now()-t0)/1000).toFixed(1); }

// 0:00-13:00 HOME (13s)
console.log(`[${elapsed()}] Scene HOME`);
await page.evaluate(()=> window.__moveCursor(960,520));
await wait(600);
await smoothScrollTo(0, 400);
await wait(400);
await page.evaluate(()=> { const h=document.querySelector('h1'); if(h){ const hl=document.getElementById('__hl'); const r=h.getBoundingClientRect(); hl.style.left=(r.left-8)+'px'; hl.style.top=(r.top-8)+'px'; hl.style.width=(r.width+16)+'px'; hl.style.height=(r.height+16)+'px'; hl.className='on'; }});
await wait(1800);
await page.evaluate(()=> window.__clearHL());
await smoothScrollTo(720, 2200);
await wait(900);
await clickText('WATCH THE RAIL HOLD');
await wait(2000);
console.log(`[${elapsed()}] to demo`);

// 13-44 DEMO (31s)
await gotoHash('demo');
await page.waitForSelector('[data-testid="guided-demo-screen"]',{timeout:8000}).catch(()=>{});
await wait(900);
console.log(`[${elapsed()}] demo valid`);
await page.evaluate(()=> window.__moveCursor(920, 420));
await wait(2200);
// demo auto runs, let valid show
await wait(4000);
// SCN 02
console.log(`[${elapsed()}] demo SCN02`);
await clickText('Modified Amount');
await wait(4500);
// SCN 03
console.log(`[${elapsed()}] demo SCN03`);
await clickText('Replayed Permit');
await wait(4500);
// SCN 04
console.log(`[${elapsed()}] demo SCN04`);
await clickText('Missing Evidence');
await wait(5000);
await wait(800);

// 44-63 CHECK (19s)
console.log(`[${elapsed()}] Scene CHECK`);
await gotoHash('check');
await page.waitForSelector('[data-testid="checking-screen"]',{timeout:8000}).catch(()=>{});
await wait(900);
await smoothScrollTo(0, 500);
await wait(400);
await clickText('CURRENT REQUEST');
await wait(900);
await page.evaluate(()=> { const el=document.getElementById('request-amount'); if(el){ const hl=document.getElementById('__hl'); const r=el.getBoundingClientRect(); hl.style.left=(r.left-6)+'px'; hl.style.top=(r.top-6)+'px'; hl.style.width=(r.width+12)+'px'; hl.style.height=(r.height+12)+'px'; hl.className='on'; }});
await wait(1100);
await page.evaluate(()=> window.__clearHL());
await clickText('CHECK THIS REQUEST');
await wait(1400);
await page.waitForSelector('text=Live checks are not enabled',{timeout:8000}).catch(()=>{});
await wait(2600);
await smoothScrollTo(460, 700);
await wait(1000);
await clickText('BACK TO REQUEST');
await wait(900);

// 63-93 SECURITY LAB (30s)
console.log(`[${elapsed()}] Scene SECURITY LAB`);
await gotoHash('security-lab');
await page.waitForSelector('[data-testid="security-lab-screen"]',{timeout:8000});
await wait(900);
await clickText('RUN SUITE');
console.log(`[${elapsed()}] run suite`);
await wait(3200);
await page.waitForFunction(()=> (document.body.textContent||'').includes('SUITE SCORE') || (document.body.textContent||'').includes('RAIL HELD'),{timeout:18000}).catch(()=>{});
await wait(3200);
await smoothScrollTo(380, 700);
await wait(700);
for(const atk of ['Modify payment amount','Change mandate version','Replay consumed permit']){
  await clickText(atk);
  await wait(1800);
  await wait(400);
}

// 93-113 VERIFY (20s)
console.log(`[${elapsed()}] Scene VERIFY`);
await gotoHash('verify');
await page.waitForSelector('text=Verify the proof',{timeout:8000});
await wait(800);
await clickText('LOAD CANONICAL PROOF');
await wait(1000);
await clickText('VERIFY PROOF');
await wait(2000);
await smoothScrollTo(340, 700);
await wait(1000);
await page.evaluate(()=>{
  const el=[...document.querySelectorAll('*')].find(x=> (x.textContent||'').includes('0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8'));
  if(el && el.getBoundingClientRect().width>10){ const r=el.getBoundingClientRect(); const hl=document.getElementById('__hl'); hl.style.left=(r.left-6)+'px'; hl.style.top=(r.top-6)+'px'; hl.style.width=(r.width+12)+'px'; hl.style.height=(r.height+12)+'px'; hl.className='on'; }
});
await wait(2000);
await page.evaluate(()=> window.__clearHL());
await smoothScrollTo(640, 800);
await wait(800);
await smoothScrollTo(0, 600);
await wait(500);

// 113-120 ACTIVITY+PERMS (7s)
console.log(`[${elapsed()}] Scene ACTIVITY`);
await gotoHash('activity');
await wait(900);
await smoothScrollTo(160, 600);
await wait(1000);
console.log(`[${elapsed()}] Scene PERMISSIONS`);
await gotoHash('permissions');
await wait(900);
await smoothScrollTo(340, 700);
await wait(1400);

// 120-130 HOME FINAL (10s + pad to 130)
console.log(`[${elapsed()}] Scene HOME FINAL`);
await gotoHash('');
await wait(900);
await smoothScrollTo(0, 600);
await wait(400);
await smoothScrollTo(1240, 2200);
await wait(900);
await smoothScrollTo(1820, 1600);
await wait(1800);
await smoothScrollTo(0, 1000);
await wait(800);
// pad to reach ~130s total
const nowElapsed = (Date.now()-t0)/1000;
const remaining = 130 - nowElapsed;
console.log(`elapsed ${nowElapsed.toFixed(1)} remaining ${remaining.toFixed(1)}`);
if(remaining>0.5){
  await wait(Math.round(remaining*1000));
}
console.log(`[${elapsed()}] timeline end, closing`);

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
      const info=execSync(`/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2 -hide_banner -i ${dest} 2>&1 | head -n 25`).toString();
      console.log(info);
    }
  }
}catch(e){ console.log(e.message)}
