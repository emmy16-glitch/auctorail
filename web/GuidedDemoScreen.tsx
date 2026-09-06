import React, { useEffect, useMemo, useRef, useState } from "react";

interface GuidedDemoScreenProps {
  onBack: () => void;
  onLive: () => void;
  onActivity: () => void;
  onPermissions: () => void;
  onSecurityLab: () => void;
}

type Tone = "mint" | "rose" | "purple" | "yellow";
type Result = "EXECUTED (DEMO)" | "BLOCKED" | "HELD";
type StepTone = "info" | "ok" | "warn" | "bad";
type DemoStep = { title: string; detail: string; tone: StepTone };
type Scenario = {
  n: string;
  id: string;
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
  {
    n: "01", id: "valid_request", title: "VALID REQUEST", shortTitle: "Valid Request",
    subtitle: "Exact authorization", tone: "mint", result: "EXECUTED (DEMO)", amount: "1.00",
    description: "Rules pass, evidence is complete, and the exact authorized action executes.",
    steps: [
      { title: "Request captured", detail: "Exact request snapshot hashed and frozen.", tone: "info" },
      { title: "Rules checked", detail: "Permission, limit, recipient and window all match.", tone: "ok" },
      { title: "Evidence verified", detail: "Miner and runtime evidence valid and bound.", tone: "ok" },
      { title: "Permit issued", detail: "One-use permit bound to this exact action.", tone: "ok" },
      { title: "Executing action", detail: "Sending the exact action to execution (demo).", tone: "info" },
      { title: "Receipt created", detail: "Completed exactly as authorized. Proof written.", tone: "ok" }
    ]
  },
  {
    n: "02", id: "modified_amount", title: "MODIFIED AMOUNT", shortTitle: "Modified Amount",
    subtitle: "Tampered after approval", tone: "rose", result: "BLOCKED", amount: "2.00",
    description: "The amount is changed after approval. The rail must catch the mismatch before execution.",
    steps: [
      { title: "Request captured", detail: "Authorized request snapshot loaded.", tone: "info" },
      { title: "Rules checked", detail: "Original request is still within permission.", tone: "ok" },
      { title: "Authorized amount", detail: "Expected amount is 1.00 USDC.", tone: "info" },
      { title: "Amount modified", detail: "Observed amount changed to 2.00 USDC.", tone: "bad" },
      { title: "Binding mismatch", detail: "action_hash_mismatch — no longer the same action.", tone: "bad" },
      { title: "Execution blocked", detail: "No execution authority is accepted.", tone: "bad" }
    ]
  },
  {
    n: "03", id: "replayed_permit", title: "REPLAYED PERMIT", shortTitle: "Replayed Permit",
    subtitle: "Already consumed", tone: "purple", result: "BLOCKED", amount: "1.00",
    description: "A consumed permit is submitted again. Single-use enforcement stops the replay.",
    steps: [
      { title: "Request captured", detail: "Exact authorized request loaded.", tone: "info" },
      { title: "Permit found", detail: "Signed permit matches this request.", tone: "info" },
      { title: "Permit checked", detail: "Consumption state inspected.", tone: "info" },
      { title: "Already consumed", detail: "permit_already_consumed — used once, dies.", tone: "bad" },
      { title: "Replay rejected", detail: "Single-use protection stops the replay.", tone: "bad" },
      { title: "Attempt recorded", detail: "Blocked replay recorded for audit.", tone: "warn" }
    ]
  },
  {
    n: "04", id: "missing_evidence", title: "MISSING EVIDENCE", shortTitle: "Missing Evidence",
    subtitle: "Did not reach threshold", tone: "yellow", result: "HELD", amount: "1.00",
    description: "Rules pass, but the evidence threshold is not reached. Auctorail holds instead of guessing.",
    steps: [
      { title: "Request captured", detail: "Exact request snapshot hashed and frozen.", tone: "info" },
      { title: "Rules checked", detail: "Permission, limit, recipient and window all match.", tone: "ok" },
      { title: "Evidence requested", detail: "Required Miner evidence requested.", tone: "info" },
      { title: "Threshold not reached", detail: "Available evidence is insufficient.", tone: "warn" },
      { title: "Authorization held", detail: "No execution authority is issued.", tone: "warn" },
      { title: "No execution sent", detail: "Vendor action remains untouched.", tone: "warn" }
    ]
  }
];

