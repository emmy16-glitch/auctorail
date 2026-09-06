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

// The real, recorded Base Sepolia protected payment — wired to every "verify on BaseScan" link.
const CANONICAL_TX = "0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc";
const BASESCAN_TX_URL = `https://sepolia.basescan.org/tx/${CANONICAL_TX}`;
const GITHUB_URL = "https://github.com/emmy16-glitch/auctorail";

// Ten attacks, each runnable in the Security Lab. Results mirror the lab's actual outcomes.
const attacks = [
  { n: "01", name: "REPLAY", tries: "Reuses a signed permit from an earlier action", layer: "04 · ONE-USE PERMIT", result: "Permit consumed. Replay dies." },
  { n: "02", name: "AMOUNT SUBSTITUTION", tries: "Changes 10 → 100 USDC after capture", layer: "01 · EXACT ACTION", result: "Hash mismatch. Request frozen." },
  { n: "03", name: "RECIPIENT SWAP", tries: "Redirects payment to an attacker address", layer: "02 · DELEGATION", result: "Pinned recipient violated. BLOCK." },
  { n: "04", name: "LIMIT OVERRIDE", tries: "Pushes spend past the delegation cap", layer: "02 · DELEGATION", result: "Limit checked before any Miner is paid. HOLD." },
  { n: "05", name: "TIME EXPIRY", tries: "Replays inside a lapsed time window", layer: "02 · DELEGATION", result: "Delegation dead. BLOCK." },
  { n: "06", name: "EVIDENCE SKIP", tries: "Triggers the action without buying evidence", layer: "03 · TELEGRAPH EVIDENCE", result: "Fail-closed: no evidence, no permit. HOLD." },
  { n: "07", name: "PERMIT MUTATION", tries: "Edits amount/recipient on a signed permit", layer: "04 · ONE-USE PERMIT", result: "Signature invalid. Permit dies." },
  { n: "08", name: "FORGED RECEIPT", tries: "Fabricates proof for an action that never ran", layer: "05 · VERIFIABLE PROOF", result: "Re-verification fails. Openly." },
  { n: "09", name: "REASON SPOOFING", tries: "Swaps the declared reason/reference", layer: "01 · EXACT ACTION", result: "Reason is hashed into the action. Mismatch." },
  { n: "10", name: "RAIL BYPASS", tries: "Calls the effect contract directly, skipping everything", layer: "04 · ONE-USE PERMIT", result: "No valid permit, no effect. The contract enforces it." }
];

const telegraph = {
  buy: "When a consequence demands evidence, Auctorail pays Miners through x402 for exactly one thing: bounded, verifiable intelligence about THIS action — recipient risk profile, counterparty reputation, intent-consistency and transfer-pattern verification. Not a subscription. Not a feed. One purchase, one action, cryptographically bound to the frozen hash from layer 01.",
  when: "Only when the consequence demands it. A low-stakes action inside delegation doesn't spend a cent — the local policy engine decides alone. The moment the stakes cross the boundary, evidence is purchased BEFORE the permit is issued. Never after. Never retroactively.",
  why: "We didn't write the intelligence. We bought it, bounded it, and bound it to the action. The moment Auctorail verifies itself, Auctorail becomes the attack surface. Telegraph gives us intelligence we don't control — and therefore can't quietly compromise — paid per-action through x402, so every purchase is itself a receipt on the rail. Evidence from a vendor you trust is a dependency. Evidence bought on an open market is a claim anyone can audit."
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
  { n: "01", title: "You set the rules first", copy: "You say what's allowed — which account, how much, by when. You never hand over the keys to the money.", example: "set   limit 10 USDC → alice" },
  { n: "02", title: "It locks the exact request", copy: "The moment the helper says “send $10 to Alice”, Auctorail freezes that exact sentence. Change one letter afterwards and it stops.", example: "freeze “send 10 USDC to alice” → 0x7b1a…c907" },
  { n: "03", title: "It gets an outside safety check", copy: "For anything risky it pays a little to ask an independent check — it doesn't just take the helper's own word for it.", example: "check safety → 2 sources · safe" },
  { n: "04", title: "It signs a one-time pass", copy: "Only a short, single-use pass can actually move the money. Use it twice and it's dead. A receipt is saved that anyone can re-check.", example: "sign pass → permit issued · receipt saved" }
];

