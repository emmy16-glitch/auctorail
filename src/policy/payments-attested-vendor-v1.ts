import {
  getAddress
} from "ethers";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  type ActionContract
} from "../core/action-contract.js";
import {
  evaluateMandate,
  type MandateContract
} from "../core/mandate-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../evidence/telegraph.js";
import {
  ATTESTED_VENDOR_PROFILE,
  verifyVendorRuntimeAttestation,
  type VendorRuntimeAttestation
} from "../evidence/vendor-runtime.js";
import {
  classifyMinerLabel,
  type CheckStatus,
  type DecisionRecord,
  type PaymentsStrictEvaluationOptions,
  type PolicyCheck
} from "./payments-strict-v1.js";

export const PAYMENTS_ATTESTED_VENDOR_V1 = {
  id:
    "payments.attested-vendor.v1" as const,
  allowedChainId:
    BASE_SEPOLIA_CHAIN_ID,
  allowedToken:
    BASE_SEPOLIA_USDC,
  allowedDestination:
    ATTESTED_VENDOR_PROFILE.address,
  maxAutonomousAmountRaw:
    10_000_000n,
  minimumTelegraphConfidence:
    0.70,
  maxTelegraphEvidenceAgeSeconds:
    300,
  maxAttestationAgeSeconds:
    ATTESTED_VENDOR_PROFILE
      .maxAgeSeconds,
  requiredIntent:
    "FRAUD_DETECTION" as const,
  requiredMinerSlug:
    "refut-onchain-risk" as const,
  requireSignalHash:
    true,
  requireExactRuntimeAttestation:
    true,
  failClosed:
    true
};

function check(
  name: string,
  status: CheckStatus,
  reason: string,
  code?: string
): PolicyCheck {
  return {
    name,
    status,
    reason,
    ...(code
      ? {
          code
        }
      : {})
  };
}

function addressesEqual(
  a: string,
  b: string
): boolean {
  try {
    return (
      getAddress(a) ===
      getAddress(b)
    );
  } catch {
    return false;
  }
}

function fresh(
  timestamp: string,
  now: Date,
  maxAgeSeconds: number
): boolean {
  const at =
    new Date(
      timestamp
    ).getTime();

  const age =
    now.getTime() -
    at;

  return (
    Number.isFinite(at) &&
    age >= 0 &&
    age <=
      maxAgeSeconds *
        1000
  );
}

