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
  loadTelegraphEvidence
} from "../src/evidence/telegraph.js";

import type {
  DecisionRecord
} from "../src/policy/payments-strict-v1.js";

import {
  mintPermit
} from "../src/permit/permit.js";

import {
  FilePermitConsumptionStore
} from "../src/executor/permit-store.js";

import {
  executeProtectedAction
} from "../src/executor/controlled-executor.js";

const SECRET =
  "proofgate-executor-test-" +
  "x".repeat(64);

function evidence() {
  const directory =
    path.join(
      process.cwd(),
      "data",
      "evidence"
    );

  const file =
    fs.readdirSync(directory)
      .filter(
        (name) =>
          name.endsWith(".json")
      )
      .sort()
      .at(-1);

  if (!file) {
    throw new Error(
      "Real Telegraph evidence missing"
    );
  }

  return loadTelegraphEvidence(
    path.join(
      directory,
      file
    )
  );
}

function store() {
  return new FilePermitConsumptionStore(
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "proofgate-"
      )
    )
  );
}

function allowDecision(
  actionId: string,
  now: Date
): DecisionRecord {
  // Unit fixture used only to test
  // executor security mechanics.
  // Not presented as Telegraph evidence.
  return {
    actionId,

    decision:
      "ALLOW",

    reason:
      "all_required_checks_passed",

    policyId:
      "payments.strict.v1",

    checks: [
      {
        name:
          "executor_security_test",
        status:
          "PASS",
        reason:
          "Local executor unit fixture."
      }
    ],

    decidedAt:
      now.toISOString()
  };
}

function action(
  destination: string,
  amountRaw =
    "5000000"
) {
  return createActionContract({
    type:
      "payment",

    chainId:
      BASE_SEPOLIA_CHAIN_ID,

    token:
      BASE_SEPOLIA_USDC,

    amountRaw,

    destination,

    reason:
      "Invoice INV-1042",

    policyId:
      "payments.strict.v1"
  });
}

describe(
  "ProofGate Controlled Executor",
  () => {
    it(
      "executes a valid permit exactly once",
      async () => {
        const ev =
          evidence();

        const now =
          new Date(
            "2026-09-01T19:00:00.000Z"
          );

        const approved =
          action(ev.subject);

        const decision =
          allowDecision(
            approved.id,
            now
          );

        const permit =
          mintPermit(
            approved,
            ev,
            decision,
            SECRET,
            {
              now,
              ttlSeconds: 30
            }
          );

        const permitStore =
          store();

        let executions = 0;

        const execute =
          async () => {
            executions++;

            return {
              txHash:
                "0xtest"
            };
          };

        const first =
          await executeProtectedAction({
            permit,
            action:
              approved,
            evidence:
              ev,
            decision,
            secret:
              SECRET,
            store:
              permitStore,
            execute,
            now:
              new Date(
                now.getTime() +
                  1000
              )
          });

        const replay =
          await executeProtectedAction({
            permit,
            action:
              approved,
            evidence:
              ev,
            decision,
            secret:
              SECRET,
            store:
              permitStore,
            execute,
            now:
              new Date(
                now.getTime() +
                  2000
              )
          });

        expect(
          first.status
        ).toBe(
          "EXECUTED"
        );

        expect(
          replay.status
        ).toBe(
          "BLOCKED"
        );

        expect(
          replay.code
        ).toBe(
          "permit_already_consumed"
        );

        expect(
          executions
        ).toBe(1);
      }
    );

    it(
      "blocks a modified amount before execution",
      async () => {
        const ev =
          evidence();

        const now =
          new Date(
            "2026-09-01T19:00:00.000Z"
          );

        const approved =
          action(
            ev.subject,
            "5000000"
          );

        const decision =
          allowDecision(
            approved.id,
            now
          );

        const permit =
          mintPermit(
            approved,
            ev,
            decision,
            SECRET,
            { now }
          );

        const tampered =
          action(
            ev.subject,
            "15000000"
          );

        let executions = 0;

        const result =
          await executeProtectedAction({
            permit,

            action:
              tampered,

            evidence:
              ev,

            decision,

            secret:
              SECRET,

            store:
              store(),

            execute:
              async () => {
                executions++;
                return {};
              },

            now:
              new Date(
                now.getTime() +
                  1000
              )
          });

        expect(
          result.status
        ).toBe(
          "BLOCKED"
        );

        expect(
          result.code
        ).toBe(
          "action_hash_mismatch"
        );

        expect(
          executions
        ).toBe(0);
      }
    );

    it(
      "allows only one winner during concurrent replay attempts",
      async () => {
        const ev =
          evidence();

        const now =
          new Date(
            "2026-09-01T19:00:00.000Z"
          );

        const approved =
          action(ev.subject);

        const decision =
          allowDecision(
            approved.id,
            now
          );

        const permit =
          mintPermit(
            approved,
            ev,
            decision,
            SECRET,
            { now }
          );

        const permitStore =
          store();

        let executions = 0;

        const attempt =
          () =>
            executeProtectedAction({
              permit,

              action:
                approved,

              evidence:
                ev,

              decision,

              secret:
                SECRET,

              store:
                permitStore,

              execute:
                async () => {
                  executions++;

                  await new Promise(
                    (resolve) =>
                      setTimeout(
                        resolve,
                        25
                      )
                  );

                  return {};
                },

              now:
                new Date(
                  now.getTime() +
                    1000
                )
            });

        const results =
          await Promise.all([
            attempt(),
            attempt()
          ]);

        expect(
          results.filter(
            (result) =>
              result.status ===
              "EXECUTED"
          )
        ).toHaveLength(1);

        expect(
          results.filter(
            (result) =>
              result.code ===
              "permit_already_consumed"
          )
        ).toHaveLength(1);

        expect(
          executions
        ).toBe(1);
      }
    );

    it(
      "does not execute an expired permit",
      async () => {
        const ev =
          evidence();

        const now =
          new Date(
            "2026-09-01T19:00:00.000Z"
          );

        const approved =
          action(ev.subject);

        const decision =
          allowDecision(
            approved.id,
            now
          );

        const permit =
          mintPermit(
            approved,
            ev,
            decision,
            SECRET,
            {
              now,
              ttlSeconds: 30
            }
          );

        let executions = 0;

        const result =
          await executeProtectedAction({
            permit,

            action:
              approved,

            evidence:
              ev,

            decision,

            secret:
              SECRET,

            store:
              store(),

            execute:
              async () => {
                executions++;
                return {};
              },

            now:
              new Date(
                now.getTime() +
                  31_000
              )
          });

        expect(
          result.code
        ).toBe(
          "permit_expired"
        );

        expect(
          executions
        ).toBe(0);
      }
    );
  }
);
