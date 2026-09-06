import React, { useState } from "react";
import { PlayIcon, BoltIcon } from "./icons";
import { AutoTerminal, type AutoTermLine } from "./AutoTerminal";

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

// Historical protected Base Sepolia payment used as a public, independently verifiable receipt.
const CANONICAL_TX = "0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc";
const BASESCAN_TX_URL = `https://sepolia.basescan.org/tx/${CANONICAL_TX}`;
const GITHUB_URL = "https://github.com/emmy16-glitch/auctorail";

// Ten attacks, each runnable in the Security Lab. Results mirror the lab's actual outcomes.
const attacks = [
  { n: "01", id: "attack-permit-replay", name: "PERMIT REPLAY", tries: "Reuses a permit after the authorized action already consumed it", layer: "04 · ONE-USE PERMIT", layerId: "layer-04", result: "Consumption guard rejects it. No second execution." },
  { n: "02", id: "attack-amount-mutation", name: "AMOUNT MUTATION", tries: "Changes 1.00 → 2.00 USDC after authorization", layer: "01 · EXACT ACTION", layerId: "layer-01", result: "Action hash mismatch. Permit verification fails." },
  { n: "03", id: "attack-evidence-subject", name: "EVIDENCE SUBJECT SWAP", tries: "Replaces vendor evidence with evidence for another address", layer: "03 · TELEGRAPH EVIDENCE", layerId: "layer-03", result: "Evidence binding mismatch. Authority is rejected." },
  { n: "04", id: "attack-permit-forgery", name: "PERMIT FORGERY", tries: "Alters the signature on an otherwise valid permit", layer: "04 · ONE-USE PERMIT", layerId: "layer-04", result: "Signature verification fails." },
  { n: "05", id: "attack-expired-permit", name: "EXPIRED PERMIT", tries: "Attempts execution after the permit TTL", layer: "04 · ONE-USE PERMIT", layerId: "layer-04", result: "Expired authority is rejected." },
  { n: "06", id: "attack-decision-tamper", name: "DECISION TAMPER", tries: "Changes the authorization decision after the permit is minted", layer: "04 · ONE-USE PERMIT", layerId: "layer-04", result: "Decision hash mismatch. Permit verification fails." },
  { n: "07", id: "attack-mandate-substitution", name: "MANDATE SUBSTITUTION", tries: "Rebinds the permit to a different mandate version", layer: "02 · DELEGATION", layerId: "layer-02", result: "Mandate hash mismatch. Authority is rejected." },
  { n: "08", id: "attack-negative-miner", name: "NEGATIVE MINER", tries: "Supplies a high-confidence negative Telegraph verdict", layer: "03 · TELEGRAPH EVIDENCE", layerId: "layer-03", result: "Negative evidence reduces authority: BLOCK." },
  { n: "09", id: "attack-runtime-tamper", name: "RUNTIME ATTESTATION TAMPER", tries: "Alters pinned runtime evidence while the Miner still says ALLOW", layer: "03 · TELEGRAPH EVIDENCE", layerId: "layer-03", result: "Runtime attestation check blocks the request." },
  { n: "10", id: "attack-receipt-tamper", name: "RECEIPT TAMPER", tries: "Changes the transaction hash inside a completed receipt", layer: "05 · VERIFIABLE PROOF", layerId: "layer-05", result: "Receipt integrity re-verification fails." }
];

const telegraph = {
  buy: "Auctorail buys bounded Telegraph intelligence through x402 and binds the returned evidence to the exact frozen action. Payment policy currently uses FRAUD_DETECTION for LOW risk, adds ONCHAIN_TX_LOOKUP for MEDIUM risk, and adds WALLET_BALANCE_CHECK for HIGH risk. Content Trust uses AI_DETECTION and CONTENT_VERIFICATION. Not a subscription. Not a feed. Evidence is acquired per action under a bounded budget.",
  when: "Evidence is policy-driven and is acquired before execution authority is issued. Even the current LOW payment tier requires FRAUD_DETECTION; higher tiers require more evidence and distinct Miners. If required evidence does not arrive or cannot be verified, Auctorail holds instead of guessing.",
  why: "Auctorail does not generate the intelligence it relies on. Telegraph provides external Miner results; Auctorail verifies their applicability, confidence, subject and action binding, then evaluates them together with the human delegation. Telegraph provides intelligence. Auctorail decides whether that evidence is sufficient to authorize the exact action."
};

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

