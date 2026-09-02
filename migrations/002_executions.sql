-- Durable execution authority for crash recovery and ambiguity reconciliation.
CREATE TABLE IF NOT EXISTS executions (
  execution_id UUID PRIMARY KEY,
  permit_id TEXT NOT NULL,
  permit_nonce TEXT NOT NULL,
  mandate_hash TEXT NOT NULL,
  action_hash TEXT NOT NULL,
  decision_hash TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  transaction_intent_hash TEXT NOT NULL,
  chain_id BIGINT NOT NULL,
  sender TEXT NOT NULL,
  destination TEXT NOT NULL,
  token TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL CHECK (state IN (
    'AUTHORIZED', 'CLAIMED', 'SUBMITTING', 'BROADCAST',
    'CONFIRMED', 'REJECTED', 'AMBIGUOUS', 'RECONCILING', 'FAILED'
  )),
  transaction_hash TEXT,
  provider_request_id TEXT,
  sender_nonce TEXT,
  last_reconciled_at TIMESTAMPTZ,
  failure_class TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS executions_permit_nonce_uq
  ON executions (permit_id, permit_nonce);
