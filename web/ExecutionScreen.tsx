import React from "react";
import { FileIcon, LockIcon, BoltIcon, CheckIcon, InfoIcon } from "./icons";

export type ExecutionUiPhase = "executing" | "executed" | "execution_failed" | "execution_ambiguous";

export interface ExecutionPermitSummary {
  id: string;
  hash: string;
  actionHash: string;
  expiresAt: string;
  keyId: string;
  algorithm: string;
}

export interface ExecutionIntelligenceSource {
  id: string;
  name: string;
  slug?: string;
  intents?: string[];
}

export interface ExecutionAuthorizationSummary {
  decision: "ALLOW";
  policyId: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  routing: { mode: string; endpoint: string };
  action: {
    hash: string;
    amount: string;
    recipient: string;
    reason: string;
    reference: string;
  };
  permit: ExecutionPermitSummary;
  evidence: {
    spendRaw: string;
    bundleHash?: string;
    sources?: ExecutionIntelligenceSource[];
  };
}

export interface ExecutionResponse {
  status: "EXECUTED" | "BLOCKED" | "FAILED" | "AMBIGUOUS";
  code: string;
  actionHash: string;
  freezeFingerprint: string;
  permit: { id: string; hash: string; expiresAt: string };
  network: { chain: string; chainId: number; asset: string };
  payment: {
    amount: string;
    amountRaw: string;
    recipient: string;
    recipientLabel: string;
    reference: string;
  };
  transaction: {
    status: string;
    transactionHash: string | null;
    blockNumber: number | null;
    confirmedAt: string | null;
    confirmedVia: string | null;
    sender: string | null;
    nonce: number | null;
    operationId: string | null;
    automaticRetry: false;
  };
  evidence: {
    bundleHash: string;
    spendRaw: string;
    sources?: ExecutionIntelligenceSource[];
  };
  receipt: { id: string; hash: string; schemaVersion: string; createdAt: string };
  error?: string;
}

