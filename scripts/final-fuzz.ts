import fs from "node:fs";
import path from "node:path";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  canonicalize,
  createActionContract,
  hashCanonicalPayload,
  type ActionContract
} from "../src/core/action-contract.js";
import {
  createMandateContract,
  type MandateContract
} from "../src/core/mandate-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../src/evidence/telegraph.js";
import {
  ATTESTED_VENDOR_PROFILE,
  buildExpectedVendorRuntimeCode,
  type VendorRuntimeAttestation
} from "../src/evidence/vendor-runtime.js";
import {
  executeProtectedAction
} from "../src/executor/controlled-executor.js";
import type {
  ConsumeResult,
  PermitConsumption,
  PermitConsumptionStore
} from "../src/executor/permit-store.js";
import {
  evaluatePaymentsAttestedVendorV1
} from "../src/policy/payments-attested-vendor-v1.js";
import type {
  DecisionRecord
} from "../src/policy/payments-strict-v1.js";
import {
  mintPermit,
  type Permit
} from "../src/permit/permit.js";

const AGENT = "procurement-agent";
const SECRET = "proofgate-final-fuzz-secret-" + "x".repeat(64);
const NOW = new Date("2026-09-02T17:38:18.426Z");
const CASES_PER_FAMILY = 100;
const CONTROL_CASES = 100;

class SingleUseMemoryStore implements PermitConsumptionStore {
  private record: PermitConsumption | null = null;

  consume(
    permitId: string,
    nonce: string,
    consumedAt: string,
    executionId?: string
  ): ConsumeResult {
    if (this.record) {
      return {
        consumed: false,
        code: "permit_already_consumed_by_other_execution",
        consumption: this.record
      };
    }

    this.record = {
      permitId,
      nonce,
      consumedAt,
      ...(executionId ? { executionId } : {})
    };

    return {
      consumed: true,
      code: "permit_consumed"
    };
  }

  isConsumed(
    permitId: string,
    nonce: string
  ): boolean {
    return Boolean(
      this.record &&
      this.record.permitId === permitId &&
      this.record.nonce === nonce
    );
  }

  getConsumption(
    permitId: string,
    nonce: string
  ): PermitConsumption | null {
    if (
      this.record &&
      this.record.permitId === permitId &&
      this.record.nonce === nonce
    ) {
      return this.record;
    }

    return null;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function addressFor(seed: number): string {
  return `0x${BigInt(seed).toString(16).padStart(40, "0")}`;
}

function buildAttestation(): VendorRuntimeAttestation {
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join("artifacts", "vendor", "ProofGateVendor.json"),
      "utf8"
    )
  ) as {
    compiler: string;
    deployedBytecode: string;
  };

  const runtime = buildExpectedVendorRuntimeCode(
    artifact.deployedBytecode,
    ATTESTED_VENDOR_PROFILE.vendorId
  );

  const body = {
    schemaVersion: "proofgate.vendor-runtime-attestation.v1" as const,
    source: "base_sepolia_rpc" as const,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    address: ATTESTED_VENDOR_PROFILE.address.toLowerCase(),
    blockNumber: 46301204,
    blockHash: `0x${"2".repeat(64)}`,
    runtimeCode: runtime.toLowerCase(),
    runtimeBytes: ATTESTED_VENDOR_PROFILE.runtimeBytes,
    runtimeKeccak256: ATTESTED_VENDOR_PROFILE.runtimeKeccak256,
    expectedRuntimeKeccak256: ATTESTED_VENDOR_PROFILE.runtimeKeccak256,
    vendorId: ATTESTED_VENDOR_PROFILE.vendorId,
    version: ATTESTED_VENDOR_PROFILE.version,
    compiler: artifact.compiler,
    exactCompiledRuntimeMatch: true,
    capturedAt: new Date(NOW.getTime() - 5_000).toISOString()
  };

  return {
    ...body,
    attestationHash: hashCanonicalPayload(canonicalize(body))
  };
}

