import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  describe,
  expect,
  it
} from "vitest";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  createActionContract
} from "../src/core/action-contract.js";
import {
  createMandateContract
} from "../src/core/mandate-contract.js";
import {
  normalizeTelegraphEvidence
} from "../src/evidence/telegraph.js";
import {
  FilePermitConsumptionStore
} from "../src/executor/permit-store.js";
import { PostgresExecutionStore } from "../src/executor/durable-execution.js";
import { encodeErc20TransferCalldata } from "../src/executor/transaction-intent.js";
import {
  runPaymentGateway
} from "../src/gateway/payment-gateway.js";
import {
  verifyProofReceipt
} from "../src/receipt/proof-receipt.js";

const VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const AGENT =
  "procurement-agent";
const SECRET =
  "proofgate-gateway-test-" +
  "k".repeat(64);
const NOW =
  new Date(
    "2026-09-01T22:30:01.000Z"
  );

function mandate(
  destination = VENDOR
) {
  return createMandateContract({
    mandateId:
      "treasury-demo-v1",
    principalId:
      "company-demo",
    agentId:
      AGENT,
    allowedActionTypes:
      ["payment"],
    allowedChainIds:
      [BASE_SEPOLIA_CHAIN_ID],
    allowedAssets:
      [BASE_SEPOLIA_USDC],
    allowedDestinations:
      [destination],
    maxPerActionRaw:
      "10000000",
    requiredIntents:
      ["FRAUD_DETECTION"],
    policyId:
      "payments.strict.v1",
    policyVersion: 1,
    issuedAt:
      "2026-09-01T00:00:00.000Z",
    expiresAt:
      "2026-09-08T01:00:00.000Z",
    version: 1
  });
}

function action(
  destination = VENDOR
) {
  return createActionContract({
    type: "payment",
    chainId:
      BASE_SEPOLIA_CHAIN_ID,
    token:
      BASE_SEPOLIA_USDC,
    amountRaw:
      "1000000",
    destination,
    reason:
      "Invoice INV-1042",
    policyId:
      "payments.strict.v1"
  });
}

function evidence(
  subject = VENDOR,
  confidence = 0.95
) {
  return normalizeTelegraphEvidence({
    schemaVersion:
      "proofgate.telegraph-evidence.v1",
    source:
      "telegraph",
    intent:
      "FRAUD_DETECTION",
    miner: {
      id:
        "unit-miner",
      name:
        "Unit Miner",
      slug:
        "unit-miner"
    },
    request: {
      endpoint:
        "/v1/ask",
      target:
        subject,
      chainId:
        BASE_SEPOLIA_CHAIN_ID
    },
    result: {
      subject,
      chainId:
        BASE_SEPOLIA_CHAIN_ID,
      confidence,
      reasoning:
        "Synthetic unit fixture only.",
      verdict:
        "ALLOW",
      signals: [
        {
          key:
            "isContract",
          present:
            true
        }
      ]
    },
    telegraph: {
      signalHash:
        "0x" + "a".repeat(64),
      costUsd:
        0.01,
      durationMs:
        100,
      timestamp:
        "2026-09-01T22:30:00.000Z"
    },
    capturedAt: {
      startedAt:
        "2026-09-01T22:29:59.000Z",
      finishedAt:
        "2026-09-01T22:30:00.000Z"
    },
    rawResponse: {
      fixture:
        true
    }
  });
}

