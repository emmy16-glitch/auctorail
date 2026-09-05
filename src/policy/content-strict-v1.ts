import {
  canonicalize,
  hashCanonicalPayload
} from "../core/action-contract.js";
import {
  evaluateGeneralMandate,
  type GeneralMandate
} from "../core/general-mandate.js";
import type { GeneralActionEnvelope } from "../core/general-action.js";
import {
  createGeneralAuthorizationDecision,
  type GeneralAuthorizationCheck,
  type GeneralAuthorizationDecision
} from "../permit/general-permit.js";

export type ContentKind = "text" | "image";
export type ProposedContentAction = "view" | "share" | "publish";
export type AuthorshipClaim = "unspecified" | "human" | "ai-assisted";
export type ContentSignalKind = "SCAM" | "DEEPFAKE" | "AI_GENERATED";

export interface ContentEvidenceSignal {
  source: "telegraph" | "deterministic_demo";
  kind: ContentSignalKind;
  minerId: string;
  minerName: string;
  intent: string;
  label: string;
  confidence: number | null;
  subjectHash: string;
  signalHash?: string | null;
  settlementTxHash?: string | null;
  receivedAt: string;
}

export interface ContentStrictResult {
  policyId: "content.strict.v1";
  policyVersion: 1;
  decision: GeneralAuthorizationDecision;
  signals: ContentEvidenceSignal[];
  evidenceCommitmentHash: string;
  summaryLine: string;
}

export const CONTENT_STRICT_V1 = {
  id: "content.strict.v1" as const,
  version: 1 as const,
  scamBlockConfidence: 0.8,
  scamHoldConfidence: 0.55,
  deepfakeBlockConfidence: 0.8,
  deepfakePassConfidence: 0.7,
  authorshipConflictConfidence: 0.8,
  maxEvidenceAgeSeconds: 600,
  failClosed: true
};

