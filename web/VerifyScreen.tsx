import React, { useEffect, useState } from "react";
import { ShieldIcon } from "./icons";

type VerifyCheck = { label: string; status: string };
type VerifyResponse = {
  valid: boolean;
  kind?: "payment" | "content" | "unknown";
  code: string;
  receiptId?: string;
  receiptHash?: string;
  summaryLine?: string;
  decision?: string | null;
  transactionHash?: string | null;
  explorerUrl?: string | null;
  checks?: VerifyCheck[];
  receipt?: Record<string, unknown>;
};

interface VerifyScreenProps {
  initialInput?: string;
}

const canonicalHash = "0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3";
const canonicalTx = "0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc";

function utilityUrl(path: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const base = (env.VITE_AUCTORAIL_UTILITY_API_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

export function VerifyScreen({ initialInput = "" }: VerifyScreenProps) {
  const [input, setInput] = useState(initialInput);
  const [status, setStatus] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    setInput(initialInput);
    setResult(null);
    setStatus("idle");
    setError(null);
  }, [initialInput]);

  async function verify(value = input) {
    const candidate = value.trim();
    if (!candidate) return;
    setStatus("checking");
    setError(null);
    setResult(null);
    setShowJson(false);
    try {
      const response = await fetch(utilityUrl("/api/verify-proof"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: candidate })
      });
      const body = await response.json() as VerifyResponse & { error?: string };
      if (!response.ok) throw new Error(body.code ?? body.error ?? `verify_http_${response.status}`);
      setResult(body);
      setStatus("done");
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "proof_verification_failed";
      setError(code.replaceAll("_", " "));
      setStatus("error");
    }
  }

  function loadCanonical() {
    setInput(canonicalHash);
    void verify(canonicalHash);
  }

  async function loadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      setError("Receipt file is too large.");
      return;
    }
    const text = await file.text();
    setInput(text);
    setResult(null);
    setStatus("idle");
  }

  return (
    <main data-testid="verify-screen">
      <div className="screen-head">
        <span className="eyebrow">PUBLIC VERIFIER</span>
        <h1>Verify the proof, not the screenshot.</h1>
        <p>Paste an Auctorail receipt JSON, receipt hash, receipt ID, or recorded Base Sepolia transaction hash. Auctorail recomputes the receipt integrity and checks the bindings it can verify locally.</p>
      </div>

      <div className="verify-layout">
        <section className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span className="eyebrow">INPUT</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={loadCanonical}>LOAD CANONICAL PROOF</button>
          </div>

          <textarea
            className="input"
            aria-label="Receipt, receipt hash, receipt ID, or transaction hash"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste receipt JSON, 0x receipt hash, receipt ID, or Base Sepolia transaction hash…"
          />

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary" type="button" disabled={!input.trim() || status === "checking"} onClick={() => void verify()}>
              {status === "checking" ? "VERIFYING…" : "VERIFY PROOF"}
            </button>
            <label className="btn btn-sm" style={{ cursor: "pointer" }}>
              UPLOAD JSON
              <input type="file" accept="application/json,.json" onChange={loadFile} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 4 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>CANONICAL PAYMENT TX</span>
            <code style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text-3)", overflowWrap: "anywhere" }}>{canonicalTx}</code>
          </div>

          {error && <div className="lab-error" role="alert" style={{ marginTop: 14 }}><strong>NOT VERIFIED</strong><span>{error}</span></div>}
        </section>

        <div aria-live="polite" style={{ display: "grid", gap: 16 }}>
          {!result ? (
            <div className="result-empty">
              <ShieldIcon style={{ width: 26, height: 31, opacity: 0.6 }} />
              <span className="eyebrow">VERIFICATION RESULT</span>
              <strong>{status === "checking" ? "CHECKING BINDINGS" : "WAITING FOR PROOF"}</strong>
              <p>A receipt hash alone is looked up only in Auctorail's local public receipt store. Unknown hashes are not treated as valid just because they look cryptographic.</p>
            </div>
          ) : (
            <>
              <div className={`verify-verdict ${result.valid ? "v-valid" : "v-invalid"}`}>
                <span className="eyebrow">VERIFICATION</span>
                <strong>{result.valid ? "VALID" : "INVALID"}</strong>
                <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.55 }}>{result.summaryLine ?? result.code}</p>
                <small className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{result.kind?.toUpperCase() ?? "UNKNOWN"} RECEIPT</small>
              </div>

              {(result.checks ?? []).length > 0 && (
                <div className="card card-pad" style={{ padding: 18 }}>
                  <span className="eyebrow" style={{ display: "block", marginBottom: 10 }}>BINDING CHECKS</span>
                  <div className="check-list">
                    {(result.checks ?? []).map((check) => {
                      const positive = new Set(["PASS", "BOUND", "ALLOW", "EXECUTED", "CONFIRMED"]).has(check.status);
                      return (
                        <div key={`${check.label}-${check.status}`} className={`check-item ${positive ? "pass" : "fail"}`}>
                          <span className="ci-mark">{positive ? "✓" : "×"}</span>
                          <span>{check.label} · <strong style={{ fontWeight: 650, color: positive ? "var(--ok)" : "var(--block)" }}>{check.status}</strong></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="card card-pad" style={{ padding: 18 }}>
                <dl className="kv">
                  <div><dt>RECEIPT ID</dt><dd className="mono">{result.receiptId ?? "—"}</dd></div>
                  <div><dt>RECEIPT HASH</dt><dd className="mono" style={{ overflowWrap: "anywhere" }}>{result.receiptHash ?? "—"}</dd></div>
                  <div><dt>DECISION</dt><dd>{result.decision ?? "—"}</dd></div>
                  {result.transactionHash && <div><dt>TRANSACTION</dt><dd className="mono" style={{ overflowWrap: "anywhere" }}>{result.transactionHash}</dd></div>}
                </dl>
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  {result.explorerUrl && (
                    <a className="explorer-link" href={result.explorerUrl} target="_blank" rel="noreferrer">OPEN BASESCAN ↗</a>
                  )}
                  {result.receipt && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowJson((value) => !value)}>{showJson ? "HIDE RECEIPT" : "VIEW RECEIPT"}</button>
                  )}
                </div>
                {showJson && result.receipt && (
                  <div className="verify-json" style={{ marginTop: 14 }}><pre>{JSON.stringify(result.receipt, null, 2)}</pre></div>
                )}
              </div>
            </>
          )}

          <div className="note">
            <ShieldIcon />
            <div>
              <strong>BOUND PROOF ≠ OBJECTIVE TRUTH</strong>
              <p>A valid Auctorail receipt proves that the receipt body and its recorded action/evidence/decision relationships have not been altered under Auctorail's verification rules. For payment receipts, the transaction hash links to Base Sepolia for independent chain inspection. For content receipts, Miner assessments remain evidence — not a claim that Auctorail can prove objective reality.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
