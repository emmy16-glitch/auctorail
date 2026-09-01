import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract,
  type PaymentPolicyId
} from "../src/core/action-contract.js";
import {
  createMandateContract
} from "../src/core/mandate-contract.js";
import {
  normalizeTelegraphEvidence
} from "../src/evidence/telegraph.js";
import {
  acquireVendorRuntimeAttestation,
  saveVendorRuntimeAttestation,
  supplementalRefFromVendorAttestation
} from "../src/evidence/vendor-runtime.js";
import {
  executeBaseSepoliaUsdcTransfer
} from "../src/executor/base-sepolia-usdc.js";
import {
  FilePermitConsumptionStore
} from "../src/executor/permit-store.js";
import {
  assertLiveExecutionEvidenceEnvelope
} from "../src/gateway/live-evidence-guard.js";
import {
  runPaymentGateway
} from "../src/gateway/payment-gateway.js";
import {
  evaluatePaymentsStrictV1
} from "../src/policy/payments-strict-v1.js";
import {
  evaluatePaymentsAttestedVendorV1
} from "../src/policy/payments-attested-vendor-v1.js";
import {
  loadOrCreateProofGateSecret
} from "../src/permit/local-secret.js";
import {
  createProofReceipt,
  verifyProofReceipt,
  type ProofReceipt
} from "../src/receipt/proof-receipt.js";

const DEMO_AGENT_ID = "procurement-agent";
const CANONICAL_VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const ATTESTED_VENDOR_POLICY =
  args.includes("--attested-vendor-policy");
const POLICY_ID: PaymentPolicyId =
  ATTESTED_VENDOR_POLICY
    ? "payments.attested-vendor.v1"
    : "payments.strict.v1";
const EVIDENCE_PATH =
  args.find((item) => !item.startsWith("--"));

if (!EVIDENCE_PATH) {
  throw new Error(
    "Usage: npm run execute:approved -- <evidence.json> [--execute] [--attested-vendor-policy]"
  );
}

if (!fs.existsSync(EVIDENCE_PATH)) {
  throw new Error(
    `evidence_file_not_found:${EVIDENCE_PATH}`
  );
}

const mandate = createMandateContract({
  mandateId:
    ATTESTED_VENDOR_POLICY
      ? "treasury-demo-attested-v1"
      : "treasury-demo-v1",
  principalId: "company-demo",
  agentId: DEMO_AGENT_ID,
  allowedActionTypes: ["payment"],
  allowedChainIds: [
    BASE_SEPOLIA_CHAIN_ID
  ],
  allowedAssets: [
    BASE_SEPOLIA_USDC
  ],
  allowedDestinations: [
    CANONICAL_VENDOR
  ],
  maxPerActionRaw: "10000000",
  requiredIntents: [
    "FRAUD_DETECTION"
  ],
  policyId: POLICY_ID,
  issuedAt:
    "2026-09-01T00:00:00.000Z",
  expiresAt:
    "2026-09-08T01:00:00.000Z",
  version: 1
});

const action = createActionContract({
  type: "payment",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  token: BASE_SEPOLIA_USDC,
  amountRaw: "1000000",
  destination: CANONICAL_VENDOR,
  reason: "Invoice INV-1042",
  policyId: POLICY_ID
});

const saved = JSON.parse(
  fs.readFileSync(
    EVIDENCE_PATH,
    "utf8"
  )
) as unknown;

assertLiveExecutionEvidenceEnvelope(
  saved,
  mandate,
  action
);

const evidence =
  normalizeTelegraphEvidence(saved);

const attestation =
  ATTESTED_VENDOR_POLICY
    ? await acquireVendorRuntimeAttestation()
    : null;

if (attestation) {
  const attestationPath =
    saveVendorRuntimeAttestation(
      attestation
    );

  console.log(
    "Vendor attestation:",
    attestationPath
  );
  console.log(
    "Vendor runtime hash:",
    attestation.runtimeKeccak256
  );
  console.log(
    "Vendor attestation hash:",
    attestation.attestationHash
  );
}

const preview =
  ATTESTED_VENDOR_POLICY
    ? evaluatePaymentsAttestedVendorV1(
        mandate,
        action,
        evidence,
        attestation,
        {
          agentId:
            DEMO_AGENT_ID,
          now:
            new Date()
        }
      )
    : evaluatePaymentsStrictV1(
        mandate,
        action,
        evidence,
        {
          agentId:
            DEMO_AGENT_ID,
          now:
            new Date()
        }
      );

