import "dotenv/config";

const configuredLiveQuota = Number(
  process.env.AUCTORAIL_LIVE_REQUESTS_PER_HOUR ??
  process.env.PROOFGATE_LIVE_REQUESTS_PER_HOUR ??
  "50"
);
const normalizedLiveQuota = String(
  Number.isSafeInteger(configuredLiveQuota) && configuredLiveQuota > 0
    ? Math.max(50, configuredLiveQuota)
    : 50
);

process.env.AUCTORAIL_LIVE_REQUESTS_PER_HOUR = normalizedLiveQuota;
// Legacy backend alias retained during the deployment migration.
process.env.PROOFGATE_LIVE_REQUESTS_PER_HOUR = normalizedLiveQuota;

const configuredTelegraphTimeout = Number(
  process.env.AUCTORAIL_TELEGRAPH_HTTP_TIMEOUT_MS ?? "16000"
);
// LOW risk has a 20 second end-to-end evidence window. A single Telegraph/x402
// request gets up to 16 seconds, leaving policy time for parsing, validation,
// accounting and a bounded fallback when the first paid route is unusable.
const telegraphHttpTimeoutMs =
  Number.isFinite(configuredTelegraphTimeout)
    ? Math.min(16_000, Math.max(1_500, Math.round(configuredTelegraphTimeout)))
    : 16_000;

const nativeFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (!url.startsWith("https://devnode.telegraphprotocol.com/")) {
    return nativeFetch(input, init);
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(new Error("telegraph_http_timeout")),
    telegraphHttpTimeoutMs
  );

  let abortFromCaller: (() => void) | undefined;
  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeout);
      throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    abortFromCaller = () => timeoutController.abort(init.signal?.reason);
    init.signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await nativeFetch(input, {
      ...init,
      signal: timeoutController.signal
    });
  } finally {
    clearTimeout(timeout);
    if (init?.signal && abortFromCaller) {
      init.signal.removeEventListener("abort", abortFromCaller);
    }
  }
};

await import("./api.js");
await import("./security-lab-api.js");
