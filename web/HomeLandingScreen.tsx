import React from "react";
import "./home-landing.css";

interface HomeLandingScreenProps {
  onDemo: () => void;
  onLive: () => void;
}

const safeguards = [
  { title: "ACTION BINDING", copy: "Prevents amount and mandate substitution." },
  { title: "PERMIT VALIDATION", copy: "Blocks replay, forgery and expiry." },
  { title: "EVIDENCE CHECKS", copy: "Verifies Miner and runtime evidence." },
  { title: "RECEIPT INTEGRITY", copy: "Ensures post-execution results are untampered." }
];

const demoSteps = [
  { n: "01", title: "VALID REQUEST", copy: "Exact authorization", state: "EXECUTED (DEMO)", tone: "mint" },
  { n: "02", title: "MODIFIED AMOUNT", copy: "Tampered after approval", state: "BLOCKED", tone: "rose" },
  { n: "03", title: "REPLAYED PERMIT", copy: "Already consumed", state: "BLOCKED", tone: "purple" },
  { n: "04", title: "MISSING EVIDENCE", copy: "Did not reach threshold", state: "HELD", tone: "yellow" }
];

export function HomeLandingScreen({ onDemo, onLive }: HomeLandingScreenProps) {
  return (
    <main className="home-landing" data-testid="home-landing-screen">
      <section className="home-hero">
        <div className="home-hero-copy">
          <h1>Prove before<br />you execute.</h1>
          <p>ProofGate enforces real authorization for agent actions. It checks, verifies, and only allows what is proven.</p>

          <div className="home-primary-actions">
            <button className="home-mode-card demo" type="button" onClick={onDemo}>
              <span className="home-mode-icon" aria-hidden="true">▷</span>
              <span className="home-mode-copy"><strong>WATCH DEMO</strong><small>Run a guided demo with deterministic results. No real payments.</small></span>
              <span className="home-mode-arrow" aria-hidden="true">→</span>
            </button>

            <button className="home-mode-card live" type="button" onClick={onLive}>
              <span className="home-mode-icon" aria-hidden="true">ϟ</span>
              <span className="home-mode-copy"><strong>ENTER LIVE MODE</strong><small>Use real Telegraph, x402 and Base Sepolia. May incur costs.</small></span>
              <span className="home-mode-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div className="home-gate-visual" aria-label="ProofGate authorization flow">
          <div className="gate-layer request"><span>AGENT REQUEST</span></div>
          <div className="gate-layer proofgate"><span>PROOFGATE</span></div>
          <div className="gate-layer execution"><span>AUTHORIZED EXECUTION</span></div>
          <div className="gate-steps">
            <div><strong>CAPTURE</strong><span>Exact request snapshot</span></div>
            <div><strong>VERIFY</strong><span>Rules, evidence, permits</span></div>
            <div><strong>ENFORCE</strong><span>Only proven actions execute</span></div>
          </div>
        </div>
      </section>

      <section className="home-safeguards" aria-label="ProofGate safeguards">
        {safeguards.map((item, index) => (
          <article key={item.title}>
            <span className="safeguard-index">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{item.title}</strong><p>{item.copy}</p></div>
          </article>
        ))}
      </section>

      <section className="home-demo-preview" aria-labelledby="demo-preview-title">
        <div className="demo-preview-intro">
          <span>DEMO PREVIEW</span>
          <h2 id="demo-preview-title">See how it works.</h2>
          <p>A short, automatic run showing success, blocked attacks and a hold case.</p>
          <button type="button" onClick={onDemo}>PLAY DEMO <b aria-hidden="true">→</b></button>
        </div>

        <div className="demo-step-track">
          {demoSteps.map((step, index) => (
            <React.Fragment key={step.n}>
              <article className={`demo-step ${step.tone}`}>
                <div className="demo-step-top">
                  <b>{step.n}</b>
                  <div><strong>{step.title}</strong><span>{step.copy}</span></div>
                </div>
                <div className="demo-step-state">{step.state}</div>
              </article>
              {index < demoSteps.length - 1 && <span className="demo-arrow" aria-hidden="true">→</span>}
            </React.Fragment>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <div><strong>PROOFGATE</strong><span>Real authorization</span></div>
        <p>BUILT FOR AN OPEN AGENT ECONOMY.</p>
        <nav aria-label="Landing links">
          <a href="https://github.com/emmy16-glitch/proof-gate" target="_blank" rel="noreferrer">GitHub ↗</a>
          <a href="https://github.com/emmy16-glitch/proof-gate#readme" target="_blank" rel="noreferrer">Docs ↗</a>
        </nav>
      </footer>
    </main>
  );
}
