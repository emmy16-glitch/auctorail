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

await import("./api.js");
await import("./security-lab-api.js");
