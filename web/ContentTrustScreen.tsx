import React, { useMemo, useState } from "react";
import "./content-trust-screen.css";

type ContentMode = "demo" | "live";
type ProposedAction = "view" | "share" | "publish";
type AuthorshipClaim = "unspecified" | "human" | "ai-assisted";

type ContentSignal = {
  source: "telegraph" | "deterministic_demo";
  kind: "SCAM" | "DEEPFAKE" | "AI_GENERATED";
  minerId: string;
  minerName: string;
  intent: string;
  label: string;
  confidence: number | null;
  signalHash?: string | null;
};

type ContentReceipt = {
  schemaVersion: string;
  receiptId: string;
  receiptHash: string;
  summaryLine: string;
  decision: { decision: "ALLOW" | "HOLD" | "BLOCK" };
};

type ContentCheckResponse = {
  mode: "LIVE_TELEGRAPH_X402" | "DETERMINISTIC_DEMO";
  realTelegraph: boolean;
  spendRaw: string;
  decision: "ALLOW" | "HOLD" | "BLOCK";
  reason: string;
  subjectHash: string;
  signals: ContentSignal[];
  summaryLine: string;
  receipt: ContentReceipt;
};

interface ContentTrustScreenProps {
  onVerifyReceipt: (receiptJson: string) => void;
}

const sample = "URGENT: Your account is suspended. Verify your wallet immediately and send crypto to restore access.";

