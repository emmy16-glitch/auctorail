#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://devnode.telegraphprotocol.com"

echo "[1/3] Checking Telegraph node..."
curl -fsS "$BASE_URL/status" | jq .

echo
echo "[2/3] Downloading live miner registry..."
curl -fsS "$BASE_URL/api/miners" > data/miners.json

echo
echo "[3/3] Downloading live intent registry..."
curl -fsS "$BASE_URL/engine/v1/intents" > data/intents.json

echo
echo "Saved:"
echo "  data/miners.json"
echo "  data/intents.json"

echo
echo "=== ProofGate candidate miner coverage ==="

for INTENT in \
  FRAUD_DETECTION \
  ONCHAIN_TX_LOOKUP \
  WALLET_BALANCE_CHECK \
  URL_SCAN \
  SSL_VERIFICATION \
  CVE_LOOKUP
do
  COUNT=$(jq --arg intent "$INTENT" \
    '[.[] |
      select(
        .activation_status == "active"
        and ((.supported_intents // []) | index($intent))
      )
    ] | length' data/miners.json)

  echo "$INTENT: $COUNT active miner(s)"
done
