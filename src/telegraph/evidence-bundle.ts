import {
  canonicalize,
  hashCanonicalPayload,
  type ActionContract
} from "../core/action-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../evidence/telegraph.js";
import type {
  AdaptiveEvidenceIntent,
  AdaptiveEvidencePlan,
  ActionRiskTier
} from "./adaptive-evidence-plan.js";
import {
  TELEGRAPH_X402_POLICY
} from "./x402-policy.js";

export interface AdaptiveEvidencePayment {
  amountRaw: string;
  network: string | null;
  asset: string | null;
}

export interface AdaptiveEvidenceItem {
  intent: AdaptiveEvidenceIntent;
  routeMode: "TELEGRAPH_INTENT_ROUTE";
  miner: {
    id: string;
    name: string;
    slug: string;
  };
  subject: string;
  chainId: number;
  label: string | null;
  confidence: number | null;
  reason: string | null;
  applicability: TelegraphEvidenceRecord["applicability"];
  signalHash: string | null;
  rawResponseHash: string;
  receivedAt: string;
  durationMs: number | null;
  costUsd: number | null;
  payment: AdaptiveEvidencePayment;
}

export interface EvidenceBundleBody {
  schemaVersion: "proofgate.evidence-bundle.v1";
  actionId: string;
  actionHash: string;
  subject: string;
  chainId: number;
  amountRaw: string;
  riskTier: ActionRiskTier;
  planHash: string;
  maxEvidenceSpendRaw: string;
  totalEvidenceSpendRaw: string;
  items: AdaptiveEvidenceItem[];
  createdAt: string;
}

export interface EvidenceBundle
  extends EvidenceBundleBody {
  bundleHash: string;
}

export interface EvidenceBundleItemInput {
  evidence: TelegraphEvidenceRecord;
  paymentAmountRaw?: string;
  paymentNetwork?: string | null;
  paymentAsset?: string | null;
}

const ADAPTIVE_INTENTS = new Set<AdaptiveEvidenceIntent>([
  "FRAUD_DETECTION",
  "ONCHAIN_TX_LOOKUP",
  "WALLET_BALANCE_CHECK"
]);

