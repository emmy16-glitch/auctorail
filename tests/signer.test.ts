import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  Ed25519PermitSigner,
  KeyRegistry,
  LocalDevelopmentSigner,
  RegistryPermitVerifier,
  assertProductionSigner
} from "../src/permit/signer.js";

const payload = { permitId: "p-1", actionHash: "a-1", amountRaw: "1000000" };

function keyPair() {
  return generateKeyPairSync("ed25519");
}

describe("production permit signer boundary", () => {
  it("signs and verifies an Ed25519 payload", () => {
    const pair = keyPair();
    const signer = new Ed25519PermitSigner(pair.privateKey, "k1");
    const registry = new KeyRegistry();
    registry.register("k1", pair.publicKey, "ACTIVE", "Ed25519");
    const verifier = new RegistryPermitVerifier(registry);
    expect(verifier.verify(payload, signer.sign(payload), signer.metadata)).toBe(true);
  });

  it("rejects payload mutation, wrong key ID, unknown key, malformed signature, and revoked key", () => {
    const pair = keyPair();
    const other = keyPair();
    const signer = new Ed25519PermitSigner(pair.privateKey, "k1");
    const registry = new KeyRegistry();
    registry.register("k1", pair.publicKey, "ACTIVE", "Ed25519");
    registry.register("k2", other.publicKey, "ACTIVE", "Ed25519");
    const verifier = new RegistryPermitVerifier(registry);
    const signature = signer.sign(payload);
    expect(verifier.verify({ ...payload, amountRaw: "2000000" }, signature, signer.metadata)).toBe(false);
    expect(verifier.verify(payload, signature, { ...signer.metadata, keyId: "k2" })).toBe(false);
    expect(verifier.verify(payload, signature, { ...signer.metadata, keyId: "k3" })).toBe(false);
    expect(verifier.verify(payload, "0x00", signer.metadata)).toBe(false);
    registry.revoke("k1");
    expect(verifier.verify(payload, signature, signer.metadata)).toBe(false);
  });

  it("supports active-to-verify-only rotation and rejects revoked keys", () => {
    const first = keyPair();
    const second = keyPair();
    const signer1 = new Ed25519PermitSigner(first.privateKey, "k1");
    const signer2 = new Ed25519PermitSigner(second.privateKey, "k2");
    const registry = new KeyRegistry();
    registry.register("k1", first.publicKey, "ACTIVE", "Ed25519");
    registry.register("k2", second.publicKey, "VERIFY_ONLY", "Ed25519");
    const verifier = new RegistryPermitVerifier(registry);
    const oldSignature = signer1.sign(payload);
    registry.rotate("k2");
    expect(verifier.verify(payload, oldSignature, signer1.metadata)).toBe(true);
    expect(verifier.verify(payload, signer2.sign(payload), signer2.metadata)).toBe(true);
    registry.revoke("k1");
    expect(verifier.verify(payload, oldSignature, signer1.metadata)).toBe(false);
  });

  it("keeps HMAC development signing explicitly out of production", () => {
    const signer = new LocalDevelopmentSigner("x".repeat(64));
    expect(signer.verify(payload, signer.sign(payload), signer.metadata)).toBe(true);
    expect(() => assertProductionSigner(signer.metadata, "production")).toThrow("production_requires_asymmetric_permit_signer");
  });
});
