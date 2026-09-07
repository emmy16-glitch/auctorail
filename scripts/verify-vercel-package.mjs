import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Run outside the checkout: no accidental access to repository artifacts,
// local credentials or development-only signer allowances.
const isolated = mkdtempSync(join(tmpdir(), "auctorail-package-"));
try {
  cpSync(resolve(".vercel/output/functions/api-utility.func"), isolated, { recursive: true });
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import http from 'node:http';
    import assert from 'node:assert/strict';
    import handler from './index.js';
    const server = http.createServer(handler.default ?? handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/security-lab', { method: 'POST', signal: AbortSignal.timeout(10000) });
      const report = await response.json();
      assert.equal(response.status, 200, JSON.stringify(report));
      assert.equal(report.mode, 'OFFLINE_DETERMINISTIC');
      assert.equal(report.allPassed, true);
      assert.equal(report.total, 13);
      assert.equal(report.scenarios.find(s => s.id === 'missing_evidence').observed, 'HOLD:telegraph_evidence:no_permit');
      console.log('Isolated production utility package: 13/13 checks pass');
    } finally { server.closeAllConnections(); server.close(); }
  `], {
    cwd: isolated,
    env: { PATH: process.env.PATH, NODE_ENV: "production" },
    encoding: "utf8", timeout: 20_000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  process.stdout.write(result.stdout);
} finally {
  rmSync(isolated, { recursive: true, force: true });
}
