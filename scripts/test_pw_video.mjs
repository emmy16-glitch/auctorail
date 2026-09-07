import { chromium as pw } from 'playwright-core';
import Chromium from '@sparticuz/chromium';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
try{execSync("mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');if(!fs.existsSync('/tmp/al2023/lib/libnss3.so')){fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br'))); require('child_process').execSync('tar -xf /tmp/al2023.tar -C /tmp/al2023')}\"")}catch(e){console.log('al2023 setup',e.message)}
process.env.LD_LIBRARY_PATH='/tmp/al2023/lib';
const exe = await Chromium.executablePath();
console.log("exe",exe);
mkdirSync('/tmp/pwtest',{recursive:true});
const browser = await pw.launch({ executablePath: exe, args: [...Chromium.args, '--no-sandbox','--disable-dev-shm-usage','--window-size=1920,1080'], headless:true });
console.log("launched");
const context = await browser.newContext({
  viewport: {width:1920,height:1080},
  recordVideo:{dir:'/tmp/pwtest', size:{width:1920,height:1080}}
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:5173/#/',{waitUntil:'domcontentloaded'});
await page.waitForSelector('[data-testid="home-landing-screen"]',{timeout:10000});
console.log("page loaded, waiting 5s with scroll");
for(let i=0;i<5;i++){
  await page.evaluate((p)=> window.scrollTo(0,p*200), i);
  await page.waitForTimeout(1000);
}
await page.goto('http://127.0.0.1:5173/#/demo',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(3000);
await context.close();
await browser.close();
console.log("done, listing");
import { execSync as ex } from 'node:child_process';
try{console.log(ex('ls -lh /tmp/pwtest').toString()); console.log(ex('ls -lh /tmp/pwtest/* 2>&1 | head -n 20').toString()); console.log(ex('/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2 -hide_banner -i /tmp/pwtest/*.webm 2>&1 | head -n 30').toString())}catch(e){console.log(e.message, e.stdout?.toString(), e.stderr?.toString())}
