import { chromium as pw } from 'playwright-core';
import Chromium from '@sparticuz/chromium';
import { execSync } from 'node:child_process';
try{execSync("mkdir -p /tmp/al2023 && node -e \"const fs=require('fs'),z=require('zlib');if(!fs.existsSync('/tmp/al2023/lib/libnss3.so')){fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br'))); require('child_process').execSync('tar -xf /tmp/al2023.tar -C /tmp/al2023')}\"")}catch{}
process.env.LD_LIBRARY_PATH='/tmp/al2023/lib';
const exe = await Chromium.executablePath();
const browser = await pw.launch({executablePath:exe, args:[...Chromium.args,'--no-sandbox'], headless:true});
const ctx = await browser.newContext();
const page = await ctx.newPage();
for(const url of ['https://github.com/emmy16-glitch/auctorail','https://sepolia.basescan.org/tx/0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc']){
  try{
    console.log('trying',url);
    await page.goto(url,{waitUntil:'domcontentloaded', timeout:10000});
    console.log('SUCCESS', url, await page.title());
  }catch(e){ console.log('FAIL',url, e.message.slice(0,200))}
}
await browser.close();