// The "simple version" — everyday language, no jargon.
const plain = [
  { n: "01", title: "You delegate the boundary", copy: "invoice-bot may pay the pinned vendor, up to 5 USDC per action, during the active permission window.", example: "delegate  invoice-bot → vendor · max 5 USDC" },
  { n: "02", title: "The agent proposes one exact action", copy: "For the demo request, it asks to pay 1.00 USDC for supplier invoice #4471. Auctorail freezes the amount, recipient, reason and reference.", example: "request   1.00 USDC · INV-4471" },
  { n: "03", title: "The rail checks delegated authority", copy: "The request must fit the real mandate before paid intelligence is used. It cannot widen the amount or swap the pinned recipient.", example: "policy    amount ≤ 5 · recipient match ✓" },
  { n: "04", title: "Required Telegraph evidence is verified", copy: "For the current LOW tier, Auctorail obtains FRAUD_DETECTION evidence and verifies that it applies to this exact recipient and Base Sepolia action.", example: "evidence  FRAUD_DETECTION · bound ✓" },
  { n: "05", title: "One-use authority can execute", copy: "Only after policy and evidence pass does Auctorail issue short-lived, one-use execution authority. The outcome can be saved as a receipt and re-verified.", example: "permit    one use · short lived · verifiable" }
];

// Plain-language loop for the auto-terminal: one normal request, one that's stopped.
const plainTerm: AutoTermLine[] = [
  { cmd: true, text: 'delegate "invoice-bot → pinned vendor · max 5 USDC"' },
  { text: "→ mandate  active permission loaded", tone: "ok" },
  { cmd: true, text: 'request "pay 1.00 USDC · invoice INV-4471"' },
  { text: "→ frozen   exact action hash created", tone: "ok" },
  { text: "→ rules    amount + recipient match  ✓", tone: "ok" },
  { text: "→ evidence Telegraph FRAUD_DETECTION ✓", tone: "ok" },
  { text: "→ permit   one-use authority issued", tone: "ok" },
  { text: "→ ready    protected execution may proceed", tone: "ok", pause: 700 },
  { cmd: true, text: 'request "pay 7.00 USDC · same vendor"' },
  { text: "→ rules    exceeds 5 USDC delegation ✗", tone: "bad" },
  { text: "→ blocked  no execution authority issued", tone: "bad", pause: 1100 }
];

// Compact loop for the closing band — the verifiable-proof angle.
const closeTerm: AutoTermLine[] = [
  { cmd: true, text: "verify receipt 0x036a…c4d2" },
  { text: "→ integrity   hash matches  ✓", tone: "ok" },
  { text: "→ bindings    mandate · action · permit  ✓", tone: "ok" },
  { text: "→ verdict     VALID · anyone can re-check", tone: "ok", pause: 1200 }
];

