import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

import type {
  ActionContract
} from "../src/core/action-contract.js";
import type {
  MandateContract
} from "../src/core/mandate-contract.js";
import {
  evaluatePaymentAuthorization,
  planPaymentAuthorization
} from "../src/sdk/proofgate.js";
import type {
  AdaptiveEvidencePlan
} from "../src/telegraph/adaptive-evidence-plan.js";
import type {
  EvidenceBundle
} from "../src/telegraph/evidence-bundle.js";

const port = Number(
  process.env.PROOFGATE_PORT ?? "8787"
);
const host =
  process.env.PROOFGATE_HOST ?? "127.0.0.1";

if (
  !Number.isInteger(port) ||
  port <= 0 ||
  port > 65535
) {
  throw new Error("PROOFGATE_PORT is invalid");
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown
): void {
  const encoded = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded),
    "cache-control": "no-store"
  });
  response.end(encoded);
}

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

async function readJson(
  request: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);
    size += buffer.length;

    if (size > 1_000_000) {
      throw new Error("request_body_too_large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(
    Buffer.concat(chunks).toString("utf8")
  );
}

async function handler(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (
    request.method === "GET" &&
    request.url === "/health"
  ) {
    sendJson(response, 200, {
      service: "proofgate",
      mode: "EVALUATE_ONLY",
      policy: "payments.adaptive.v1",
      status: "ok"
    });
    return;
  }

  if (
    request.method === "POST" &&
    request.url === "/v1/plan"
  ) {
    const body = await readJson(request);

    if (!isObject(body)) {
      throw new Error("request_body_invalid");
    }

    const amountRaw = body.amountRaw;
    const destination = body.destination;
    const reason = body.reason;

    if (
      typeof amountRaw !== "string" ||
      typeof destination !== "string" ||
      typeof reason !== "string"
    ) {
      throw new Error("payment_proposal_invalid");
    }

    sendJson(
      response,
      200,
      planPaymentAuthorization({
        amountRaw,
        destination,
        reason
      })
    );
    return;
  }

  if (
    request.method === "POST" &&
    request.url === "/v1/evaluate"
  ) {
    const body = await readJson(request);

    if (
      !isObject(body) ||
      !isObject(body.mandate) ||
      !isObject(body.action) ||
      !isObject(body.plan) ||
      typeof body.agentId !== "string"
    ) {
      throw new Error("authorization_context_invalid");
    }

    const bundle =
      body.bundle === null
        ? null
        : isObject(body.bundle)
          ? body.bundle as unknown as EvidenceBundle
          : null;

    const result =
      evaluatePaymentAuthorization({
        mandate:
          body.mandate as unknown as MandateContract,
        action:
          body.action as unknown as ActionContract,
        plan:
          body.plan as unknown as AdaptiveEvidencePlan,
        bundle,
        agentId:
          body.agentId
      });

    sendJson(
      response,
      result.decision.decision === "ALLOW"
        ? 200
        : 403,
      result
    );
    return;
  }

  sendJson(response, 404, {
    error: "not_found"
  });
}

const server = createServer(
  (request, response) => {
    handler(request, response).catch(
      (error: unknown) => {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }
    );
  }
);

server.listen(port, host, () => {
  console.log(
    `ProofGate authorization gateway listening on http://${host}:${port}`
  );
  console.log(
    "Mode: EVALUATE_ONLY (does not hold a wallet key, buy evidence, mint permits, or execute funds)"
  );
});
