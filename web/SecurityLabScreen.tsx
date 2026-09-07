import React, { useEffect, useMemo, useRef, useState } from "react";

export interface SecurityLabScenario {
  id: string;
  attack: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface SecurityLabReport {
  schemaVersion: string;
  mode: string;
  policyId: string;
  baselineDecision: string;
  scenarios: SecurityLabScenario[];
  passed: number;
  total: number;
  allPassed: boolean;
}

interface SecurityLabScreenProps { apiBase: string; }

type Category = "action" | "permit" | "evidence" | "receipt";
type StepTone = "info" | "ok" | "warn" | "bad";

type AttackPreset = {
  id: string;
  category: Category;
  label: string;
  description: string;
  original: string;
  mutated: string;
  boundary: string;
  stoppedAt: string;
};

const PRESETS: AttackPreset[] = [
  { id: "recipient_mutation", category: "action", label: "Change payment recipient", description: "Request payment to a wallet the principal never delegated.", original: "Approved Vendor", mutated: "Attacker wallet", boundary: "Permission", stoppedAt: "Recipient delegation" },
  { id: "expired_permission", category: "permit", label: "Use expired permission", description: "Request authority after the principal's permission expires.", original: "Active permission", mutated: "Expired permission", boundary: "Permission", stoppedAt: "Mandate expiry" },
  { id: "missing_evidence", category: "evidence", label: "Remove required evidence", description: "Missing evidence must produce HOLD and no permit.", original: "Bound evidence", mutated: "No evidence", boundary: "Evidence", stoppedAt: "Policy evaluation" },
  { id: "amount_mutation", category: "action", label: "Modify payment amount", description: "Change the payment amount after a valid authorization has been created.", original: "1.00 USDC", mutated: "100.00 USDC", boundary: "Action Binding", stoppedAt: "Permit validation" },
  { id: "mandate_substitution", category: "action", label: "Change mandate version", description: "Rebind the permit to a different mandate version after authorization.", original: "Mandate v1", mutated: "Mandate v2", boundary: "Action Binding", stoppedAt: "Permit validation" },
  { id: "permit_replay", category: "permit", label: "Replay consumed permit", description: "Reuse a permit after the authorized action has already consumed it.", original: "Fresh permit", mutated: "Consumed permit", boundary: "Permit", stoppedAt: "Consumption guard" },
  { id: "permit_forgery", category: "permit", label: "Forge permit signature", description: "Alter the Ed25519 signature on an otherwise valid permit.", original: "Valid signature", mutated: "Forged signature", boundary: "Permit", stoppedAt: "Signature verification" },
  { id: "expired_permit", category: "permit", label: "Use expired permit", description: "Attempt execution after the permit's 30-second TTL.", original: "Within 30s TTL", mutated: "31s after mint", boundary: "Permit", stoppedAt: "Expiry validation" },
  { id: "decision_tamper", category: "permit", label: "Tamper authorization decision", description: "Alter the authorization decision after the permit has been minted.", original: "Original decision hash", mutated: "Modified decision reason", boundary: "Permit", stoppedAt: "Decision binding" },
  { id: "evidence_subject_swap", category: "evidence", label: "Swap evidence subject", description: "Replace vendor evidence with evidence bound to another address.", original: "Auctorail Vendor", mutated: "Different vendor", boundary: "Evidence", stoppedAt: "Evidence binding" },
  { id: "negative_miner", category: "evidence", label: "Force negative Miner verdict", description: "Keep runtime proof valid while the deterministic Telegraph verdict becomes BLOCK.", original: "Miner: ALLOW", mutated: "Miner: BLOCK", boundary: "Evidence", stoppedAt: "Policy evaluation" },
  { id: "runtime_attestation_tamper", category: "evidence", label: "Tamper runtime attestation", description: "Alter pinned runtime evidence while Telegraph still reports ALLOW.", original: "Pinned runtime", mutated: "Modified runtime", boundary: "Evidence", stoppedAt: "Runtime attestation" },
  { id: "receipt_tamper", category: "receipt", label: "Modify transaction hash", description: "Change the transaction hash inside a completed Proof Receipt.", original: "Signed receipt hash", mutated: "Altered tx hash", boundary: "Receipt", stoppedAt: "Receipt verification" }
];

const CATEGORY_TAG: Record<Category, string> = {
  action: "ACTION BINDING", permit: "PERMIT", evidence: "EVIDENCE", receipt: "RECEIPT"
};

function resultLabel(result: SecurityLabScenario): string {
  if (!result.passed) return "FAILED";
  if (result.id === "missing_evidence") return "HOLD";
  if (result.id === "receipt_tamper") return "TAMPER DETECTED";
  return "BLOCKED";
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

type LogLine = { t: string; text: string; tone: StepTone; cmd?: boolean };

export function SecurityLabScreen({ apiBase }: SecurityLabScreenProps) {
  const [presetId, setPresetId] = useState("amount_mutation");
  const [report, setReport] = useState<SecurityLabReport | null>(null);
  const [running, setRunning] = useState<"single" | "suite" | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [logStep, setLogStep] = useState(0);
  const [finishedRun, setFinishedRun] = useState<{ kind: "single" | "suite"; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(0);
  const selected = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];

  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { cancelRef.current += 1; requestRef.current?.abort(); }, []);

  async function fetchReport(): Promise<SecurityLabReport> {
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${apiBase}/api/security-lab`, { method: "POST", signal: controller.signal });
      const body = await response.json() as SecurityLabReport & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "security_lab_failed");
      if (body.schemaVersion !== "proofgate.attack-lab.v1" || body.mode !== "OFFLINE_DETERMINISTIC" ||
          !Array.isArray(body.scenarios) || body.scenarios.length === 0 ||
          body.scenarios.some(item => !item || typeof item.id !== "string" || typeof item.observed !== "string" || typeof item.expected !== "string" || typeof item.attack !== "string" || typeof item.passed !== "boolean" || item.passed !== (item.expected === item.observed)) ||
          new Set(body.scenarios.map(item => item.id)).size !== body.scenarios.length ||
          PRESETS.some(preset => !body.scenarios.some(item => item.id === preset.id))) {
        throw new Error("security_lab_invalid_report");
      }
      const attacks = body.scenarios.filter(item => item.id !== "baseline");
      const passed = attacks.filter(item => item.passed).length;
      const allPassed = body.baselineDecision === "ALLOW" && body.scenarios.find(item => item.id === "baseline")?.passed === true && passed === attacks.length;
      if (body.total !== attacks.length || body.passed !== passed || body.allPassed !== allPassed) throw new Error("security_lab_invalid_report");
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Security Lab timed out. Please retry.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  function animateLines(lines: LogLine[], stepMs: number, onDone: () => void) {
    const token = ++cancelRef.current;
    setLogLines([]);
    setLogStep(0);
    setFinishedRun(null);
    let i = 0;
    const tick = () => {
      if (token !== cancelRef.current) return;
      i += 1;
      setLogStep(i);
      setLogLines(lines.slice(0, i));
      if (i < lines.length) window.setTimeout(tick, stepMs);
      else window.setTimeout(() => { if (token === cancelRef.current) onDone(); }, 420);
    };
    window.setTimeout(tick, 120);
  }

  async function runSuite() {
    if (running) return;
    setRunning("suite"); setError(null); setFinishedRun(null); setReport(null); setLogLines([]);
    try {
      const body = await fetchReport();
      setReport(body);
      const attacks = body.scenarios.filter((item) => item.id !== "baseline");
      const lines: LogLine[] = [
        { t: "01", text: `suite --all ${attacks.length} --offline --harness`, tone: "info", cmd: true },
        ...attacks.map((item, index) => ({
          t: String(index + 2).padStart(2, "0"),
          text: `[${index + 1}/${attacks.length}] ${item.id} — ${resultLabel(item)} (${item.observed})`,
          tone: (item.passed ? "ok" : "bad") as StepTone
        })),
        { t: String(attacks.length + 2).padStart(2, "0"), text: `${body.passed}/${body.total} checks passed — ${body.allPassed ? "RAIL HELD" : "BOUNDARY FAILED"}`, tone: body.allPassed ? "ok" : "bad" }
      ];
      animateLines(lines, 125, () => { setRunning(null); setFinishedRun({ kind: "suite", time: nowLabel() }); });
    } catch (caught) {
      setRunning(null);
      setError(caught instanceof Error ? caught.message : "security_lab_failed");
    }
  }

  function chooseAttack(id: string) {
    const preset = PRESETS.find((item) => item.id === id);
    if (preset) void runSingleFor(preset);
  }

  const lastResult = useMemo(() => {
    if (finishedRun?.kind === "single") return report?.scenarios.find((item) => item.id === selected.id) ?? null;
    return null;
  }, [finishedRun, report, selected]);

  async function runSingleFor(preset: AttackPreset) {
    if (running) return;
    setPresetId(preset.id);
    setRunning("single"); setError(null); setFinishedRun(null); setReport(null); setLogLines([]);
    try {
      const body = await fetchReport();
      const result = body.scenarios.find((item) => item.id === preset.id);
      if (!result) throw new Error("attack_scenario_missing");
      setReport(body);
      const lines: LogLine[] = [
        { t: "01", text: `attack --id ${preset.id} --offline --harness`, tone: "info", cmd: true },
        { t: "02", text: `baseline loaded — deterministic authorization (${body.baselineDecision})`, tone: "info" },
        { t: "03", text: `mutation applied — ${preset.original} → ${preset.mutated}`, tone: "warn" },
        { t: "04", text: `${preset.boundary.toLowerCase()} recheck — ${result.observed}`, tone: "bad" },
        { t: "05", text: result.passed ? `expected check passed — ${resultLabel(result)} (${result.observed})` : `BOUNDARY FAILED — expected ${result.expected}`, tone: result.passed ? "ok" : "bad" }
      ];
      animateLines(lines, 240, () => { setRunning(null); setFinishedRun({ kind: "single", time: nowLabel() }); });
    } catch (caught) {
      setRunning(null);
      setError(caught instanceof Error ? caught.message : "security_lab_failed");
    }
  }

  const recent = report?.scenarios.filter((item) => item.id !== "baseline").slice(0, 4) ?? [];
  const suiteScore = report && finishedRun?.kind === "suite";

  return (
    <main data-testid="security-lab-screen">
      <div className="lab-intro">
        <div>
          <span className="eyebrow">SECURITY LAB · DETERMINISTIC</span>
          <h1>Try to break Auctorail.</h1>
          <p className="lab-lede">Pick an attack and the lab runs it — or run the full suite and inspect every observed result. This lab proves enforcement boundaries without pretending to be a live Miner run.</p>
        </div>
        <div className="note">
          <span style={{ fontSize: 20, color: "var(--accent)", display: "grid", placeItems: "center", width: 30, height: 30, border: "1px solid var(--line)", borderRadius: 8 }} aria-hidden="true">△</span>
          <div>
            <strong>SAFE · OFFLINE · ZERO REAL PAYMENTS</strong>
            <p>The lab is isolated from live checks. No Telegraph/x402 purchase or blockchain write is made. Every result comes from the deterministic attack harness.</p>
          </div>
        </div>
      </div>

      <div className="demo-layout v2-grid" style={{ marginTop: 6 }}>
        <section aria-label="Attack console">
          <div className="demo-console fade-rise">
            <div className="console-bar">
              <span className="console-title">
                <span className="console-dots" aria-hidden="true"><i /><i /><i /></span>
                auctorail lab — {presetId}{finishedRun ? ` · ${finishedRun.kind}` : running ? " · running" : " · idle"}
              </span>
              <select
                className="lab-attack-select"
                value={presetId}
                disabled={running !== null}
                onChange={(event) => chooseAttack(event.target.value)}
                aria-label="Select attack to run"
                title="Pick an attack — it runs immediately"
              >
                {PRESETS.map((item, index) => (
                  <option key={item.id} value={item.id}>ATK {String(index + 1).padStart(2, "0")} · {item.label}</option>
                ))}
              </select>
              <span className={`console-state ${running ? "running" : finishedRun ? "done" : "paused"}`}>
                {running ? "RUNNING" : finishedRun ? "COMPLETE" : "READY"}
              </span>
            </div>
            <div className="console-body">
              {logLines.length === 0 && <span className="console-line">select an attack — or run the full suite — and the harness takes it from there.</span>}
              {logLines.slice(0, logStep).map((line, i) => (
                <span key={i} className={`console-line ${line.tone === "info" && !line.cmd ? "" : line.tone} ${line.cmd ? "cmd" : ""}`}>
                  <span className="cl-t">{line.t}</span>
                  {line.cmd ? <span className="cl-cmd">{line.text}</span> : line.text}
                </span>
              ))}
              {running && <span className="console-cursor" aria-hidden="true" />}
            </div>
            <div className="console-controls">
              <button className="btn btn-primary btn-sm" type="button" onClick={() => void runSingleFor(selected)} disabled={running !== null}>
                {running === "single" ? "RUNNING ATTACK..." : "RUN ATTACK"}
              </button>
              <button className="btn btn-sm" type="button" onClick={runSuite} disabled={running !== null}>
                {running === "suite" ? "RUNNING SUITE..." : "RUN SUITE"}
              </button>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {report ? `${report.passed}/${report.total} BOUNDARIES HELD` : "DETERMINISTIC HARNESS"}
              </span>
            </div>
          </div>

          <div className="verdict-zone" style={{ marginTop: 18 }} aria-live="polite">
            {finishedRun?.kind === "single" && lastResult ? (
              <>
                <div className={`verdict-display ${lastResult.passed ? "rose" : "yellow"}`}>
                  {lastResult.passed ? (lastResult.id === "missing_evidence" ? "HOLD · NO PERMIT" : lastResult.id === "receipt_tamper" ? "TAMPER DETECTED" : "ATTACK BLOCKED") : "BOUNDARY FAILED"}
                </div>
                <p className="verdict-copy" style={{ margin: 0 }}>
                  {lastResult.passed
                    ? `The ${selected.stoppedAt.toLowerCase()} check returned the expected result. ${lastResult.id === "receipt_tamper" ? "The altered simulated receipt failed integrity verification." : lastResult.id === "missing_evidence" ? "Required evidence is missing; no permit was issued." : "No unauthorized effect was accepted by this offline check."}`
                    : "The expected security boundary did not hold — inspect the trace."}
                </p>
                <div className="kv" style={{ marginTop: 14, maxWidth: 560 }}>
                  <div><dt>REASON</dt><dd className="mono">{lastResult.observed}</dd></div>
                  <div><dt>EXPECTED</dt><dd className="mono">{lastResult.expected}</dd></div>
                  <div><dt>OBSERVED</dt><dd className="mono">{lastResult.observed}</dd></div>
                  <div><dt>BOUNDARY</dt><dd>{selected.boundary} · stopped at {selected.stoppedAt}</dd></div>
                  <div><dt>TIME</dt><dd className="mono">{finishedRun.time}</dd></div>
                </div>
              </>
            ) : finishedRun?.kind === "suite" && report ? (
              <>
                <div className={`verdict-display ${report.allPassed ? "mint" : "yellow"}`}><span>{report.allPassed ? "RAIL HELD" : "BOUNDARY FAILED"}</span> <span className="verdict-count">{report.passed}/{report.total}</span></div>
                <p className="verdict-copy" style={{ margin: 0 }}>
                  {report.allPassed
                    ? `All ${report.total} deterministic checks returned their expected result, including fail-closed HOLD and receipt integrity.`
                    : "The full suite did not hold — review the scenario report below."}
                </p>
              </>
            ) : (
              <p className="verdict-copy" style={{ margin: 0 }}>
                <span style={{ fontFamily: "var(--mono)", color: "var(--text-3)" }}>awaiting run · </span>
                {selected.description}
              </p>
            )}
          </div>

          {error && <div className="lab-error" role="alert" style={{ marginTop: 14 }}><strong>LAB STOPPED</strong><span>{error}</span></div>}

          {report && (
            <div className="card card-pad" style={{ marginTop: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <span className="eyebrow">RECENT ATTACKS</span>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>LATEST SUITE</span>
              </div>
              <div className="recent-list">
                {recent.map((item) => (
                  <div key={item.id}>
                    <span>{item.attack}</span>
                    <b className={item.passed ? "ok" : "fail"}>{resultLabel(item)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside aria-label="Attack details">
          <div className="demo-request-panel">
            <div className="drp-title"><strong>MUTATION · {CATEGORY_TAG[selected.category]}</strong></div>
            <pre>{`authorized : ${selected.original}\nmutated    : ${selected.mutated}\nfixture    : offline attested-vendor policy\npermit TTL : 30 seconds`}</pre>
            <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>BOUNDARY&nbsp;&nbsp;&nbsp;{selected.boundary}</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--text-3)" }}>STOPPED AT&nbsp;{selected.stoppedAt}</span>
            </div>
          </div>
          <div className="demo-result-panel">
            <span className="eyebrow" style={{ display: "block", marginBottom: 6 }}>SUITE SCORE</span>
            <div className={`drp-result ${suiteScore ? (report?.allPassed ? "mint" : "rose") : ""}`}>
              {report ? (suiteScore ? `${report.allPassed ? "RAIL HELD" : "BOUNDARY FAILED"} ${report.passed}/${report.total}` : `${report.passed}/${report.total} · AWAITING SUITE`) : "AWAITING RUN"}
            </div>
            <small>{report?.allPassed ? "Every check returned its expected result." : "Run the suite to verify every invariant."}</small>
          </div>
        </aside>
      </div>
    </main>
  );
}
