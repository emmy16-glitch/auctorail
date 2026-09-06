import { chromium } from 'playwright';
import fs from 'fs';
const OUT='live-out'; fs.mkdirSync(OUT,{recursive:true});
const log=(...a)=>{console.log(...a); fs.appendFileSync(OUT+'/results.txt', a.join(' ')+'\n');};
fs.writeFileSync(OUT+'/results.txt','');
const b = await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx = await b.newContext({viewport:{width:1440,height:900},recordVideo:{dir:OUT+'/vid',size:{width:1440,height:900}}});
const p = await ctx.newPage();
let tx=null;
for(let attempt=1; attempt<=4 && !tx; attempt++){
  log('--- attempt', attempt);
  try{
    await p.goto('https://auctorail.vercel.app/#/check',{waitUntil:'domcontentloaded',timeout:30000});
    await p.waitForTimeout(2200);
    const btn = p.locator('button', {hasText:'CHECK THIS REQUEST'}).first();
    await btn.click(); log('clicked CHECK');
    for(let i=0;i<50;i++){
      await p.waitForTimeout(1000);
      const txt = await p.evaluate(()=>document.body.innerText);
      const m = txt.match(/0x[0-9a-fA-F]{64}/);
      if(m && /CONFIRMED|Success/i.test(txt)){ tx=m[0]; break; }
      if(/Execution stopped|NOT CONFIRMED|BLOCKED|HELD/i.test(txt)){ break; }
    }
    const txt = await p.evaluate(()=>document.body.innerText);
    if(/Execution stopped|NOT CONFIRMED/i.test(txt)){
      // capture technical details for diagnosis
      try{ const td=p.locator('button',{hasText:'VIEW TECHNICAL DETAILS'}).first(); await td.click(); await p.waitForTimeout(800);
        const d=await p.evaluate(()=>document.body.innerText); log('DETAILS:', d.slice(0,900).replace(/\n+/g,' | ')); }catch(e){}
      await p.screenshot({path:OUT+'/attempt'+attempt+'.png'});
    }
    if(tx){ await p.screenshot({path:OUT+'/success.png'}); log('TX=',tx); }
    // reset for next attempt
    try{ const nr=p.locator('button',{hasText:'NEW REQUEST'}).first(); await nr.click(); await p.waitForTimeout(800);}catch(e){}
  }catch(e){ log('attempt-err', e.message.split('\n')[0]); }
}
if(tx){
  try{ await p.goto('https://sepolia.basescan.org/tx/'+tx,{waitUntil:'domcontentloaded',timeout:30000}); await p.waitForTimeout(6000); await p.screenshot({path:OUT+'/03-explorer.png'}); const st=await p.evaluate(()=>document.body.innerText.slice(0,300)); log('explorer:', st.replace(/\n/g,' ').slice(0,160)); }catch(e){ log('explorer err', e.message.split('\n')[0]); }
}
log('FINAL tx=', tx||'NONE');
await ctx.close(); await b.close(); log('done');
