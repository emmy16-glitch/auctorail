export type AuthorizationDecision = "ALLOW" | "HOLD" | "BLOCK";
export type AuthorizationCheckStatus = "PASS" | "HOLD" | "BLOCK";

export interface AuthorizationCheck {
  name: string;
  status: AuthorizationCheckStatus;
  reason: string;
  code?: string;
}

export interface AuthorizationSource {
  id: string;
  name: string;
  slug?: string;
  intents?: string[];
}

export interface AuthorizationPresentationResult {
  status: "BLOCKED" | "REQUIRES_INTELLIGENCE" | "DECIDED";
  decision: AuthorizationDecision | null;
  reason: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  policyId: string;
  policyVersion: number;
  freezeFingerprint: string;
  routing: { mode: string; endpoint: string };
  action: {
    hash: string;
    amount: string;
    recipient: string;
    chainId: number;
    chain: string;
    asset: string;
    reason: string;
    reference: string;
  };
  mandate: { id: string; hash: string; maxPerAction: string; expiresAt: string };
  checks?: AuthorizationCheck[];
  evidence: {
    status: string;
    code?: string;
    spendRaw: string;
    bundleHash?: string;
    rejectedAttempts?: number;
    completedIntents?: string[];
    sources?: AuthorizationSource[];
    failedIntent?: string;
    error?: string;
  };
  executionAuthorized?: boolean;
  permit?: { hash: string } | null;
}

export interface PresentationDetail {
  label: string;
  value: string;
  mono?: boolean;
}