export function evaluatePaymentsAttestedVendorV1(
  mandate: MandateContract,
  action: ActionContract,
  evidence:
    TelegraphEvidenceRecord |
    null,
  attestation:
    VendorRuntimeAttestation |
    null,
  options:
    PaymentsStrictEvaluationOptions
): DecisionRecord {
  const checks:
    PolicyCheck[] = [];

  const now =
    options.now ??
    new Date();

  const mandateEvaluation =
    evaluateMandate(
      mandate,
      action,
      options.agentId,
      now
    );

  checks.push(
    ...mandateEvaluation.checks.map(
      (item) =>
        check(
          item.name,
          item.status,
          item.reason,
          item.code
        )
    )
  );

  checks.push(
    check(
      "allowed_chain",
      action.payload.chainId ===
        PAYMENTS_ATTESTED_VENDOR_V1
          .allowedChainId
        ? "PASS"
        : "BLOCK",
      action.payload.chainId ===
        PAYMENTS_ATTESTED_VENDOR_V1
          .allowedChainId
        ? "Action uses Base Sepolia."
        : "Action uses a prohibited chain."
    )
  );

  checks.push(
    check(
      "allowed_asset",
      addressesEqual(
        action.payload.token,
        PAYMENTS_ATTESTED_VENDOR_V1
          .allowedToken
      )
        ? "PASS"
        : "BLOCK",
      addressesEqual(
        action.payload.token,
        PAYMENTS_ATTESTED_VENDOR_V1
          .allowedToken
      )
        ? "Action uses approved Base Sepolia USDC."
        : "Action uses an unauthorized asset."
    )
  );

  checks.push(
    check(
      "attested_vendor_destination",
      addressesEqual(
        action.payload.destination,
        PAYMENTS_ATTESTED_VENDOR_V1
          .allowedDestination
      )
        ? "PASS"
        : "BLOCK",
      addressesEqual(
        action.payload.destination,
        PAYMENTS_ATTESTED_VENDOR_V1
          .allowedDestination
      )
        ? "Action targets the exact vendor identity pinned by the attested-vendor policy."
        : "Action targets a destination outside the attested-vendor policy."
    )
  );

  const amount =
    BigInt(
      action.payload.amountRaw
    );

  checks.push(
    check(
      "autonomous_amount_limit",
      amount <=
        PAYMENTS_ATTESTED_VENDOR_V1
          .maxAutonomousAmountRaw
        ? "PASS"
        : "BLOCK",
      amount <=
        PAYMENTS_ATTESTED_VENDOR_V1
          .maxAutonomousAmountRaw
        ? "Amount is within autonomous spending policy."
        : "Amount exceeds autonomous spending limit."
    )
  );

  if (!evidence) {
    checks.push(
      check(
        "telegraph_evidence",
        "HOLD",
        "Required Telegraph evidence is missing."
      )
    );
  } else {
    checks.push(
      check(
        "telegraph_evidence",
        "PASS",
        "Real Telegraph evidence is present."
      )
    );

    checks.push(
      check(
        "required_intent",
        evidence.intent ===
          PAYMENTS_ATTESTED_VENDOR_V1
            .requiredIntent
          ? "PASS"
          : "HOLD",
        evidence.intent ===
          PAYMENTS_ATTESTED_VENDOR_V1
            .requiredIntent
          ? "Required FRAUD_DETECTION evidence is present."
          : "Evidence does not satisfy the required intent."
      )
    );

    checks.push(
      check(
        "required_miner_profile",
        evidence.miner.slug ===
          PAYMENTS_ATTESTED_VENDOR_V1
            .requiredMinerSlug
          ? "PASS"
          : "HOLD",
        evidence.miner.slug ===
          PAYMENTS_ATTESTED_VENDOR_V1
            .requiredMinerSlug
          ? "Telegraph evidence came from the contract-control Miner profile bound to this policy."
          : "Telegraph evidence came from a Miner outside the attested-vendor evidence profile."
      )
    );

    checks.push(
      check(
        "evidence_subject_binding",
        addressesEqual(
          evidence.subject,
          action.payload.destination
        )
          ? "PASS"
          : "BLOCK",
        addressesEqual(
          evidence.subject,
          action.payload.destination
        )
          ? "Evidence subject matches the exact payment destination."
          : "Evidence was produced for a different destination."
      )
    );

    checks.push(
      check(
        "evidence_chain_binding",
        evidence.chainId ===
          action.payload.chainId
          ? "PASS"
          : "BLOCK",
        evidence.chainId ===
          action.payload.chainId
          ? "Evidence chain matches the Action Contract."
          : "Evidence belongs to a different chain."
      )
    );

    checks.push(
      check(
        "evidence_applicability",
        evidence.applicability ===
          "APPLICABLE"
          ? "PASS"
          : "HOLD",
        evidence.applicability ===
          "APPLICABLE"
          ? "Miner assessment is applicable to this target."
          : "Miner evidence is not sufficiently applicable to this exact target."
      )
    );

    checks.push(
      check(
        "corroborative_confidence",
        evidence.confidence !==
          null &&
        evidence.confidence >=
          PAYMENTS_ATTESTED_VENDOR_V1
            .minimumTelegraphConfidence
          ? "PASS"
          : "HOLD",
        evidence.confidence !==
          null &&
        evidence.confidence >=
          PAYMENTS_ATTESTED_VENDOR_V1
            .minimumTelegraphConfidence
          ? `Telegraph confidence ${evidence.confidence} satisfies the composite-policy corroboration floor ${PAYMENTS_ATTESTED_VENDOR_V1.minimumTelegraphConfidence}.`
          : `Telegraph confidence ${evidence.confidence ?? "missing"} does not satisfy the composite-policy corroboration floor ${PAYMENTS_ATTESTED_VENDOR_V1.minimumTelegraphConfidence}.`
      )
    );

    const minerStatus =
      classifyMinerLabel(
        evidence.label
      );

    checks.push(
      check(
        "miner_result",
        minerStatus,
        `Telegraph Miner returned ${evidence.label ?? "no verdict"}.`
      )
    );

    checks.push(
      check(
        "telegraph_signal_hash",
        evidence.signalHash
          ? "PASS"
          : "HOLD",
        evidence.signalHash
          ? "Telegraph signal hash is present."
          : "Telegraph signal hash is missing."
      )
    );

    checks.push(
      check(
        "telegraph_evidence_freshness",
        fresh(
          evidence.receivedAt,
          now,
          PAYMENTS_ATTESTED_VENDOR_V1
            .maxTelegraphEvidenceAgeSeconds
        )
          ? "PASS"
          : "HOLD",
        fresh(
          evidence.receivedAt,
          now,
          PAYMENTS_ATTESTED_VENDOR_V1
            .maxTelegraphEvidenceAgeSeconds
        )
          ? "Telegraph evidence is fresh."
          : "Telegraph evidence is stale or has an invalid timestamp."
      )
    );
  }

  if (!attestation) {
    checks.push(
      check(
        "vendor_runtime_attestation",
        "HOLD",
        "Exact live vendor runtime attestation is missing."
      )
    );
  } else {
    const verified =
      verifyVendorRuntimeAttestation(
        attestation
      );

    checks.push(
      check(
        "vendor_runtime_attestation",
        verified
          ? "PASS"
          : "BLOCK",
        verified
          ? `Live Base Sepolia runtime exactly matches the pinned ProofGateVendor runtime (${attestation.runtimeKeccak256}); attestation ${attestation.attestationHash}.`
          : "Live vendor runtime attestation failed integrity or exact-runtime verification."
      )
    );

    checks.push(
      check(
        "vendor_attestation_freshness",
        verified &&
        fresh(
          attestation.capturedAt,
          now,
          PAYMENTS_ATTESTED_VENDOR_V1
            .maxAttestationAgeSeconds
        )
          ? "PASS"
          : "HOLD",
        verified &&
        fresh(
          attestation.capturedAt,
          now,
          PAYMENTS_ATTESTED_VENDOR_V1
            .maxAttestationAgeSeconds
        )
          ? "Vendor runtime attestation is fresh."
          : "Vendor runtime attestation is stale or has an invalid timestamp."
      )
    );
  }

  return finalize(
    mandate,
    options.agentId,
    action,
    checks,
    now,
    attestation
  );
}