function utilityUrl(path: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const base = (env.VITE_AUCTORAIL_UTILITY_API_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

function confidence(value: number | null): string {
  return value === null ? "NOT PROVIDED" : `${Math.round(value * 100)}%`;
}

export function ContentTrustScreen({ onVerifyReceipt }: ContentTrustScreenProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ContentMode>("demo");
  const [proposedAction, setProposedAction] = useState<ProposedAction>("view");
  const [authorshipClaim, setAuthorshipClaim] = useState<AuthorshipClaim>("unspecified");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<ContentCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canRun = text.trim().length > 0 && status !== "running";
  const verdictClass = useMemo(() => result ? result.decision.toLowerCase() : "idle", [result]);

  async function runCheck() {
    if (!canRun) return;
    setStatus("running");
    setError(null);
    setResult(null);
    try {
      const response = await fetch(utilityUrl("/api/content-check"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          text: text.trim(),
          proposedAction,
          authorshipClaim
        })
      });
      const body = await response.json() as ContentCheckResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `content_check_http_${response.status}`);
      setResult(body);
      setStatus("done");
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "content_check_failed";
      setError(
        code === "content_live_disabled"
          ? "Live Content Trust is disabled on this deployment. Demo mode remains available and makes no Miner payment."
          : code === "telegraph_credentials_unavailable"
            ? "Live Telegraph credentials are not configured on this deployment."
            : code.replaceAll("_", " ")
      );
      setStatus("error");
    }
  }

  async function shareResult() {
    if (!result) return;
    const shareText = `${result.summaryLine}\nReceipt: ${result.receipt.receiptHash}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Auctorail Content Check", text: shareText });
        return;
      } catch {
        // User cancellation falls through to clipboard when available.
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="content-trust" data-testid="content-trust-screen">
      <section className="content-trust-hero">
        <div>
          <span className="content-eyebrow">CONTENT TRUST / POLICY content.strict.v1</span>
          <h1>Check the evidence<br />before you act.</h1>
          <p>Paste a message. Auctorail binds the exact content, evaluates evidence, and returns one conservative decision: ALLOW, HOLD, or BLOCK.</p>
        </div>
        <aside className={`content-mode-note ${mode}`}>
          <strong>{mode === "live" ? "LIVE TELEGRAPH + x402" : "DETERMINISTIC DEMO"}</strong>
          <span>{mode === "live" ? "Real Miner calls may spend the configured evidence budget." : "Zero Miner payments. Zero blockchain writes."}</span>
        </aside>
      </section>

      <section className="content-workbench">
        <div className="content-input-panel">
          <div className="content-panel-head">
            <div><span>01</span><strong>PASTE CONTENT</strong></div>
            <button type="button" onClick={() => setText(sample)}>LOAD SCAM SAMPLE</button>
          </div>
          <textarea
            aria-label="Content to check"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste a suspicious message, post text, or claim here…"
            maxLength={8000}
          />
          <div className="content-count">{text.length.toLocaleString()} / 8,000</div>

          <fieldset className="content-choice">
            <legend>02 · WHAT ARE YOU ABOUT TO DO?</legend>
            <div className="content-segments">
              {(["view", "share", "publish"] as ProposedAction[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  className={proposedAction === action ? "active" : ""}
                  onClick={() => setProposedAction(action)}
                >{action.toUpperCase()}</button>
              ))}
            </div>
          </fieldset>

          {proposedAction === "publish" && (
            <fieldset className="content-choice content-authorship">
              <legend>AUTHORSHIP CLAIM</legend>
              <div className="content-segments content-segments-three">
                {([
                  ["unspecified", "UNSPECIFIED"],
                  ["human", "HUMAN"],
                  ["ai-assisted", "AI-ASSISTED"]
                ] as [AuthorshipClaim, string][]).map(([value, label]) => (
                  <button key={value} type="button" className={authorshipClaim === value ? "active" : ""} onClick={() => setAuthorshipClaim(value)}>{label}</button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="content-choice">
            <legend>03 · EVIDENCE MODE</legend>
            <div className="content-mode-switch">
              <button type="button" className={mode === "demo" ? "active" : ""} onClick={() => setMode("demo")}>DEMO · FREE</button>
              <button type="button" className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}>LIVE TELEGRAPH</button>
            </div>
          </fieldset>

          <button className="content-run" type="button" disabled={!canRun} onClick={runCheck}>
            {status === "running" ? "CHECKING EVIDENCE…" : mode === "live" ? "CHECK WITH TELEGRAPH" : "RUN CONTENT CHECK"}
          </button>
          {error && <div className="content-error" role="alert"><strong>CHECK STOPPED</strong><span>{error}</span></div>}
        </div>

        <div className={`content-result-panel ${verdictClass}`} aria-live="polite">
          {!result ? (
            <div className="content-empty-state">
              <span>RESULT</span>
              <strong>{status === "running" ? "ACQUIRING EVIDENCE" : "WAITING FOR CONTENT"}</strong>
              <p>{status === "running" ? "The exact content hash is frozen while evidence is evaluated." : "A decision appears here. Missing or inconclusive required evidence becomes HOLD — never a guessed ALLOW."}</p>
            </div>
          ) : (
            <>
              <div className="content-verdict">
                <span>DECISION</span>
                <strong>{result.decision}</strong>
                <p>{result.summaryLine}</p>
                <small>{result.realTelegraph ? `REAL TELEGRAPH · x402 SPEND RAW ${result.spendRaw}` : "DEMO EVIDENCE · NOT TELEGRAPH OUTPUT"}</small>
              </div>

              <div className="content-signals">
                <div className="content-section-label">EVIDENCE</div>
                {result.signals.map((signal) => (
                  <article key={`${signal.kind}-${signal.minerId}`}>
                    <div>
                      <strong>{signal.kind.replaceAll("_", " ")}</strong>
                      <span>{signal.intent}</span>
                    </div>
                    <div className="content-signal-value">
                      <b>{signal.label.toUpperCase()}</b>
                      <span>{confidence(signal.confidence)}</span>
                    </div>
                    <small>{signal.source === "telegraph" ? `${signal.minerName} · Miner ${signal.minerId}` : "Deterministic demo classifier"}</small>
                  </article>
                ))}
              </div>

              <div className="content-receipt-card">
                <div className="content-section-label">AUCTORAIL CONTENT RECEIPT</div>
                <p>{result.receipt.receiptHash}</p>
                <div className="content-receipt-actions">
                  <button type="button" onClick={() => onVerifyReceipt(JSON.stringify(result.receipt, null, 2))}>VERIFY RECEIPT</button>
                  <button type="button" onClick={shareResult}>{copied ? "COPIED" : "SHARE RESULT"}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="content-policy-note">
        <strong>FAIL-CLOSED BY DESIGN</strong>
        <p>Strong scam evidence can BLOCK. Missing or inconclusive required evidence becomes HOLD. AI-written text is informational by itself; it only becomes a policy conflict when a publication explicitly claims human authorship and the AI-generation evidence crosses the configured threshold.</p>
      </section>
    </main>
  );
}
