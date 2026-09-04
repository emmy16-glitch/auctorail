import React from "react";
import "./execution-screen.css";

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
  routing: {
    mode: string;
    endpoint: string;
  };
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
  permit: {
    id: string;
    hash: string;
    expiresAt: string;
  };
  network: {
    chain: string;
    chainId: number;
    asset: string;
  };
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
  };
  receipt: {
    id: string;
    hash: string;
    schemaVersion: string;
    createdAt: string;
  };
  error?: string;
}

type SvgProps = React.SVGProps<SVGSVGElement>;

function FileIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 38 44" aria-hidden="true" {...props}>
      <path d="M7 2h16l8 8v32H7V2Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M23 2v9h8M12 21h14M12 27h14M12 33h10" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LockIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 40 44" aria-hidden="true" {...props}>
      <path d="M11 18v-6a9 9 0 0 1 18 0v6M6 18h28v23H6V18Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M20 27v7" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function BoltIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 54 70" aria-hidden="true" {...props}>
      <path d="M32 3 9 39h18l-4 28 23-38H29L32 3Z" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="miter" />
    </svg>
  );
}

function CheckIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <path d="m7 17 6 6L26 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}

function InfoIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 38 38" aria-hidden="true" {...props}>
      <circle cx="19" cy="19" r="16" fill="none" stroke="currentColor" strokeWidth="2.3" />
      <path d="M19 17v11M19 10.5v2" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
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
  if (!sources?.length) return "Recorded in evidence bundle";
  return sources.map((source) => source.name).join(" · ");
}

