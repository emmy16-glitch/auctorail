import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  canonicalize,
  createActionContract,
  hashCanonicalPayload,
  BASE_SEPOLIA_USDC
} from "../core/action-contract.js";
import {
  createMandateContract
} from "../core/mandate-contract.js";
import type {
  TelegraphEvidenceRecord
} from "../evidence/telegraph.js";
import {
  ATTESTED_VENDOR_PROFILE,
  buildExpectedVendorRuntimeCode,
  supplementalRefFromVendorAttestation,
  type VendorRuntimeAttestation
} from "../evidence/vendor-runtime.js";
import {
  executeProtectedAction
} from "../executor/controlled-executor.js";
import {
  FilePermitConsumptionStore
} from "../executor/permit-store.js";
import {
  evaluatePaymentsAttestedVendorV1
} from "../policy/payments-attested-vendor-v1.js";
import {
  mintPermit,
  verifyPermit,
  type Permit
} from "../permit/permit.js";
import {
  createProofReceipt,
  verifyProofReceipt
} from "../receipt/proof-receipt.js";

const AGENT =
  "procurement-agent";

const SECRET =
  "proofgate-attack-lab-secret-" +
  "x".repeat(64);

const NOW =
  new Date(
    "2026-09-01T23:20:20.000Z"
  );

const VENDOR =
  ATTESTED_VENDOR_PROFILE.address;

const OTHER_VENDOR =
  "0x1111111111111111111111111111111111111111";

export interface AttackScenarioResult {
  id: string;
  attack: string;
  expected: string;
  observed: string;
  passed: boolean;
}

export interface AttackLabReport {
  schemaVersion:
    "proofgate.attack-lab.v1";
  mode:
    "OFFLINE_DETERMINISTIC";
  policyId:
    "payments.attested-vendor.v1";
  baselineDecision:
    string;
  scenarios:
    AttackScenarioResult[];
  passed:
    number;
  total:
    number;
  allPassed:
    boolean;
}

function buildAttestation():
  VendorRuntimeAttestation {
  const artifact =
    JSON.parse(
      fs.readFileSync(
        path.join(
          "artifacts",
          "vendor",
          "ProofGateVendor.json"
        ),
        "utf8"
      )
    ) as {
      compiler: string;
      deployedBytecode: string;
    };

  const runtime =
    buildExpectedVendorRuntimeCode(
      artifact.deployedBytecode,
      ATTESTED_VENDOR_PROFILE
        .vendorId
    );

  const body = {
    schemaVersion:
      "proofgate.vendor-runtime-attestation.v1" as const,
    source:
      "base_sepolia_rpc" as const,
    chainId:
      84532,
    address:
      VENDOR.toLowerCase(),
    blockNumber:
      46268077,
    blockHash:
      "0x" +
      "2".repeat(64),
    runtimeCode:
      runtime.toLowerCase(),
    runtimeBytes:
      ATTESTED_VENDOR_PROFILE
        .runtimeBytes,
    runtimeKeccak256:
      ATTESTED_VENDOR_PROFILE
        .runtimeKeccak256,
    expectedRuntimeKeccak256:
      ATTESTED_VENDOR_PROFILE
        .runtimeKeccak256,
    vendorId:
      ATTESTED_VENDOR_PROFILE
        .vendorId,
    version:
      1,
    compiler:
      artifact.compiler,
    exactCompiledRuntimeMatch:
      true,
    capturedAt:
      "2026-09-01T23:20:10.000Z"
  };

  return {
    ...body,
    attestationHash:
      hashCanonicalPayload(
        canonicalize(
          body
        )
      )
  };
}

function buildEvidence(
  overrides?: Partial<
    TelegraphEvidenceRecord
  >
): TelegraphEvidenceRecord {
  const base:
    TelegraphEvidenceRecord =
    {
      source:
        "telegraph",
      intent:
        "FRAUD_DETECTION",
      miner: {
        id:
          "95822412",
        name:
          "Refut On-Chain Risk",
        slug:
          "refut-onchain-risk"
      },
      subject:
        VENDOR.toLowerCase(),
      chainId:
        84532,
      label:
        "ALLOW",
      confidence:
        0.70,
      reason:
        "Deterministic Attack Lab fixture. This is not a live Miner call.",
      applicability:
        "APPLICABLE",
      signalHash:
        "0x" +
        "a".repeat(64),
      costUsd:
        0.01,
      durationMs:
        25,
      rawResponseHash:
        "0x" +
        "b".repeat(64),
      receivedAt:
        "2026-09-01T23:20:00.000Z",
      rawResponse: {
        fixture:
          "attack-lab-only"
      }
    };

  return {
    ...base,
    ...overrides,
    ...(overrides?.miner
      ? {
          miner: {
            ...base.miner,
            ...overrides.miner
          }
        }
      : {})
  };
}

