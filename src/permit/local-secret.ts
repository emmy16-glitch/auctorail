import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

function validateSecret(secret: string): string {
  const normalized = secret.trim();

  if (normalized.length < 32) {
    throw new Error("PROOFGATE_SECRET must contain at least 32 characters");
  }

  return normalized;
}

export function loadOrCreateAuctorailSecret(options?: {
  filePath?: string;
  envSecret?: string | null;
}): string {
  const envSecret =
    options?.envSecret !== undefined
      ? options.envSecret
      : process.env.PROOFGATE_SECRET ?? null;

  if (envSecret) {
    return validateSecret(envSecret);
  }

  const filePath =
    options?.filePath ??
    path.join(".proofgate", "permit-secret");

  if (fs.existsSync(filePath)) {
    return validateSecret(fs.readFileSync(filePath, "utf8"));
  }

  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
    mode: 0o700
  });

  const generated = randomBytes(32).toString("hex");

  try {
    fs.writeFileSync(filePath, generated + "\n", {
      flag: "wx",
      mode: 0o600
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    return validateSecret(fs.readFileSync(filePath, "utf8"));
  }

  return generated;
}