function check(
  name: string,
  status: "PASS" | "HOLD" | "BLOCK",
  reason: string,
  code?: string
): GeneralAuthorizationCheck {
  return { name, status, reason, ...(code ? { code } : {}) };
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function finiteConfidence(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1;
}

function fresh(signal: ContentEvidenceSignal, now: Date): boolean {
  const received = new Date(signal.receivedAt).getTime();
  const age = now.getTime() - received;
  return Number.isFinite(received) && age >= 0 && age <= CONTENT_STRICT_V1.maxEvidenceAgeSeconds * 1000;
}

function findSignal(signals: ContentEvidenceSignal[], kind: ContentSignalKind): ContentEvidenceSignal | undefined {
  return signals.find((signal) => signal.kind === kind);
}

function evidenceIntegrityChecks(
  signals: ContentEvidenceSignal[],
  subjectHash: string,
  now: Date
): GeneralAuthorizationCheck[] {
  const checks: GeneralAuthorizationCheck[] = [];

  if (signals.length === 0) {
    return [check("content_evidence", "HOLD", "No content evidence is present.", "content_evidence_missing")];
  }

  for (const signal of signals) {
    checks.push(
      signal.subjectHash === subjectHash
        ? check(`content_${signal.kind.toLowerCase()}_subject`, "PASS", `${signal.kind} evidence is bound to the exact content hash.`)
        : check(`content_${signal.kind.toLowerCase()}_subject`, "BLOCK", `${signal.kind} evidence belongs to different content.`, "content_evidence_subject_mismatch")
    );
    checks.push(
      fresh(signal, now)
        ? check(`content_${signal.kind.toLowerCase()}_freshness`, "PASS", `${signal.kind} evidence is fresh.`)
        : check(`content_${signal.kind.toLowerCase()}_freshness`, "HOLD", `${signal.kind} evidence is stale or has an invalid timestamp.`, "content_evidence_stale")
    );
    if (signal.source === "telegraph" && !signal.minerId.trim()) {
      checks.push(check(`content_${signal.kind.toLowerCase()}_miner`, "HOLD", "Telegraph Miner identity is missing.", "content_miner_identity_missing"));
    }
  }

  return checks;
}

function scamCheck(signal: ContentEvidenceSignal | undefined): GeneralAuthorizationCheck {
  if (!signal) return check("scam_signal", "HOLD", "Required scam assessment is missing.", "scam_evidence_missing");
  const label = normalized(signal.label);
  const confidence = signal.confidence;

  if ((label.includes("scam") || label.includes("phishing") || label === "malicious") && finiteConfidence(confidence) && confidence >= CONTENT_STRICT_V1.scamBlockConfidence) {
    return check("scam_signal", "BLOCK", `Scam/phishing evidence is ${Math.round(confidence * 100)}% confident.`, "scam_signal_block");
  }
  if (label === "likely_safe" || label === "safe" || label === "allow") {
    return finiteConfidence(confidence) && confidence >= CONTENT_STRICT_V1.scamHoldConfidence
      ? check("scam_signal", "PASS", "Scam assessment did not find a strong scam pattern.")
      : check("scam_signal", "HOLD", "Scam assessment is not confident enough to clear the content.", "scam_confidence_insufficient");
  }
  if (label.includes("suspicious") || label.includes("unknown") || label.includes("recheck")) {
    return check("scam_signal", "HOLD", "Scam assessment is suspicious or inconclusive.", "scam_signal_inconclusive");
  }
  return check("scam_signal", "HOLD", "Scam assessment could not be classified safely.", "scam_signal_unrecognized");
}

function deepfakeCheck(signal: ContentEvidenceSignal | undefined): GeneralAuthorizationCheck {
  if (!signal) return check("deepfake_signal", "HOLD", "Required deepfake assessment is missing.", "deepfake_evidence_missing");
  const label = normalized(signal.label);
  const confidence = signal.confidence;
  const positive = label === "ai" || label === "deepfake" || label === "synthetic" || label === "true";
  const negative = label === "human" || label === "authentic" || label === "not_ai" || label === "false" || label === "safe";

  if (positive && finiteConfidence(confidence) && confidence >= CONTENT_STRICT_V1.deepfakeBlockConfidence) {
    return check("deepfake_signal", "BLOCK", `Deepfake/synthetic-media evidence is ${Math.round(confidence * 100)}% confident.`, "deepfake_signal_block");
  }
  if (negative && finiteConfidence(confidence) && confidence >= CONTENT_STRICT_V1.deepfakePassConfidence) {
    return check("deepfake_signal", "PASS", "Deepfake assessment cleared the image at the required confidence.");
  }
  return check("deepfake_signal", "HOLD", "Deepfake assessment is inconclusive at the required confidence.", "deepfake_signal_inconclusive");
}

function aiGenerationCheck(
  signal: ContentEvidenceSignal | undefined,
  proposedAction: ProposedContentAction,
  authorshipClaim: AuthorshipClaim
): GeneralAuthorizationCheck {
  if (!signal) {
    return check("ai_generation_signal", "PASS", "AI-generation evidence is optional for this policy.");
  }

  const label = normalized(signal.label);
  const generated = ["ai", "ai_generated", "generated", "synthetic", "true", "1"].includes(label);
  const confidence = signal.confidence;

  if (
    generated &&
    proposedAction === "publish" &&
    authorshipClaim === "human" &&
    finiteConfidence(confidence) &&
    confidence >= CONTENT_STRICT_V1.authorshipConflictConfidence
  ) {
    return check(
      "ai_generation_signal",
      "BLOCK",
      `The content is strongly assessed as AI-generated while the proposed publication claims human authorship (${Math.round(confidence * 100)}%).`,
      "human_authorship_claim_conflict"
    );
  }

  if (generated) {
    return check(
      "ai_generation_signal",
      "PASS",
      `AI-generation assessment is informational${finiteConfidence(confidence) ? ` (${Math.round(confidence * 100)}%)` : ""}; AI-written content is not malicious by itself.`,
      "ai_generated_informational"
    );
  }

  return check("ai_generation_signal", "PASS", "AI-generation assessment does not create a policy violation.");
}

function summary(decision: GeneralAuthorizationDecision, checks: GeneralAuthorizationCheck[]): string {
  const priority = checks.find((item) => item.status === "BLOCK") ?? checks.find((item) => item.status === "HOLD");
  if (decision.decision === "ALLOW") return "Auctorail content check: ALLOW — required evidence checks passed.";
  if (decision.decision === "BLOCK") return `Auctorail content check: BLOCK — ${priority?.code ?? priority?.name ?? decision.reason}.`;
  return `Auctorail content check: HOLD — ${priority?.code ?? priority?.name ?? decision.reason}.`;
}

export function evaluateContentStrictV1(input: {
  mandate: GeneralMandate;
  action: GeneralActionEnvelope;
  agentId: string;
  contentKind: ContentKind;
  proposedAction: ProposedContentAction;
  authorshipClaim: AuthorshipClaim;
  subjectHash: string;
  signals: ContentEvidenceSignal[];
  now?: Date;
}): ContentStrictResult {
  const now = input.now ?? new Date();
  const mandate = evaluateGeneralMandate(input.mandate, input.action, input.agentId, now);
  const checks: GeneralAuthorizationCheck[] = mandate.checks.map((item) => ({ ...item }));

  checks.push(...evidenceIntegrityChecks(input.signals, input.subjectHash, now));

  if (input.contentKind === "text") {
    checks.push(scamCheck(findSignal(input.signals, "SCAM")));
  } else {
    checks.push(deepfakeCheck(findSignal(input.signals, "DEEPFAKE")));
  }

  checks.push(aiGenerationCheck(findSignal(input.signals, "AI_GENERATED"), input.proposedAction, input.authorshipClaim));

  const evidenceCommitmentHash = hashCanonicalPayload(canonicalize(input.signals));
  const decision = createGeneralAuthorizationDecision({
    mandate: input.mandate,
    action: input.action,
    agentId: input.agentId,
    checks,
    evidenceCommitmentHash,
    now
  });

  return {
    policyId: CONTENT_STRICT_V1.id,
    policyVersion: CONTENT_STRICT_V1.version,
    decision,
    signals: input.signals,
    evidenceCommitmentHash,
    summaryLine: summary(decision, checks)
  };
}
