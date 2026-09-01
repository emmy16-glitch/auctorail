import fs from "node:fs";
import path from "node:path";

import {
  loadTelegraphEvidence,
  type TelegraphEvidenceRecord
} from "./telegraph.js";

export interface StoredTelegraphEvidence {
  filePath: string;
  evidence: TelegraphEvidenceRecord;
}

function normalizeAddress(value: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return null;
  }

  return value.toLowerCase();
}

export function findLatestMatchingTelegraphEvidence(
  directory: string,
  target: string,
  chainId: number,
  intent = "FRAUD_DETECTION"
): StoredTelegraphEvidence | null {
  const normalizedTarget = normalizeAddress(target);

  if (!normalizedTarget) {
    throw new Error("invalid_evidence_target");
  }

  if (!fs.existsSync(directory)) {
    return null;
  }

  const matches: StoredTelegraphEvidence[] = [];

  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(directory, name);
    const evidence = loadTelegraphEvidence(filePath);
    const normalizedSubject = normalizeAddress(evidence.subject);

    if (
      normalizedSubject === normalizedTarget &&
      evidence.chainId === chainId &&
      evidence.intent === intent
    ) {
      matches.push({ filePath, evidence });
    }
  }

  matches.sort((a, b) => {
    const left = new Date(a.evidence.receivedAt).getTime();
    const right = new Date(b.evidence.receivedAt).getTime();
    return right - left;
  });

  return matches[0] ?? null;
}
