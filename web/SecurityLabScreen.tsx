import React, { useState } from "react";
import "./security-lab-screen.css";

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

interface SecurityLabScreenProps {
  apiBase: string;
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 48 56" aria-hidden="true">
      <path d="M24 3 43 10v15c0 12-7.6 22.4-19 28C12.6 47.4 5 37 5 25V10L24 3Z" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function SecurityLabScreen({ apiBase }: SecurityLabScreenProps) {
  const [report, setReport] = useState<SecurityLabReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runLab() {
    if (running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const response = await fetch(`${apiBase}/api/security-lab`, { method: "POST" });
      const body = await response.json() as SecurityLabReport & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "security_lab_failed");
      setReport(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "security_lab_failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="security-shell" data-testid="security-lab-screen">
      <section className="security-hero">
        <span className="security-step">ATTACK THE GATE</span>
        <h1>Try to break<br />ProofGate.</h1>
        <p>Run deterministic tampering and replay attacks against the authorization boundary. This lab never substitutes fake evidence into the live CHECK flow.</p>
      </section>

      <section className="security-flow hard-shadow" aria-label="Security Lab flow">
        <div className="security-node purple"><b>01</b><strong>BUILD</strong><span>Start from a valid authorized action.</span></div>
        <div className="security-arrow" aria-hidden="true">↓</div>
        <div className="security-node"><b>02</b><strong>MUTATE</strong><span>Change recipient, permit, evidence, timing or replay state.</span></div>
        <div className="security-arrow" aria-hidden="true">↓</div>
        <div className="security-node mint"><b>03</b><strong>VERIFY</strong><span>ProofGate must stop the modified action before protected execution.</span></div>
      </section>

      <button className="run-security-button" type="button" onClick={runLab} disabled={running}>
        <span>{running ? "RUNNING ATTACKS..." : "RUN SECURITY LAB"}</span>
        <span aria-hidden="true">→</span>
      </button>

      {running && (
        <section className="security-running" role="status">
          <span className="security-spinner" aria-hidden="true" />
          <div><strong>Attacks in progress.</strong><span>Replay, mutation, expiry, evidence and receipt invariants are being exercised.</span></div>
        </section>
      )}

      {error && (
        <section className="security-error" role="alert">
          <strong>LAB STOPPED</strong>
          <span>{error}</span>
        </section>
      )}

      {report && (
        <section className={`security-report ${report.allPassed ? "passed" : "failed"}`} aria-label="Security Lab results">
          <div className="report-summary">
            <div>
              <span>RESULT</span>
              <strong>{report.allPassed ? "GATE HELD" : "ATTACK SUCCEEDED"}</strong>
            </div>
            <b>{report.passed}/{report.total}</b>
          </div>
          <p className="report-mode">{report.mode.replaceAll("_", " ")} · {report.policyId}</p>
          <div className="scenario-list">
            {report.scenarios.map((scenario) => (
              <details key={scenario.id} className={scenario.passed ? "scenario-pass" : "scenario-fail"}>
                <summary>
                  <span>{scenario.passed ? "✓" : "!"}</span>
                  <strong>{scenario.attack}</strong>
                  <b>{scenario.passed ? "BLOCKED" : "FAILED"}</b>
                </summary>
                <div>
                  <p><strong>EXPECTED</strong><br />{scenario.expected}</p>
                  <p><strong>OBSERVED</strong><br />{scenario.observed}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="security-note">
        <div><ShieldIcon /></div>
        <p><strong>Separate from live authorization.</strong><br />The lab attacks ProofGate's security invariants. The normal CHECK path continues to use real Telegraph routing and real x402 evidence.</p>
      </section>
    </main>
  );
}