function requireUnsignedInteger(
  value: string,
  field: string
): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field}_invalid`);
  }

  return BigInt(value);
}

function addressesEqual(
  a: string,
  b: string
): boolean {
  return (
    /^0x[0-9a-fA-F]{40}$/.test(a) &&
    /^0x[0-9a-fA-F]{40}$/.test(b) &&
    a.toLowerCase() === b.toLowerCase()
  );
}

function isSha256Hex(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function validEvidenceItem(item: AdaptiveEvidenceItem): boolean {
  if (!ADAPTIVE_INTENTS.has(item.intent)) return false;
  if (item.routeMode !== "TELEGRAPH_INTENT_ROUTE") return false;
  if (
    !item.miner.id.trim() ||
    !item.miner.name.trim() ||
    !item.miner.slug.trim()
  ) {
    return false;
  }

  if (!isSha256Hex(item.rawResponseHash)) return false;
  if (item.signalHash !== null && !isSha256Hex(item.signalHash)) return false;
  if (!validTimestamp(item.receivedAt)) return false;

  if (
    item.confidence !== null &&
    (!Number.isFinite(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1)
  ) {
    return false;
  }

  if (
    !["APPLICABLE", "NOT_APPLICABLE", "UNKNOWN"].includes(
      item.applicability
    )
  ) {
    return false;
  }

  if (
    item.durationMs !== null &&
    (!Number.isFinite(item.durationMs) || item.durationMs < 0)
  ) {
    return false;
  }

  if (
    item.costUsd !== null &&
    (!Number.isFinite(item.costUsd) || item.costUsd < 0)
  ) {
    return false;
  }

  let paymentAmount: bigint;
  try {
    paymentAmount = requireUnsignedInteger(
      item.payment.amountRaw,
      "evidence_payment_amount"
    );
  } catch {
    return false;
  }

  if (paymentAmount === 0n) {
    return item.payment.network === null && item.payment.asset === null;
  }

  return (
    paymentAmount <= TELEGRAPH_X402_POLICY.maxAmountRaw &&
    item.payment.network === TELEGRAPH_X402_POLICY.network &&
    typeof item.payment.asset === "string" &&
    addressesEqual(item.payment.asset, TELEGRAPH_X402_POLICY.asset)
  );
}

export function hashAdaptiveEvidencePlan(
  plan: AdaptiveEvidencePlan
): string {
  return hashCanonicalPayload(
    canonicalize(plan)
  );
}

function toItem(
  plan: AdaptiveEvidencePlan,
  input: EvidenceBundleItemInput
): AdaptiveEvidenceItem {
  const evidence = input.evidence;

  if (
    !plan.requirements.some(
      (item) => item.intent === evidence.intent
    )
  ) {
    throw new Error(
      `evidence_intent_not_required:${evidence.intent}`
    );
  }

  if (!addressesEqual(evidence.subject, plan.subject)) {
    throw new Error("evidence_bundle_subject_mismatch");
  }

  if (evidence.chainId !== plan.chainId) {
    throw new Error("evidence_bundle_chain_mismatch");
  }

  const amountRaw =
    input.paymentAmountRaw ?? "0";

  requireUnsignedInteger(
    amountRaw,
    "evidence_payment_amount"
  );

  return {
    intent:
      evidence.intent as AdaptiveEvidenceIntent,
    routeMode:
      "TELEGRAPH_INTENT_ROUTE",
    miner: {
      id: evidence.miner.id,
      name: evidence.miner.name,
      slug: evidence.miner.slug
    },
    subject:
      evidence.subject.toLowerCase(),
    chainId:
      evidence.chainId,
    label:
      evidence.label,
    confidence:
      evidence.confidence,
    reason:
      evidence.reason,
    applicability:
      evidence.applicability,
    signalHash:
      evidence.signalHash,
    rawResponseHash:
      evidence.rawResponseHash,
    receivedAt:
      evidence.receivedAt,
    durationMs:
      evidence.durationMs,
    costUsd:
      evidence.costUsd,
    payment: {
      amountRaw,
      network:
        input.paymentNetwork ?? null,
      asset:
        input.paymentAsset ?? null
    }
  };
}

export function createEvidenceBundle(
  action: ActionContract,
  plan: AdaptiveEvidencePlan,
  inputs: EvidenceBundleItemInput[],
  options?: {
    now?: Date;
  }
): EvidenceBundle {
  if (
    plan.actionId !== action.id ||
    plan.actionHash !== action.actionHash ||
    !addressesEqual(plan.subject, action.payload.destination) ||
    plan.chainId !== action.payload.chainId ||
    plan.amountRaw !== action.payload.amountRaw
  ) {
    throw new Error("adaptive_plan_action_mismatch");
  }

  requireUnsignedInteger(
    plan.maxEvidenceSpendRaw,
    "max_evidence_spend"
  );

  const items = inputs.map(
    (input) => toItem(plan, input)
  );

  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.intent)) {
      throw new Error(
        `duplicate_evidence_intent:${item.intent}`
      );
    }
    seen.add(item.intent);
  }

  const requirementOrder = new Map(
    plan.requirements.map(
      (item, index) => [item.intent, index]
    )
  );

  items.sort(
    (a, b) =>
      (requirementOrder.get(a.intent) ?? 999) -
      (requirementOrder.get(b.intent) ?? 999)
  );

  const totalEvidenceSpendRaw =
    items.reduce(
      (total, item) =>
        total +
        requireUnsignedInteger(
          item.payment.amountRaw,
          "evidence_payment_amount"
        ),
      0n
    ).toString();

  const body: EvidenceBundleBody = {
    schemaVersion:
      "proofgate.evidence-bundle.v1",
    actionId:
      action.id,
    actionHash:
      action.actionHash,
    subject:
      action.payload.destination.toLowerCase(),
    chainId:
      action.payload.chainId,
    amountRaw:
      action.payload.amountRaw,
    riskTier:
      plan.riskTier,
    planHash:
      hashAdaptiveEvidencePlan(plan),
    maxEvidenceSpendRaw:
      plan.maxEvidenceSpendRaw,
    totalEvidenceSpendRaw,
    items,
    createdAt:
      (options?.now ?? new Date()).toISOString()
  };

  return {
    ...body,
    bundleHash:
      hashCanonicalPayload(
        canonicalize(body)
      )
  };
}

export function isEvidenceBundle(
  value: unknown
): value is EvidenceBundle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate =
    value as Partial<EvidenceBundle>;

  return (
    candidate.schemaVersion ===
      "proofgate.evidence-bundle.v1" &&
    typeof candidate.bundleHash === "string" &&
    Array.isArray(candidate.items)
  );
}

export function verifyEvidenceBundle(
  bundle: EvidenceBundle
): boolean {
  try {
    const {
      bundleHash,
      ...body
    } = bundle;

    if (!isSha256Hex(bundleHash) || !isSha256Hex(bundle.actionHash) || !isSha256Hex(bundle.planHash)) {
      return false;
    }

    if (!validTimestamp(bundle.createdAt)) {
      return false;
    }

    if (
      bundleHash !==
      hashCanonicalPayload(
        canonicalize(body)
      )
    ) {
      return false;
    }

    requireUnsignedInteger(
      bundle.maxEvidenceSpendRaw,
      "max_evidence_spend"
    );

    const total = bundle.items.reduce(
      (sum, item) =>
        sum +
        requireUnsignedInteger(
          item.payment.amountRaw,
          "evidence_payment_amount"
        ),
      0n
    );

    if (
      total.toString() !==
      bundle.totalEvidenceSpendRaw
    ) {
      return false;
    }

    const intents =
      bundle.items.map((item) => item.intent);

    if (
      new Set(intents).size !==
      intents.length
    ) {
      return false;
    }

    return bundle.items.every(
      (item) =>
        validEvidenceItem(item) &&
        addressesEqual(
          item.subject,
          bundle.subject
        ) &&
        item.chainId === bundle.chainId
    );
  } catch {
    return false;
  }
}

export type AuthorizationEvidence =
  | TelegraphEvidenceRecord
  | EvidenceBundle;

export function authorizationEvidenceMatchesAction(
  evidence: AuthorizationEvidence,
  action: ActionContract
): boolean {
  if (isEvidenceBundle(evidence)) {
    return (
      verifyEvidenceBundle(evidence) &&
      evidence.actionId === action.id &&
      evidence.actionHash === action.actionHash &&
      addressesEqual(
        evidence.subject,
        action.payload.destination
      ) &&
      evidence.chainId ===
        action.payload.chainId &&
      evidence.amountRaw ===
        action.payload.amountRaw
    );
  }

  return (
    addressesEqual(
      evidence.subject,
      action.payload.destination
    ) &&
    evidence.chainId ===
      action.payload.chainId
  );
}

export function evidenceCommitmentForHash(
  evidence: AuthorizationEvidence
): unknown {
  if (isEvidenceBundle(evidence)) {
    return {
      kind: "bundle",
      schemaVersion:
        evidence.schemaVersion,
      bundleHash:
        evidence.bundleHash,
      planHash:
        evidence.planHash,
      actionId:
        evidence.actionId,
      actionHash:
        evidence.actionHash,
      subject:
        evidence.subject,
      chainId:
        evidence.chainId,
      riskTier:
        evidence.riskTier,
      totalEvidenceSpendRaw:
        evidence.totalEvidenceSpendRaw,
      items:
        evidence.items.map((item) => ({
          intent: item.intent,
          miner: item.miner,
          subject: item.subject,
          chainId: item.chainId,
          label: item.label,
          confidence: item.confidence,
          applicability:
            item.applicability,
          signalHash:
            item.signalHash,
          rawResponseHash:
            item.rawResponseHash,
          receivedAt:
            item.receivedAt,
          payment:
            item.payment
        }))
    };
  }

  return {
    kind: "single",
    source: evidence.source,
    intent: evidence.intent,
    miner: evidence.miner,
    subject: evidence.subject,
    chainId: evidence.chainId,
    label: evidence.label,
    confidence: evidence.confidence,
    applicability:
      evidence.applicability,
    signalHash: evidence.signalHash,
    rawResponseHash:
      evidence.rawResponseHash,
    receivedAt:
      evidence.receivedAt
  };
}
