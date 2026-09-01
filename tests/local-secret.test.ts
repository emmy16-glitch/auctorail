import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  describe,
  expect,
  it
} from "vitest";

import {
  loadOrCreateProofGateSecret
} from "../src/permit/local-secret.js";

describe(
  "local ProofGate permit secret",
  () => {
    it(
      "creates and then reuses a stable local secret",
      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "proofgate-secret-"
            )
          );

        const file =
          path.join(
            directory,
            "permit-secret"
          );

        const first =
          loadOrCreateProofGateSecret({
            filePath: file,
            envSecret: null
          });

        const second =
          loadOrCreateProofGateSecret({
            filePath: file,
            envSecret: null
          });

        expect(first.length).toBeGreaterThanOrEqual(
          32
        );
        expect(second).toBe(first);

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
      "prefers an explicit strong environment secret without writing a file",
      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "proofgate-secret-env-"
            )
          );

        const file =
          path.join(
            directory,
            "permit-secret"
          );

        const secret =
          "environment-secret-" +
          "x".repeat(64);

        expect(
          loadOrCreateProofGateSecret({
            filePath: file,
            envSecret: secret
          })
        ).toBe(secret);

        expect(
          fs.existsSync(file)
        ).toBe(false);

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
