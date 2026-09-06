import React from "react";
import { PlayIcon, BoltIcon } from "./icons";

interface HomeLandingScreenProps {
  onDemo: () => void;
  onLive: () => void;
  onContent: () => void;
  onVerify: () => void;
  onSecurity: () => void;
}

const ladder = [
  { n: "01", title: "Capture the exact action", tag: "EXACT ACTION", key: false, copy: "The agent's proposed transfer — amount, recipient, reason, reference — is frozen and hashed the moment it arrives. Nothing can be substituted after this point." },
  { n: "02", title: "Check what was actually delegated", tag: "DELEGATION", key: false, copy: "Permission, spending limit, pinned recipient, time window. The local policy engine checks the real delegation first — before a single Miner is paid." },
  { n: "03", title: "Buy real evidence when it matters", tag: "TELEGRAPH · X402", key: true, copy: "When the consequence demands it, Miner intelligence is purchased through x402, bounded, verified — and cryptographically bound to this exact action." },
  { n: "04", title: "Issue a one-use permit", tag: "ONE-USE", key: false, copy: "A short-lived signed permit is the only thing that can cause the effect. Replay it, mutate it, forge it — it dies. The rail holds." },
  { n: "05", title: "Leave a verifiable proof", tag: "ON-CHAIN", key: false, copy: "The outcome becomes a tamper-evident receipt anyone can re-verify, with the transaction on Base Sepolia open for independent inspection." }
];

const demos = [
  {
    kicker: "GUIDED DEMO",
    title: "Run the rails yourself",
    copy: "Four deterministic scenarios: a valid request, a tampered amount, a replayed permit and a held decision.",
    checklist: ["Pick a scenario, watch it execute", "Exact failure point shown per attack", "Zero payments · zero API calls"],
    cta: "RUN THE DEMO",
    action: "onDemo" as const
  },
  {
    kicker: "SECURITY LAB",
    title: "Try to break the rails",
    copy: "Mutate a valid authorization — replay, forge, tamper — and watch the exact boundary where Auctorail stops you.",
    checklist: ["10 attack scenarios, 10 rails held", "Offline and fully deterministic", "Every block returns a machine code"],
    cta: "OPEN THE LAB",
    action: "onSecurity" as const
  },
  {
    kicker: "PUBLIC VERIFIER",
    title: "Verify a receipt",
    copy: "Recompute receipt integrity and every binding from a hash, an ID, or the receipt JSON itself.",
    checklist: ["Integrity + 5 binding checks", "Tamper the hash, watch it fail", "Proof, not screenshots"],
    cta: "VERIFY A RECEIPT",
    action: "onVerify" as const
  }
];

