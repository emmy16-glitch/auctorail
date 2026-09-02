import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { PostgresPermitConsumptionStore } from "../src/executor/permit-store.js";
import { PostgresExecutionStore } from "../src/executor/durable-execution.js";

const databaseUrl = process.env.PROOFGATE_DATABASE_URL;
if (!databaseUrl) {
  console.log("POSTGRES_INTEGRATION=NOT_RUN (set PROOFGATE_DATABASE_URL to enable)");
  process.exit(0);
}

const schema = `proofgate_test_${randomUUID().replaceAll("-", "")}`;
const pool = new pg.Pool({ connectionString: databaseUrl, max: 32, options: `-c search_path=${schema}` });
const database = {
  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[]) {
    const result = await pool.query(text, values as unknown[]);
    return { rows: result.rows as Row[] };
  }
};
const permitStore = new PostgresPermitConsumptionStore(database);
const executionStore = new PostgresExecutionStore(database);
const now = new Date();
const transactionHash = `0x${"a".repeat(64)}`;

try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const migration1 = await fs.readFile(path.join(process.cwd(), "migrations/001_permit_consumptions.sql"), "utf8");
  const migration2 = await fs.readFile(path.join(process.cwd(), "migrations/002_executions.sql"), "utf8");
  await pool.query(`${migration1}\n${migration2}`);

  const permitId = `integration-permit-${randomUUID()}`;
  const nonce = "integration-nonce";
  const executionId = randomUUID();
  const claims = await Promise.all(Array.from({ length: 100 }, () => permitStore.consume(permitId, nonce, now.toISOString(), executionId)));
  const successfulClaims = claims.filter((claim) => claim.consumed).length;
  const replayClaims = claims.filter((claim) => !claim.consumed).length;
  if (successfulClaims !== 1 || replayClaims !== 99) throw new Error(`claim_race_failed:${successfulClaims}/${replayClaims}`);
  const ownership = await permitStore.getConsumption(permitId, nonce);
  if (!ownership || ownership.executionId !== executionId) throw new Error("claim_owner_not_persisted");
  const recovered = await permitStore.consume(permitId, nonce, now.toISOString(), executionId);
  if (recovered.code !== "permit_already_consumed_by_this_execution") throw new Error(`same_execution_recovery_failed:${recovered.code}`);
  const foreign = await permitStore.consume(permitId, nonce, now.toISOString(), randomUUID());
  if (foreign.code !== "permit_already_consumed_by_other_execution") throw new Error(`foreign_claim_not_blocked:${foreign.code}`);

  await executionStore.create({
    executionId,
    permitId,
    permitNonce: nonce,
    mandateHash: "mandate-hash",
    actionHash: "action-hash",
    decisionHash: "decision-hash",
    policyId: "payments.strict.v1",
    chainId: 84532,
    sender: "0x0000000000000000000000000000000000000002",
    destination: "0x0000000000000000000000000000000000000003",
    token: "0x0000000000000000000000000000000000000004",
    amountRaw: "1000000",
    transactionIntentHash: "intent-hash",
    now
  });
  await executionStore.transition(executionId, "AUTHORIZED", "CLAIMED", new Date());
  await executionStore.transition(executionId, "CLAIMED", "SUBMITTING", new Date());
  await executionStore.transition(executionId, "SUBMITTING", "BROADCAST", new Date(), transactionHash);
  await executionStore.transition(executionId, "BROADCAST", "CONFIRMED", new Date(), transactionHash);
  const persisted = await executionStore.get(executionId);
  if (!persisted || persisted.state !== "CONFIRMED" || persisted.transactionHash !== transactionHash || persisted.transactionIntentHash !== "intent-hash") {
    throw new Error("execution_round_trip_failed");
  }

  console.log(JSON.stringify({
    postgresIntegration: "PASS",
    schema,
    concurrentClaims: 100,
    successfulClaims,
    replayClaims,
    sameExecutionRecovery: "PASS",
    foreignExecutionBlocked: "PASS",
    executionLifecycle: "AUTHORIZED->CLAIMED->SUBMITTING->BROADCAST->CONFIRMED",
    executionRoundTrip: "PASS",
    transactionIntentHashPersisted: "PASS",
    telegraphRequests: 0,
    x402Payments: 0,
    blockchainWrites: 0
  }, null, 2));
} finally {
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
}
