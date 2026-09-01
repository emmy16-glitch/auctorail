import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  canonicalize,
  type ActionContract
} from "../core/action-contract.js";

import type {
  TelegraphEvidenceRecord
} from "../evidence/telegraph.js";

import type {
  DecisionRecord
} from "../policy/payments-strict-v1.js";

import {
  createDecisionHash
} from "./decision-hash.js";

export interface PermitPayload {
  permitId: string;

  actionHash: string;

  decisionHash: string;

  nonce: string;

  policyId:
    "payments.strict.v1";

  issuedAt: string;

  expiresAt: string;
}

export interface Permit {
  payload: PermitPayload;

  signature: string;
}

export type PermitVerificationCode =
  | "permit_valid"
  | "invalid_permit_signature"
  | "action_hash_mismatch"
  | "decision_hash_mismatch"
  | "permit_expired"
  | "decision_not_allow";

export interface PermitVerificationResult {
  valid: boolean;

  code:
    PermitVerificationCode;
}

function requireStrongSecret(
  secret: string
): void {
  if (
    !secret ||
    secret.length < 32
  ) {
    throw new Error(
      "PROOFGATE_SECRET must contain at least 32 characters"
    );
  }
}

function signPermitPayload(
  payload: PermitPayload,
  secret: string
): string {
  requireStrongSecret(secret);

  return (
    "0x" +
    createHmac(
      "sha256",
      secret
    )
      .update(
        canonicalize(payload),
        "utf8"
      )
      .digest("hex")
  );
}

function safeSignatureEqual(
  supplied: string,
  expected: string
): boolean {
  try {
    const a =
      Buffer.from(
        supplied.replace(/^0x/, ""),
        "hex"
      );

    const b =
      Buffer.from(
        expected.replace(/^0x/, ""),
        "hex"
      );

    if (
      a.length === 0 ||
      a.length !== b.length
    ) {
      return false;
    }

    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function mintPermit(
  action: ActionContract,
  evidence: TelegraphEvidenceRecord,
  decision: DecisionRecord,
  secret: string,
  options?: {
    now?: Date;
    ttlSeconds?: number;
  }
): Permit {
  if (
    decision.decision !==
    "ALLOW"
  ) {
    throw new Error(
      "decision_not_allow"
    );
  }

  const now =
    options?.now ??
    new Date();

  const ttlSeconds =
    options?.ttlSeconds ??
    30;

  if (
    ttlSeconds <= 0 ||
    ttlSeconds > 300
  ) {
    throw new Error(
      "invalid_permit_ttl"
    );
  }

  const expiresAt =
    new Date(
      now.getTime() +
      ttlSeconds * 1000
    );

  const decisionHash =
    createDecisionHash(
      action,
      evidence,
      decision
    );

  const payload:
    PermitPayload = {
      permitId:
        randomUUID(),

      actionHash:
        action.actionHash,

      decisionHash,

      nonce:
        randomBytes(16)
          .toString("hex"),

      policyId:
        decision.policyId,

      issuedAt:
        now.toISOString(),

      expiresAt:
        expiresAt.toISOString()
    };

  return {
    payload,

    signature:
      signPermitPayload(
        payload,
        secret
      )
  };
}

export function verifyPermit(
  permit: Permit,
  action: ActionContract,
  evidence: TelegraphEvidenceRecord,
  decision: DecisionRecord,
  secret: string,
  options?: {
    now?: Date;
  }
): PermitVerificationResult {
  requireStrongSecret(secret);

  const expectedSignature =
    signPermitPayload(
      permit.payload,
      secret
    );

  if (
    !safeSignatureEqual(
      permit.signature,
      expectedSignature
    )
  ) {
    return {
      valid: false,
      code:
        "invalid_permit_signature"
    };
  }

  if (
    decision.decision !==
    "ALLOW"
  ) {
    return {
      valid: false,
      code:
        "decision_not_allow"
    };
  }

  const now =
    options?.now ??
    new Date();

  if (
    now.getTime() >=
    new Date(
      permit.payload.expiresAt
    ).getTime()
  ) {
    return {
      valid: false,
      code:
        "permit_expired"
    };
  }

  if (
    permit.payload.actionHash !==
    action.actionHash
  ) {
    return {
      valid: false,
      code:
        "action_hash_mismatch"
    };
  }

  const expectedDecisionHash =
    createDecisionHash(
      action,
      evidence,
      decision
    );

  if (
    permit.payload.decisionHash !==
    expectedDecisionHash
  ) {
    return {
      valid: false,
      code:
        "decision_hash_mismatch"
    };
  }

  return {
    valid: true,
    code:
      "permit_valid"
  };
}