export function HomeLandingScreen(props: HomeLandingScreenProps) {
  const { onDemo, onLive, onContent, onVerify, onSecurity } = props;
  const demoHandlers = { onDemo, onSecurity, onVerify } as Record<"onDemo" | "onSecurity" | "onVerify", () => void>;

  return (
    <main data-testid="home-landing-screen">
      <section className="landing-hero">
        <span className="hero-prompt fade-rise">
          <span className="prompt-host">auctorail</span>@base-sepolia — authorization rails
          <span className="hero-cursor" aria-hidden="true" />
        </span>
        <h1 className="hero-title fade-rise" style={{ "--d": "80ms" } as React.CSSProperties}>
          Prove <span className="accent-word">authority</span> before execution.
        </h1>
        <p className="hero-sub fade-rise" style={{ "--d": "160ms" } as React.CSSProperties}>
          Every autonomous action starts with one question: did the human actually authorize
          <em> this exact action</em>? Auctorail freezes the request, checks the real delegation,
          buys genuine evidence when the consequence demands it — and only then lets a signed
          one-use permit cause the effect.
        </p>
        <div className="hero-actions fade-rise" style={{ "--d": "240ms" } as React.CSSProperties}>
          <button className="btn btn-primary btn-lg" type="button" onClick={onDemo}>
            <PlayIcon style={{ width: 15, height: 15 }} />
            <span>WATCH DEMO</span>
            <span className="arrow" aria-hidden="true">→</span>
          </button>
          <button className="btn btn-lg" type="button" onClick={onLive}>
            <BoltIcon style={{ width: 15, height: 19 }} />
            <span>ENTER LIVE MODE</span>
          </button>
        </div>
      </section>

      <div className="stats-band">
        <div className="page-inner stats-inner">
          <div className="stat"><b className="stat-hot">10/10</b><span>attack scenarios contained in lab</span></div>
          <div className="stat"><b>268</b><span>tests green on every change</span></div>
          <div className="stat"><b>7,400</b><span>fuzz cases run against the rails</span></div>
          <div className="stat"><b className="stat-hot">0</b><span>payments without a signed permit</span></div>
        </div>
      </div>

      <section className="landing-section" aria-labelledby="how-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">01</span><span className="sec-dash">—</span>HOW IT WORKS</span>
            <h2 className="section-title" id="how-title">Five layers. No shortcuts.</h2>
            <p className="section-lede">The agent may decide what it wants to do. It cannot create, expand, or bypass the authority required to do it.</p>
          </div>
          <div className="depth-ladder">
            {ladder.map((row, index) => (
              <div className={`ladder-row ${row.key ? "key" : ""} fade-rise`} key={row.n} style={{ "--d": `${index * 60}ms` } as React.CSSProperties}>
                <span className="ladder-num">{row.n}</span>
                <div className="ladder-main">
                  <strong>{row.title}</strong>
                  <p>{row.copy}</p>
                </div>
                <span className="ladder-tag">{row.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="demos-title" style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="page-inner" style={{ padding: "84px 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">02</span><span className="sec-dash">—</span>SEE IT WORKING</span>
            <h2 className="section-title" id="demos-title">These are not illustrations.</h2>
            <p className="section-lede">They are working demonstrations of the enforcement built into every layer of the platform. Run them — they are deterministic, they are live in your browser, and they fail loudly when the rails hold.</p>
          </div>
          <div className="demo-cards">
            {demos.map((demo) => (
              <button className="demo-card" type="button" key={demo.title} onClick={demoHandlers[demo.action]}>
                <span className="demo-card-kicker">{demo.kicker}</span>
                <strong>{demo.title}</strong>
                <p>{demo.copy}</p>
                <ul className="demo-checklist">{demo.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
                <span className="demo-card-cta">{demo.cta} <span aria-hidden="true">→</span></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="content-trust-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="split-section">
            <div>
              <span className="sec-label"><span className="sec-num">03</span><span className="sec-dash">—</span>CONTENT TRUST · SAME AUTHORIZATION CORE</span>
              <h2 className="section-title" id="content-trust-title" style={{ marginTop: 16 }}>Paste it. Check the evidence before you act.</h2>
              <p className="section-lede">
                The same fail-closed ALLOW / HOLD / BLOCK model, applied to suspicious text.
                Demo mode is zero-cost; live mode routes real Telegraph/x402 evidence when enabled.
              </p>
              <div className="split-actions" style={{ marginTop: 26 }}>
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

      <section className="closing-band" aria-labelledby="closing-title">
        <span className="sec-label fade-rise" style={{ justifyContent: "center", display: "inline-flex" }}><span className="sec-dash">—</span>END OF THE RAIL<span className="sec-dash">—</span></span>
        <h2 id="closing-title" className="fade-rise" style={{ "--d": "80ms" } as React.CSSProperties}>
          One exact action. One signed permit. <span className="accent-word">One verifiable proof.</span>
        </h2>
        <p className="closing-sub fade-rise" style={{ "--d": "160ms" } as React.CSSProperties}>
          Run the deterministic demo to see every rail hold — or enter live mode and let Auctorail
          authorize a real Base Sepolia transfer, evidence and all.
        </p>
        <div className="hero-actions fade-rise" style={{ "--d": "240ms" } as React.CSSProperties}>
          <button className="btn btn-primary btn-lg" type="button" onClick={onDemo}><span>RUN THE DEMO</span> <span className="arrow" aria-hidden="true">→</span></button>
          <button className="btn btn-lg" type="button" onClick={onLive}><span>START A REAL CHECK</span></button>
        </div>
      </section>
    </main>
  );
}
