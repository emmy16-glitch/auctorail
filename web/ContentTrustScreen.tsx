import React, { useEffect, useMemo, useRef, useState } from "react";

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

type OcrPhase = "idle" | "engine" | "recognizing" | "done" | "error";
type OcrState = {
  phase: OcrPhase;
  fileName?: string;
  fileSize?: number;
  progress: number;
  status?: string;
  words?: number;
  chars?: number;
  error?: string;
};

const ocrIdle: OcrState = { phase: "idle", progress: 0 };

type TesseractWorker = {
  recognize: (image: File) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<void>;
};

// In-browser OCR: the tesseract worker, wasm cores and English traineddata are
// served from public/tesseract/ (copied from node_modules at dev/build time), so
// a screenshot -> text extraction works fully offline, with no CDN and no
// server round-trip. Only the extracted text is ever sent to the content check.
async function loadOcrWorker(onProgress: (status: string, progress: number) => void): Promise<TesseractWorker> {
  // The package's main field is CJS; the ESM dist build is what browsers need
  // (it re-exports the CJS namespace as its default export).
  const [mod] = await Promise.all([import("tesseract.js/dist/tesseract.esm.min.js")]);
  const { createWorker } = (mod.default ?? mod) as {
    createWorker: (langs?: string | string[], oem?: number, options?: Record<string, unknown>) => Promise<unknown>;
  };
  // Resolve absolute URLs from the page origin: the worker script resolves
  // core/lang paths relative to its own URL, so relative bases would double
  // the "tesseract/" segment once the worker runs.
  const appBase = new URL(import.meta.env.BASE_URL ?? "./", window.location.href).href.replace(/\/$/, "");
  const tess = `${appBase}/tesseract`;
  return createWorker("eng", 1, {
    workerPath: `${tess}/worker.min.js`,
    corePath: `${tess}/`,
    langPath: `${tess}/`,
    logger: (m: { status?: string; progress?: number }) => {
      if (typeof m.status === "string") onProgress(m.status, m.progress ?? 0);
    }
  } as Parameters<typeof createWorker>[2]) as unknown as TesseractWorker;
}