function shortHash(value: string | null | undefined, lead = 8, tail = 6): string {
  if (!value) return "—";
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function formatEvidenceSpend(raw: string | undefined): string {
  if (!raw || !/^\d+$/.test(raw)) return "—";
  const value = BigInt(raw);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ""} USDC`;
}

function sourceNames(sources: ExecutionIntelligenceSource[] | undefined): string {
  if (!sources?.length) return "Source metadata unavailable";
  return sources.map((source) => source.name).join(" · ");
}

function executionMessage(phase: ExecutionUiPhase, amount: string, response: ExecutionResponse | null, error: string | null) {
  if (phase === "executed") return { title: "Payment confirmed.", copy: `The authorized ${amount} USDC action was confirmed on Base Sepolia and a verifiable Auctorail receipt was created.` };
  if (phase === "execution_ambiguous") return {
    title: "Confirmation uncertain.",
    copy: response?.transaction.transactionHash
      ? "A transaction hash exists, but confirmation could not be established safely. Auctorail will not broadcast another payment automatically."
      : "The execution request may have reached the network, but a trustworthy final result was not available. Auctorail will not create a replacement transaction automatically."
  };
  if (phase === "execution_failed") return { title: "Execution stopped.", copy: error ?? response?.error ?? "The authorized payment did not complete. Auctorail did not automatically retry it." };
  return {
    title: "Execution in progress.",
    copy: "Your authorized action is being executed automatically. Auctorail will update this screen once the real transaction is confirmed."
  };
}

function executionWire(phase: ExecutionUiPhase, authorization: ExecutionAuthorizationSummary, response: ExecutionResponse | null, error: string | null) {
  const lines: { text: string; tone?: "ok" | "warn" | "bad"; cmd?: boolean; pending?: boolean }[] = [
    { cmd: true, text: `execute --permit ${authorization.permit.id} --amount ${authorization.action.amount} USDC --to ${authorization.action.recipient}` },
    { text: `permit verified · ${shortHash(authorization.permit.hash)} · one-use · bound to action ${shortHash(authorization.action.hash)}`, tone: "ok" }
  ];
  if (phase === "executing") {
    lines.push({ text: "broadcasting signed transfer to base-sepolia · confirmation pending…", pending: true });
    return lines;
  }
  if (phase === "executed" && response) {
    lines.push({ text: "POST /api/execute · 200 OK · EXECUTED", tone: "ok" });
    if (response.transaction.transactionHash) {
      lines.push({ text: `tx ${shortHash(response.transaction.transactionHash, 10, 8)} · block ${response.transaction.blockNumber ?? "—"} · nonce ${response.transaction.nonce ?? "—"} · op ${response.transaction.operationId ?? "—"}`, tone: "ok" });
    }
    if (response.transaction.confirmedVia) {
      lines.push({ text: `confirmed via ${response.transaction.confirmedVia} · ${response.transaction.confirmedAt ?? ""}` });
    }
    lines.push({ text: `receipt written · ${shortHash(response.receipt.hash)} · ${response.receipt.schemaVersion}`, tone: "ok" });
    return lines;
  }
  if (phase === "execution_ambiguous") {
    lines.push({ text: response?.transaction.transactionHash ? `tx ${shortHash(response.transaction.transactionHash, 10, 8)} present · confirmation unverified` : "broadcast unverified", tone: "warn" });
    lines.push({ text: "no automatic rebroadcast allowed — resolve the uncertain transaction first", tone: "warn" });
    return lines;
  }
  lines.push({ text: `execution stopped · ${response?.code ?? error ?? "failed"} · no automatic retry`, tone: "bad" });
  return lines;
}

export function ExecutionScreen(props: {
  phase: ExecutionUiPhase;
  authorization: ExecutionAuthorizationSummary;
  response: ExecutionResponse | null;
  error: string | null;
  proofOpen: boolean;
  onToggleProof: () => void;
  onNewRequest: () => void;
}) {
  const { phase, authorization, response, error, proofOpen, onToggleProof, onNewRequest } = props;
  const confirmed = phase === "executed";
  const ambiguous = phase === "execution_ambiguous";
  const failed = phase === "execution_failed";
  const pending = phase === "executing";
  const message = executionMessage(phase, authorization.action.amount, response, error);
  const transactionHash = response?.transaction.transactionHash ?? null;
  const blockNumber = response?.transaction.blockNumber ?? null;
  const receipt = response?.receipt ?? null;
  const evidenceSpend = response?.evidence.spendRaw ?? authorization.evidence.spendRaw;
  const decision = authorization.decision;
  const policyId = authorization.policyId;
  const riskTier = authorization.riskTier;
  const routeEndpoint = authorization.routing.endpoint;
  const statusClass = confirmed ? "ok" : ambiguous ? "hold" : failed ? "block" : "";

  return (
    <div className="execution-layout" data-testid="execution-screen">
      <section>
        <div className="execution-head">
          <span className="badge accent">STEP 3 OF 3 · PROTECTED EXECUTION</span>
          <h1>{confirmed ? "Payment executed" : ambiguous ? "Confirmation uncertain" : failed ? "Execution stopped" : "Executing request"}</h1>
          <p>
            {confirmed ? "Authorization and execution complete. The approved action is confirmed on Base Sepolia."
              : pending ? "Authorization complete. Executing the approved action on Base Sepolia."
              : ambiguous ? "Authorization complete. No automatic rebroadcast is allowed."
              : "Authorization complete. The protected payment did not complete."}
          </p>
        </div>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <span className="eyebrow" style={{ display: "block", marginBottom: 10 }}>REQUEST</span>
          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gap: 14, alignItems: "center" }}>
            <FileIcon style={{ width: 26, height: 30, color: "var(--text-3)" }} />
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 15, fontWeight: 650, display: "block", overflowWrap: "anywhere" }}>{authorization.action.amount} USDC → Auctorail Vendor</strong>
              <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{authorization.action.reason} · Ref: {authorization.action.reference || "—"}</span>
            </div>
          </div>
        </div>

        <div className="demo-console wire-console exec-wire" aria-label="Execution wire log" role="log">
          <div className="console-bar">
            <span className="console-title">
              <span className="console-dots" aria-hidden="true"><i /><i /><i /></span>
              auctorail wire — protected execution
            </span>
            <span className={`console-state ${pending ? "running" : confirmed ? "done" : "paused"}`}>{pending ? "BROADCASTING" : confirmed ? "CONFIRMED" : ambiguous ? "UNCERTAIN" : "STOPPED"}</span>
          </div>
          <div className="console-body">
            {executionWire(phase, authorization, response, error).map((line, index) => (
              <span key={index} className={`wire-line ${line.tone ?? ""} ${line.cmd ? "cmd" : ""} ${line.pending ? "pending" : ""}`}>
                {line.cmd ? <span className="wl-cmd">{line.text}</span> : line.text}
                {line.pending && <span className="console-cursor" aria-hidden="true" />}
              </span>
            ))}
          </div>
        </div>

        <div className="exec-steps" aria-label="Execution progress">
          <ExecutionRow number="01" title="AUTHORIZATION PASSED" copy="Policy and Miner checks completed." state="done" />
          <ExecutionRow number="02" title="PERMIT ISSUED" copy="Execution permit generated and signed." state="done" />
          <ExecutionRow
            number="03"
            title={confirmed ? "EXECUTED ON BASE SEPOLIA" : ambiguous ? "BROADCAST STATUS UNCERTAIN" : failed ? "EXECUTION STOPPED" : "EXECUTING ON BASE SEPOLIA"}
            copy={confirmed ? "The USDC transfer was confirmed on-chain." : ambiguous ? "Auctorail will not make another broadcast attempt." : failed ? "The protected executor did not complete the transfer." : "Sending the authorized transaction to the network..."}
            state={confirmed ? "done" : ambiguous ? "warning" : failed ? "error" : "running"}
          />
          <ExecutionRow
            number="04"
            title={confirmed ? "CONFIRMED" : ambiguous ? "CONFIRMATION UNCERTAIN" : failed ? "NOT CONFIRMED" : "CONFIRMATION PENDING"}
            copy={confirmed ? `Block ${blockNumber ?? "confirmed"}` : ambiguous ? "No automatic retry is allowed for this action." : failed ? "No successful confirmation was recorded." : "Waiting for network confirmation..."}
            state={confirmed ? "done" : ambiguous ? "warning" : failed ? "error" : "pending"}
          />
        </div>

        <div className={`note ${statusClass}`} role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <InfoIcon />
          <div><strong>{message.title}</strong><p>{message.copy}</p></div>
        </div>
      </section>

      <aside>
        <div className="card card-pad" aria-label="Execution details">
          <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>EXECUTION DETAILS</span>
          <dl className="kv">
            <div><dt>Network</dt><dd>Base Sepolia</dd></div>
            <div><dt>Recipient</dt><dd>Auctorail Vendor</dd></div>
            <div><dt>Amount</dt><dd>{authorization.action.amount} USDC</dd></div>
            <div><dt>Decision</dt><dd>{decision}</dd></div>
            <div><dt>Telegraph route</dt><dd className="mono">{routeEndpoint} · auto-ranked</dd></div>
            <div><dt>Intelligence spend</dt><dd>{formatEvidenceSpend(evidenceSpend)}</dd></div>
            <div><dt>Permit hash</dt><dd className="mono" title={authorization.permit.hash}>{shortHash(authorization.permit.hash)}</dd></div>
            <div><dt>Status</dt><dd>{confirmed ? "Confirmed" : ambiguous ? "Uncertain — no retry" : failed ? "Stopped" : "Broadcast / confirmation pending"}</dd></div>
            <div><dt>Tx hash</dt><dd className="mono" title={transactionHash ?? undefined}>{shortHash(transactionHash, 10, 8)}</dd></div>
            <div><dt>Block</dt><dd>{blockNumber ?? "—"}</dd></div>
          </dl>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn btn-block" disabled={pending || ambiguous} onClick={onNewRequest}
            title={pending ? "The protected execution request is already in flight. An on-chain broadcast cannot be safely cancelled from the browser." : ambiguous ? "Resolve the uncertain transaction before creating a replacement for this payment." : undefined}>
            <span>{pending ? "EXECUTION IN PROGRESS" : ambiguous ? "RETRY LOCKED" : "NEW REQUEST"}</span>
            <span aria-hidden="true">{pending || ambiguous ? "×" : "←"}</span>
          </button>
          <button type="button" className="btn btn-primary btn-block" disabled={!receipt} onClick={onToggleProof} aria-expanded={proofOpen}>
            <span>VIEW PROOF</span><span aria-hidden="true" className="arrow">{proofOpen ? "↑" : "↓"}</span>
          </button>
        </div>

        {proofOpen && receipt && (
          <div className="card card-pad proof-drawer" data-testid="proof-drawer" style={{ marginTop: 16 }}>
            <div className="drawer-head">
              <span className="eyebrow">VERIFIABLE RECEIPT</span>
              <span className="badge accent">REAL</span>
            </div>
            <dl className="kv">
              <div><dt>Decision</dt><dd>{decision}</dd></div>
              <div><dt>Policy</dt><dd className="mono">{policyId}</dd></div>
              <div><dt>Risk tier</dt><dd>{riskTier}</dd></div>
              <div><dt>Receipt</dt><dd className="mono" title={receipt.hash}>{shortHash(receipt.hash, 10, 8)}</dd></div>
              <div><dt>Action</dt><dd className="mono" title={authorization.action.hash}>{shortHash(authorization.action.hash, 10, 8)}</dd></div>
              <div><dt>Permit</dt><dd className="mono" title={authorization.permit.hash}>{shortHash(authorization.permit.hash, 10, 8)}</dd></div>
              <div><dt>Evidence</dt><dd className="mono" title={authorization.evidence.bundleHash}>{shortHash(authorization.evidence.bundleHash, 10, 8)}</dd></div>
              <div><dt>Sources</dt><dd>{sourceNames(authorization.evidence.sources)}</dd></div>
              <div><dt>Telegraph</dt><dd className="mono">{routeEndpoint} · auto-ranked</dd></div>
              <div><dt>x402 spend</dt><dd>{formatEvidenceSpend(evidenceSpend)}</dd></div>
              <div><dt>Transaction</dt><dd className="mono" title={transactionHash ?? undefined}>{shortHash(transactionHash, 10, 8)}</dd></div>
            </dl>
          </div>
        )}

        <div className="note" style={{ marginTop: 16 }}>
          <LockIcon />
          <div>
            <strong>You stay in control.</strong>
            <p>This action executes only within the approved limits, using real Telegraph intelligence, an exact-action permit and protected on-chain execution.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

type ExecutionRowState = "done" | "running" | "pending" | "warning" | "error";

function ExecutionRow(props: { number: string; title: string; copy: string; state: ExecutionRowState }) {
  const { number, title, copy, state } = props;
  return (
    <div className={`exec-row ${state}`} data-execution-stage={number}>
      <div className="er-mark" aria-label={state}>
        {state === "done" ? <CheckIcon style={{ width: 12, height: 12 }} /> : state === "running" ? <span className="execution-spinner" /> : state === "warning" ? "!" : state === "error" ? "×" : number}
      </div>
      <div>
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
    </div>
  );
}