function buildEvidence(): TelegraphEvidenceRecord {
  return {
    source: "telegraph",
    intent: "FRAUD_DETECTION",
    miner: {
      id: "95822412",
      name: "Refut On-Chain Risk",
      slug: "refut-onchain-risk"
    },
    subject: ATTESTED_VENDOR_PROFILE.address.toLowerCase(),
    chainId: BASE_SEPOLIA_CHAIN_ID,
    label: "ALLOW",
    confidence: 0.70,
    reason: "Deterministic final fuzz fixture; no live request is performed.",
    applicability: "APPLICABLE",
    signalHash: `0x${"a".repeat(64)}`,
    costUsd: 0.01,
    durationMs: 25,
    rawResponseHash: `0x${"b".repeat(64)}`,
    receivedAt: new Date(NOW.getTime() - 10_000).toISOString(),
    rawResponse: {
      fixture: "final-fuzz-only"
    }
  };
}

function buildMandate(): MandateContract {
  return createMandateContract({
    mandateId: "final-fuzz-attested-v1",
    principalId: "company-demo",
    agentId: AGENT,
    allowedActionTypes: ["payment"],
    allowedChainIds: [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets: [BASE_SEPOLIA_USDC],
    allowedDestinations: [ATTESTED_VENDOR_PROFILE.address],
    maxPerActionRaw: "10000000",
    maxCumulativeRaw: "100000000",
    requiredIntents: ["FRAUD_DETECTION"],
    policyId: "payments.attested-vendor.v1",
    policyVersion: 1,
    issuedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-08T01:00:00.000Z",
    status: "ACTIVE",
    version: 1
  });
}

function buildAction(): ActionContract {
  return createActionContract({
    type: "payment",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    token: BASE_SEPOLIA_USDC,
    amountRaw: "1000000",
    destination: ATTESTED_VENDOR_PROFILE.address,
    reason: "Final fuzz invoice",
    policyId: "payments.attested-vendor.v1",
    policyVersion: 1
  });
}

interface CaseContext {
  mandate: MandateContract;
  action: ActionContract;
  evidence: TelegraphEvidenceRecord;
  decision: DecisionRecord;
  permit: Permit;
  now: Date;
}

interface MutationFamily {
  id: string;
  mutate: (context: CaseContext, index: number) => void;
}

const families: MutationFamily[] = [
  {
    id: "action_amount_stale_hash",
    mutate: (context, index) => {
      context.action.payload.amountRaw = String(2_000_000 + index);
    }
  },
  {
    id: "action_destination_swap",
    mutate: (context, index) => {
      context.action.payload.destination = addressFor(10_000 + index);
    }
  },
  {
    id: "action_chain_confusion",
    mutate: (context, index) => {
      context.action.payload.chainId = 1 + index;
    }
  },
  {
    id: "action_asset_swap",
    mutate: (context, index) => {
      context.action.payload.token = addressFor(20_000 + index);
    }
  },
  {
    id: "action_reason_mutation",
    mutate: (context, index) => {
      context.action.payload.reason = `Mutated reason ${index}`;
    }
  },
  {
    id: "permit_signature_forgery",
    mutate: (context, index) => {
      const suffix = (index % 256).toString(16).padStart(2, "0");
      context.permit.signature = `0x${"0".repeat(62)}${suffix}`;
    }
  },
  {
    id: "evidence_subject_swap",
    mutate: (context, index) => {
      context.evidence.subject = addressFor(30_000 + index);
    }
  },
  {
    id: "evidence_chain_swap",
    mutate: (context, index) => {
      context.evidence.chainId = 100_000 + index;
    }
  },
  {
    id: "decision_commitment_tamper",
    mutate: (context, index) => {
      context.decision.reason = `tampered-decision-${index}`;
    }
  },
  {
    id: "mandate_version_substitution",
    mutate: (context, index) => {
      context.mandate.version = 2 + index;
    }
  },
  {
    id: "expired_permit",
    mutate: (context, index) => {
      context.now = new Date(
        NOW.getTime() + 31_000 + index
      );
    }
  }
];

const baselineMandate = buildMandate();
const baselineAction = buildAction();
const baselineEvidence = buildEvidence();
const baselineAttestation = buildAttestation();
const baselineDecision = evaluatePaymentsAttestedVendorV1(
  baselineMandate,
  baselineAction,
  baselineEvidence,
  baselineAttestation,
  {
    agentId: AGENT,
    now: NOW
  }
);

if (
  baselineDecision.decision !== "ALLOW" ||
  baselineDecision.checks.some((item) => item.status !== "PASS")
) {
  throw new Error("final_fuzz_baseline_not_allow");
}

const baselinePermit = mintPermit(
  baselineMandate,
  baselineAction,
  baselineEvidence,
  baselineDecision,
  SECRET,
  {
    now: NOW,
    ttlSeconds: 30
  }
);

let validControlsPassed = 0;
let unauthorizedExecutions = 0;
let uncaughtErrors = 0;
const familyResults = new Map<string, number>();

for (let index = 0; index < CONTROL_CASES; index++) {
  let executions = 0;

  try {
    const result = await executeProtectedAction({
      mandate: clone(baselineMandate),
      permit: clone(baselinePermit),
      action: clone(baselineAction),
      evidence: clone(baselineEvidence),
      decision: clone(baselineDecision),
      secret: SECRET,
      store: new SingleUseMemoryStore(),
      execute: async () => {
        executions++;
        return { control: index };
      },
      now: new Date(NOW.getTime() + 1_000)
    });

    if (result.status === "EXECUTED" && executions === 1) {
      validControlsPassed++;
    }
  } catch {
    uncaughtErrors++;
  }
}

for (const family of families) {
  let contained = 0;

  for (let index = 0; index < CASES_PER_FAMILY; index++) {
    const context: CaseContext = {
      mandate: clone(baselineMandate),
      action: clone(baselineAction),
      evidence: clone(baselineEvidence),
      decision: clone(baselineDecision),
      permit: clone(baselinePermit),
      now: new Date(NOW.getTime() + 1_000)
    };

    family.mutate(context, index);

    let executions = 0;

    try {
      const result = await executeProtectedAction({
        mandate: context.mandate,
        permit: context.permit,
        action: context.action,
        evidence: context.evidence,
        decision: context.decision,
        secret: SECRET,
        store: new SingleUseMemoryStore(),
        execute: async () => {
          executions++;
          return {
            family: family.id,
            index
          };
        },
        now: context.now
      });

      if (result.status === "EXECUTED" || executions > 0) {
        unauthorizedExecutions++;
      } else {
        contained++;
      }
    } catch {
      uncaughtErrors++;
    }
  }

  familyResults.set(family.id, contained);
}

const adversarialTotal = families.length * CASES_PER_FAMILY;
const adversarialContained = [...familyResults.values()]
  .reduce((sum, value) => sum + value, 0);

console.log("");
console.log("PROOFGATE FINAL FUZZ");
console.log("====================");
console.log("Mode: OFFLINE_DETERMINISTIC");
console.log("Policy: payments.attested-vendor.v1");
console.log("Mutation families:", families.length);
console.log("Cases per family:", CASES_PER_FAMILY);
console.log("");

for (const family of families) {
  console.log(
    `${familyResults.get(family.id) === CASES_PER_FAMILY ? "PASS" : "FAIL"} | ${family.id} | ${familyResults.get(family.id) ?? 0}/${CASES_PER_FAMILY}`
  );
}

console.log("");
console.log(
  `Adversarial cases contained: ${adversarialContained}/${adversarialTotal}`
);
console.log(
  `Valid controls passed: ${validControlsPassed}/${CONTROL_CASES}`
);
console.log(
  `Unauthorized executions: ${unauthorizedExecutions}`
);
console.log(
  `Uncaught errors: ${uncaughtErrors}`
);
console.log("Telegraph requests: 0");
console.log("x402 payments: 0");
console.log("Blockchain writes: 0");

if (
  adversarialContained !== adversarialTotal ||
  validControlsPassed !== CONTROL_CASES ||
  unauthorizedExecutions !== 0 ||
  uncaughtErrors !== 0
) {
  process.exitCode = 2;
}
