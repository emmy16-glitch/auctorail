import React from "react";
import "./home-landing.css";

interface HomeLandingScreenProps {
  onDemo: () => void;
  onLive: () => void;
  onContent: () => void;
  onVerify: () => void;
}
type SvgProps = React.SVGProps<SVGSVGElement>;
function FileIcon(props: SvgProps) { return <svg viewBox="0 0 44 52" aria-hidden="true" {...props}><path d="M8 3h19l9 9v37H8z" fill="none" stroke="currentColor" strokeWidth="2.5"/><path d="M27 3v10h9M14 24h16M14 31h16M14 38h12" fill="none" stroke="currentColor" strokeWidth="2.2"/></svg>; }
function ShieldIcon(props: SvgProps) { return <svg viewBox="0 0 48 56" aria-hidden="true" {...props}><path d="M24 3 43 10v15c0 12-7.6 22.4-19 28C12.6 47.4 5 37 5 25V10z" fill="none" stroke="currentColor" strokeWidth="3"/></svg>; }
function DatabaseIcon(props: SvgProps) { return <svg viewBox="0 0 48 52" aria-hidden="true" {...props}><ellipse cx="24" cy="9" rx="16" ry="6" fill="none" stroke="currentColor" strokeWidth="2.4"/><path d="M8 9v30c0 3.3 7.2 6 16 6s16-2.7 16-6V9M8 24c0 3.3 7.2 6 16 6s16-2.7 16-6" fill="none" stroke="currentColor" strokeWidth="2.4"/></svg>; }
function ReceiptIcon(props: SvgProps) { return <svg viewBox="0 0 44 52" aria-hidden="true" {...props}><path d="M8 3h20l8 8v38l-5-3-4 3-5-3-5 3-4-3-5 3z" fill="none" stroke="currentColor" strokeWidth="2.4"/><path d="M28 3v9h8M14 23h16M14 30h16M14 37h11" fill="none" stroke="currentColor" strokeWidth="2.1"/></svg>; }
function PlayIcon(props: SvgProps) { return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><path d="M9 6 25 16 9 26z" fill="none" stroke="currentColor" strokeWidth="2.3"/></svg>; }
function BoltIcon(props: SvgProps) { return <svg viewBox="0 0 32 40" aria-hidden="true" {...props}><path d="M18 2 6 22h10l-2 16 12-22H16z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="miter"/></svg>; }

function GateFlowGraphic() {
  return <svg className="gate-flow-svg" viewBox="0 0 430 390" role="img" aria-label="Agent request passes through Auctorail before authorized execution">
    <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="miter"><path d="M35 70 215 15l179 63-180 59z" fill="#fff"/><path d="M35 70v19l179 59 180-60V78" fill="#f8f8f8"/><path d="M26 159 212 101l191 63-189 65z" fill="#e3d1ff"/><path d="M26 159v20l188 65 189-66v-14" fill="#efe6ff"/><path d="M27 257 214 198l192 64-191 67z" fill="#fff"/><path d="M27 257v20l188 68 191-68v-15" fill="#f8f8f8"/><path d="M45 91v55M385 97v52M212 151v45" strokeDasharray="4 4"/></g>
    <g fill="none" stroke="currentColor" strokeWidth="2"><path d="M201 50h18l8 8v24h-26zM219 50v9h8M206 66h15M206 72h15"/><path d="M214 145 229 151v11c0 9-5.8 16.8-15 21-9.2-4.2-15-12-15-21v-11z"/><path d="m203 280 8 8 17-22" strokeWidth="3"/></g>
    <g fill="currentColor" fontFamily="Courier New, monospace" fontWeight="700" fontSize="11"><text x="214" y="112" textAnchor="middle">AGENT REQUEST</text><text x="214" y="204" textAnchor="middle">AUCTORAIL</text><text x="215" y="316" textAnchor="middle">AUTHORIZED EXECUTION</text></g>
  </svg>;
}

const safeguards = [
  { title: "ACTION BINDING", copy: "Prevents amount and mandate substitution.", icon: FileIcon },
  { title: "PERMIT VALIDATION", copy: "Blocks replay, forgery and expiry.", icon: ShieldIcon },
  { title: "EVIDENCE CHECKS", copy: "Verifies Miner and runtime evidence.", icon: DatabaseIcon },
  { title: "RECEIPT INTEGRITY", copy: "Ensures post-execution results are untampered.", icon: ReceiptIcon }
];
const demoSteps = [
  { n: "01", title: "VALID REQUEST", copy: "Exact authorization", state: "✓  EXECUTED (DEMO)", tone: "mint" },
  { n: "02", title: "MODIFIED AMOUNT", copy: "Tampered after approval", state: "⊘  BLOCKED", tone: "rose" },
  { n: "03", title: "REPLAYED PERMIT", copy: "Already consumed", state: "⊘  BLOCKED", tone: "purple" },
  { n: "04", title: "MISSING EVIDENCE", copy: "Did not reach threshold", state: "!  HELD", tone: "yellow" }
];

export function HomeLandingScreen({ onDemo, onLive, onContent, onVerify }: HomeLandingScreenProps) {
  return <main className="home-landing" data-testid="home-landing-screen">
    <section className="home-hero"><div className="home-hero-copy"><h1>Prove authority<br/>before execution.</h1><p>Auctorail enforces real authorization for agent actions.<br className="desktop-break"/> It checks, verifies, and only allows what is proven.</p>
      <div className="home-primary-actions"><button className="home-mode-card demo" type="button" onClick={onDemo}><span className="home-mode-icon"><PlayIcon/></span><span className="home-mode-copy"><strong>WATCH DEMO</strong><small>Run a guided demo with<br/>deterministic results.<br/>No real payments.</small></span><span className="home-mode-arrow">→</span></button><button className="home-mode-card live" type="button" onClick={onLive}><span className="home-mode-icon"><BoltIcon/></span><span className="home-mode-copy"><strong>ENTER LIVE MODE</strong><small>Use real Telegraph, x402<br/>and Base Sepolia.<br/>May incur miner costs.</small></span><span className="home-mode-arrow">→</span></button></div></div>
      <div className="home-gate-visual"><GateFlowGraphic/><div className="gate-steps"><div><strong>CAPTURE</strong><span>Exact request snapshot</span></div><div><strong>VERIFY</strong><span>Rules, evidence, permits</span></div><div><strong>ENFORCE</strong><span>Only proven actions execute</span></div></div></div></section>

    <section className="home-safeguards" aria-label="Auctorail safeguards">{safeguards.map((item) => { const Icon=item.icon; return <article key={item.title}><Icon/><div><strong>{item.title}</strong><p>{item.copy}</p></div></article>; })}</section>

    <section className="home-content-trust" aria-labelledby="content-trust-title">
      <div className="home-content-copy">
        <span>CONTENT TRUST / SAME AUTHORIZATION CORE</span>
        <h2 id="content-trust-title">Paste it. Check the evidence before you act.</h2>
        <p>Use the same fail-closed ALLOW / HOLD / BLOCK model on suspicious text. Demo mode is zero-cost; Live mode can route real Telegraph/x402 evidence when enabled.</p>
        <div className="home-content-actions">
          <button type="button" onClick={onContent}>CHECK CONTENT <b>→</b></button>
          <button type="button" onClick={onVerify}>VERIFY A RECEIPT</button>
        </div>
      </div>
      <div className="home-content-flow" aria-label="Content Trust flow">
        <div><b>01</b><strong>EXACT CONTENT</strong><span>hash the subject</span></div>
        <i>→</i>
        <div><b>02</b><strong>TELEGRAPH EVIDENCE</strong><span>live when enabled</span></div>
        <i>→</i>
        <div><b>03</b><strong>ALLOW / HOLD / BLOCK</strong><span>fail closed</span></div>
        <i>→</i>
        <div><b>04</b><strong>VERIFIABLE RECEIPT</strong><span>same share text</span></div>
      </div>
    </section>

    <section className="home-demo-preview" aria-labelledby="demo-preview-title"><div className="demo-preview-intro"><span>DEMO PREVIEW</span><h2 id="demo-preview-title">See how it works.</h2><p>A short, automatic run showing success,<br/>blocked attacks and a hold case.</p><button type="button" onClick={onDemo}>PLAY DEMO <b>→</b></button></div><div className="demo-step-track">{demoSteps.map((step,index)=><React.Fragment key={step.n}><article className={`demo-step ${step.tone}`}><div className="demo-step-top"><b>{step.n}</b><div><strong>{step.title}</strong><span>{step.copy}</span></div></div><div className="demo-step-state">{step.state}</div></article>{index<demoSteps.length-1&&<span className="demo-arrow">→</span>}</React.Fragment>)}</div></section>
    <footer className="home-footer"><div className="footer-brand"><ShieldIcon/><div><strong>AUCTORAIL</strong><span>Authorization rails</span></div></div><p>BUILT FOR AN OPEN AGENT ECONOMY.</p><nav aria-label="Landing links"><a href="https://github.com/emmy16-glitch/proof-gate" target="_blank" rel="noreferrer">GitHub ↗</a><a href="https://github.com/emmy16-glitch/proof-gate#readme" target="_blank" rel="noreferrer">Docs ↗</a><span>Privacy</span><span>Terms</span></nav></footer>
  </main>;
}
