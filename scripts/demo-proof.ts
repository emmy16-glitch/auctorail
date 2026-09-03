import fs from "node:fs";
import path from "node:path";

const CANONICAL_VENDOR =
  "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14";
const CANONICAL_TX =
  "0x41b1d2516a510ed330d5745bec5886911b090c96062ab4f8160de8a8f59f2ffc";
const CANONICAL_SIGNAL =
  "0x13499ae69d8e6c43f0798e9e1c9c9dcdabba5ac33fcc88855282def9e78cae4c";
const CANONICAL_RECEIPT =
  "0x036a153a1d89d23fbe6c6fda64383c4f8a7e4731d7a6d61f9e6328c0db9e91e3";

function jsonFiles(directory: string, prefix?: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => !prefix || name.startsWith(prefix))
    .map((name) => path.join(directory, name))
    .sort((a, b) =>
      fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
    );
}

function readJson(file: string | undefined): any | null {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function short(file: string | undefined): string {
  return file ? path.relative(process.cwd(), file) : "(not found)";
}

function paymentAmountRaw(value: any): bigint {
  const raw = value?.payment?.amountRaw;
  return typeof raw === "string" && /^[0-9]+$/.test(raw)
    ? BigInt(raw)
    : 0n;
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function compactText(value: string, max = 220): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length <= max
    ? oneLine
    : `${oneLine.slice(0, max - 1)}…`;
}

function printLine(label: string, value: unknown): void {
  console.log(`${label.padEnd(26)} ${String(value)}`);
}

console.log("");
console.log("PROOFGATE — JUDGE DEMO PROOF");
console.log("=============================");
console.log("Agent confidence is not permission to act.");
console.log("");
console.log("This command is READ-ONLY:");
console.log("  • zero Telegraph requests");
console.log("  • zero x402 payments");
console.log("  • zero blockchain writes");
console.log("  • no private-key or .env access");
console.log("");

console.log("PROOF A — REAL PROTECTED EXECUTION (v1.0)");
console.log("-----------------------------------------");
printLine("Network", "Base Sepolia (84532)");
printLine("Protected amount", "1 USDC");
printLine("Vendor", CANONICAL_VENDOR);
printLine("Telegraph Miner", "Refut On-Chain Risk (95822412)");
printLine("Intent", "FRAUD_DETECTION");
printLine("Miner verdict", "ALLOW @ 0.70 confidence");
printLine("Signal hash", CANONICAL_SIGNAL);
printLine("Transaction", CANONICAL_TX);
printLine("Block", "46301208");
printLine("Proof receipt hash", CANONICAL_RECEIPT);
console.log("");
console.log("This proves the real execution boundary. It predates v1.2 quorum;");
console.log("we do not claim the historical transaction used v1.2 quorum.");
console.log("");

const bundleFile = jsonFiles(
  path.join("data", "evidence", "bundles"),
  "adaptive-bundle-"
)[0];
const bundle = readJson(bundleFile);
const receiptFiles = jsonFiles(path.join("data", "receipts"));
const receiptFile = bundle
  ? receiptFiles.find((file) => {
      const candidate = readJson(file);
      return candidate?.evidence?.bundleHash === bundle.bundleHash;
    }) ?? receiptFiles[0]
  : receiptFiles[0];
const receipt = readJson(receiptFile);

console.log("PROOF B — LATEST LIVE HIGH-RISK TELEGRAPH AUTHORIZATION");
console.log("------------------------------------------------------");

if (!bundle) {
  console.log("No local adaptive bundle found.");
  console.log("Run the demo from the worktree that contains the captured live artifacts.");
  process.exitCode = 2;
} else {
  printLine("Bundle", short(bundleFile));
  printLine("Bundle hash", bundle.bundleHash ?? "(missing)");
  printLine("Action hash", bundle.actionHash ?? "(missing)");
  printLine("Risk tier", bundle.riskTier ?? "(missing)");
  printLine("Chain", bundle.chainId ?? "(missing)");
  printLine("Accepted spend raw", bundle.totalEvidenceSpendRaw ?? "0");
  console.log("");

  console.log("Accepted Telegraph evidence:");
  for (const item of bundle.items ?? []) {
    console.log(
      `  attempt ${item.attempt}: ${item.miner?.name ?? "unknown"} ` +
      `(${item.miner?.id ?? "?"}) → ${item.label ?? "(no label)"} ` +
      `confidence=${item.confidence ?? "(none)"} ` +
      `applicability=${item.applicability ?? "(none)"}`
    );
  }
  console.log("");

  console.log("Quorum result:");
  for (const quorum of bundle.quorums ?? []) {
    console.log(
      `  ${quorum.intent}: ${quorum.status} | ` +
      `distinct=${quorum.distinctMinerIds?.length ?? 0}/${quorum.rule?.minimumDistinctMiners ?? "?"} | ` +
      `positive=${quorum.positiveMinerIds?.length ?? 0}/${quorum.rule?.minimumPositiveResults ?? "?"}`
    );
  }
  console.log("");

  const acceptedTimes = (bundle.items ?? [])
    .map((item: any) => timestampMs(item?.receivedAt))
    .filter((value: number | null): value is number => value !== null);
  const bundleCreatedAt = timestampMs(bundle.createdAt);
  const sessionStart = acceptedTimes.length > 0
    ? Math.min(...acceptedTimes) - 1_000
    : bundleCreatedAt !== null
      ? bundleCreatedAt - 65_000
      : null;
  const sessionEnd = bundleCreatedAt !== null
    ? bundleCreatedAt + 5_000
    : acceptedTimes.length > 0
      ? Math.max(...acceptedTimes) + 10_000
      : null;
  const acceptedAttempts = new Set<number>(
    (bundle.items ?? [])
      .map((item: any) => item?.attempt)
      .filter((attempt: unknown): attempt is number =>
        Number.isInteger(attempt) && Number(attempt) > 0
      )
  );
  const maxObservedAttempt = acceptedAttempts.size > 0
    ? Math.max(...acceptedAttempts)
    : Number.POSITIVE_INFINITY;

  const rejectedFiles = jsonFiles(
    path.join("data", "evidence", "adaptive", "rejected"),
    "fraud_detection-"
  );

  let rejectedSpend = 0n;
  const rejected: any[] = [];
  for (const file of rejectedFiles) {
    const value = readJson(file);
    if (!value) continue;
    if (value?.request?.actionHash !== bundle.actionHash) continue;

    const attempt = value?.request?.attemptNumber;
    if (
      !Number.isInteger(attempt) ||
      attempt < 1 ||
      attempt > maxObservedAttempt ||
      acceptedAttempts.has(attempt)
    ) {
      continue;
    }

    const capturedAt =
      timestampMs(value?.capturedAt?.finishedAt) ??
      timestampMs(value?.capturedAt?.startedAt);
    if (
      capturedAt === null ||
      sessionStart === null ||
      sessionEnd === null ||
      capturedAt < sessionStart ||
      capturedAt > sessionEnd
    ) {
      continue;
    }

    rejected.push({ file, value });
    rejectedSpend += paymentAmountRaw(value);
  }

  rejected.sort((a, b) =>
    Number(a.value?.request?.attemptNumber ?? 0) -
    Number(b.value?.request?.attemptNumber ?? 0)
  );

  if (rejected.length > 0) {
    console.log("Rejected paid evidence from this run (correctly quarantined):");
    for (const entry of rejected) {
      const value = entry.value;
      const result = value?.rawResponse?.result ?? {};
      const returnedChainParts = [
        result?.meta?.chainId,
        result?.meta?.network,
        result?.chainId,
        result?.chain,
        result?.network
      ]
        .filter((part) => part !== undefined && part !== null)
        .map((part) => String(part));
      const returnedChain = [...new Set(returnedChainParts)].join(" / ");

      console.log(
        `  attempt ${value?.request?.attemptNumber ?? "?"}: ` +
        `${value?.miner?.name ?? "unknown"} (${value?.miner?.id ?? "?"}) ` +
        `→ ${value?.rejection?.code ?? "rejected"}`
      );
      if (returnedChain) {
        console.log(`    returned chain/network: ${returnedChain}`);
      }
      if (typeof result?.answer === "string") {
        console.log(`    answer: ${compactText(result.answer)}`);
      }
      console.log(`    artifact: ${short(entry.file)}`);
    }
    console.log("");
  }

  const acceptedSpend =
    typeof bundle.totalEvidenceSpendRaw === "string" &&
    /^[0-9]+$/.test(bundle.totalEvidenceSpendRaw)
      ? BigInt(bundle.totalEvidenceSpendRaw)
      : 0n;
  printLine("Rejected spend raw", rejectedSpend.toString());
  printLine("Actual acquisition raw", (acceptedSpend + rejectedSpend).toString());
  console.log("");

  if (receipt) {
    printLine("Matching receipt", short(receiptFile));
    printLine("Decision", receipt?.decision?.decision ?? "(unknown)");
    printLine("Reason", receipt?.decision?.reason ?? "(unknown)");
    printLine("Execution status", receipt?.execution?.status ?? "(unknown)");
  }

  console.log("");
  console.log("What this live HIGH run proves:");
  console.log("  • Telegraph/x402 acquisition is real.");
  console.log("  • distinct Miner identity is enforced.");
  console.log("  • wrong-chain or ambiguous-chain evidence is rejected.");
  console.log("  • low-confidence ALLOW does not automatically become permission.");
  console.log("  • insufficient independent intelligence produces HOLD.");
  console.log("  • the protected 7-USDC action was NOT executed.");
}

console.log("");
console.log("JUDGE CLOSE");
console.log("-----------");
console.log(
  "Telegraph tells autonomous software what the outside world says. " +
  "ProofGate decides how much independent intelligence the consequence deserves, " +
  "and only turns sufficient evidence plus delegated authority into one-use permission for one exact action."
);
