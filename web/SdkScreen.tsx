import React, { useEffect, useMemo, useState } from "react";
import "./sdk-screen.css";
type RunKind="valid"|"attack"; type RunState="idle"|"running"|"done";
type DemoSpec={kind:RunKind;title:string;subtitle:string;amountLabel:string;amountValue:string;button:string;result:string;resultCopy:string;steps:string[]};
const demoSpecs:Record<RunKind,DemoSpec>={valid:{kind:"valid",title:"TRY THE SDK (VALID REQUEST)",subtitle:"DEMO 1 / 2",amountLabel:"Amount",amountValue:"1.00 USDC",button:"RUN REQUEST",result:"ALLOW",resultCopy:"Authorization issued. Action can be executed.",steps:["Request captured","Rules checked","Evidence verified","Permit issued","Execution simulated"]},attack:{kind:"attack",title:"TRY AN ATTACK (MODIFIED AMOUNT)",subtitle:"DEMO 2 / 2",amountLabel:"Modified amount",amountValue:"2.00 USDC (was 1.00)",button:"RUN ATTACK",result:"BLOCKED",resultCopy:"Action no longer matches the authorized request.",steps:["Request captured","Rules checked","Amount modified","Binding mismatch","Execution blocked"]}};
function copy(text:string){if(navigator.clipboard)void navigator.clipboard.writeText(text);}
function MiniSdkDemo({kind}:{kind:RunKind}){const spec=demoSpecs[kind];const[state,setState]=useState<RunState>("idle");const[step,setStep]=useState(-1);useEffect(()=>{if(state!=="running")return;const timer=window.setTimeout(()=>{if(step<spec.steps.length-1)setStep(v=>v+1);else setState("done");},step<0?240:430);return()=>window.clearTimeout(timer);},[state,step,spec.steps.length]);function run(){setStep(-1);setState("running");}const status=state==="idle"?"READY":state==="running"?"RUNNING":spec.result;return <section className={`sdk-demo sdk-demo-${kind}`}><header className="sdk-demo-head"><strong>{spec.title}</strong><span>{spec.subtitle}</span></header><div className="sdk-demo-request"><div><b>Request{kind==="attack"?" (modified)":""}</b><dl><div><dt>Action</dt><dd>transfer</dd></div><div><dt>{spec.amountLabel}</dt><dd className={kind==="attack"?"sdk-danger-text":""}>{spec.amountValue}</dd></div><div><dt>Recipient</dt><dd>0x742d...9f3a</dd></div><div><dt>Agent</dt><dd>invoice-bot</dd></div></dl></div><button type="button" onClick={run}>{spec.button} <span>→</span></button></div><div className="sdk-demo-body"><ol>{spec.steps.map((item,index)=>{const complete=state==="done"||index<step;const active=state==="running"&&index===step;const failed=kind==="attack"&&(item==="Binding mismatch"||item==="Execution blocked")&&(active||complete||state==="done");return <li key={item} className={`${complete?"complete":""} ${active?"active":""} ${failed?"failed":""}`}><span className="sdk-step-dot"/><span>{item}</span><small>{state==="idle"&&index>0?"—":`${120+index*70}ms`}</small></li>;})}</ol><div className={`sdk-demo-result ${state==="done"?"done":""}`}><span className="sdk-result-symbol">{state==="done"?(kind==="valid"?"✓":"×"):"·"}</span><div><b>{state==="done"?spec.result:status}</b><small>{state==="done"?spec.resultCopy:state==="running"?"Auctorail is checking the request.":"Run the deterministic SDK example."}</small></div></div></div></section>}
const installCommand="npm install ./packages/sdk";
const sdkCode=`import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d...22c14",
  reason: "Supplier invoice #4471",
  reference: "INV-4471"
});

console.log(auth.decision); // "ALLOW" | "HOLD" | "BLOCK"

if (auth.allowed && auth.executionToken) {
  const receipt = await rail.execute(auth);
  console.log(receipt);
}`;
export function SdkScreen(){const[step,setStep]=useState(0);const lines=useMemo(()=>sdkCode.split("\n"),[]);return <main className="sdk-screen" data-testid="sdk-screen"><div className="sdk-meta-row"><span>DOCS <i>/</i> SDK</span><span>REPO-LOCAL PACKAGE <i>·</i> DEMO MODE</span></div><section className="sdk-hero"><div><h1>BUILD WITH AUCTORAIL</h1><p>Authorize an agent action in a few lines of code.</p></div><p className="sdk-hero-note">REAL CLIENT PACKAGE.<br/>LOCAL HACKATHON INSTALL.<br/>NO FAKE API DOMAIN.</p></section><div className="sdk-install"><code>$ {installCommand}</code><button type="button" onClick={()=>copy(installCommand)}>COPY</button></div><nav className="sdk-step-tabs" aria-label="SDK steps">{["INITIALIZE","AUTHORIZE","EXECUTE"].map((item,index)=><button key={item} type="button" className={step===index?"active":""} onClick={()=>setStep(index)}><b>0{index+1}</b><span>{item}</span></button>)}</nav><section className="sdk-workbench"><article className="sdk-code-card"><header><strong>JAVASCRIPT</strong><button type="button" onClick={()=>copy(sdkCode)}>COPY CODE</button></header><pre>{lines.map((line,index)=><span key={index}><i>{String(index+1).padStart(2,"0")}</i>{line||" "}</span>)}</pre></article><div className="sdk-demo-stack"><MiniSdkDemo kind="valid"/><MiniSdkDemo kind="attack"/></div></section><section className="sdk-how"><strong>HOW IT WORKS</strong><div className="sdk-flow"><div><b>YOUR AGENT</b><small>Sends a request</small></div><span>→</span><div><b>AUCTORAIL SDK</b><small>Runs policy + live flow</small></div><span>→</span><div><b>AUCTORAIL API</b><small>Telegraph & authorization</small></div><span>→</span><div><b>EXECUTION</b><small>Bound external effect</small></div></div></section><footer className="sdk-footer"><span>PUBLIC NPM RELEASE NOT CLAIMED.</span><span>GitHub ↗ &nbsp;&nbsp; Integration Guide ↗ &nbsp;&nbsp; Examples ↗</span></footer></main>}
