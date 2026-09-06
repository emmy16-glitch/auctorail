import React, { useMemo, useState } from "react";

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

function shortContent(hash: string | null | undefined): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 14)}…` : hash;
}

function contentWire(args: {
  status: "idle" | "running" | "done" | "error";
  proposedAction: ProposedAction;
  authorshipClaim: AuthorshipClaim;
  result: ContentCheckResponse | null;
  error: string | null;
}): { text: string; tone?: "ok" | "warn" | "bad"; cmd?: boolean; pending?: boolean }[] {
  const { status, proposedAction, authorshipClaim, result, error } = args;
  if (status === "idle" && !result) return [{ text: "live content check only — evidence is acquired via a real x402 payment · no demo mode" }];
  const lines: { text: string; tone?: "ok" | "warn" | "bad"; cmd?: boolean; pending?: boolean }[] = [
    { cmd: true, text: `content --action ${proposedAction} --authorship ${authorshipClaim} --mode live-telegraph-x402` }
  ];
  if (status === "running") {
    lines.push({ text: "hashing exact subject…", pending: true });
    lines.push({ text: "telegraph content route · acquiring real x402 evidence…", pending: true });
    return lines;
  }
  if (status === "error" && !result) {
    lines.push({ text: `check stopped · ${error ?? "failed closed"}`, tone: "bad" });
    return lines;
  }
  if (result) {
    lines.push({ text: `subject frozen · ${shortContent(result.subjectHash)}` });
    lines.push({ text: `telegraph content route · real x402 · spend raw ${result.spendRaw}`, tone: "ok" });
    for (const signal of result.signals) {
      lines.push({
        text: `${signal.kind} · ${confidence(signal.confidence)} · ${signal.minerName}`,
        tone: signal.kind === "SCAM" ? "bad" : signal.kind === "DEEPFAKE" ? "bad" : signal.kind === "AI_GENERATED" ? "warn" : undefined
      });
    }
    lines.push({
      text: `decision ${result.decision} · ${result.reason}`,
      tone: result.decision === "ALLOW" ? "ok" : result.decision === "HOLD" ? "warn" : "bad"
    });
    lines.push({ text: `receipt written · ${shortContent(result.receipt.receiptHash)} · ${result.receipt.schemaVersion}`, tone: "ok" });
  }
  return lines;
}

function kindClass(kind: ContentSignal["kind"]): string {
  if (kind === "SCAM") return "s-scam";
  if (kind === "DEEPFAKE") return "s-deepfake";
  return "s-ai";
}

export function ContentTrustScreen({ onVerifyReceipt }: ContentTrustScreenProps) {
  const [text, setText] = useState("");
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
          mode: "live",
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
          ? "Live Content Trust is disabled on this deployment (AUCTORAIL_CONTENT_LIVE_ENABLED=false)."
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
    <main data-testid="content-trust-screen">
      <div className="screen-head">
        <span className="eyebrow">CONTENT TRUST · POLICY content.strict.v1</span>
        <h1>Check the evidence before you act.</h1>
        <p>Paste a message. Auctorail binds the exact content, evaluates evidence, and returns one conservative decision: ALLOW, HOLD, or BLOCK.</p>
      </div>

      <div className="content-layout">
        <section className="card card-pad">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span className="eyebrow">01 · PASTE CONTENT</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setText(sample)}>LOAD SCAM SAMPLE</button>
          </div>

          <textarea
            className="input"
            aria-label="Content to check"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste a suspicious message, post text, or claim here…"
            maxLength={8000}
          />
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>{text.length.toLocaleString()} / 8,000</div>

          <div style={{ margin: "16px 0" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>02 · WHAT ARE YOU ABOUT TO DO?</span>
            <div className="mode-switch" role="group" aria-label="Proposed action">
              {(["view", "share", "publish"] as ProposedAction[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  className={proposedAction === action ? "active" : ""}
                  style={{ gridColumn: "span 1" }}
                  onClick={() => setProposedAction(action)}
                >{action.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {proposedAction === "publish" && (
            <div style={{ margin: "0 0 16px" }}>
              <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>AUTHORSHIP CLAIM</span>
              <div className="mode-switch" role="group" aria-label="Authorship claim">
                {([["unspecified", "UNSPECIFIED"], ["human", "HUMAN"], ["ai-assisted", "AI-ASSISTED"]] as [AuthorshipClaim, string][]).map(([value, label]) => (
                  <button key={value} type="button" className={authorshipClaim === value ? "active" : ""} onClick={() => setAuthorshipClaim(value)}>{label}</button>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-lg btn-block" type="button" disabled={!canRun} onClick={runCheck}>
            {status === "running" ? "CHECKING EVIDENCE…" : "CHECK WITH TELEGRAPH"}
          </button>
          {error && <div className="lab-error" role="alert" style={{ marginTop: 14 }}><strong>CHECK STOPPED</strong><span>{error}</span></div>}
        </section>

        <aside aria-live="polite" style={{ display: "grid", gap: 16 }}>
          <div className="demo-console wire-console content-wire" aria-label="Content check wire log" role="log">
              <div className="console-bar">
                <span className="console-title">
                  <span className="console-dots" aria-hidden="true"><i /><i /><i /></span>
                  auctorail wire — content trust
                </span>
                <span className={`console-state ${status === "running" ? "running" : status === "error" ? "paused" : "done"}`}>
                  {status === "running" ? "STREAMING" : status === "error" ? "STOPPED" : status === "idle" && !result ? "READY" : "COMPLETE"}
                </span>
              </div>
              <div className="console-body">
                {contentWire({ status, proposedAction, authorshipClaim, result, error }).map((line, index) => (
                  <span key={index} className={`wire-line ${line.tone ?? ""} ${line.cmd ? "cmd" : ""} ${line.pending ? "pending" : ""}`}>
                    {line.cmd ? <span className="wl-cmd">{line.text}</span> : line.text}
                    {line.pending && <span className="console-cursor" aria-hidden="true" />}
                  </span>
                ))}
              </div>
          </div>
          {!result ? (
            <div className="result-empty">
              <span className="eyebrow">RESULT</span>
              <strong>{status === "running" ? "ACQUIRING EVIDENCE" : "WAITING FOR CONTENT"}</strong>
              <p>{status === "running" ? "The exact content hash is frozen while evidence is evaluated." : "A decision appears here. Missing or inconclusive required evidence becomes HOLD — never a guessed ALLOW."}</p>
            </div>
          ) : (
            <>
              <div className={`content-verdict v-${verdictClass}`}>
                <span className="eyebrow">DECISION</span>
                <strong>{result.decision}</strong>
                <p className="cv-reason">{result.summaryLine}</p>
                <small className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{result.realTelegraph ? `REAL TELEGRAPH · x402 SPEND RAW ${result.spendRaw}` : "DEMO EVIDENCE · NOT TELEGRAPH OUTPUT"}</small>
              </div>

              <div className="signal-list">
                <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>EVIDENCE</span>
                {result.signals.map((signal) => (
                  <article className="signal-item" key={`${signal.kind}-${signal.minerId}`}>
                    <div>
                      <strong className={`signal-kind ${kindClass(signal.kind)}`}>{signal.kind.replaceAll("_", " ")}</strong>
                      <small>{signal.intent}</small>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <b style={{ fontSize: 13 }}>{signal.label.toUpperCase()}</b>
                      <div><small>{confidence(signal.confidence)}</small></div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="card card-pad" style={{ padding: 18 }}>
                <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>AUCTORAIL CONTENT RECEIPT</span>
                <code style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3)", overflowWrap: "anywhere" }}>{result.receipt.receiptHash}</code>
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onVerifyReceipt(JSON.stringify(result.receipt, null, 2))}>VERIFY RECEIPT</button>
                  <button type="button" className="btn btn-sm" onClick={shareResult}>{copied ? "COPIED" : "SHARE RESULT"}</button>
                </div>
              </div>
            </>
          )}

          <div className="note">
            <span style={{ fontSize: 18, display: "grid", placeItems: "center", width: 30, height: 30, margin: "2px auto 0", border: "1px solid var(--line)", borderRadius: 8, color: "var(--accent)" }} aria-hidden="true">✓</span>
            <div>
              <strong>FAIL-CLOSED BY DESIGN</strong>
              <p>Strong scam evidence can BLOCK. Missing or inconclusive required evidence becomes HOLD. AI-written text is informational by itself; it only becomes a policy conflict when a publication explicitly claims human authorship and the AI-generation evidence crosses the configured threshold.</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
