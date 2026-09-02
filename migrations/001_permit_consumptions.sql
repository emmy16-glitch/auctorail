-- Shared authoritative permit-consumption state for production replicas.
-- PostgreSQL 14+ recommended.
CREATE TABLE IF NOT EXISTS permit_consumptions (
  permit_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  consumed_at TIMESTAMPTZ NOT NULL,
  execution_id UUID NOT NULL,
  PRIMARY KEY (permit_id, nonce),
  UNIQUE (execution_id)
);
