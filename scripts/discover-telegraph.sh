#!/usr/bin/env bash
set -euo pipefail

BASE_URL="https://devnode.telegraphprotocol.com"

mkdir -p data

echo "[1/6] Checking Telegraph node..."
curl -fsS "$BASE_URL/status" | jq .

echo
echo "[2/6] Downloading on-chain/live miner registry metadata..."
curl -fsS "$BASE_URL/api/miners" > data/miners-registry.json

echo
echo "[3/6] Downloading dispatcher-loaded integration catalog..."
curl -fsS "$BASE_URL/miner-dispatcher/integrations" > data/integrations.json

echo
echo "[4/6] Merging registry rank/activity with authoritative dispatcher endpoints..."
jq -n \
  --slurpfile registry data/miners-registry.json \
  --slurpfile integrations data/integrations.json '
  ($registry[0] // []) as $registryRows |
  ($integrations[0] // []) as $loadedRows |
  [
    $registryRows[] as $miner |
    (
      $loadedRows
      | map(
          select(
            ((.id | tostring) == ($miner.id | tostring))
            or (.slug == $miner.slug)
          )
        )
      | first
    ) as $loaded |
    if $loaded == null then
      $miner + {
        dispatcher_loaded: false,
        dispatcher_source: "miner-dispatcher/integrations",
        endpoints: []
      }
    else
      $miner + {
        dispatcher_loaded: true,
        dispatcher_source: "miner-dispatcher/integrations",
        endpoints: (
          ($loaded.endpoints // [])
          | sort_by([
              (.path // ""),
              (
                if ((.method // "") | ascii_upcase) == "POST" then 0
                elif ((.method // "") | ascii_upcase) == "GET" then 1
                else 2
                end
              )
            ])
        ),
        input_schema: ($loaded.input_schema // $miner.input_schema),
        output_schema: ($loaded.output_schema // $miner.output_schema),
        signal_mapping: (
          $loaded.signal_mapping
          // $loaded.semantics.signal_mapping
          // $miner.signal_mapping
        ),
        supported_intents: (
          $loaded.semantics.supported_intents
          // $loaded.supported_intents
          // $miner.supported_intents
          // []
        )
      }
    end
  ]
' > data/miners.json.tmp
mv data/miners.json.tmp data/miners.json

echo
echo "[5/6] Downloading live intent registry..."
curl -fsS "$BASE_URL/engine/v1/intents" > data/intents.json

echo
echo "[6/6] Downloading dispatcher health snapshot (read-only)..."
if curl -fsS "$BASE_URL/api/subnets/health" > data/subnet-health.json.tmp; then
  mv data/subnet-health.json.tmp data/subnet-health.json
  HEALTH_STATUS="saved"
else
  rm -f data/subnet-health.json.tmp
  HEALTH_STATUS="unavailable (continuing without health snapshot)"
fi

echo
echo "Saved:"
echo "  data/miners-registry.json       (rank/activity metadata)"
echo "  data/integrations.json          (dispatcher-loaded endpoint source of truth)"
echo "  data/miners.json                (merged Auctorail registry)"
echo "  data/intents.json"
echo "  data/subnet-health.json         ($HEALTH_STATUS)"

echo
echo "=== Auctorail candidate miner coverage ==="

for INTENT in \
  FRAUD_DETECTION \
  ONCHAIN_TX_LOOKUP \
  WALLET_BALANCE_CHECK \
  URL_SCAN \
  SSL_VERIFICATION \
  CVE_LOOKUP
do
  ACTIVE=$(jq --arg intent "$INTENT" \
    '[.[] |
      select(
        .activation_status == "active"
        and ((.supported_intents // []) | index($intent))
      )
    ] | length' data/miners.json)

  LOADED=$(jq --arg intent "$INTENT" \
    '[.[] |
      select(
        .activation_status == "active"
        and .dispatcher_loaded == true
        and ((.supported_intents // []) | index($intent))
      )
    ] | length' data/miners.json)

  echo "$INTENT: $ACTIVE active registry miner(s); $LOADED dispatcher-loaded"
done

echo
echo "Direct corroboration endpoints now come only from the live dispatcher integration catalog."
echo "Duplicate semantic routes are ordered body-first (POST before GET) so direct Engine forwarding cannot accidentally choose a query-only variant when a JSON-body variant is declared."
