import { spawnSync } from "node:child_process";

console.log(
  "scripts/deploy-vendor.mjs now delegates to the journaled, idempotent deployment path."
);

const result = spawnSync(
  "npm",
  ["run", "vendor:deploy"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  }
);

process.exit(result.status ?? 1);
