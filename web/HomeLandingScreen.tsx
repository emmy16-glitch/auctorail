import React from "react";
import { PlayIcon, BoltIcon } from "./icons";

interface HomeLandingScreenProps {
  onDemo: () => void;
  onLive: () => void;
  onContent: () => void;
  onVerify: () => void;
  onSecurity: () => void;
}

const steps = [
  { n: "01", title: "CAPTURE", copy: "The exact proposed action — amount, recipient, reason — is frozen and hashed. Nothing can be substituted afterwards." },
  { n: "02", title: "DELEGATE", copy: "Auctorail checks what the principal actually delegated: permission, limit, recipient, window. Before a Miner is paid." },
  { n: "03", title: "EVIDENCE", copy: "When the consequence requires it, Telegraph Miner intelligence is bought via x402, bounded, and bound to the exact action." },
  { n: "04", title: "ENFORCE", copy: "A short-lived one-use permit is the only thing that can cause the effect. A tamper-evident receipt records the outcome." }
];

const demos = [
  {
    kicker: "GUIDED DEMO",
    title: "Watch Auctorail in action",
    copy: "A deterministic run through success, a tampered amount, a replayed permit and a held decision. No real payments.",
    cta: "PLAY DEMO",
    action: "onDemo" as const
  },
  {
    kicker: "SECURITY LAB",
    title: "Try to break the rails",
    copy: "Mutate a valid authorization and watch the exact boundary where Auctorail stops it. Offline and fully deterministic.",
    cta: "OPEN THE LAB",
    action: "onSecurity" as const
  },
  {
    kicker: "PUBLIC VERIFIER",
    title: "Verify a receipt",
    copy: "Recompute receipt integrity and binding from a hash, an ID, or the receipt JSON itself. Proof, not screenshots.",
    cta: "VERIFY A RECEIPT",
    action: "onVerify" as const
  }
];

function GateDiagram() {
  return (
    <div className="gate-figure" aria-label="Agent request passes through Auctorail before authorized execution">
      <div className="gate-row">
        <div className="gate-node">
          <span className="eyebrow">AGENT REQUEST</span>
          <strong>invoice-bot proposes</strong>
          <span className="copy">1.00 USDC → Auctorail Vendor · Base Sepolia. One exact, hashable action.</span>
        </div>
        <div className="gate-node mid">
          <span className="eyebrow" style={{ color: "var(--accent)" }}>AUCTORAIL</span>
          <strong>authority + evidence</strong>
          <span className="copy">Mandate checked first. Telegraph evidence bounded, verified and bound to this action.</span>
        </div>
        <div className="gate-node">
          <span className="eyebrow">AUTHORIZED EXECUTION</span>
          <strong>one-use permit</strong>
          <span className="copy">Only a signed permit for this exact action may cause the external effect.</span>
        </div>
      </div>
    </div>
  );
}

export function HomeLandingScreen(props: HomeLandingScreenProps) {
  const { onDemo, onLive, onContent, onVerify, onSecurity } = props;
  const demoHandlers = { onDemo, onSecurity, onVerify } as Record<"onDemo" | "onSecurity" | "onVerify", () => void>;

  return (
    <main data-testid="home-landing-screen">
      <section className="landing-hero">
        <span className="hero-chips">
          <span className="badge accent"><span className="status-dot" aria-hidden="true" />REAL AUTHORIZATION · PROVABLE SECURITY</span>
        </span>
        <h1>Prove authority before execution.</h1>
        <p className="hero-sub">
          Auctorail is a pre-execution authorization layer for autonomous agents.
          It freezes the exact action, checks what the human actually delegated, and only then
          lets a signed one-use permit cause the effect.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" type="button" onClick={onLive}>
            <BoltIcon style={{ width: 15, height: 19 }} />
            <span>ENTER LIVE MODE</span>
            <span className="arrow" aria-hidden="true">→</span>
          </button>
          <button className="btn btn-lg" type="button" onClick={onDemo}>
            <PlayIcon style={{ width: 15, height: 15 }} />
            <span>WATCH DEMO</span>
          </button>
        </div>
        <GateDiagram />
      </section>

      <div className="stats-band">
        <div className="stats-inner">
          <div className="stat"><b>268/268</b><span>tests passing</span></div>
          <div className="stat"><b>7,400</b><span>fuzz cases contained</span></div>
          <div className="stat"><b>1</b><span>protected Base Sepolia execution</span></div>
          <div className="stat"><b>0</b><span>production vulnerabilities</span></div>
        </div>
      </div>

      <section className="landing-section" aria-labelledby="how-title">
        <div className="page-inner" style={{ padding: 0 }}>
          <div className="section-head">
            <span className="eyebrow"><span className="num">01</span>HOW IT WORKS</span>
            <h2 className="section-title" id="how-title">Four gates. No shortcuts.</h2>
            <p className="section-lede">The agent may decide what it wants to do. It cannot create, expand, or bypass the authority required to do it.</p>
          </div>
          <div className="steps-grid">
            {steps.map((step) => (
              <article className="step-card" key={step.n}>
                <span className="step-num">{step.n}</span>
                <strong>{step.title}</strong>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="demos-title" style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="page-inner" style={{ padding: "84px 28px" }}>
          <div className="section-head">
            <span className="eyebrow"><span className="num">02</span>SEE IT WORKING</span>
            <h2 className="section-title" id="demos-title">These are not illustrations.</h2>
            <p className="section-lede">They are working demonstrations of the enforcement built into every layer of the platform.</p>
          </div>
          <div className="demo-cards">
            {demos.map((demo) => (
              <button className="demo-card" type="button" key={demo.title} onClick={demoHandlers[demo.action]}>
                <span className="demo-card-kicker">{demo.kicker}</span>
                <strong>{demo.title}</strong>
                <p>{demo.copy}</p>
                <span className="demo-card-cta">{demo.cta} →</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="content-trust-title">
        <div className="page-inner" style={{ padding: 0 }}>
          <div className="split-section">
            <div>
              <span className="eyebrow"><span className="num">03</span>CONTENT TRUST · SAME AUTHORIZATION CORE</span>
              <h2 className="section-title" id="content-trust-title" style={{ marginTop: 12 }}>Paste it. Check the evidence before you act.</h2>
              <p className="section-lede">
                The same fail-closed ALLOW / HOLD / BLOCK model, applied to suspicious text.
                Demo mode is zero-cost; live mode routes real Telegraph/x402 evidence when enabled.
              </p>
              <div className="split-actions">
                <button className="btn btn-primary" type="button" onClick={onContent}>CHECK CONTENT <span className="arrow" aria-hidden="true">→</span></button>
                <button className="btn" type="button" onClick={onVerify}>VERIFY A RECEIPT</button>
              </div>
            </div>
            <div className="mini-flow" aria-label="Content Trust flow">
              <div className="mini-flow-item"><b>01</b><div><strong>EXACT CONTENT</strong><span>hash the subject</span></div></div>
              <div className="mini-flow-item"><b>02</b><div><strong>TELEGRAPH EVIDENCE</strong><span>live when enabled</span></div></div>
              <div className="mini-flow-item"><b>03</b><div><strong>ALLOW / HOLD / BLOCK</strong><span>fail closed</span></div></div>
              <div className="mini-flow-item"><b>04</b><div><strong>VERIFIABLE RECEIPT</strong><span>one shared source of truth</span></div></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
