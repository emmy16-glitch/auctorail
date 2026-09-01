import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export interface PermitConsumption {
  permitId: string;
  nonce: string;
  consumedAt: string;
}

export interface ConsumeResult {
  consumed: boolean;
  code:
    | "permit_consumed"
    | "permit_already_consumed";
}

export interface PermitConsumptionStore {
  consume(
    permitId: string,
    nonce: string,
    consumedAt: string
  ): ConsumeResult;

  isConsumed(
    permitId: string,
    nonce: string
  ): boolean;
}

function keyFor(
  permitId: string,
  nonce: string
): string {
  return createHash("sha256")
    .update(`${permitId}:${nonce}`)
    .digest("hex");
}

export class FilePermitConsumptionStore
implements PermitConsumptionStore {
  constructor(
    private readonly directory:
      string = ".proofgate/consumed"
  ) {
    fs.mkdirSync(
      this.directory,
      { recursive: true }
    );
  }

  private filePath(
    permitId: string,
    nonce: string
  ): string {
    return path.join(
      this.directory,
      `${keyFor(
        permitId,
        nonce
      )}.json`
    );
  }

  consume(
    permitId: string,
    nonce: string,
    consumedAt: string
  ): ConsumeResult {
    const file =
      this.filePath(
        permitId,
        nonce
      );

    const record:
      PermitConsumption = {
        permitId,
        nonce,
        consumedAt
      };

    try {
      fs.writeFileSync(
        file,
        JSON.stringify(
          record,
          null,
          2
        ),
        {
          flag: "wx",
          mode: 0o600
        }
      );

      return {
        consumed: true,
        code:
          "permit_consumed"
      };
    } catch (
      error: unknown
    ) {
      const code =
        (error as NodeJS.ErrnoException)
          .code;

      if (code === "EEXIST") {
        return {
          consumed: false,
          code:
            "permit_already_consumed"
        };
      }

      throw error;
    }
  }

  isConsumed(
    permitId: string,
    nonce: string
  ): boolean {
    return fs.existsSync(
      this.filePath(
        permitId,
        nonce
      )
    );
  }
}
