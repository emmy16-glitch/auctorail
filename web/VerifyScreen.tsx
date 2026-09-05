import React, { useEffect, useState } from "react";
import "./verify-screen.css";

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
    <main className="verify-proof" data-testid="verify-screen">
      <section className="verify-hero">
        <div>
          <span className="verify-eyebrow">PUBLIC VERIFIER</span>
          <h1>Verify the proof,<br />not the screenshot.</h1>
          <p>Paste an Auctorail receipt JSON, receipt hash, receipt ID, or recorded Base Sepolia transaction hash. Auctorail recomputes the receipt integrity and checks the bindings it can verify locally.</p>
        </div>
        <div className="verify-principle">
          <strong>WHAT THIS PROVES</strong>
          <span>Receipt integrity</span>
          <span>Exact action binding</span>
          <span>Evidence commitment</span>
          <span>Decision / permit consistency</span>
          <span>Recorded execution reference</span>
        </div>
      </section>

      <section className="verify-grid">
        <div className="verify-input-card">
          <div className="verify-card-head">
            <span>INPUT</span>
            <button type="button" onClick={loadCanonical}>LOAD CANONICAL PROOF</button>
          </div>
          <textarea
            aria-label="Receipt, receipt hash, receipt ID, or transaction hash"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste receipt JSON, 0x receipt hash, receipt ID, or Base Sepolia transaction hash…"
          />
          <div className="verify-input-actions">
            <label className="verify-file-button">
              UPLOAD JSON
              <input type="file" accept="application/json,.json" onChange={loadFile} />
            </label>
            <button className="verify-submit" type="button" disabled={!input.trim() || status === "checking"} onClick={() => void verify()}>
              {status === "checking" ? "VERIFYING…" : "VERIFY PROOF"}
            </button>
          </div>
          <div className="verify-examples">
            <span>CANONICAL PAYMENT TX</span>
            <code>{canonicalTx}</code>
          </div>
          {error && <div className="verify-error" role="alert"><strong>NOT VERIFIED</strong><span>{error}</span></div>}
        </div>

        <div className={`verify-result-card ${result ? (result.valid ? "valid" : "invalid") : "idle"}`} aria-live="polite">
          {!result ? (
            <div className="verify-empty">
              <span>VERIFICATION RESULT</span>
              <strong>{status === "checking" ? "CHECKING BINDINGS" : "WAITING FOR PROOF"}</strong>
              <p>A receipt hash alone is looked up only in Auctorail's local public receipt store. Unknown hashes are not treated as valid just because they look cryptographic.</p>
            </div>
          ) : (
            <>
              <div className="verify-verdict">
                <span>VERIFICATION</span>
                <strong>{result.valid ? "VALID" : "INVALID"}</strong>
                <p>{result.summaryLine ?? result.code}</p>
                <small>{result.kind?.toUpperCase() ?? "UNKNOWN"} RECEIPT</small>
              </div>

              <div className="verify-checks">
                {(result.checks ?? []).map((check) => (
                  <div key={`${check.label}-${check.status}`}>
                    <span>{check.label}</span>
                    <strong>{check.status}</strong>
                  </div>
                ))}
              </div>

              <dl className="verify-meta">
                <div><dt>RECEIPT ID</dt><dd>{result.receiptId ?? "—"}</dd></div>
                <div><dt>RECEIPT HASH</dt><dd>{result.receiptHash ?? "—"}</dd></div>
                <div><dt>DECISION</dt><dd>{result.decision ?? "—"}</dd></div>
                {result.transactionHash && <div><dt>TRANSACTION</dt><dd>{result.transactionHash}</dd></div>}
              </dl>

              <div className="verify-result-actions">
                {result.explorerUrl && (
                  <a href={result.explorerUrl} target="_blank" rel="noreferrer">OPEN BASESCAN ↗</a>
                )}
                {result.receipt && (
                  <button type="button" onClick={() => setShowJson((value) => !value)}>{showJson ? "HIDE RECEIPT" : "VIEW RECEIPT"}</button>
                )}
              </div>

              {showJson && result.receipt && (
                <pre className="verify-json">{JSON.stringify(result.receipt, null, 2)}</pre>
              )}
            </>
          )}
        </div>
      </section>

      <section className="verify-disclaimer">
        <strong>BOUND PROOF ≠ OBJECTIVE TRUTH</strong>
        <p>A valid Auctorail receipt proves that the receipt body and its recorded action/evidence/decision relationships have not been altered under Auctorail's verification rules. For payment receipts, the transaction hash links to Base Sepolia for independent chain inspection. For content receipts, Miner assessments remain evidence — not a claim that Auctorail can prove objective reality.</p>
      </section>
    </main>
  );
}