function finalize(
  mandate:
    MandateContract,
  agentId:
    string,
  action:
    ActionContract,
  checks:
    PolicyCheck[],
  now:
    Date,
  attestation:
    VendorRuntimeAttestation |
    null
): DecisionRecord {
  const context:
    Omit<
      DecisionRecord,
      "decision" |
      "reason"
    > =
    {
      mandate: {
        mandateId:
          mandate.mandateId,
        mandateHash:
          mandate.mandateHash,
        principalId:
          mandate.principalId,
        agentId:
          mandate.agentId,
        version:
          mandate.version
      },
      agentId:
        agentId.trim(),
      actionId:
        action.id,
      policyId:
        "payments.attested-vendor.v1",
      policyVersion: 1,
      checks,
      decidedAt:
        now.toISOString(),
      ...(attestation
        ? {
            evidenceRefs: {
              vendorRuntimeAttestationHash:
                attestation
                  .attestationHash
            }
          }
        : {})
    };

  const blocked =
    checks.find(
      (item) =>
        item.status ===
        "BLOCK"
    );

  if (blocked) {
    return {
      ...context,
      decision:
        "BLOCK",
      reason:
        blocked.code ??
        blocked.name
    };
  }

  const held =
    checks.find(
      (item) =>
        item.status ===
        "HOLD"
    );

  if (held) {
    return {
      ...context,
      decision:
        "HOLD",
      reason:
        held.code ??
        held.name
    };
  }

  return {
    ...context,
    decision:
      "ALLOW",
    reason:
      "composite_attested_vendor_checks_passed"
  };
}
