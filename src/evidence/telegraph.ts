import fs from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";

import {
  canonicalize
} from "../core/action-contract.js";

const SavedTelegraphEvidenceSchema = z.object({
  source: z.literal("telegraph"),

  intent: z.string(),

  miner: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string()
  }),

  request: z.object({
    endpoint: z.string(),
    target: z.string(),
    chainId: z.number()
  }),

  result: z
    .object({
      chainId: z.number().optional(),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional(),

      reasoning: z.string().optional(),
      subject: z.string().optional(),
      verdict: z.string().optional(),

      signals: z
        .array(
          z.object({
            key: z.string(),
            present: z.boolean()
          })
        )
        .optional()
    })
    .passthrough(),

  telegraph: z
    .object({
      signalHash: z
        .string()
        .nullable()
        .optional(),

      costUsd: z
        .number()
        .nullable()
        .optional(),

      durationMs: z
        .number()
        .nullable()
        .optional(),

      timestamp: z
        .string()
        .nullable()
        .optional()
    })
    .passthrough(),

  capturedAt: z.object({
    startedAt: z.string(),
    finishedAt: z.string()
  }),

  rawResponse: z.unknown()
}).passthrough();

export type EvidenceApplicability =
  | "APPLICABLE"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export interface TelegraphEvidenceRecord {
  source: "telegraph";

  intent: string;

  miner: {
    id: string;
    name: string;
    slug: string;
  };

  subject: string;

  chainId: number;

  label: string | null;

  confidence: number | null;

  reason: string | null;

  applicability:
    EvidenceApplicability;

  signalHash: string | null;

  costUsd: number | null;

  durationMs: number | null;

  rawResponseHash: string;

  receivedAt: string;

  rawResponse: unknown;
}

function normalizeTimestamp(
  value: string
): string {
  // Telegraph may return nanosecond precision.
  // JS Date works more reliably with millisecond precision.
  const safe = value.replace(
    /(\.\d{3})\d+Z$/,
    "$1Z"
  );

  const date = new Date(safe);

  if (
    Number.isNaN(date.getTime())
  ) {
    throw new Error(
      `Invalid evidence timestamp: ${value}`
    );
  }

  return date.toISOString();
}

function hashRawResponse(
  rawResponse: unknown
): string {
  return (
    "0x" +
    createHash("sha256")
      .update(
        canonicalize(rawResponse),
        "utf8"
      )
      .digest("hex")
  );
}

function determineApplicability(
  signals:
    | Array<{
        key: string;
        present: boolean;
      }>
    | undefined
): EvidenceApplicability {
  if (!signals) {
    return "UNKNOWN";
  }

  const contractSignal =
    signals.find(
      (signal) =>
        signal.key === "isContract"
    );

  if (!contractSignal) {
    return "UNKNOWN";
  }

  return contractSignal.present
    ? "APPLICABLE"
    : "NOT_APPLICABLE";
}

export function normalizeTelegraphEvidence(
  input: unknown
): TelegraphEvidenceRecord {
  const parsed =
    SavedTelegraphEvidenceSchema.parse(
      input
    );

  const timestamp =
    parsed.telegraph.timestamp ??
    parsed.capturedAt.finishedAt;

  return {
    source: "telegraph",

    intent: parsed.intent,

    miner: parsed.miner,

    subject:
      parsed.result.subject ??
      parsed.request.target,

    chainId:
      parsed.result.chainId ??
      parsed.request.chainId,

    label:
      parsed.result.verdict ??
      null,

    confidence:
      parsed.result.confidence ??
      null,

    reason:
      parsed.result.reasoning ??
      null,

    applicability:
      determineApplicability(
        parsed.result.signals
      ),

    signalHash:
      parsed.telegraph.signalHash ??
      null,

    costUsd:
      parsed.telegraph.costUsd ??
      null,

    durationMs:
      parsed.telegraph.durationMs ??
      null,

    rawResponseHash:
      hashRawResponse(
        parsed.rawResponse
      ),

    receivedAt:
      normalizeTimestamp(timestamp),

    rawResponse:
      parsed.rawResponse
  };
}

export function loadTelegraphEvidence(
  filePath: string
): TelegraphEvidenceRecord {
  const raw = JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );

  return normalizeTelegraphEvidence(
    raw
  );
}