function buildMandate(
  version:
    number =
      1
) {
  return createMandateContract({
    mandateId:
      "attack-lab-attested-v1",
    principalId:
      "company-demo",
    agentId:
      AGENT,
    allowedActionTypes:
      ["payment"],
    allowedChainIds:
      [84532],
    allowedAssets:
      [BASE_SEPOLIA_USDC],
    allowedDestinations:
      [VENDOR],
    maxPerActionRaw:
      "10000000",
    requiredIntents:
      ["FRAUD_DETECTION"],
    policyId:
      "payments.attested-vendor.v1",
    issuedAt:
      "2026-09-01T00:00:00.000Z",
    expiresAt:
      "2026-09-08T01:00:00.000Z",
    version
  });
}

function buildAction(
  amountRaw:
    string =
      "1000000"
) {
  return createActionContract({
    type:
      "payment",
    chainId:
      84532,
    token:
      BASE_SEPOLIA_USDC,
    amountRaw,
    destination:
      VENDOR,
    reason:
      "Attack Lab invoice",
    policyId:
      "payments.attested-vendor.v1"
  });
}

function scenario(
  id: string,
  attack: string,
  expected: string,
  observed: string
): AttackScenarioResult {
  return {
    id,
    attack,
    expected,
    observed,
    passed:
      expected ===
      observed
  };
}

function freshStore(
  name: string
): {
  directory: string;
  store:
    FilePermitConsumptionStore;
} {
  const directory =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        `proofgate-attack-${name}-`
      )
    );

  return {
    directory,
    store:
      new FilePermitConsumptionStore(
        directory
      )
  };
}

