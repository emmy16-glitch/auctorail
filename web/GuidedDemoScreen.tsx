import React, { useEffect, useMemo, useState } from "react";

interface GuidedDemoScreenProps {
  onBack: () => void;
  onLive: () => void;
  onActivity: () => void;
  onPermissions: () => void;
  onSecurityLab: () => void;
}

type Tone = "mint" | "rose" | "purple" | "yellow";
type Result = "EXECUTED (DEMO)" | "BLOCKED" | "HELD";
type DemoStep = { title: string; detail: string };
type Scenario = {
  n: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  tone: Tone;
  result: Result;
  amount: string;
  description: string;
  steps: DemoStep[];
};

const scenarios: Scenario[] = [
  { n: "01", title: "VALID REQUEST", shortTitle: "Valid Request", subtitle: "Exact authorization", tone: "mint", result: "EXECUTED (DEMO)", amount: "1.00", description: "Checking rules, verifying evidence, and executing the exact authorized action.", steps: [
    { title: "Request captured", detail: "Exact request snapshot." },
    { title: "Rules checked", detail: "Policy and permission rules match." },
    { title: "Evidence verified", detail: "Miner and runtime evidence valid." },
    { title: "Permit issued", detail: "Bound to request, cannot be replayed." },
    { title: "Executing action", detail: "Sending to execution layer (demo)." },
    { title: "Receipt created", detail: "Action completed exactly as authorized." }
  ] },
  { n: "02", title: "MODIFIED AMOUNT", shortTitle: "Modified Amount", subtitle: "Tampered after approval", tone: "rose", result: "BLOCKED", amount: "2.00", description: "The authorized amount is changed after approval. Auctorail must catch the mismatch before execution.", steps: [
    { title: "Request captured", detail: "Authorized request snapshot loaded." },
    { title: "Rules checked", detail: "Original request is still permitted." },
    { title: "Authorized amount", detail: "Expected amount is 1.00 USDC." },
    { title: "Amount modified", detail: "Observed amount changed to 2.00 USDC." },
    { title: "Binding mismatch", detail: "Action no longer matches authorization." },
    { title: "Execution blocked", detail: "No execution authority is accepted." }
  ] },
  { n: "03", title: "REPLAYED PERMIT", shortTitle: "Replayed Permit", subtitle: "Already consumed", tone: "purple", result: "BLOCKED", amount: "1.00", description: "A previously consumed permit is submitted again. Single-use enforcement must stop the replay.", steps: [
    { title: "Request captured", detail: "Exact authorized request loaded." },
    { title: "Permit found", detail: "Signed permit matches this request." },
    { title: "Permit checked", detail: "Consumption state is inspected." },
    { title: "Already consumed", detail: "Permit has already been used once." },
    { title: "Replay rejected", detail: "Single-use protection stops the replay." },
    { title: "Attempt recorded", detail: "Blocked replay is recorded for audit." }
  ] },
  { n: "04", title: "MISSING EVIDENCE", shortTitle: "Missing Evidence", subtitle: "Did not reach threshold", tone: "yellow", result: "HELD", amount: "1.00", description: "Rules pass, but the required evidence threshold is not reached. Auctorail holds instead of guessing.", steps: [
    { title: "Request captured", detail: "Exact request snapshot." },
    { title: "Rules checked", detail: "Policy and permission rules match." },
    { title: "Evidence requested", detail: "Required Miner evidence requested." },
    { title: "Threshold not reached", detail: "Available evidence is insufficient." },
    { title: "Authorization held", detail: "No execution authority is issued." },
    { title: "No execution sent", detail: "Vendor action remains untouched." }
  ] }
];

const symbols: Record<Tone, string> = { mint: "✓", rose: "⊘", purple: "⊘", yellow: "!" };

