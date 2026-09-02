import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  timingSafeEqual,
  verify as cryptoVerify,
  type KeyObject
} from "node:crypto";
import { canonicalize } from "../core/action-contract.js";

export type PermitAlgorithm = "Ed25519" | "HS256";
export type KeyState = "ACTIVE" | "VERIFY_ONLY" | "REVOKED";

export interface PermitSignatureMetadata {
  keyId: string;
  algorithm: PermitAlgorithm;
  signingVersion: number;
}

export interface PermitSigner {
  readonly metadata: PermitSignatureMetadata;
  sign(payload: unknown): string;
}

/** Remote KMS/HSM boundary; implementations may perform network I/O asynchronously. */
export interface AsyncPermitSigner {
  readonly metadata: PermitSignatureMetadata;
  sign(payload: unknown): Promise<string>;
}

export function asAsyncPermitSigner(signer: PermitSigner): AsyncPermitSigner {
  return {
    metadata: signer.metadata,
    async sign(payload: unknown): Promise<string> {
      return signer.sign(payload);
    }
  };
}

export interface PermitVerifier {
  verify(payload: unknown, signature: string, metadata: PermitSignatureMetadata): boolean;
}

export interface VerificationKeyResolver {
  resolve(keyId: string): { key: KeyObject; state: KeyState; algorithm: PermitAlgorithm; signingVersion: number } | null;
}

export class KeyRegistry implements VerificationKeyResolver {
  private readonly keys = new Map<string, { key: KeyObject; state: KeyState; algorithm: PermitAlgorithm; signingVersion: number }>();

  register(keyId: string, key: KeyObject | string, state: KeyState, algorithm: PermitAlgorithm, signingVersion = 1): void {
    if (!keyId || state === "REVOKED" && this.keys.get(keyId)?.state === "REVOKED") {
      throw new Error("invalid_key_registration");
    }
    const publicKey = typeof key === "string" ? createPublicKey(key) : key.type === "public" ? key : createPublicKey(key);
    this.keys.set(keyId, { key: publicKey, state, algorithm, signingVersion });
  }

  rotate(keyId: string): void {
    const entry = this.keys.get(keyId);
    if (!entry || entry.state === "REVOKED") throw new Error("key_not_rotatable");
    for (const [id, value] of this.keys) {
      if (id !== keyId && value.state === "ACTIVE") this.keys.set(id, { ...value, state: "VERIFY_ONLY" });
    }
    this.keys.set(keyId, { ...entry, state: "ACTIVE" });
  }

  revoke(keyId: string): void {
    const entry = this.keys.get(keyId);
    if (!entry) throw new Error("unknown_key_id");
    this.keys.set(keyId, { ...entry, state: "REVOKED" });
  }

  resolve(keyId: string) {
    return this.keys.get(keyId) ?? null;
  }
}

export class Ed25519PermitSigner implements PermitSigner, PermitVerifier {
  readonly metadata: PermitSignatureMetadata;
  private readonly privateKey: KeyObject;

  constructor(privateKey: KeyObject | string, keyId: string, signingVersion = 1) {
    this.privateKey = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
    this.metadata = { keyId, algorithm: "Ed25519", signingVersion };
  }

  sign(payload: unknown): string {
    return `0x${cryptoSign(null, Buffer.from(canonicalize(payload)), this.privateKey).toString("hex")}`;
  }

  verify(payload: unknown, signature: string, metadata: PermitSignatureMetadata): boolean {
    if (metadata.algorithm !== "Ed25519" || metadata.keyId !== this.metadata.keyId || metadata.signingVersion !== this.metadata.signingVersion) return false;
    try {
      return cryptoVerify(null, Buffer.from(canonicalize(payload)), createPublicKey(this.privateKey), Buffer.from(signature.slice(2), "hex"));
    } catch {
      return false;
    }
  }
}

export class RegistryPermitVerifier implements PermitVerifier {
  constructor(private readonly registry: VerificationKeyResolver) {}

  verify(payload: unknown, signature: string, metadata: PermitSignatureMetadata): boolean {
    const resolved = this.registry.resolve(metadata.keyId);
    if (!resolved || resolved.state === "REVOKED" || resolved.algorithm !== metadata.algorithm || resolved.signingVersion !== metadata.signingVersion) return false;
    try {
      if (metadata.algorithm !== "Ed25519" || !/^0x[0-9a-f]{128}$/i.test(signature)) return false;
      return cryptoVerify(null, Buffer.from(canonicalize(payload)), resolved.key, Buffer.from(signature.slice(2), "hex"));
    } catch {
      return false;
    }
  }
}

/** HMAC is intentionally restricted to local/test/demo environments. */
export class LocalDevelopmentSigner implements PermitSigner, PermitVerifier {
  readonly metadata: PermitSignatureMetadata;
  constructor(private readonly secret: string, keyId = "local-development", signingVersion = 1) {
    if (process.env.NODE_ENV === "production") throw new Error("LocalDevelopmentSigner is NOT FOR PRODUCTION");
    if (secret.length < 32) throw new Error("development_signing_secret_too_weak");
    this.metadata = { keyId, algorithm: "HS256", signingVersion };
  }
  sign(payload: unknown): string {
    return `0x${createHmac("sha256", this.secret).update(canonicalize(payload)).digest("hex")}`;
  }
  verify(payload: unknown, signature: string, metadata: PermitSignatureMetadata): boolean {
    if (metadata.keyId !== this.metadata.keyId || metadata.algorithm !== "HS256" || metadata.signingVersion !== this.metadata.signingVersion || !/^0x[0-9a-f]{64}$/i.test(signature)) return false;
    const expected = Buffer.from(this.sign(payload).slice(2), "hex");
    const supplied = Buffer.from(signature.slice(2), "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
}

export function assertProductionSigner(metadata: PermitSignatureMetadata, environment = process.env.NODE_ENV): void {
  if (environment === "production" && metadata.algorithm === "HS256") throw new Error("production_requires_asymmetric_permit_signer");
}
