import puppeteer from 'puppeteer-core';
import Chromium from '@sparticuz/chromium';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

try{execSync("test -f /tmp/al2023/lib/libnss3.so || (mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))\\\" && tar -xf /tmp/al2023.tar -C /tmp/al2023)")}catch(e){console.log(e.message)}
process.env.LD_LIBRARY_PATH='/tmp/al2023/lib';
const exe = await Chromium.executablePath();
console.log("exe", exe);
const browser = await puppeteer.launch({executablePath:exe, headless:true, args:[...Chromium.args,'--no-sandbox','--disable-dev-shm-usage','--window-size=1920,1080']});
const page = await browser.newPage();
await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
await page.goto('http://127.0.0.1:5173/#/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-testid="home-landing-screen"]',{timeout:10000});
console.log("page loaded");

// Inject cursor
await page.evaluate(()=>{
  const style=document.createElement('style');
  style.textContent=`#__cursor{position:fixed;top:0;left:0;width:18px;height:18px;background:#3ecf8e;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none;z-index:99999;transform:translate(-100px,-100px);}#__cursor.click{transform:translate(-100px,-100px) scale(0.85); background:#fff}`;
  document.head.appendChild(style);
  const c=document.createElement('div'); c.id='__cursor'; document.body.appendChild(c);
  window.__moveCursor=(x,y,click=false)=>{
    const el=document.getElementById('__cursor');
    if(!el) return;
    el.style.transform=`translate(${x-9}px,${y-9}px)${click?' scale(0.85)':''}`;
    el.style.background=click?'#fff':'#3ecf8e';
  };
});

const outDir='/tmp/screencast_test';
mkdirSync(outDir,{recursive:true});
let frameCount=0;
const client = await page.target().createCDPSession();
await client.send('Page.startScreencast', {format:'jpeg', quality:80, maxWidth:1920, maxHeight:1080, everyNthFrame:1});
client.on('Page.screencastFrame', async ({data, sessionId})=>{
  frameCount++;
  const buf=Buffer.from(data,'base64');
  writeFileSync(join(outDir, `frame_${String(frameCount).padStart(5,'0')}.jpg`), buf);
  await client.send('Page.screencastFrameAck', {sessionId}).catch(()=>{});
  if(frameCount%15===0) console.log('frames',frameCount);
});

// Move cursor and scroll for 10s
for(let t=0; t<10000; t+=100){
  const progress = t/10000;
  await page.evaluate((p)=> window.scrollTo(0, p*600), progress);
  const mx = 960 + Math.sin(t/800)*200;
  const my = 500 + progress*300;
  await page.evaluate((x,y)=> window.__moveCursor(x,y), mx, my);
  await new Promise(r=>setTimeout(r,100));
}

await new Promise(r=>setTimeout(r,500));
await client.send('Page.stopScreencast').catch(()=>{});
console.log('final frames',frameCount);
await browser.close();