export function GuidedDemoScreen({ onBack, onLive, onActivity, onPermissions, onSecurityLab }: GuidedDemoScreenProps) {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const scenario = scenarios[scenarioIndex];
  const terminal = stepIndex === scenario.steps.length - 1;
  const absoluteStep = scenarioIndex * 6 + stepIndex + 1;
  const overallProgress = Math.min(100, (absoluteStep / (scenarios.length * 6)) * 100);

  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setTimeout(() => {
      if (!terminal) { setStepIndex((v) => v + 1); return; }
      if (scenarioIndex < scenarios.length - 1) { setScenarioIndex((v) => v + 1); setStepIndex(0); setDetailsOpen(false); return; }
      setPlaying(false);
      setFinished(true);
    }, terminal ? 2200 : 1250);
    return () => window.clearTimeout(timer);
  }, [playing, finished, terminal, scenarioIndex]);

  const completedCounts = useMemo(() => {
    const count = finished ? scenarios.length : scenarioIndex + (terminal ? 1 : 0);
    const done = scenarios.slice(0, count);
    return {
      executed: done.filter((i) => i.result === "EXECUTED (DEMO)").length,
      blocked: done.filter((i) => i.result === "BLOCKED").length,
      held: done.filter((i) => i.result === "HELD").length
    };
  }, [finished, scenarioIndex, terminal]);

  function selectScenario(index: number) {
    setScenarioIndex(index);
    setStepIndex(0);
    setFinished(false);
    setPlaying(true);
    setDetailsOpen(false);
  }

  function restart() { selectScenario(0); }
  function skip() {
    if (scenarioIndex < scenarios.length - 1) { selectScenario(scenarioIndex + 1); return; }
    setStepIndex(5);
    setPlaying(false);
    setFinished(true);
  }
  function nextScenario() {
    if (scenarioIndex < scenarios.length - 1) { selectScenario(scenarioIndex + 1); return; }
    setFinished(true);
    setPlaying(false);
  }

  const resultTitle = finished ? "DEMO COMPLETE" : terminal ? scenario.result : `${scenario.steps[stepIndex].title.toUpperCase()}...`;
  const resultCopy = finished ? "All deterministic scenarios completed." : scenario.steps[stepIndex].detail;

  return (
    <main data-testid="guided-demo-screen">
      <div className="screen-head">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onBack} style={{ marginBottom: 14 }}>← <span>BACK</span></button>
        <div>
          <span className="eyebrow">DEMO MODE · DETERMINISTIC · ZERO PAYMENTS</span>
          <h1>Watch Auctorail in action.</h1>
          <p>A short, automatic demo showing a successful authorization, blocked attacks and a hold case. No real payments.</p>
        </div>
      </div>

      <div className="card card-pad demo-player">
        <div className="demo-player-main">
          <button className="demo-play-box" type="button" onClick={() => setPlaying((v) => !v)} aria-label={playing ? "Pause demo" : "Play demo"}>{playing ? "Ⅱ" : "▶"}</button>
          <div>
            <strong>{finished ? "DEMO COMPLETE" : playing ? "DEMO IS PLAYING" : "DEMO PAUSED"}</strong>
            <span>Step {stepIndex + 1} of 6 · {scenario.steps[stepIndex].title.toLowerCase()}</span>
          </div>
        </div>
        <div className="demo-progress"><span style={{ width: `${overallProgress}%` }} /></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-sm" type="button" onClick={restart}>↻ <span>Restart</span></button>
          <button className="btn btn-sm" type="button" onClick={skip}>≫ <span>Skip</span></button>
          <button className="btn btn-sm btn-ghost" type="button" onClick={nextScenario}>{scenarioIndex < scenarios.length - 1 ? "Next Scenario →" : "Finish Demo"}</button>
        </div>
      </div>

      <div className="demo-layout" style={{ marginTop: 20 }}>
        <aside className="demo-rail" aria-label="Demo scenarios">
          {scenarios.map((item, index) => (
            <button key={item.n} type="button" className={`demo-rail-card tone-${item.tone} ${scenarioIndex === index ? "active" : ""}`} onClick={() => selectScenario(index)}>
              <b>{item.n}</b>
              <span><strong>{item.shortTitle}</strong><small>{item.subtitle}</small></span>
              <i aria-hidden="true">{symbols[item.tone]}</i>
            </button>
          ))}
        </aside>

        <section aria-label="Current scenario">
          <div style={{ marginBottom: 12 }}>
            <span className="eyebrow">SCENARIO {scenarioIndex + 1} OF 4</span>
            <h2 style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 640, letterSpacing: "-0.015em" }}>{scenario.shortTitle}</h2>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)" }}>{scenario.description}</p>
          </div>
          <ol className="demo-timeline">
            {scenario.steps.map((s, index) => {
              const complete = index < stepIndex || finished;
              const current = index === stepIndex && !finished;
              return (
                <li key={s.title} className={`tone-${scenario.tone} ${complete ? "complete" : ""} ${current ? "current" : ""}`}>
                  <span className="demo-node">{complete ? "✓" : current ? "●" : ""}</span>
                  <div><b>{s.title}</b><small>{s.detail}</small></div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside>
          <div className="demo-request-panel">
            <div className="drp-title"><strong>CURRENT REQUEST</strong></div>
            <pre className={detailsOpen ? "" : "collapsed"}>{`{\n  "action": "transfer",\n  "to": "0x742d...9f3a",\n  "amount": "${scenario.amount}",\n  "asset": "USDC",\n  "chain": "base-sepolia"\n}`}</pre>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setDetailsOpen((v) => !v)}>{detailsOpen ? "Hide details" : "View full details"}</button>
          </div>
          <div className="demo-result-panel">
            <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>RESULT</span>
            <div className={`drp-result ${scenario.tone}`}>{finished ? "✓ DEMO COMPLETE" : resultTitle}</div>
            <small>{resultCopy}</small>
          </div>
          {finished && (
            <div className="demo-complete">
              <strong>DEMO SUMMARY</strong>
              <div className="dc-counts">
                <span>✓ {completedCounts.executed} Executed</span>
                <span>⊘ {completedCounts.blocked} Blocked</span>
                <span>! {completedCounts.held} Held</span>
              </div>
              <p>Auctorail only executes actions that still match their authorization.</p>
              <div className="dc-actions">
                <button className="btn btn-sm" type="button" onClick={restart}>↻ REPLAY DEMO</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={onLive}>→ TRY LIVE MODE</button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        <button className="btn btn-sm" type="button" onClick={onActivity}>VIEW ACTIVITY</button>
        <button className="btn btn-sm" type="button" onClick={onPermissions}>VIEW PERMISSIONS</button>
        <button className="btn btn-sm" type="button" onClick={onSecurityLab}>OPEN SECURITY LAB</button>
      </div>
    </main>
  );
}