export function HomeLandingScreen(props: HomeLandingScreenProps) {
  const { onDemo, onLive, onContent, onVerify, onSecurity } = props;
  const demoHandlers = { onDemo, onSecurity, onVerify } as Record<"onDemo" | "onSecurity" | "onVerify", () => void>;
  const [activeStep, setActiveStep] = useState(0);

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
          An agent asked to pay one bill can be prompt-injected into widening, redirecting, or replaying a payment.
          Inside Auctorail’s protected execution path, those unauthorized changes fail at the authorization rail — not merely by convention.
        </p>
        <div className="hero-actions fade-rise" style={{ "--d": "240ms" } as React.CSSProperties}>
          <button className="btn btn-primary btn-lg" type="button" onClick={onDemo}>
            <PlayIcon style={{ width: 15, height: 15 }} />
            <span>WATCH THE RAIL HOLD</span>
            <span className="arrow" aria-hidden="true">→</span>
          </button>
          <button className="btn btn-lg" type="button" onClick={onLive}>
            <BoltIcon style={{ width: 15, height: 19 }} />
            <span>RUN A REAL TESTNET TRANSFER</span>
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

      <section className="landing-section plain-section" aria-labelledby="plain-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">00</span><span className="sec-dash">—</span>THE SIMPLE VERSION</span>
            <h2 className="section-title" id="plain-title">Here's what it actually does.</h2>
            <p className="section-lede">No jargon. You delegate a bounded payment, the agent proposes one exact action, and Auctorail checks that the request still fits the delegation before any protected execution can happen. Tap each step.</p>
          </div>
          <div className="plain-grid">
            <div className="plain-steps" role="tablist" aria-label="How Auctorail works, in plain words">
              {plain.map((step, index) => {
                const active = index === activeStep;
                return (
                  <button
                    key={step.n}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`plain-step ${active ? "active" : ""}`}
                    onClick={() => setActiveStep(index)}
                  >
                    <span className="plain-step-num">{step.n}</span>
                    <span className="plain-step-body">
                      <strong>{step.title}</strong>
                      <span className="plain-step-copy">{step.copy}</span>
                      <code className="plain-step-example mono">{step.example}</code>
                    </span>
                    <span className="plain-step-arrow" aria-hidden="true">{active ? "–" : "+"}</span>
                  </button>
                );
              })}
            </div>
            <div className="plain-terminal">
              <p className="plain-terminal-hint">watching it run, right now — it loops on its own. tap to pause.</p>
              <AutoTerminal
                lines={plainTerm}
                label="auctorail — plain run"
                ariaLabel="Live terminal showing a normal request passing and a request that exceeds the limit being stopped"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">01</span><span className="sec-dash">—</span>HOW IT WORKS</span>
            <h2 className="section-title" id="how-title">Five layers. No shortcuts.</h2>
            <p className="section-lede">The agent may decide what it wants to do. It cannot create, expand, or bypass the authority required to do it.</p>
          </div>
          <div className="depth-ladder">
            {ladder.map((row, index) => (
              <div id={`layer-${row.n}`} className={`ladder-row ${row.key ? "key" : ""} fade-rise`} key={row.n} style={{ "--d": `${index * 60}ms` } as React.CSSProperties}>
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

      <section className="landing-section" id="telegraph" aria-labelledby="telegraph-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">01.5</span><span className="sec-dash">—</span>BUILT ON TELEGRAPH</span>
            <h2 className="section-title" id="telegraph-title">The verification is purchased, bounded, and bound to the action.</h2>
            <p className="section-lede">Auctorail does not treat an agent's own claim as authorization evidence. When policy requires intelligence, Telegraph is the external evidence market Auctorail queries and verifies.</p>
          </div>
          <div className="telegraph-grid">
            <div className="telegraph-card"><strong>WHAT WE BUY</strong><p>{telegraph.buy}</p></div>
            <div className="telegraph-card"><strong>WHEN WE BUY IT</strong><p>{telegraph.when}</p></div>
            <div className="telegraph-card"><strong>WHY TELEGRAPH, NOT A HOMEGROWN ORACLE</strong><p>{telegraph.why}</p></div>
          </div>
          <p className="telegraph-failclosed">If Telegraph can't deliver the evidence, the rail doesn't guess. It holds. <span className="accent-word">Fail-closed is the whole point.</span></p>
        </div>
      </section>

      <section className="landing-section" id="attacks" aria-labelledby="attacks-title" style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="page-inner" style={{ padding: "84px 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">02</span><span className="sec-dash">—</span>THE ATTACK MATRIX</span>
            <h2 className="section-title" id="attacks-title">Claims are cheap. Attacks are not.</h2>
            <p className="section-lede">Ten deterministic attacks are implemented in the Security Lab. Open any case to run the real harness, or run the full suite and inspect the exact boundary that stopped it.</p>
          </div>
          <div className="attack-table" role="table" aria-label="Attack matrix">
            <div className="attack-row attack-head" role="row">
              <span role="columnheader">#</span><span role="columnheader">ATTACK</span><span role="columnheader">WHAT THE ATTACKER TRIES</span><span role="columnheader">LAYER THAT STOPS IT</span><span role="columnheader">RESULT</span><span role="columnheader" />
            </div>
            {attacks.map((a) => (
              <div className="attack-row" id={a.id} role="row" key={a.n}>
                <span className="mono" role="cell">{a.n}</span>
                <strong role="cell">{a.name}</strong>
                <span role="cell">{a.tries}</span>
                <button className="attack-layer-link mono" type="button" role="cell" onClick={() => document.getElementById(a.layerId)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{a.layer}</button>
                <span role="cell">{a.result}</span>
                <button className="btn btn-sm" type="button" onClick={onSecurity} role="cell">OPEN IN LAB ▸</button>
              </div>
            ))}
          </div>
          <div className="attack-summary">
            <span className="mono">10 deterministic attacks. 10 boundaries held. 0 unauthorized protected executions.</span>
            <button className="btn btn-primary" type="button" onClick={onSecurity}>OPEN LAB · RUN ALL TEN ▸</button>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="demos-title" style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="page-inner" style={{ padding: "84px 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">03</span><span className="sec-dash">—</span>SEE IT WORKING</span>
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
          <div className="demo-proof-links">
            <a className="btn btn-sm" href={BASESCAN_TX_URL} target="_blank" rel="noreferrer">VERIFY PROTECTED TX ON BASESCAN ↗</a>
            <button className="btn btn-sm" type="button" onClick={onVerify}>VIEW THE PERMIT ▸</button>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="content-trust-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="split-section">
            <div>
              <span className="sec-label"><span className="sec-num">04</span><span className="sec-dash">—</span>CONTENT TRUST</span>
              <h2 className="section-title" id="content-trust-title" style={{ marginTop: 16 }}>The same rail. A different threat.</h2>
              <p className="section-lede">
                An agent that acts on bad input can be dangerous even when its tool permission is valid. Content Trust hashes the exact text, evaluates bounded evidence, and returns ALLOW / HOLD / BLOCK before downstream action. Demo mode is zero-cost; live mode uses real Telegraph/x402 evidence when enabled.
              </p>
              <div className="split-actions" style={{ marginTop: 26 }}>
                <button className="btn btn-primary" type="button" onClick={onContent}>TRY IT — CHECK SUSPICIOUS CONTENT <span className="arrow" aria-hidden="true">→</span></button>
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
          Run the deterministic lab to inspect the security boundaries — or enter live mode to authorize a Base Sepolia testnet transfer with real Telegraph evidence.
        </p>
        <p className="closing-sub fade-rise" style={{ "--d": "200ms" } as React.CSSProperties}>
          The linked transaction below is a previously confirmed protected Base Sepolia testnet execution. Deterministic demos never move funds.
        </p>
        <div className="hero-actions fade-rise" style={{ "--d": "240ms" } as React.CSSProperties}>
          <button className="btn btn-primary btn-lg" type="button" onClick={onLive}><span>RUN LIVE MODE — AUTHORIZE A REAL BASE SEPOLIA TRANSFER</span></button>
          <a className="btn btn-lg" href={GITHUB_URL} target="_blank" rel="noreferrer"><span>READ THE CODE — GITHUB ↗</span></a>
          <a className="btn btn-lg" href={BASESCAN_TX_URL} target="_blank" rel="noreferrer"><span>VERIFY THE RECEIPTS — BASESCAN ↗</span></a>
        </div>
        <p className="closing-contact fade-rise" style={{ "--d": "280ms" } as React.CSSProperties}>
          Questions, audits, attacks we haven't thought of:{" "}
          <a href="https://x.com/Okunlola_Labs" target="_blank" rel="noreferrer">X / @Okunlola_Labs ↗</a>
          {" · "}
          <a href="mailto:emmanuelokunlola16@gmail.com">emmanuelokunlola16@gmail.com</a>
        </p>
        <div className="closing-term fade-rise" style={{ "--d": "320ms" } as React.CSSProperties}>
          <AutoTerminal
            lines={closeTerm}
            label="auctorail — verify"
            compact
            ariaLabel="Live terminal re-verifying a saved receipt and confirming it is valid"
          />
        </div>
      </section>
    </main>
  );
}