function contentWire(args: {
  status: "idle" | "running" | "done" | "error";
  proposedAction: ProposedAction;
  authorshipClaim: AuthorshipClaim;
  result: ContentCheckResponse | null;
  error: string | null;
  ocr: OcrState;
}): { text: string; tone?: "ok" | "warn" | "bad"; cmd?: boolean; pending?: boolean }[] {
  const { status, proposedAction, authorshipClaim, result, error, ocr } = args;
  if (status === "idle" && !result) {
    const idle: { text: string; tone?: "ok" | "warn" | "bad"; cmd?: boolean; pending?: boolean }[] = [
      { text: "live content check only — evidence is acquired via a real x402 payment · no demo mode" }
    ];
    if (ocr.fileName && ocr.phase === "engine") idle.push({ text: `image loaded · ${ocr.fileName} · ocr engine loading…`, pending: true });
    if (ocr.fileName && ocr.phase === "recognizing") idle.push({ text: `image loaded · ${ocr.fileName} · extracting text in-browser · ${Math.round(ocr.progress * 100)}%`, pending: true });
    if (ocr.fileName && ocr.phase === "done") idle.push({ text: `image loaded · ${ocr.fileName} · ${ocr.words ?? 0} words extracted in-browser (tesseract)`, tone: "ok" });
    if (ocr.fileName && ocr.phase === "error") idle.push({ text: `ocr stopped · ${ocr.error ?? "failed"} — paste the text manually`, tone: "bad" });
    return idle;
  }
  const lines: { text: string; tone?: "ok" | "warn" | "bad"; cmd?: boolean; pending?: boolean }[] = [
    { cmd: true, text: `content --action ${proposedAction} --authorship ${authorshipClaim} --mode live-telegraph-x402` }
  ];
  if (ocr.fileName && ocr.phase === "done") lines.push({ text: `image loaded · ${ocr.fileName} · ${ocr.words ?? 0} words extracted in-browser (tesseract)`, tone: "ok" });
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
  const [ocr, setOcr] = useState<OcrState>(ocrIdle);
  const [preview, setPreview] = useState<string | null>(null);
  const ocrWorkerRef = useRef<TesseractWorker | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canRun = text.trim().length > 0 && status !== "running";

  useEffect(() => () => {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (ocrWorkerRef.current) void ocrWorkerRef.current.terminate().catch(() => {});
  }, []);

  async function handleOcrFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setOcr({ phase: "error", fileName: file.name, fileSize: file.size, progress: 0, error: "unsupported_file_type" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setOcr({ phase: "error", fileName: file.name, fileSize: file.size, progress: 0, error: "image_too_large_(max_10_mb)" });
      return;
    }
    setOcr({ phase: "engine", fileName: file.name, fileSize: file.size, progress: 0, status: "loading ocr engine" });
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    try {
      if (!ocrWorkerRef.current) {
        ocrWorkerRef.current = await loadOcrWorker((st, p) =>
          setOcr((s) => (s.phase === "engine" ? { ...s, status: st, progress: p } : s))
        );
      }
      setOcr((s) => ({ ...s, phase: "recognizing", status: "extracting text", progress: 0 }));
      const { data } = await ocrWorkerRef.current.recognize(file);
      const cleaned = (data.text ?? "").replace(/\s+/g, " ").trim();
      const words = cleaned ? cleaned.split(" ").length : 0;
      if (words < 3) {
        setOcr({ phase: "error", fileName: file.name, fileSize: file.size, progress: 1, error: "no_readable_text_found" });
        return;
      }
      setText(cleaned.slice(0, 8000));
      setOcr({ phase: "done", fileName: file.name, fileSize: file.size, progress: 1, words, chars: cleaned.length, status: "done" });
    } catch (reason) {
      setOcr({
        phase: "error",
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        error: reason instanceof Error && reason.message ? reason.message : "ocr_failed"
      });
    }
  }

  function clearOcr() {
    setOcr(ocrIdle);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
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

          <div
            className={`ocr-drop ${ocr.phase === "error" ? "is-error" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleOcrFile(event.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={fileInputRef}
              className="ocr-drop-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              onChange={(event) => void handleOcrFile(event.target.files?.[0])}
              aria-label="Upload a screenshot or image"
            />
            {preview ? (
              <div className="ocr-preview-row">
                <img className="ocr-thumb" src={preview} alt="Uploaded image preview" />
                <div className="ocr-preview-meta">
                  <strong>{ocr.fileName}</strong>
                  <span>{Math.max(1, Math.round((ocr.fileSize ?? 0) / 1024))} KB · stays on your device</span>
                  {ocr.phase === "done" && <em>extracted {ocr.words} words → filled the box above (you can edit it)</em>}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearOcr}>CLEAR</button>
              </div>
            ) : (
              <span className="ocr-drop-hint">
                <strong>Drop a screenshot or image</strong> — or tap to browse. Text is extracted in your browser with on-device OCR; nothing is uploaded except the text you check.
              </span>
            )}
            {ocr.phase === "engine" && (
              <span className="ocr-progress" role="status">loading OCR engine · {Math.round(ocr.progress * 100)}%</span>
            )}
            {ocr.phase === "recognizing" && (
              <span className="ocr-progress" role="status">extracting text · {Math.round(ocr.progress * 100)}%</span>
            )}
            {ocr.phase === "error" && (
              <span className="ocr-error" role="alert">OCR stopped · {String(ocr.error ?? "failed").replaceAll("_", " ")} — paste the text manually instead.</span>
            )}
          </div>

          <div style={{ margin: "16px 0" }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: 4 }}>02 · WHAT ARE YOU ABOUT TO DO?</span>
            <small style={{ display: "block", fontSize: 11.5, color: "var(--text-3)", marginBottom: 8 }}>
              The action you're about to take with this content. The bigger the action, the stricter the check — PUBLISH is held to the highest bar.
            </small>
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
                {contentWire({ status, proposedAction, authorshipClaim, result, error, ocr }).map((line, index) => (
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