console.log("");
console.log("PROOFGATE APPROVED PAYMENT");
console.log("==========================");
console.log(
  "Mode:",
  EXECUTE
    ? "EXECUTE"
    : "CHECK ONLY"
);
console.log(
  "Mandate hash:",
  mandate.mandateHash
);
console.log(
  "Action hash:",
  action.actionHash
);
console.log(
  "Evidence:",
  EVIDENCE_PATH
);
console.log(
  "Serving Miner:",
  `${evidence.miner.name} (${evidence.miner.id})`
);
console.log(
  "Policy:",
  preview.decision
);
console.log(
  "Reason:",
  preview.reason
);
console.log("");

if (preview.decision !== "ALLOW") {
  const receipt =
    createProofReceipt({
      mandate,
      action,
      evidence,
      decision: preview,
      permit: null,
      execution: {
        status:
          preview.decision === "BLOCK"
            ? "BLOCKED"
            : "NOT_EXECUTED",
        code:
          `policy_${preview.decision.toLowerCase()}`,
        chainId:
          action.payload.chainId
      },
      ...(attestation
        ? {
            supplementalEvidence: [
              supplementalRefFromVendorAttestation(
                attestation
              )
            ]
          }
        : {})
    });

  saveReceipt(receipt);

  console.log(
    "Protected transaction: NOT SENT"
  );

  process.exit(
    preview.decision === "BLOCK"
      ? 3
      : 2
  );
}

if (!EXECUTE) {
  console.log(
    "READY: policy ALLOW."
  );
  console.log(
    "No transaction was sent."
  );
  console.log(
    "Re-run with --execute only while this exact evidence remains fresh."
  );
  process.exit(0);
}

const privateKey =
  process.env.PROOFGATE_EXECUTOR_PRIVATE_KEY ??
  process.env.TELEGRAPH_EVM_PRIVATE_KEY;

if (!privateKey) {
  throw new Error(
    "PROOFGATE_EXECUTOR_PRIVATE_KEY or TELEGRAPH_EVM_PRIVATE_KEY is required only after policy ALLOW"
  );
}

const secret =
  loadOrCreateProofGateSecret();

const store =
  new FilePermitConsumptionStore();

const result =
  await runPaymentGateway({
    mandate,
    action,
    evidence,
    agentId:
      DEMO_AGENT_ID,
    secret,
    store,
    permitTtlSeconds: 30,
    ...(attestation
      ? {
          supplementalEvidence: [
            supplementalRefFromVendorAttestation(
              attestation
            )
          ],
          evaluatePolicy: (
            gatewayMandate,
            gatewayAction,
            gatewayEvidence,
            gatewayOptions
          ) =>
            evaluatePaymentsAttestedVendorV1(
              gatewayMandate,
              gatewayAction,
              gatewayEvidence,
              attestation,
              gatewayOptions
            )
        }
      : {}),
    execute: async (
      protectedAction
    ) =>
      executeBaseSepoliaUsdcTransfer({
        action:
          protectedAction,
        privateKey
      })
  });

saveReceipt(result.receipt);

console.log(
  "Final decision:",
  result.decision.decision
);
console.log(
  "Permit:",
  result.permit?.payload.permitId ??
    "(none)"
);
console.log(
  "Execution:",
  result.execution?.status ??
    "NOT_EXECUTED"
);
console.log(
  "Execution code:",
  result.execution?.code ??
    "not_executed"
);

const txHash =
  result.execution?.result
    ?.transactionHash;

console.log(
  "Transaction:",
  txHash ?? "(none)"
);

if (
  result.execution?.status ===
  "EXECUTED"
) {
  process.exit(0);
}

if (
  result.execution?.status ===
  "AMBIGUOUS"
) {
  process.exit(4);
}

if (
  result.execution?.status ===
  "FAILED"
) {
  process.exit(5);
}

process.exit(3);

function saveReceipt(
  receipt: ProofReceipt
): string {
  if (!verifyProofReceipt(receipt)) {
    throw new Error(
      "refusing_to_save_invalid_receipt"
    );
  }

  const directory =
    path.join(
      "data",
      "receipts"
    );

  fs.mkdirSync(
    directory,
    {
      recursive: true
    }
  );

  const file =
    path.join(
      directory,
      `${receipt.receiptId}.json`
    );

  fs.writeFileSync(
    file,
    JSON.stringify(
      receipt,
      null,
      2
    ),
    {
      mode: 0o600
    }
  );

  console.log(
    "Proof receipt:",
    file
  );
  console.log(
    "Receipt hash:",
    receipt.receiptHash
  );
  console.log("");

  return file;
}
