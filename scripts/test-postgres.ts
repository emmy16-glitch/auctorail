import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { PostgresPermitConsumptionStore } from "../src/executor/permit-store.js";
import { PostgresExecutionStore } from "../src/executor/durable-execution.js";
import { PostgresSpendAuthorityStore } from "../src/executor/spend-authority.js";

const databaseUrl = process.env.PROOFGATE_DATABASE_URL;
if (!databaseUrl) {
  console.log("POSTGRES_INTEGRATION=NOT_RUN (set PROOFGATE_DATABASE_URL to enable)");
  process.exit(0);
}

const schema = `proofgate_test_${randomUUID().replaceAll("-", "")}`;
const pool = new pg.Pool({ connectionString: databaseUrl, max: 32, options: `-c search_path=${schema}` });
interface TestDatabase {
  query<Row = Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<{ rows: Row[] }>;
  transaction<T>(work: (database: TestDatabase) => Promise<T>): Promise<T>;
}
const database: TestDatabase = {
  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[]) {
    const result = await pool.query(text, values as unknown[]);
    return { rows: result.rows as Row[] };
  },
  async transaction<T>(work: (database: TestDatabase) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tx = {
        query: async <Row = Record<string, unknown>>(text: string, values: readonly unknown[]) => {
          const result = await client.query(text, values as unknown[]);
          return { rows: result.rows as Row[] };
        },
        transaction: async <Nested>(nested: (database: TestDatabase) => Promise<Nested>) => nested(tx as TestDatabase)
      } as TestDatabase;
      const result = await work(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};
const permitStore = new PostgresPermitConsumptionStore(database);
const executionStore = new PostgresExecutionStore(database);
const spendStore = new PostgresSpendAuthorityStore(database);
const now = new Date();
const transactionHash = `0x${"a".repeat(64)}`;

try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const migration1 = await fs.readFile(path.join(process.cwd(), "migrations/001_permit_consumptions.sql"), "utf8");
  const migration2 = await fs.readFile(path.join(process.cwd(), "migrations/002_executions.sql"), "utf8");
  const migration3 = await fs.readFile(path.join(process.cwd(), "migrations/003_spend_authority.sql"), "utf8");
  await pool.query(`${migration1}\n${migration2}\n${migration3}`);

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

  const authorityId = `integration-authority-${randomUUID()}`;
  await spendStore.createAuthority({ authorityId, mandateHash: "mandate-hash", policyId: "payments.strict.v1", policyVersion: 1, chainId: 84532, token: "0x0000000000000000000000000000000000000004", maxCumulativeRaw: "10", now });
  const spendResults = await Promise.all([
    spendStore.reserve({ authorityId, executionId: randomUUID(), amountRaw: "7", now }),
    spendStore.reserve({ authorityId, executionId: randomUUID(), amountRaw: "7", now })
  ]);
  if (spendResults.filter((item) => item.reserved).length !== 1) throw new Error("cumulative_spend_race_failed");
  const reusableExecutionId = randomUUID();
  if (!(await spendStore.reserve({ authorityId, executionId: reusableExecutionId, amountRaw: "1", now })).reserved) throw new Error("initial_reservation_failed");
  await spendStore.release(authorityId, reusableExecutionId, now);
  if (!(await spendStore.reserve({ authorityId, executionId: reusableExecutionId, amountRaw: "1", now })).reserved) throw new Error("released_reservation_reuse_failed");
  await spendStore.consume(authorityId, reusableExecutionId, now);
  const consumed = await database.query<{ status: string }>("SELECT status FROM spend_reservations WHERE authority_id = $1 AND execution_id = $2::uuid", [authorityId, reusableExecutionId]);
  if (consumed.rows[0]?.status !== "CONSUMED") throw new Error("confirmed_reservation_not_consumed");

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
    migration003: "PASS",
    cumulativeSpendRace: "PASS",
    cumulativeSpendWinners: spendResults.filter((item) => item.reserved).length,
    releasedReservationReuse: "PASS",
    consumedReservation: "PASS",
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