// Plain-language loop for the auto-terminal: one normal request, one that's stopped.
const plainTerm: AutoTermLine[] = [
  { cmd: true, text: 'check "send 10 USDC to alice"' },
  { text: "→ frozen   exact request locked", tone: "ok" },
  { text: "→ rules    within your limit  ✓", tone: "ok" },
  { text: "→ safety   independent check  ✓", tone: "ok" },
  { text: "→ pass     one-time permit signed", tone: "ok" },
  { text: "→ done     receipt saved · verifiable", tone: "ok", pause: 700 },
  { cmd: true, text: 'check "send 100 USDC to bob"' },
  { text: "→ frozen   exact request locked", tone: "ok" },
  { text: "→ rules    over your limit    ✗", tone: "bad" },
  { text: "→ stopped  nothing sent · no money moved", tone: "bad", pause: 1100 }
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
          An agent asked to pay one bill can be prompt-injected into draining a wallet.
          Auctorail makes that <em>structurally impossible</em> — not just unlikely.
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
            <p className="section-lede">No jargon. Think of it this way: you ask someone to pay a single bill — but you only trust them with that one bill, and you want proof they did it right. Tap each step.</p>
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

      <section className="landing-section" aria-labelledby="telegraph-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">01.5</span><span className="sec-dash">—</span>BUILT ON TELEGRAPH</span>
            <h2 className="section-title" id="telegraph-title">The verification is purchased, bounded, and bound to the action.</h2>
            <p className="section-lede">Auctorail doesn't trust intelligence it can't pay for, bound, and re-verify. Telegraph is where that intelligence comes from.</p>
          </div>
          <div className="telegraph-grid">
            <div className="telegraph-card"><strong>WHAT WE BUY</strong><p>{telegraph.buy}</p></div>
            <div className="telegraph-card"><strong>WHEN WE BUY IT</strong><p>{telegraph.when}</p></div>
            <div className="telegraph-card"><strong>WHY TELEGRAPH, NOT A HOMEGROWN ORACLE</strong><p>{telegraph.why}</p></div>
          </div>
          <p className="telegraph-failclosed">If Telegraph can't deliver the evidence, the rail doesn't guess. It holds. <span className="accent-word">Fail-closed is the whole point.</span></p>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="attacks-title" style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="page-inner" style={{ padding: "84px 28px" }}>
          <div className="section-head v2">
            <span className="sec-label"><span className="sec-num">02</span><span className="sec-dash">—</span>THE ATTACK MATRIX</span>
            <h2 className="section-title" id="attacks-title">Claims are cheap. Attacks are not.</h2>
            <p className="section-lede">Ten ways to break the rail. Each one was tried. Each row is runnable — not described, executed. The rail holds, or your browser says why it didn't.</p>
          </div>
          <div className="attack-table" role="table" aria-label="Attack matrix">
            <div className="attack-row attack-head" role="row">
              <span role="columnheader">#</span><span role="columnheader">ATTACK</span><span role="columnheader">WHAT THE ATTACKER TRIES</span><span role="columnheader">LAYER THAT STOPS IT</span><span role="columnheader">RESULT</span><span role="columnheader" />
            </div>
            {attacks.map((a) => (
              <div className="attack-row" role="row" key={a.n}>
                <span className="mono" role="cell">{a.n}</span>
                <strong role="cell">{a.name}</strong>
                <span role="cell">{a.tries}</span>
                <span className="mono" role="cell">{a.layer}</span>
                <span role="cell">{a.result}</span>
                <button className="btn btn-sm" type="button" onClick={onSecurity} role="cell">RUN ▸</button>
              </div>
            ))}
          </div>
          <div className="attack-summary">
            <span className="mono">10 attacks. 10 holds. 0 payments that shouldn't exist.</span>
            <button className="btn btn-primary" type="button" onClick={onSecurity}>RUN ALL TEN ▸</button>
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
            <a className="btn btn-sm" href={BASESCAN_TX_URL} target="_blank" rel="noreferrer">VERIFY THIS RECEIPT ON BASESCAN ↗</a>
            <button className="btn btn-sm" type="button" onClick={onVerify}>VIEW THE PERMIT ▸</button>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="content-trust-title">
        <div className="page-inner" style={{ padding: "0 28px" }}>
          <div className="split-section">
            <div>
              <span className="sec-label"><span className="sec-num">04</span><span className="sec-dash">—</span>CONTENT TRUST · THE SAME RAIL, A DIFFERENT THREAT</span>
              <h2 className="section-title" id="content-trust-title" style={{ marginTop: 16 }}>An agent that acts on bad input is as dangerous as one that acts without authority.</h2>
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
        <p className="closing-sub fade-rise" style={{ "--d": "200ms" } as React.CSSProperties}>
          The demo above ran on testnet. The rail doesn't know the difference.
        </p>
        <div className="hero-actions fade-rise" style={{ "--d": "240ms" } as React.CSSProperties}>
          <button className="btn btn-primary btn-lg" type="button" onClick={onLive}><span>RUN LIVE MODE — AUTHORIZE A REAL BASE SEPOLIA TRANSFER</span></button>
          <a className="btn btn-lg" href={GITHUB_URL} target="_blank" rel="noreferrer"><span>READ THE CODE — GITHUB ↗</span></a>
          <a className="btn btn-lg" href={BASESCAN_TX_URL} target="_blank" rel="noreferrer"><span>VERIFY THE RECEIPTS — BASESCAN ↗</span></a>
        </div>
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