export async function runAttackLab():
  Promise<AttackLabReport> {
  const mandate =
    buildMandate();

  const action =
    buildAction();

  const evidence =
    buildEvidence();

  const attestation =
    buildAttestation();

  const decision =
    evaluatePaymentsAttestedVendorV1(
      mandate,
      action,
      evidence,
      attestation,
      {
        agentId:
          AGENT,
        now:
          NOW
      }
    );

  if (
    decision.decision !==
      "ALLOW" ||
    decision.checks.some(
      (item) =>
        item.status !==
        "PASS"
    )
  ) {
    throw new Error(
      "attack_lab_baseline_not_allow"
    );
  }

  const permit =
    mintPermit(
      mandate,
      action,
      evidence,
      decision,
      SECRET,
      {
        now:
          NOW,
        ttlSeconds:
          30
      }
    );

  const results:
    AttackScenarioResult[] = [];

  // 1. Baseline executes exactly once.
  {
    const {
      directory,
      store
    } =
      freshStore(
        "baseline"
      );

    let executions =
      0;

    const baseline =
      await executeProtectedAction({
        mandate,
        permit,
        action,
        evidence,
        decision,
        secret:
          SECRET,
        store,
        execute:
          async () => {
            executions++;

            return {
              transactionHash:
                "0x" +
                "c".repeat(64)
            };
          },
        now:
          new Date(
            NOW.getTime() +
            1_000
          )
      });

    results.push(
      scenario(
        "baseline",
        "Valid exact permit/action executes once.",
        "EXECUTED:1",
        `${baseline.status}:${executions}`
      )
    );

    const replay =
      await executeProtectedAction({
        mandate,
        permit,
        action,
        evidence,
        decision,
        secret:
          SECRET,
        store,
        execute:
          async () => {
            executions++;

            return {
              transactionHash:
                "0x" +
                "d".repeat(64)
            };
          },
        now:
          new Date(
            NOW.getTime() +
            2_000
          )
      });

    results.push(
      scenario(
        "permit_replay",
        "Replay a consumed permit.",
        "permit_already_consumed:1",
        `${replay.code}:${executions}`
      )
    );

    fs.rmSync(
      directory,
      {
        recursive:
          true,
        force:
          true
      }
    );
  }

  // 2. Amount mutation after authorization.
  {
    const mutated =
      buildAction(
        "2000000"
      );

    const verification =
      verifyPermit(
        mandate,
        permit,
        mutated,
        evidence,
        decision,
        SECRET,
        {
          now:
            new Date(
              NOW.getTime() +
              1_000
            )
        }
      );

    results.push(
      scenario(
        "amount_mutation",
        "Change 1 USDC to 2 USDC after authorization.",
        "action_hash_mismatch",
        verification.code
      )
    );
  }

  // 3. Evidence subject substitution.
  {
    const tamperedEvidence =
      buildEvidence({
        subject:
          OTHER_VENDOR
      });

    const verification =
      verifyPermit(
        mandate,
        permit,
        action,
        tamperedEvidence,
        decision,
        SECRET,
        {
          now:
            new Date(
              NOW.getTime() +
              1_000
            )
        }
      );

    results.push(
      scenario(
        "evidence_subject_swap",
        "Replace exact vendor evidence with evidence for another address.",
        "evidence_binding_mismatch",
        verification.code
      )
    );
  }

  // 4. Permit signature forgery.
  {
    const forged:
      Permit =
      {
        payload:
          permit.payload,
        signature:
          "0x" +
          "0".repeat(64)
      };

    const verification =
      verifyPermit(
        mandate,
        forged,
        action,
        evidence,
        decision,
        SECRET,
        {
          now:
            new Date(
              NOW.getTime() +
              1_000
            )
        }
      );

    results.push(
      scenario(
        "permit_forgery",
        "Forge the HMAC permit signature.",
        "invalid_permit_signature",
        verification.code
      )
    );
  }

  // 5. Expired permit.
  {
    const verification =
      verifyPermit(
        mandate,
        permit,
        action,
        evidence,
        decision,
        SECRET,
        {
          now:
            new Date(
              NOW.getTime() +
              31_000
            )
        }
      );

    results.push(
      scenario(
        "expired_permit",
        "Use a permit after its 30-second TTL.",
        "permit_expired",
        verification.code
      )
    );
  }

  // 6. Decision tampering after permit mint.
  {
    const tamperedDecision =
      {
        ...decision,
        reason:
          "tampered_reason"
      };

    const verification =
      verifyPermit(
        mandate,
        permit,
        action,
        evidence,
        tamperedDecision,
        SECRET,
        {
          now:
            new Date(
              NOW.getTime() +
              1_000
            )
        }
      );

    results.push(
      scenario(
        "decision_tamper",
        "Alter the authorization decision after permit mint.",
        "decision_hash_mismatch",
        verification.code
      )
    );
  }

  // 7. Mandate substitution.
  {
    const otherMandate =
      buildMandate(
        2
      );

    const verification =
      verifyPermit(
        otherMandate,
        permit,
        action,
        evidence,
        decision,
        SECRET,
        {
          now:
            new Date(
              NOW.getTime() +
              1_000
            )
        }
      );

    results.push(
      scenario(
        "mandate_substitution",
        "Rebind a permit to another mandate version.",
        "mandate_hash_mismatch",
        verification.code
      )
    );
  }

  // 8. Negative Miner signal can only reduce authority.
  {
    const negative =
      buildEvidence({
        label:
          "BLOCK",
        confidence:
          0.95
      });

    const negativeDecision =
      evaluatePaymentsAttestedVendorV1(
        mandate,
        action,
        negative,
        attestation,
        {
          agentId:
            AGENT,
          now:
            NOW
        }
      );

    results.push(
      scenario(
        "negative_miner",
        "Give deterministic runtime proof but a negative Telegraph verdict.",
        "BLOCK:miner_result",
        `${negativeDecision.decision}:${negativeDecision.reason}`
      )
    );
  }

  // 9. Runtime attestation tamper.
  {
    const tamperedAttestation =
      {
        ...attestation,
        runtimeBytes:
          164
      };

    const runtimeDecision =
      evaluatePaymentsAttestedVendorV1(
        mandate,
        action,
        evidence,
        tamperedAttestation,
        {
          agentId:
            AGENT,
          now:
            NOW
        }
      );

    results.push(
      scenario(
        "runtime_attestation_tamper",
        "Alter pinned runtime evidence while Telegraph still says ALLOW.",
        "BLOCK:vendor_runtime_attestation",
        `${runtimeDecision.decision}:${runtimeDecision.reason}`
      )
    );
  }

  // 10. Receipt mutation must fail integrity verification.
  {
    const receipt =
      createProofReceipt({
        mandate,
        action,
        evidence,
        decision,
        permit,
        supplementalEvidence: [
          supplementalRefFromVendorAttestation(
            attestation
          )
        ],
        execution: {
          status:
            "EXECUTED",
          code:
            "executed",
          transactionHash:
            "0x" +
            "e".repeat(64),
          chainId:
            84532,
          executedAt:
            new Date(
              NOW.getTime() +
              1_000
            ).toISOString()
        },
        now:
          new Date(
            NOW.getTime() +
            1_000
          )
      });

    if (
      !verifyProofReceipt(
        receipt
      )
    ) {
      throw new Error(
        "attack_lab_baseline_receipt_invalid"
      );
    }

    const tamperedReceipt =
      {
        ...receipt,
        execution: {
          ...receipt.execution,
          transactionHash:
            "0x" +
            "f".repeat(64)
        }
      };

    results.push(
      scenario(
        "receipt_tamper",
        "Alter transaction hash inside a completed Proof Receipt.",
        "false",
        String(
          verifyProofReceipt(
            tamperedReceipt
          )
        )
      )
    );
  }

  const baseline =
    results.find(
      (item) =>
        item.id ===
        "baseline"
    );

  const attacks =
    results.filter(
      (item) =>
        item.id !==
        "baseline"
    );

  const passed =
    attacks.filter(
      (item) =>
        item.passed
    ).length;

  return {
    schemaVersion:
      "proofgate.attack-lab.v1",
    mode:
      "OFFLINE_DETERMINISTIC",
    policyId:
      "payments.attested-vendor.v1",
    baselineDecision:
      decision.decision,
    scenarios:
      results,
    passed,
    total:
      attacks.length,
    allPassed:
      baseline?.passed ===
        true &&
      passed ===
        attacks.length
  };
}
