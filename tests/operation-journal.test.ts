import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FileOperationJournal } from "../src/executor/operation-journal.js";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "proofgate-journal-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("ProofGate operation journal", () => {
  it("persists state before an irreversible operation and advances it", () => {
    const journal = new FileOperationJournal(temporaryDirectory());
    const prepared = journal.create({
      kind: "onchain_execution",
      actionHash: "0x" + "a".repeat(64),
      target: "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14",
      metadata: { nonce: 7 }
    });

    expect(prepared.state).toBe("PREPARED");
    expect(journal.get(prepared.operationId)?.metadata.nonce).toBe(7);

    const broadcast = journal.update(prepared.operationId, {
      state: "BROADCAST",
      transactionHash: "0x" + "b".repeat(64),
      metadata: { rpc: "rpc-1" }
    });

    expect(broadcast.state).toBe("BROADCAST");
    expect(broadcast.transactionHash).toBe("0x" + "b".repeat(64));
    expect(broadcast.metadata).toEqual({ nonce: 7, rpc: "rpc-1" });
  });

  it("does not reopen a terminal operation after confirmation", () => {
    const journal = new FileOperationJournal(temporaryDirectory());
    const operation = journal.create({ kind: "onchain_execution" });

    journal.update(operation.operationId, {
      state: "BROADCAST",
      transactionHash: "0x" + "c".repeat(64)
    });

    journal.update(operation.operationId, {
      state: "CONFIRMED"
    });

    expect(() =>
      journal.update(operation.operationId, {
        state: "BROADCAST"
      })
    ).toThrow("invalid_operation_transition:CONFIRMED->BROADCAST");
  });

  it("records ambiguous outcomes instead of guessing that execution failed", () => {
    const journal = new FileOperationJournal(temporaryDirectory());
    const operation = journal.create({ kind: "onchain_execution" });

    const ambiguous = journal.update(operation.operationId, {
      state: "AMBIGUOUS",
      metadata: { reason: "rpc_confirmation_timeout" }
    });

    expect(ambiguous.state).toBe("AMBIGUOUS");
    expect(ambiguous.metadata.reason).toBe("rpc_confirmation_timeout");
  });
});
