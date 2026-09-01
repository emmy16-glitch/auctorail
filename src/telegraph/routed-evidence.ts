export interface TelegraphMinerRecord {
  id: string | number;
  name: string;
  slug: string;
  activation_status?: string;
  supported_intents?: string[];
  output_schema?: {
    properties?: Record<string, unknown>;
  };
}

export interface ServingMinerIdentity {
  id: string;
  name: string;
  slug: string;
  record: TelegraphMinerRecord | null;
}

export type EvidenceBindingFailureCode =
  | "evidence_subject_not_asserted"
  | "evidence_subject_mismatch"
  | "evidence_chain_not_asserted"
  | "evidence_chain_mismatch";

export type ExplicitEvidenceBinding =
  | {
      valid: true;
      subject: string;
      chainId: number;
      subjectField: string;
      chainField: string;
    }
  | {
      valid: false;
      code: EvidenceBindingFailureCode;
      detail: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function addressesEqual(a: string, b: string): boolean {
  return addressLike(a) && addressLike(b) && a.toLowerCase() === b.toLowerCase();
}

function schemaProperties(miner: TelegraphMinerRecord | null): Set<string> {
  const properties = miner?.output_schema?.properties;
  return isObject(properties)
    ? new Set(Object.keys(properties))
    : new Set<string>();
}

function aliasIsTrustworthy(
  field: string,
  canonicalField: "subject" | "chainId",
  declared: Set<string>
): boolean {
  return field === canonicalField || declared.has(field);
}

function parseExactChainId(value: unknown, expectedChainId: number): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value === expectedChainId ? value : null;
  }

  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  if (/^[0-9]+$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed === expectedChainId
      ? parsed
      : null;
  }

  if (normalized === `eip155:${expectedChainId}`) {
    return expectedChainId;
  }

  if (
    expectedChainId === 84532 &&
    [
      "base-sepolia",
      "base_sepolia",
      "base sepolia",
      "base-sepolia-testnet",
      "base sepolia testnet"
    ].includes(normalized)
  ) {
    return expectedChainId;
  }

  return null;
}

export function resolveServingMiner(
  body: Record<string, unknown>,
  requestedMiner: TelegraphMinerRecord | null,
  miners: TelegraphMinerRecord[]
): ServingMinerIdentity | null {
  const officialMinerUsed =
    typeof body.miner_used === "string" && body.miner_used.trim()
      ? body.miner_used.trim()
      : null;

  const explicitId =
    body.miner_id !== undefined && body.miner_id !== null
      ? String(body.miner_id)
      : null;

  const byOfficialMinerUsed = officialMinerUsed
    ? miners.find(
        (candidate) =>
          candidate.slug === officialMinerUsed ||
          String(candidate.id) === officialMinerUsed
      ) ?? null
    : null;

  const byExplicitId = explicitId
    ? miners.find((candidate) => String(candidate.id) === explicitId) ?? null
    : null;

  const selected =
    byOfficialMinerUsed ??
    byExplicitId ??
    requestedMiner ??
    null;

  const id = explicitId ?? (selected ? String(selected.id) : null);

  const name =
    typeof body.miner_name === "string" && body.miner_name.trim()
      ? body.miner_name.trim()
      : selected?.name ?? null;

  const slug =
    byOfficialMinerUsed?.slug ??
    byExplicitId?.slug ??
    requestedMiner?.slug ??
    (
      officialMinerUsed &&
      !/^[0-9]+$/.test(officialMinerUsed)
        ? officialMinerUsed
        : null
    );

  if (!id || !name || !slug) return null;

  return { id, name, slug, record: selected };
}

export function validateExplicitEvidenceBinding(input: {
  result: Record<string, unknown>;
  miner: TelegraphMinerRecord | null;
  expectedSubject: string;
  expectedChainId: number;
}): ExplicitEvidenceBinding {
  const declared = schemaProperties(input.miner);

  const subjectAliases = [
    "subject",
    "address",
    "target",
    "destination",
    "wallet_address",
    "entity_address"
  ] as const;

  let sawSubjectField = false;

  for (const field of subjectAliases) {
    if (!aliasIsTrustworthy(field, "subject", declared)) continue;
    if (!(field in input.result)) continue;

    sawSubjectField = true;
    const value = input.result[field];

    if (!addressLike(value)) continue;

    if (!addressesEqual(value, input.expectedSubject)) {
      return {
        valid: false,
        code: "evidence_subject_mismatch",
        detail:
          `Miner explicitly returned ${field}=${value}, ` +
          `which does not match ${input.expectedSubject}.`
      };
    }

    const chain = findChainBinding(
      input.result,
      declared,
      input.expectedChainId
    );

    if (!chain.valid) return chain;

    return {
      valid: true,
      subject: value.toLowerCase(),
      chainId: input.expectedChainId,
      subjectField: field,
      chainField: chain.chainField
    };
  }

  return {
    valid: false,
    code: sawSubjectField
      ? "evidence_subject_mismatch"
      : "evidence_subject_not_asserted",
    detail: sawSubjectField
      ? "Miner returned a subject-like field, but it was not a valid exact EVM subject."
      : "The Miner result did not explicitly assert the exact payment subject in a canonical or schema-declared field."
  };
}

function findChainBinding(
  result: Record<string, unknown>,
  declared: Set<string>,
  expectedChainId: number
):
  | { valid: true; chainField: string }
  | { valid: false; code: EvidenceBindingFailureCode; detail: string } {
  const chainAliases = [
    "chainId",
    "chain_id",
    "network",
    "network_id",
    "chain"
  ] as const;

  let sawChainField = false;

  for (const field of chainAliases) {
    if (!aliasIsTrustworthy(field, "chainId", declared)) continue;
    if (!(field in result)) continue;

    sawChainField = true;
    const value = result[field];
    const parsed = parseExactChainId(value, expectedChainId);

    if (parsed !== null) {
      return { valid: true, chainField: field };
    }

    return {
      valid: false,
      code: "evidence_chain_mismatch",
      detail:
        `Miner explicitly returned ${field}=${String(value)}, ` +
        `which does not prove exact chainId ${expectedChainId}.`
    };
  }

  return {
    valid: false,
    code: sawChainField
      ? "evidence_chain_mismatch"
      : "evidence_chain_not_asserted",
    detail: sawChainField
      ? `Miner returned a chain-like field, but it did not prove exact chainId ${expectedChainId}.`
      : `The Miner result did not explicitly assert exact chainId ${expectedChainId} in a canonical or schema-declared field.`
  };
}

export function canonicalizeBoundMinerResult(
  result: Record<string, unknown>,
  binding: Extract<ExplicitEvidenceBinding, { valid: true }>
): Record<string, unknown> {
  return {
    ...result,
    subject: binding.subject,
    chainId: binding.chainId
  };
}

export function proofExitCode(
  decision: "ALLOW" | "HOLD" | "BLOCK"
): number {
  if (decision === "ALLOW") return 0;
  if (decision === "HOLD") return 2;
  return 3;
}
