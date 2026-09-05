function joinUrl(baseUrl, path) {
  const base = String(baseUrl ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `auctorail-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readJson(response) {
  let body = null;
  try { body = await response.json(); }
  catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body?.error ?? `Auctorail request failed with HTTP ${response.status}`);
    error.code = body?.error ?? "auctorail_http_error";
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function normalizeAuthorization(result) {
  const decision = result?.decision ?? (result?.status === "BLOCKED" ? "BLOCK" : "HOLD");
  return {
    id: result?.action?.id ?? null,
    decision,
    allowed: decision === "ALLOW",
    reason: result?.reason ?? null,
    riskTier: result?.riskTier ?? null,
    action: result?.action ?? null,
    evidence: result?.evidence ?? null,
    permit: result?.permit ?? null,
    executionToken: result?.execution?.token ?? null,
    raw: result
  };
}

export class Auctorail {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl ?? "").replace(/\/$/, "");
    this.headers = { ...(options.headers ?? {}) };
  }

  async authorize(input) {
    if (!input || typeof input !== "object") throw new TypeError("authorize(input) requires an input object");

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new TypeError("amount must be a positive number or numeric string");
    if (!input.recipient) throw new TypeError("recipient is required");

    const limit = Number(input.limit ?? amount);
    const durationSeconds = Number(input.durationSeconds ?? 3600);
    const body = {
      mode: "policy",
      agentId: input.agent ?? "invoice-bot",
      limit: limit.toFixed(2),
      amount: amount.toFixed(2),
      destination: input.recipient,
      durationSeconds,
      reason: input.reason ?? "SDK authorization request",
      reference: input.reference ?? `sdk-${Date.now()}`
    };

    const commonHeaders = { "content-type": "application/json", ...this.headers };
    const policyResponse = await fetch(joinUrl(this.baseUrl, "/api/authorize"), {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify(body)
    });
    const policy = await readJson(policyResponse);

    if (policy.status === "BLOCKED" || policy.decision === "BLOCK" || input.live === false) {
      return normalizeAuthorization(policy);
    }

    if (policy.status !== "REQUIRES_INTELLIGENCE" || !policy.freezeFingerprint) {
      return normalizeAuthorization(policy);
    }

    const liveResponse = await fetch(joinUrl(this.baseUrl, "/api/authorize"), {
      method: "POST",
      headers: {
        ...commonHeaders,
        "idempotency-key": input.idempotencyKey ?? makeIdempotencyKey()
      },
      body: JSON.stringify({
        ...body,
        mode: "live",
        freezeFingerprint: policy.freezeFingerprint
      })
    });

    return normalizeAuthorization(await readJson(liveResponse));
  }

  async execute(authorization, options = {}) {
    const executionToken = authorization?.executionToken ?? authorization?.raw?.execution?.token;
    if (!executionToken) throw new Error("This authorization does not contain executable authority");

    const response = await fetch(joinUrl(this.baseUrl, "/api/execute"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": options.idempotencyKey ?? makeIdempotencyKey(),
        ...this.headers
      },
      body: JSON.stringify({ executionToken })
    });

    return readJson(response);
  }
}

export default Auctorail;
