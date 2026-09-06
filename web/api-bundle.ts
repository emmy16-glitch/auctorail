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
  process.env.AUCTORAIL_TELEGRAPH_HTTP_TIMEOUT_MS ?? "8000"
);
// Keep each upstream Telegraph request below the LOW-risk 12 second evidence
// deadline while allowing normal Miner/x402 responses more time than the old
// 3.5 second demo-oriented cap.
const telegraphHttpTimeoutMs =
  Number.isFinite(configuredTelegraphTimeout)
    ? Math.min(11_000, Math.max(1_500, Math.round(configuredTelegraphTimeout)))
    : 8_000;

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
