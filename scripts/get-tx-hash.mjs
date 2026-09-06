import fs from 'fs';
import { chromium } from 'playwright';
const OUT='live-out'; fs.mkdirSync(OUT,{recursive:true});
const RPC='https://sepolia.base.org';
const BLOCK=46482796;
const log=(...a)=>{console.log(...a); fs.appendFileSync(OUT+'/hash-log.txt', a.join(' ')+'\n');};
fs.writeFileSync(OUT+'/hash-log.txt','');
async function getBlock(n){
  const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['0x'+n.toString(16),true]})});
  return (await r.json()).result;
}
let full=null;
for(let n=BLOCK; n<=BLOCK+3 && !full; n++){
  const blk=await getBlock(n); if(!blk||!blk.transactions) continue;
  for(const t of blk.transactions){
    if(typeof t==='object' && t.hash && t.hash.startsWith('0x79f9ab9d') && t.hash.endsWith('2afb7571')){ full=t.hash; log('FOUND in block',n,'hash',full,'to',t.to,'value',t.value); break; }
  }
}
if(!full){ // fallback: match by to=vendor in that block range
  for(let n=BLOCK; n<=BLOCK+3 && !full; n++){
    const blk=await getBlock(n); if(!blk||!blk.transactions) continue;
    for(const t of blk.transactions){ if(typeof t==='object' && /0xb38d0405/i.test(t.to||'')){ full=t.hash; log('VENDOR-TX block',n,'hash',full); break; } }
  }
}
if(full){ fs.writeFileSync(OUT+'/fullhash.txt', full); log('FULLHASH=',full);
  try{
    const b=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
    const p=await b.newPage(); await p.setViewportSize({width:1440,height:900});
    await p.goto('https://sepolia.basescan.org/tx/'+full,{waitUntil:'domcontentloaded',timeout:30000});
    await p.waitForTimeout(6000); await p.screenshot({path:OUT+'/03-explorer.png'});
    const st=await p.evaluate(()=>document.body.innerText.slice(0,300)); log('explorer:', st.replace(/\n/g,' ').slice(0,160));
    await b.close();
  }catch(e){ log('explorer err', e.message.split('\n')[0]); }
}else{ log('FULLHASH not found'); }
log('done');
