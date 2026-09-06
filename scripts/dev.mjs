import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");

for (const required of [tsxCli, viteCli]) {
  if (!existsSync(required)) {
    console.error("Auctorail dev dependencies are missing. Run `npm install` first.");
    process.exit(1);
  }
}

const viteArgs = process.argv.slice(2);
const hasHost = viteArgs.some((arg) => arg === "--host" || arg.startsWith("--host="));
if (!hasHost) viteArgs.unshift("0.0.0.0");
if (!hasHost) viteArgs.unshift("--host");

function resolveVitePort(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--port") {
      const value = Number(args[index + 1]);
      if (Number.isInteger(value) && value > 0 && value <= 65535) return value;
    }
    if (arg.startsWith("--port=")) {
      const value = Number(arg.slice("--port=".length));
      if (Number.isInteger(value) && value > 0 && value <= 65535) return value;
    }
  }
  return 5173;
}

function resolveLiveQuota(value) {
  const parsed = Number(value ?? 50);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.max(50, parsed) : 50;
}

const vitePort = resolveVitePort(viteArgs);
const liveQuota = resolveLiveQuota(process.env.AUCTORAIL_LIVE_REQUESTS_PER_HOUR ?? process.env.PROOFGATE_LIVE_REQUESTS_PER_HOUR);
const localOrigins = `http://localhost:${vitePort},http://127.0.0.1:${vitePort}`;

// Auctorail is the current product namespace. Legacy PROOFGATE_* aliases are
// mirrored only so the already-deployed backend can be migrated without
// invalidating historical receipts, permits, or Base Sepolia evidence.
const env = {
  ...process.env,
  AUCTORAIL_LIVE_AUTHORIZATION_ENABLED:
    process.env.AUCTORAIL_LIVE_AUTHORIZATION_ENABLED ?? process.env.PROOFGATE_LIVE_AUTHORIZATION_ENABLED ?? "true",
  AUCTORAIL_LIVE_REQUESTS_PER_HOUR: String(liveQuota),
  AUCTORAIL_CONTENT_LIVE_ENABLED:
    process.env.AUCTORAIL_CONTENT_LIVE_ENABLED ?? "true",
  AUCTORAIL_WEB_ORIGINS:
    process.env.AUCTORAIL_WEB_ORIGINS ?? process.env.PROOFGATE_WEB_ORIGINS ?? localOrigins,
  PROOFGATE_LIVE_AUTHORIZATION_ENABLED:
    process.env.AUCTORAIL_LIVE_AUTHORIZATION_ENABLED ?? process.env.PROOFGATE_LIVE_AUTHORIZATION_ENABLED ?? "true",
  PROOFGATE_LIVE_REQUESTS_PER_HOUR: String(liveQuota),
  PROOFGATE_WEB_ORIGINS:
    process.env.AUCTORAIL_WEB_ORIGINS ?? process.env.PROOFGATE_WEB_ORIGINS ?? localOrigins
};

const children = new Set();
let shuttingDown = false;

function start(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`${label} exited (${reason}). Stopping Auctorail dev services.`);
    shutdown(code && code !== 0 ? code : 0);
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 1800);
  timer.unref();
  if (children.size === 0) process.exit(exitCode);
  Promise.all(
    [...children].map(
      (child) => new Promise((resolve) => child.once("exit", resolve))
    )
  ).finally(() => process.exit(exitCode));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting Auctorail authorization API + Security Lab + Vite...");
console.log(`Live authorization: ${env.AUCTORAIL_LIVE_AUTHORIZATION_ENABLED}`);
console.log(`Live-check quota: ${env.AUCTORAIL_LIVE_REQUESTS_PER_HOUR}/hour`);
console.log(`Local web origins: ${env.AUCTORAIL_WEB_ORIGINS}`);

start("Auctorail API bundle", [tsxCli, "web/api-bundle.ts"]);
start("Auctorail web UI", [viteCli, ...viteArgs]);