describe(
  "payment gateway orchestration",
  () => {
    it(
      "wires ALLOW to permit, one protected execution, and a verifiable receipt",
      async () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "proofgate-gateway-"
            )
          );

        const store =
          new FilePermitConsumptionStore(
            directory
          );

        let executions = 0;
        const txHash =
          "0x" + "b".repeat(64);

        const result =
          await runPaymentGateway({
            mandate:
              mandate(),
            action:
              action(),
            evidence:
              evidence(),
            agentId:
              AGENT,
            secret:
              SECRET,
            store,
            now:
              NOW,
            execute:
              async () => {
                executions++;

                return {
                  transactionHash:
                    txHash,
                  blockNumber:
                    123,
                  confirmedAt:
                    NOW.toISOString()
                };
              }
          });

        expect(
          result.decision.decision
        ).toBe("ALLOW");
        expect(
          result.permit
        ).not.toBeNull();
        expect(
          result.execution?.status
        ).toBe("EXECUTED");
        expect(executions).toBe(1);
        expect(
          result.receipt.execution
            .transactionHash
        ).toBe(txHash);
        expect(
          verifyProofReceipt(
            result.receipt
          )
        ).toBe(true);

        fs.rmSync(
          directory,
          {
            recursive: true,
            force: true
          }
        );
      }
    );

    it(
      "never mints or executes when evidence confidence produces HOLD",
      async () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "proofgate-gateway-hold-"
            )
          );

        const store =
          new FilePermitConsumptionStore(
            directory
          );

        let executions = 0;

        const result =
          await runPaymentGateway({
            mandate:
              mandate(),
            action:
              action(),
            evidence:
              evidence(VENDOR, 0.5),
            agentId:
              AGENT,
            secret:
              SECRET,
            store,
            now:
              NOW,
            execute:
              async () => {
                executions++;
                return {
                  transactionHash:
                    "0x" + "c".repeat(64)
                };
              }
          });

        expect(
          result.decision.decision
        ).toBe("HOLD");
        expect(
          result.permit
        ).toBeNull();
        expect(
          result.execution
        ).toBeNull();
        expect(executions).toBe(0);
        expect(
          result.receipt.execution.status
        ).toBe("NOT_EXECUTED");
        expect(
          verifyProofReceipt(
            result.receipt
          )
        ).toBe(true);

        fs.rmSync(
          directory,
          {
            recursive: true,
            force: true
          }
        );
      }
    );

    it(
      "never mints or executes when the mandate forbids the destination",
      async () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "proofgate-gateway-block-"
            )
          );

        const store =
          new FilePermitConsumptionStore(
            directory
          );

        let executions = 0;

        const forbidden =
          "0x1111111111111111111111111111111111111111";

        const result =
          await runPaymentGateway({
            mandate:
              mandate(VENDOR),
            action:
              action(forbidden),
            evidence:
              evidence(forbidden, 0.95),
            agentId:
              AGENT,
            secret:
              SECRET,
            store,
            now:
              NOW,
            execute:
              async () => {
                executions++;
                return {
                  transactionHash:
                    "0x" + "d".repeat(64)
                };
              }
          });

        expect(
          result.decision.decision
        ).toBe("BLOCK");
        expect(
          result.permit
        ).toBeNull();
        expect(
          result.execution
        ).toBeNull();
        expect(executions).toBe(0);
        expect(
          result.receipt.execution.status
        ).toBe("BLOCKED");

        fs.rmSync(
          directory,
          {
            recursive: true,
            force: true
          }
        );
      }
    );
  }
);


describe("payment gateway durable execution path", () => {
  it("uses durable coordination and performs one final ERC-20 intent-bound submission", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "proofgate-durable-gateway-"));
    const permitStore = new FilePermitConsumptionStore(directory);
    const rows = new Map<string, any>();
    const database = {
      async query(text: string, values: readonly unknown[]) {
        if (text.includes("INSERT INTO executions")) {
          rows.set(String(values[0]), { executionId: values[0], permitId: values[1], permitNonce: values[2], state: values[13], transactionIntentHash: values[7] });
          return { rows: [] };
        }
        if (text.includes("WHERE permit_id = $1")) {
          return { rows: [...rows.values()].filter((row) => row.permitId === values[0] && row.permitNonce === values[1]) };
        }
        if (text.includes("UPDATE executions")) {
          const row = rows.get(String(values[0]));
          if (!row || row.state !== values[4]) return { rows: [] };
          row.state = values[1];
          if (values[2]) row.transactionHash = values[2];
          return { rows: [{ execution_id: values[0] }] };
        }
        return { rows: rows.has(String(values[0])) ? [rows.get(String(values[0]))] : [] };
      }
    };
    const executionStore = new PostgresExecutionStore(database);
    const currentAction = action();
    const sender = "0x0000000000000000000000000000000000000002";
    const txHash = "0x" + "e".repeat(64);
    let executions = 0;
    const result = await runPaymentGateway({
      mandate: mandate(),
      action: currentAction,
      evidence: evidence(),
      agentId: AGENT,
      secret: SECRET,
      store: permitStore,
      durableExecutionStore: executionStore,
      sender,
      transactionIntent: () => ({
        chainId: currentAction.payload.chainId,
        sender,
        token: currentAction.payload.token,
        recipient: currentAction.payload.destination,
        amountRaw: currentAction.payload.amountRaw,
        calldata: encodeErc20TransferCalldata(currentAction.payload.destination, currentAction.payload.amountRaw),
        value: "0"
      }),
      now: NOW,
      execute: async () => { executions += 1; return { transactionHash: txHash, confirmedAt: NOW.toISOString() }; }
    });
    expect(result.execution?.status).toBe("EXECUTED");
    expect(executions).toBe(1);
    expect(rows.size).toBe(1);
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
