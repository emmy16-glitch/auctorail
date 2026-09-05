// Auctorail public SDK entrypoint.
//
// The implementation currently re-exports the battle-tested authorization
// functions from the legacy module so existing deployments and historical
// receipts remain compatible while new integrations use the Auctorail name.
export * from "./proofgate.js";
