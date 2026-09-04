import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { runAttackLab } from "../src/security/attack-lab.js";

const PORT = Number(process.env.PROOFGATE_SECURITY_LAB_PORT ?? 8788);
const ALLOWED_ORIGINS = new Set(
  (process.env.PROOFGATE_WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

function headers(request: IncomingMessage): Record<string, string> {
  const origin = request.headers.origin;
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "vary": "Origin",
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "access-control-allow-origin": origin } : {})
  };
}

function reply(request: IncomingMessage, response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, headers(request));
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(request, response, 403, { error: "origin_not_allowed" });

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...headers(request),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600"
    });
    return response.end();
  }

  if (request.method !== "POST" || request.url !== "/api/security-lab") {
    return reply(request, response, 404, { error: "not_found" });
  }

  try {
    const report = await runAttackLab();
    return reply(request, response, 200, report);
  } catch (error) {
    return reply(request, response, 500, {
      error: "security_lab_failed",
      detail: error instanceof Error ? error.message : "unknown_security_lab_error"
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ProofGate Security Lab API listening on ${PORT}`);
  console.log("Security Lab mode: deterministic authorization attack harness");
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