const toneClass: Record<StepTone, string> = { info: "", ok: "ok", warn: "warn", bad: "bad" };

export function GuidedDemoScreen({ onBack, onLive, onActivity, onPermissions, onSecurityLab }: GuidedDemoScreenProps) {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [ranScenarios, setRanScenarios] = useState<Set<number>>(new Set());
  const scenario = scenarios[scenarioIndex];
  const terminal = stepIndex === scenario.steps.length - 1;
  const absoluteStep = scenarioIndex * 6 + stepIndex + 1;
  const overallProgress = Math.min(100, (absoluteStep / (scenarios.length * 6)) * 100);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setTimeout(() => {
      if (!terminal) { setStepIndex((v) => v + 1); return; }
      setRanScenarios((prev) => new Set(prev).add(scenarioIndex));
      if (scenarioIndex < scenarios.length - 1) { setScenarioIndex((v) => v + 1); setStepIndex(0); return; }
      setPlaying(false);
      setFinished(true);
    }, terminal ? 2400 : 1100);
    return () => window.clearTimeout(timer);
  }, [playing, finished, terminal, scenarioIndex, stepIndex]);

  const logLines = useMemo(() => {
    const lines: { t: string; text: string; tone: StepTone; cmd?: boolean }[] = [];
    lines.push({ t: "+0.0s", text: `run --scenario ${scenario.id} --network base-sepolia --demo`, tone: "info", cmd: true });
    for (let i = 0; i <= Math.min(stepIndex, scenario.steps.length - 1); i++) {
      const step = scenario.steps[i];
      lines.push({ t: `+${(i * 0.7 + 0.7).toFixed(1)}s`, text: `${step.title.toLowerCase()} — ${step.detail}`, tone: step.tone });
    }
    return lines;
  }, [scenario, stepIndex]);

  const completedCounts = useMemo(() => {
    const done = scenarios.filter((_, i) => ranScenarios.has(i) || (finished && i === scenarioIndex));
    return {
      executed: done.filter((i) => i.result === "EXECUTED (DEMO)").length,
      blocked: done.filter((i) => i.result === "BLOCKED").length,
      held: done.filter((i) => i.result === "HELD").length
    };
  }, [finished, ranScenarios, scenarioIndex]);

  function selectScenario(index: number) {
    setScenarioIndex(index);
    setStepIndex(0);
    setFinished(false);
    setPlaying(true);
  }

  function restart() { selectScenario(0); setRanScenarios(new Set()); }

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

  const scenarioDone = terminal;
  const verdictTone = finished ? "mint" : scenarioDone ? scenario.tone : null;
  const verdictText = finished ? "DEMO COMPLETE" : scenarioDone ? scenario.result : "RUNNING";
  const verdictCopy = finished
    ? "All four deterministic scenarios completed. The rails held where they were supposed to."
    : scenarioDone
      ? scenario.description
      : scenario.steps[stepIndex].detail;

  return (
    <main data-testid="guided-demo-screen">
      <div className="screen-head">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onBack} style={{ marginBottom: 14 }}>← <span>BACK</span></button>
        <div>
          <span className="eyebrow">DEMO MODE · DETERMINISTIC · ZERO PAYMENTS</span>
          <h1>Watch Auctorail in action.</h1>
          <p>Pick a scenario and run it. Auctorail executes the exact check sequence against frozen, deterministic data — success, tamper, replay and hold. No real payments.</p>
        </div>
      </div>

      <div className="scenario-cards" role="group" aria-label="Demo scenarios">
        {scenarios.map((item, index) => (
          <button
            key={item.n}
            type="button"
            className={`scenario-card ${scenarioIndex === index ? "active" : ""}`}
            onClick={() => selectScenario(index)}
            aria-pressed={scenarioIndex === index}
          >
            <span className="sc-top">
              <span className="sc-num">SCN {item.n}</span>
              <span className={`sc-result ${item.tone}`}>{item.result}</span>
            </span>
            <strong>{item.shortTitle}</strong>
            <small>{item.subtitle}</small>
            {(ranScenarios.has(index) || (finished && index === scenarioIndex)) && <span className="sc-ran" aria-label="scenario run">✓</span>}
          </button>
        ))}
      </div>

      <div className="demo-layout v2-grid" style={{ marginTop: 6 }}>
        <section aria-label="Demo console">
          <div className="demo-console fade-rise">
            <div className="console-bar">
              <span className="console-title">
                <span className="console-dots" aria-hidden="true"><i /><i /><i /></span>
                auctorail demo — scenario {scenario.n} · {scenario.id}
              </span>
              <span className={`console-state ${playing ? "running" : finished ? "done" : "paused"}`}>
                {playing ? "RUNNING" : finished ? "COMPLETE" : "PAUSED"}
              </span>
            </div>
            <div className="console-body" ref={bodyRef}>
              {logLines.map((line, i) => (
                <span key={`${scenario.n}:${i}`} className={`console-line ${toneClass[line.tone]} ${line.cmd ? "cmd" : ""}`}>
                  <span className="cl-t">{line.t}</span>
                  {line.cmd ? <span className="cl-cmd">{line.text}</span> : line.text}
                </span>
              ))}
              {!finished && <span className="console-cursor" aria-hidden="true" />}
            </div>
            <div className="console-controls">
              <button className="btn btn-sm" type="button" aria-label={playing ? "Pause demo" : "Play demo"} onClick={() => setPlaying((v) => !v)}>
                {playing ? "Ⅱ PAUSE" : "▶ RUN"}
              </button>
              <button className="btn btn-sm" type="button" onClick={skip}>≫ <span>SKIP</span></button>
              <button className="btn btn-sm btn-ghost" type="button" onClick={nextScenario}>
                {scenarioIndex < scenarios.length - 1 ? "NEXT SCENARIO →" : "FINISH"}
              </button>
              <div className="console-progress" aria-hidden="true"><span style={{ width: `${overallProgress}%` }} /></div>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {scenarioIndex + 1}/4 · STEP {stepIndex + 1}/6
              </span>
            </div>
          </div>

          <div className="verdict-zone" style={{ marginTop: 18 }} aria-live="polite">
            {verdictTone ? (
              <>
                <div className={`verdict-display ${verdictTone}`}>{verdictText}</div>
                <p className="verdict-copy" style={{ margin: 0 }}>{verdictCopy}</p>
              </>
            ) : (
              <p className="verdict-copy" style={{ margin: 0 }}>
                <span style={{ fontFamily: "var(--mono)", color: "var(--text-3)" }}>awaiting completion · </span>
                {scenario.steps[stepIndex].title.toLowerCase()} — {scenario.steps[stepIndex].detail}
              </p>
            )}
          </div>

          {finished && (
            <div className="demo-complete" style={{ marginTop: 18 }}>
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
        </section>

        <aside aria-label="Demo details">
          <div className="demo-request-panel">
            <div className="drp-title"><strong>CURRENT REQUEST</strong></div>
            <pre>{`{\n  "action": "transfer",\n  "to": "0x742d...9f3a",\n  "amount": "${scenario.amount}",\n  "asset": "USDC",\n  "chain": "base-sepolia"\n}`}</pre>
          </div>
          <div className="demo-result-panel">
            <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>RESULT</span>
            <div className={`drp-result ${scenarioDone || finished ? scenario.tone : ""}`}>
              {finished ? "✓ DEMO COMPLETE" : scenarioDone ? scenario.result : "IN PROGRESS"}
            </div>
            <small>{verdictCopy}</small>
          </div>
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