export function formatEvidenceSpend(raw: string | undefined): string {
  if (!raw || !/^\d+$/.test(raw)) return "—";
  const value = BigInt(raw);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ""} USDC`;
}

export function sourceNames(sources: AuthorizationSource[] | undefined): string {
  return sources?.length ? sources.map((source) => source.name).join(" · ") : "None recorded";
}

export function decisionCheck(result: AuthorizationPresentationResult): AuthorizationCheck | undefined {
  return result.checks?.find((check) => check.code === result.reason || check.name === result.reason)
    ?? result.checks?.find((check) => check.status === result.decision);
}

function evidenceIssueSummary(result: AuthorizationPresentationResult): string | null {
  switch (result.evidence.code) {
    case "adaptive_evidence_deadline_exceeded":
      return "The bounded live-evidence window expired before ProofGate could complete the required check.";
    case "adaptive_evidence_budget_exceeded":
      return "The next evidence call would have exceeded the request's pre-authorized x402 evidence budget, so ProofGate stopped instead of overspending.";
    case "adaptive_evidence_acquisition_failed":
      return "Telegraph routing or x402 acquisition did not return usable evidence for the required check.";
    case "adaptive_evidence_quorum_unsatisfied":
      return "ProofGate received evidence attempts, but not enough independent confidence-qualified Miner evidence to satisfy the required quorum.";
    case "adaptive_evidence_negative_veto":
      return "A high-confidence negative Miner result vetoed authorization.";
    default:
      return null;
  }
}

export function describeAuthorizationOutcome(result: AuthorizationPresentationResult): string {
  const decisive = decisionCheck(result);
  if (result.decision === "HOLD") {
    const why = evidenceIssueSummary(result) ?? decisive?.reason ?? "The required authorization evidence did not satisfy the policy.";
    return `${why} ProofGate held the request, issued no execution permit, and sent no vendor payment.`;
  }
  if (result.decision === "BLOCK" && result.evidence.status === "NOT_REQUESTED") {
    const why = decisive?.reason ?? "The local permission rules rejected this action.";
    return `${why} ProofGate blocked the request before any Miner call, x402 evidence fee, permit, or vendor payment.`;
  }
  if (result.decision === "BLOCK") {
    const why = evidenceIssueSummary(result) ?? decisive?.reason ?? "The evaluated evidence or policy blocked this action.";
    return `${why} ProofGate issued no execution permit and sent no vendor payment.`;
  }
  if (result.decision === "ALLOW") {
    return "Every required authorization check passed for this exact action. ProofGate may issue the short-lived, one-use execution permit.";
  }
  return "ProofGate has not granted execution authority for this request.";
}

export function buildAuthorizationTechnical(
  result: AuthorizationPresentationResult,
  recipientLabel: string
): PresentationDetail[] {
  return [
    { label: "Decision", value: result.decision ?? "NONE" },
    { label: "Reason", value: result.reason, mono: true },
    { label: "Policy", value: `${result.policyId} · v${result.policyVersion}`, mono: true },
    { label: "Risk tier", value: result.riskTier },
    { label: "Action hash", value: result.action.hash, mono: true },
    { label: "Freeze fingerprint", value: result.freezeFingerprint, mono: true },
    { label: "Recipient", value: `${recipientLabel} · ${result.action.recipient}`, mono: true },
    { label: "Evidence", value: result.evidence.status },
    { label: "Evidence code", value: result.evidence.code ?? "—", mono: true },
    ...(result.evidence.failedIntent
      ? [{ label: "Failed intent", value: result.evidence.failedIntent, mono: true }]
      : []),
    ...(result.evidence.error
      ? [{ label: "Acquisition detail", value: result.evidence.error, mono: true }]
      : []),
    { label: "Evidence bundle", value: result.evidence.bundleHash ?? "Not created", mono: true },
    { label: "Miner sources", value: sourceNames(result.evidence.sources) },
    { label: "Telegraph route", value: `${result.routing.endpoint} · ${result.routing.mode}`, mono: true },
    { label: "x402 spend", value: formatEvidenceSpend(result.evidence.spendRaw) },
    { label: "Completed intents", value: result.evidence.completedIntents?.join(" · ") || "None" },
    { label: "Rejected attempts", value: String(result.evidence.rejectedAttempts ?? 0) },
    { label: "Permit issued", value: result.permit ? "YES" : "NO" },
    { label: "Execution authorized", value: result.executionAuthorized ? "YES" : "NO" }
  ];
}

export function evidenceExplanation(result: AuthorizationPresentationResult): string {
  if (result.evidence.status === "NOT_REQUESTED") {
    return "The local permission decision finished first, so ProofGate did not call Telegraph or pay any Miner for this request.";
  }
  if (result.evidence.status === "COMPLETE") {
    const sourceCount = result.evidence.sources?.length ?? 0;
    const intentCount = result.evidence.completedIntents?.length ?? 0;
    return `ProofGate finished the required Telegraph evidence collection for this exact action. ${sourceCount} serving Miner source${sourceCount === 1 ? "" : "s"} and ${intentCount} completed intent${intentCount === 1 ? "" : "s"} are committed to the evidence bundle.`;
  }
  if (result.decision === "HOLD") {
    const acquisition = evidenceIssueSummary(result);
    if (acquisition) {
      return `${acquisition} ProofGate cannot turn incomplete or insufficient evidence into execution authority.`;
    }
    const decisive = decisionCheck(result);
    return decisive?.reason
      ? `${decisive.reason} ProofGate cannot turn incomplete or insufficient evidence into authority.`
      : "The required evidence did not reach the policy threshold, so ProofGate held the request instead of guessing.";
  }
  if (result.decision === "BLOCK") {
    const acquisition = evidenceIssueSummary(result);
    if (acquisition) return `${acquisition} No execution permit can be issued.`;
    const decisive = decisionCheck(result);
    return decisive?.reason
      ? `${decisive.reason} The evidence stage completed with a blocking result.`
      : "The evidence stage produced a blocking result, so no execution permit can be issued.";
  }
  return "ProofGate did not obtain a complete trusted evidence result for this request.";
}

export function evidenceTechnical(result: AuthorizationPresentationResult): PresentationDetail[] {
  const evidenceChecks = (result.checks ?? []).filter((check) => {
    const name = check.name.toLowerCase();
    return name.includes("evidence") || name.includes("quorum") || name.includes("miner") || name.includes("fraud") || name.includes("wallet") || name.includes("onchain") || name.includes("signal") || name.includes("fresh") || name.includes("applic") || name.includes("conflict") || name.includes("veto");
  });

  return [
    { label: "Evidence status", value: result.evidence.status },
    { label: "Evidence code", value: result.evidence.code ?? "—", mono: true },
    ...(result.evidence.failedIntent
      ? [{ label: "Failed intent", value: result.evidence.failedIntent, mono: true }]
      : []),
    ...(result.evidence.error
      ? [{ label: "Acquisition detail", value: result.evidence.error, mono: true }]
      : []),
    { label: "Telegraph route", value: `${result.routing.endpoint} · ${result.routing.mode}`, mono: true },
    { label: "Miner sources", value: sourceNames(result.evidence.sources) },
    { label: "Completed intents", value: result.evidence.completedIntents?.join(" · ") || "None" },
    { label: "Evidence bundle", value: result.evidence.bundleHash ?? "Not created", mono: true },
    { label: "x402 spend", value: formatEvidenceSpend(result.evidence.spendRaw) },
    { label: "Rejected attempts", value: String(result.evidence.rejectedAttempts ?? 0) },
    ...evidenceChecks.slice(0, 8).map((check) => ({
      label: check.name.replaceAll("_", " "),
      value: `${check.status} · ${check.reason}`,
      mono: false
    }))
  ];
}
