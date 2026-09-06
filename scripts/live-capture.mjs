import { chromium } from 'playwright';
import fs from 'fs';
const OUT='live-out'; fs.mkdirSync(OUT,{recursive:true});
const log=(...a)=>{console.log(...a); fs.appendFileSync(OUT+'/results.txt', a.join(' ')+'\n');};
fs.writeFileSync(OUT+'/results.txt','');
const b = await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx = await b.newContext({viewport:{width:1440,height:900},recordVideo:{dir:OUT+'/vid',size:{width:1440,height:900}}});
const p = await ctx.newPage();
try{
  await p.goto('https://auctorail.vercel.app/#/check',{waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForTimeout(2500);
  await p.screenshot({path:OUT+'/01-check.png'});
  log('loaded check screen');
  const btn = p.locator('button', {hasText:'CHECK THIS REQUEST'}).first();
  await btn.click(); log('clicked CHECK');
  // wait for a 64-hex tx hash or a terminal decision, up to 60s
  let tx=null;
  for(let i=0;i<60;i++){
    await p.waitForTimeout(1000);
    const txt = await p.evaluate(()=>document.body.innerText);
    const m = txt.match(/0x[0-9a-fA-F]{64}/);
    if(m){ tx=m[0]; break; }
    if(/BLOCKED|HELD|failed|unavailable/i.test(txt) && i>15){ log('terminal-non-tx state'); break; }
  }
  await p.screenshot({path:OUT+'/02-result.png'});
  log('tx=', tx||'NONE');
  if(tx){
    try{
      await p.goto('https://sepolia.basescan.org/tx/'+tx,{waitUntil:'domcontentloaded',timeout:30000});
      await p.waitForTimeout(6000);
      await p.screenshot({path:OUT+'/03-explorer.png'});
      const st = await p.evaluate(()=>document.body.innerText.slice(0,400));
      log('explorer-snippet=', st.replace(/\n/g,' ').slice(0,200));
    }catch(e){ log('explorer err', e.message.split('\n')[0]); }
  }
}catch(e){ log('CAPTURE-ERR', e.message.split('\n')[0]); }
await p.waitForTimeout(1000);
await ctx.close(); await b.close();
log('done');
