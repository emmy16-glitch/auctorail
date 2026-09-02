CREATE TABLE IF NOT EXISTS spend_authorities (
  authority_id TEXT PRIMARY KEY,
  mandate_hash TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK (policy_version > 0),
  chain_id BIGINT NOT NULL,
  token TEXT NOT NULL,
  max_cumulative_raw NUMERIC(78, 0) NOT NULL CHECK (max_cumulative_raw > 0),
  reserved_raw NUMERIC(78, 0) NOT NULL DEFAULT 0 CHECK (reserved_raw >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS spend_reservations (
  authority_id TEXT NOT NULL REFERENCES spend_authorities(authority_id),
  execution_id UUID NOT NULL,
  amount_raw NUMERIC(78, 0) NOT NULL CHECK (amount_raw > 0),
  status TEXT NOT NULL CHECK (status IN ('RESERVED', 'RELEASED', 'CONSUMED')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (authority_id, execution_id)
);

DROP INDEX IF EXISTS spend_reservations_execution_uq;
CREATE UNIQUE INDEX IF NOT EXISTS spend_reservations_execution_uq
  ON spend_reservations (execution_id);
