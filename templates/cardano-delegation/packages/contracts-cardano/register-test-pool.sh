#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POOL_DIR="$SCRIPT_DIR/test-pool-2"
CARDANO_CLI="$HOME/.yaci-cli/cardano-node/bin/cardano-cli"
export CARDANO_NODE_SOCKET_PATH="$HOME/.yaci-cli/local-clusters/default/node/node.sock"

POOL_ADDR=$(cat "$POOL_DIR/payment.addr")
YACI_API="http://localhost:10000/local-cluster/api"

echo "[register-test-pool] Funding pool operator address..."
curl -s "$YACI_API/addresses/topup" \
  -X POST -H "Content-Type: application/json" \
  -d "{\"address\":\"$POOL_ADDR\",\"adaAmount\":10000}" > /dev/null

echo "[register-test-pool] Waiting for UTxOs..."
for i in $(seq 1 15); do
  UTXO_LINE=$("$CARDANO_CLI" conway query utxo --address "$POOL_ADDR" --testnet-magic 42 2>/dev/null | tail -1)
  if echo "$UTXO_LINE" | grep -q lovelace; then
    break
  fi
  sleep 2
done

UTXO_IN=$(echo "$UTXO_LINE" | awk '{print $1 "#" $2}')
if [ -z "$UTXO_IN" ] || [ "$UTXO_IN" = "#" ]; then
  echo "[register-test-pool] ERROR: No UTxOs found after funding"
  exit 1
fi

TMPDIR=$(mktemp -d)

"$CARDANO_CLI" conway stake-address registration-certificate \
  --stake-verification-key-file "$POOL_DIR/stake.vkey" \
  --key-reg-deposit-amt 2000000 \
  --out-file "$TMPDIR/stake-reg.cert"

"$CARDANO_CLI" conway stake-pool registration-certificate \
  --cold-verification-key-file "$POOL_DIR/cold.vkey" \
  --vrf-verification-key-file "$POOL_DIR/vrf.vkey" \
  --pool-pledge 500000000 \
  --pool-cost 340000000 \
  --pool-margin 0.05 \
  --pool-reward-account-verification-key-file "$POOL_DIR/stake.vkey" \
  --pool-owner-stake-verification-key-file "$POOL_DIR/stake.vkey" \
  --testnet-magic 42 \
  --out-file "$TMPDIR/pool-reg.cert"

"$CARDANO_CLI" conway transaction build \
  --testnet-magic 42 \
  --tx-in "$UTXO_IN" \
  --tx-out "$POOL_ADDR+5000000000" \
  --certificate-file "$TMPDIR/stake-reg.cert" \
  --certificate-file "$TMPDIR/pool-reg.cert" \
  --change-address "$POOL_ADDR" \
  --out-file "$TMPDIR/tx.raw" \
  --witness-override 3

"$CARDANO_CLI" conway transaction sign \
  --tx-body-file "$TMPDIR/tx.raw" \
  --signing-key-file "$POOL_DIR/payment.skey" \
  --signing-key-file "$POOL_DIR/cold.skey" \
  --signing-key-file "$POOL_DIR/stake.skey" \
  --testnet-magic 42 \
  --out-file "$TMPDIR/tx.signed"

"$CARDANO_CLI" conway transaction submit \
  --testnet-magic 42 \
  --tx-file "$TMPDIR/tx.signed"

POOL_ID=$("$CARDANO_CLI" conway stake-pool id --cold-verification-key-file "$POOL_DIR/cold.vkey" --output-format bech32)
echo "[register-test-pool] Pool registered: $POOL_ID"

rm -rf "$TMPDIR"