function executionMessage(
  phase: ExecutionUiPhase,
  amount: string,
  response: ExecutionResponse | null,
  error: string | null
) {
  if (phase === "executed") {
    return {
      title: "Payment confirmed.",
      copy: `The authorized ${amount} USDC action was confirmed on Base Sepolia and a verifiable ProofGate receipt was created.`
    };
  }
  if (phase === "execution_ambiguous") {
    return {
      title: "Confirmation uncertain.",
      copy: response?.transaction.transactionHash
        ? "A transaction hash exists, but confirmation could not be established safely. ProofGate will not broadcast another payment automatically."
        : "The execution request may have reached the network, but a trustworthy final result was not available. ProofGate will not create a replacement transaction automatically."
    };
  }
  if (phase === "execution_failed") {
    return {
      title: "Execution stopped.",
      copy: error ?? response?.error ?? "The authorized payment did not complete. ProofGate did not automatically retry it."
    };
  }
  return {
    title: "Execution in progress.",
    copy: `The ${amount} USDC action is now inside the protected executor. ProofGate will mark it complete only after a real Base Sepolia confirmation.`
  };
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

  return (
    <main className={`execution-shell execution-${phase}`} data-testid="execution-screen">
      <section className="execution-hero">
        <div>
          <span className="step-chip">STEP 3 OF 3</span>
          <h1>{confirmed ? "PAYMENT EXECUTED" : ambiguous ? "CONFIRMATION UNCERTAIN" : failed ? "EXECUTION STOPPED" : "EXECUTING REQUEST"}</h1>
          <p>
            {confirmed ? "Authorization and execution complete." : "Authorization complete."}<br />
            {confirmed
              ? "The approved action is confirmed on Base Sepolia."
              : pending
                ? "The approved action is executing automatically."
                : ambiguous
                  ? "No automatic rebroadcast is allowed."
                  : "The protected payment did not complete."}
          </p>
        </div>
        <div className="execution-hero-mark" aria-hidden="true">
          <span className="exec-corner ec1" /><span className="exec-corner ec2" /><span className="exec-corner ec3" /><span className="exec-corner ec4" />
          <BoltIcon />
        </div>
      </section>

      <section className="execution-request hard-shadow" aria-label="Authorized request">
        <div>
          <span>AUTHORIZED REQUEST</span>
          <strong>{authorization.action.amount} USDC → ProofGate Vendor</strong>
          <p>{authorization.action.reason}</p>
          <p>Ref: {authorization.action.reference || "—"}</p>
        </div>
        <FileIcon />
      </section>

      <section className="execution-progress hard-shadow" aria-label="Execution progress">
        <h2>EXECUTION PROGRESS</h2>
        <ExecutionRow number="01" title="AUTHORIZATION PASSED" copy="Authority and ranked Telegraph intelligence satisfied policy." state="done" />
        <ExecutionRow number="02" title="PERMIT ISSUED" copy="Exact-action one-use Permit generated and signed." state="done" />
        <ExecutionRow
          number="03"
          title={confirmed ? "EXECUTED ON BASE SEPOLIA" : ambiguous ? "BROADCAST STATUS UNCERTAIN" : failed ? "EXECUTION STOPPED" : "EXECUTING ON BASE SEPOLIA"}
          copy={confirmed ? "The USDC transfer was confirmed on-chain." : ambiguous ? "ProofGate will not make another broadcast attempt." : failed ? "The protected executor did not complete the transfer." : "Submitting the one authorized transaction and reconciling it across Base Sepolia RPCs."}
          state={confirmed ? "done" : ambiguous ? "warning" : failed ? "error" : "running"}
        />
        <ExecutionRow
          number="04"
          title={confirmed ? "CONFIRMED" : ambiguous ? "CONFIRMATION UNCERTAIN" : failed ? "NOT CONFIRMED" : "CONFIRMATION PENDING"}
          copy={confirmed ? `Block ${blockNumber ?? "confirmed"}` : ambiguous ? "No automatic retry is allowed for this action." : failed ? "No successful confirmation was recorded." : "Waiting for a real network confirmation..."}
          state={confirmed ? "done" : ambiguous ? "warning" : failed ? "error" : "pending"}
        />
      </section>

      <section className={`execution-message ${confirmed ? "success" : ambiguous ? "warning" : failed ? "error" : "pending"}`} role="status" aria-live="polite">
        <InfoIcon />
        <div>
          <strong>{message.title}</strong>
          <p>{message.copy}</p>
        </div>
      </section>

      <section className="execution-details hard-shadow" aria-label="Execution details">
        <h2>EXECUTION DETAILS</h2>
        <dl>
          <div><dt>Network</dt><dd>Base Sepolia</dd></div>
          <div><dt>Recipient</dt><dd>ProofGate Vendor</dd></div>
          <div><dt>Amount</dt><dd>{authorization.action.amount} USDC</dd></div>
          <div><dt>Decision</dt><dd>{authorization.decision}</dd></div>
          <div><dt>Telegraph route</dt><dd>{authorization.routing.endpoint} · auto-ranked</dd></div>
          <div><dt>Intelligence spend</dt><dd>{formatEvidenceSpend(evidenceSpend)}</dd></div>
          <div><dt>Permit hash</dt><dd title={authorization.permit.hash}>{shortHash(authorization.permit.hash)}</dd></div>
          <div><dt>Status</dt><dd>{confirmed ? "Confirmed" : ambiguous ? "Uncertain — no retry" : failed ? "Stopped" : "Executing"}</dd></div>
          <div><dt>Tx hash</dt><dd title={transactionHash ?? undefined}>{shortHash(transactionHash, 10, 8)}</dd></div>
          <div><dt>Block</dt><dd>{blockNumber ?? "—"}</dd></div>
        </dl>
      </section>

      <div className="execution-actions">
        <button
          type="button"
          className="execution-secondary"
          disabled={pending || ambiguous}
          onClick={onNewRequest}
          title={pending ? "The protected execution request is already in flight. An on-chain broadcast cannot be safely cancelled from the browser." : ambiguous ? "Resolve the uncertain transaction before creating a replacement for this payment." : undefined}
        >
          <span>{pending ? "EXECUTION IN PROGRESS" : ambiguous ? "RETRY LOCKED" : "NEW REQUEST"}</span>
          <span aria-hidden="true">{pending || ambiguous ? "×" : "←"}</span>
        </button>
        <button type="button" className="execution-proof" disabled={!receipt} onClick={onToggleProof} aria-expanded={proofOpen}>
          <span>VIEW PROOF</span><span className="proof-arrow" aria-hidden="true" />
        </button>
      </div>

      {proofOpen && receipt && (
        <section className="proof-drawer" data-testid="proof-drawer">
          <div className="proof-title"><span>VERIFIABLE RECEIPT</span><b>REAL</b></div>
          <dl>
            <div><dt>Decision</dt><dd>{authorization.decision}</dd></div>
            <div><dt>Policy</dt><dd>{authorization.policyId}</dd></div>
            <div><dt>Risk tier</dt><dd>{authorization.riskTier}</dd></div>
            <div><dt>Receipt</dt><dd title={receipt.hash}>{shortHash(receipt.hash, 10, 8)}</dd></div>
            <div><dt>Action</dt><dd title={authorization.action.hash}>{shortHash(authorization.action.hash, 10, 8)}</dd></div>
            <div><dt>Permit</dt><dd title={authorization.permit.hash}>{shortHash(authorization.permit.hash, 10, 8)}</dd></div>
            <div><dt>Evidence</dt><dd title={authorization.evidence.bundleHash}>{shortHash(authorization.evidence.bundleHash, 10, 8)}</dd></div>
            <div><dt>Sources</dt><dd>{sourceNames(authorization.evidence.sources)}</dd></div>
            <div><dt>Telegraph</dt><dd>{authorization.routing.endpoint} · auto-ranked</dd></div>
            <div><dt>x402 spend</dt><dd>{formatEvidenceSpend(evidenceSpend)}</dd></div>
            <div><dt>Transaction</dt><dd title={transactionHash ?? undefined}>{shortHash(transactionHash, 10, 8)}</dd></div>
          </dl>
        </section>
      )}

      <section className="execution-safety">
        <div className="execution-lock"><LockIcon /></div>
        <p><strong>Authority stays bounded.</strong><br />This action can execute only through the exact frozen request, real Telegraph evidence, signed one-use Permit and protected executor.</p>
      </section>
    </main>
  );
}

type ExecutionRowState = "done" | "running" | "pending" | "warning" | "error";

function ExecutionRow(props: { number: string; title: string; copy: string; state: ExecutionRowState }) {
  const { number, title, copy, state } = props;
  return (
    <div className={`execution-row exec-row-${state}`} data-execution-stage={number}>
      <div className="execution-number">{number}</div>
      <div className="execution-row-status" aria-label={state}>
        {state === "done" ? <CheckIcon /> : state === "running" ? <span className="execution-spinner" /> : state === "warning" ? <span>!</span> : state === "error" ? <span>×</span> : <span className="execution-empty" />}
      </div>
      <div className="execution-row-copy"><strong>{title}</strong><span>{copy}</span></div>
    </div>
  );
}