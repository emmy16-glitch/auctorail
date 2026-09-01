export interface TelegraphMinerRecord {
  id: string | number;
  name: string;
  slug: string;
  activation_status?: string;
  supported_intents?: string[];
  output_schema?: {
    properties?: Record<string, unknown>;
  };
  signal_mapping?: {
    label_field?: string;
    confidence_field?: string;
    reason_field?: string;
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function explicitAddressesInText(text: string): string[] {
  return unique(
    [...text.matchAll(/\b0x[0-9a-fA-F]{40}\b/g)]
      .map((match) => match[0].toLowerCase())
  );
}

function explicitChainIdsInText(text: string): number[] {
  const ids: number[] = [];
  const chainIdPattern = /\bchain\s*id\s*[:=#]?\s*(\d+)\b/gi;
  const caipPattern = /\beip155:(\d+)\b/gi;

  for (const match of text.matchAll(chainIdPattern)) {
    const parsed = Number(match[1]);
    if (Number.isSafeInteger(parsed)) ids.push(parsed);
  }

  for (const match of text.matchAll(caipPattern)) {
    const parsed = Number(match[1]);
    if (Number.isSafeInteger(parsed)) ids.push(parsed);
  }

  if (/\bbase[\s_-]+sepolia(?:[\s_-]+testnet)?\b/i.test(text)) {
    ids.push(84532);
  }

  return unique(ids);
}

function declaredTextFields(
  result: Record<string, unknown>,
  miner: TelegraphMinerRecord | null
): Array<{ field: string; text: string }> {
  const declared = schemaProperties(miner);
  const mapping = miner?.signal_mapping;

  const candidates = unique(
    [
      mapping?.label_field,
      mapping?.reason_field,
      "signal",
      "answer",
      "summary",
      "reasoning"
    ].filter((value): value is string => Boolean(value))
  );

  return candidates
    .filter((field) => declared.has(field))
    .map((field) => ({ field, value: result[field] }))
    .filter(
      (entry): entry is { field: string; value: string } =>
        typeof entry.value === "string" && entry.value.trim().length > 0
    )
    .map((entry) => ({
      field: entry.field,
      text: entry.value
    }));
}

function validateTextBinding(input: {
  field: string;
  text: string;
  expectedSubject: string;
  expectedChainId: number;
}): ExplicitEvidenceBinding | null {
  const addresses = explicitAddressesInText(input.text);

  if (addresses.length === 0) {
    return null;
  }

  const expectedSubject = input.expectedSubject.toLowerCase();

  if (!addresses.includes(expectedSubject)) {
    return {
      valid: false,
      code: "evidence_subject_mismatch",
      detail:
        `Schema-declared text field ${input.field} explicitly named ` +
        `${addresses.join(", ")}, not ${input.expectedSubject}.`
    };
  }

  const conflictingAddresses = addresses.filter(
    (address) => address !== expectedSubject
  );

  if (conflictingAddresses.length > 0) {
    return {
      valid: false,
      code: "evidence_subject_mismatch",
      detail:
        `Schema-declared text field ${input.field} named the expected subject ` +
        `but also named different EVM subjects (${conflictingAddresses.join(", ")}); ` +
        "ProofGate refuses ambiguous text binding."
    };
  }

  const chainIds = explicitChainIdsInText(input.text);

  if (chainIds.length === 0) {
    return {
      valid: false,
      code: "evidence_chain_not_asserted",
      detail:
        `Schema-declared text field ${input.field} explicitly named the exact ` +
        "subject but did not explicitly identify the chain."
    };
  }

  if (!chainIds.includes(input.expectedChainId)) {
    return {
      valid: false,
      code: "evidence_chain_mismatch",
      detail:
        `Schema-declared text field ${input.field} explicitly named chain IDs ` +
        `${chainIds.join(", ")}, not ${input.expectedChainId}.`
    };
  }

  const conflictingChains = chainIds.filter(
    (chainId) => chainId !== input.expectedChainId
  );

  if (conflictingChains.length > 0) {
    return {
      valid: false,
      code: "evidence_chain_mismatch",
      detail:
        `Schema-declared text field ${input.field} named the expected chain ` +
        `but also named different chain IDs (${conflictingChains.join(", ")}); ` +
        "ProofGate refuses ambiguous text binding."
    };
  }

  return {
    valid: true,
    subject: expectedSubject,
    chainId: input.expectedChainId,
    subjectField: `${input.field}:text`,
    chainField: `${input.field}:text`
  };
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

    const chain = findStructuredChainBinding(
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

  for (const candidate of declaredTextFields(input.result, input.miner)) {
    const textBinding = validateTextBinding({
      field: candidate.field,
      text: candidate.text,
      expectedSubject: input.expectedSubject,
      expectedChainId: input.expectedChainId
    });

    if (textBinding) return textBinding;
  }

  return {
    valid: false,
    code: sawSubjectField
      ? "evidence_subject_mismatch"
      : "evidence_subject_not_asserted",
    detail: sawSubjectField
      ? "Miner returned a subject-like field, but it was not a valid exact EVM subject."
      : "The Miner result did not explicitly assert the exact payment subject in a canonical, schema-declared structured field, or deterministically bindable schema-declared text field."
  };
}

function findStructuredChainBinding(
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
      : `The Miner result did not explicitly assert exact chainId ${expectedChainId} in a canonical or schema-declared structured field.`
  };
}

function mappedString(
  result: Record<string, unknown>,
  field: string | undefined
): string | null {
  if (!field) return null;
  const value = result[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function mappedConfidence(
  result: Record<string, unknown>,
  field: string | undefined
): number | null {
  if (!field) return null;
  const value = result[field];

  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
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

export function adaptBoundMinerResultForPolicy(
  result: Record<string, unknown>,
  miner: TelegraphMinerRecord | null,
  binding: Extract<ExplicitEvidenceBinding, { valid: true }>
): Record<string, unknown> {
  const canonical =
    canonicalizeBoundMinerResult(result, binding);

  const mapping = miner?.signal_mapping;

  const mappedLabel =
    mappedString(result, mapping?.label_field);

  const mappedReason =
    mappedString(result, mapping?.reason_field);

  const mappedConfidenceValue =
    mappedConfidence(result, mapping?.confidence_field);

  return {
    ...canonical,
    ...(
      typeof canonical.verdict !== "string" &&
      mappedLabel
        ? { verdict: mappedLabel }
        : {}
    ),
    ...(
      typeof canonical.reasoning !== "string" &&
      mappedReason
        ? { reasoning: mappedReason }
        : {}
    ),
    ...(
      typeof canonical.confidence !== "number" &&
      mappedConfidenceValue !== null
        ? { confidence: mappedConfidenceValue }
        : {}
    )
  };
}

export function proofExitCode(
  decision: "ALLOW" | "HOLD" | "BLOCK"
): number {
  if (decision === "ALLOW") return 0;
  if (decision === "HOLD") return 2;
  return 3;
}
