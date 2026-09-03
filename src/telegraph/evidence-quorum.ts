export interface EvidenceQuorumRule {
  minimumDistinctMiners: number;
  minimumPositiveResults: number;
  minimumPositiveConfidence: number | null;
  maxAttempts: number;
  negativeVetoConfidence: number | null;
}

export type EvidenceQuorumStatus =
  | "SATISFIED"
  | "INSUFFICIENT_DIVERSITY"
  | "INSUFFICIENT_POSITIVES"
  | "VETOED"
  | "ATTEMPT_LIMIT_EXCEEDED";

export interface QuorumEvidenceLike {
  intent: string;
  miner: {
    id: string;
  };
  label: string | null;
  confidence: number | null;
}

export interface EvidenceQuorumSummary {
  intent: string;
  rule: EvidenceQuorumRule;
  observedAttempts: number;
  distinctMinerIds: string[];
  positiveMinerIds: string[];
  belowConfidencePositiveMinerIds: string[];
  negativeMinerIds: string[];
  uncertainMinerIds: string[];
  vetoMinerIds: string[];
  duplicateMinerAttempts: number;
  status: EvidenceQuorumStatus;
}

const POSITIVE_LABELS = new Set([
  "ALLOW",
  "ALLOWED",
  "APPROVE",
  "APPROVED",
  "PASS",
  "PASSED",
  "SAFE",
  "CLEAN",
  "CLEAR",
  "OK",
  "LOW_RISK"
]);

const NEGATIVE_LABELS = new Set([
  "BLOCK",
  "DENY",
  "DENIED",
  "REJECT",
  "REJECTED",
  "MALICIOUS",
  "SUSPICIOUS",
  "FRAUD",
  "FRAUDULENT",
  "RISKY",
  "HIGH_RISK",
  "FAIL",
  "FAILED"
]);

function normalizedLabel(label: string | null): string | null {
  if (label === null) return null;
  const value = label.trim().toUpperCase();
  return value.length > 0 ? value : null;
}

function validConfidence(value: number | null): boolean {
  return (
    value === null ||
    (
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1
    )
  );
}

export function isPositiveEvidenceLabel(
  label: string | null
): boolean {
  const value = normalizedLabel(label);
  return value !== null && POSITIVE_LABELS.has(value);
}

export function isExplicitNegativeEvidenceLabel(
  label: string | null
): boolean {
  const value = normalizedLabel(label);
  return value !== null && NEGATIVE_LABELS.has(value);
}

export function validEvidenceQuorumRule(
  rule: EvidenceQuorumRule
): boolean {
  return (
    Number.isInteger(rule.minimumDistinctMiners) &&
    rule.minimumDistinctMiners >= 1 &&
    Number.isInteger(rule.minimumPositiveResults) &&
    rule.minimumPositiveResults >= 0 &&
    rule.minimumPositiveResults <= rule.minimumDistinctMiners &&
    validConfidence(rule.minimumPositiveConfidence) &&
    Number.isInteger(rule.maxAttempts) &&
    rule.maxAttempts >= rule.minimumDistinctMiners &&
    rule.maxAttempts <= 20 &&
    validConfidence(rule.negativeVetoConfidence)
  );
}

export function summarizeEvidenceQuorum(
  intent: string,
  rule: EvidenceQuorumRule,
  items: QuorumEvidenceLike[]
): EvidenceQuorumSummary {
  if (!intent.trim()) {
    throw new Error("quorum_intent_required");
  }

  if (!validEvidenceQuorumRule(rule)) {
    throw new Error("invalid_evidence_quorum_rule");
  }

  const matching = items.filter(
    (item) => item.intent === intent
  );

  const byMiner = new Map<
    string,
    {
      positive: boolean;
      negative: boolean;
      maxPositiveConfidence: number | null;
      maxNegativeConfidence: number | null;
    }
  >();

  for (const item of matching) {
    const minerId = item.miner.id.trim();
    if (!minerId) {
      continue;
    }

    const current = byMiner.get(minerId) ?? {
      positive: false,
      negative: false,
      maxPositiveConfidence: null,
      maxNegativeConfidence: null
    };

    if (isExplicitNegativeEvidenceLabel(item.label)) {
      current.negative = true;
      if (
        item.confidence !== null &&
        Number.isFinite(item.confidence)
      ) {
        current.maxNegativeConfidence =
          current.maxNegativeConfidence === null
            ? item.confidence
            : Math.max(
                current.maxNegativeConfidence,
                item.confidence
              );
      }
    } else if (isPositiveEvidenceLabel(item.label)) {
      current.positive = true;
      if (
        item.confidence !== null &&
        Number.isFinite(item.confidence)
      ) {
        current.maxPositiveConfidence =
          current.maxPositiveConfidence === null
            ? item.confidence
            : Math.max(
                current.maxPositiveConfidence,
                item.confidence
              );
      }
    }

    byMiner.set(minerId, current);
  }

  const distinctMinerIds = [...byMiner.keys()].sort();
  const positiveMinerIds: string[] = [];
  const belowConfidencePositiveMinerIds: string[] = [];
  const negativeMinerIds: string[] = [];
  const uncertainMinerIds: string[] = [];
  const vetoMinerIds: string[] = [];

  for (const minerId of distinctMinerIds) {
    const state = byMiner.get(minerId)!;

    if (state.negative) {
      negativeMinerIds.push(minerId);

      if (
        rule.negativeVetoConfidence !== null &&
        state.maxNegativeConfidence !== null &&
        state.maxNegativeConfidence >=
          rule.negativeVetoConfidence
      ) {
        vetoMinerIds.push(minerId);
      }
      continue;
    }

    if (state.positive) {
      const confidencePass =
        rule.minimumPositiveConfidence === null ||
        (
          state.maxPositiveConfidence !== null &&
          state.maxPositiveConfidence >=
            rule.minimumPositiveConfidence
        );

      if (confidencePass) {
        positiveMinerIds.push(minerId);
      } else {
        belowConfidencePositiveMinerIds.push(minerId);
      }
      continue;
    }

    uncertainMinerIds.push(minerId);
  }

  let status: EvidenceQuorumStatus;

  if (matching.length > rule.maxAttempts) {
    status = "ATTEMPT_LIMIT_EXCEEDED";
  } else if (vetoMinerIds.length > 0) {
    status = "VETOED";
  } else if (
    distinctMinerIds.length <
    rule.minimumDistinctMiners
  ) {
    status = "INSUFFICIENT_DIVERSITY";
  } else if (
    positiveMinerIds.length <
    rule.minimumPositiveResults
  ) {
    status = "INSUFFICIENT_POSITIVES";
  } else {
    status = "SATISFIED";
  }

  return {
    intent,
    rule: {
      ...rule
    },
    observedAttempts: matching.length,
    distinctMinerIds,
    positiveMinerIds,
    belowConfidencePositiveMinerIds,
    negativeMinerIds,
    uncertainMinerIds,
    vetoMinerIds,
    duplicateMinerAttempts:
      matching.length - distinctMinerIds.length,
    status
  };
}
