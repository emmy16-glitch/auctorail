import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DecisionRecord } from "../src/policy/payments-strict-v1";
import "./styles.css";

const VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CHAIN_ID = 84532;

function formatAmount(raw: string) {
  const value = Number(raw) / 1_000_000;
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function App() {
  const [limit, setLimit] = useState("10.00");
  const [amount, setAmount] = useState("7.00");
  const [reason, setReason] = useState("Pay supplier invoice");
  const [reference, setReference] = useState("INV-1042");
  const [decision, setDecision] = useState<DecisionRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem("proofgate-theme") === "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("proofgate-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const withinLimit = Number(amount) <= Number(limit);
  const summary = useMemo(
    () => `${amount || "0.00"} USDC is ${withinLimit ? "within" : "above"} the agent's ${limit || "0.00"} USDC spending limit.`,
    [amount, limit, withinLimit]
  );

  async function runProofGate() {
    setRunning(true);
    setDecision(null);
    try {
      const response = await fetch("/api/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit, amount, reason, reference })
      });
      const result = await response.json() as DecisionRecord & { error?: string };
      if (!response.ok) {
        if (result.decision === "HOLD") {
          setDecision(result);
          return;
        }
        throw new Error(result.error ?? "authorization_failed");
      }
      setDecision(result);
    } catch (error) {
      setDecision({
        decision: "HOLD",
        reason: error instanceof Error ? error.message : "authorization_failed",
        policyId: "payments.strict.v1",
        policyVersion: 1,
        agentId: "demo-agent",
        actionId: "invalid",
        mandate: { mandateId: "invalid", mandateHash: "invalid", principalId: "invalid", agentId: "demo-agent", version: 1 },
        checks: [],
        decidedAt: new Date().toISOString()
      });
    } finally {
      setRunning(false);
    }
  }

  const status = decision?.decision;
  const statusCopy = status === "ALLOW"
    ? "This action has enough verified evidence to receive permission."
    : status === "HOLD"
      ? decision?.reason === "telegraph_credentials_unavailable"
        ? "The trusted Telegraph verifier is not configured yet. No permission was issued."
        : "ProofGate could not verify enough independent evidence."
      : status === "BLOCK"
        ? decision?.reason === "mandate_amount_violation"
          ? "The proposed payment exceeds the delegated limit."
          : "This action violates the delegated authority or received disqualifying evidence."
        : "Ready to evaluate this exact action.";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ProofGate home"><span className="brand-mark">⌁</span><span>ProofGate</span></a>
        <div className="header-actions"><nav><a className="active" href="#try">Try ProofGate</a><a href="#developer">Developers</a><a href="#about">About</a></nav><button className="theme-toggle" type="button" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={darkMode} onClick={() => setDarkMode(value => !value)}><span className="theme-icon">{darkMode ? "☼" : "☾"}</span><span className="theme-label">{darkMode ? "Light" : "Dark"}</span></button></div>
      </header>
      <main id="try" className="page">
        <section className="hero" id="top">
          <div><h1>Proof before permission.</h1><p>Set what the agent is allowed to do, propose an action, and see whether ProofGate permits it.</p></div>
          <div className="context-pill"><span className="dot" /> Base Sepolia testnet <span>·</span> USDC</div>
        </section>
        <button className="example" onClick={() => { setLimit("10.00"); setAmount("7.00"); setReason("Pay supplier invoice"); setReference("INV-1042"); setDecision(null); }}>▣&nbsp; Try an example: Vendor invoice <span>⌄</span></button>
        <section className="cards">
          <article className="card">
            <div className="card-title"><span className="step">1</span><div><h2>Set the boundary</h2><p>What can this agent spend?</p></div></div>
            <label>Maximum per payment<div className="input-row amount-row"><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /><span>USDC</span></div></label>
            <label>Who can receive it<div className="static-field"><strong>ProofGate Vendor</strong><small>{VENDOR.slice(0, 6)}...{VENDOR.slice(-4)} · <em>Verified recipient</em></small></div></label>
            <label>Permission expires<div className="static-field">◷ <span>24 hours</span></div></label>
            <div className="callout blue">ⓘ&nbsp; This agent may spend up to <strong>{limit || "0.00"} USDC</strong> with this recipient.</div>
          </article>
          <article className="card">
            <div className="card-title"><span className="step">2</span><div><h2>Propose the action</h2><p>What should the agent do now?</p></div></div>
            <label>Payment amount<div className="input-row amount-row"><input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setDecision(null); }} /><span>USDC</span></div></label>
            <label>Recipient<div className="static-field"><strong>ProofGate Vendor</strong><small>{VENDOR.slice(0, 6)}...{VENDOR.slice(-4)}</small></div></label>
            <label>Why is this payment needed?<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <label>Reference, optional<input value={reference} placeholder="Invoice #, PO #, task id..." onChange={(e) => setReference(e.target.value)} /></label>
            <div className={`callout ${withinLimit ? "green" : "red"}`}>{withinLimit ? "✓" : "×"}&nbsp; {summary}</div>
          </article>
        </section>
        <div className="action-area"><button className="primary" onClick={runProofGate} disabled={running}>{running ? "Checking this action…" : "♢  Run ProofGate  →"}</button><small>⌑&nbsp; Checking authorization does not execute a payment.</small></div>
        <section className={`result ${status ? status.toLowerCase() : "neutral"}`} aria-live="polite"><div className="result-icon">{status === "BLOCK" ? "×" : status === "ALLOW" ? "✓" : status === "HOLD" ? "!" : "⌑"}</div><div><div className="result-heading">{status ? status : "Ready to evaluate"}</div><p>{statusCopy}</p>{status === "BLOCK" && <p className="detail">External intelligence is not queried when the mandate check fails.</p>}{status === "HOLD" && <p className="detail">No permission issued. No transaction sent.</p>}{status === "ALLOW" && <p className="detail">One-use permission ready. Execution has not happened.</p>}</div></section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
