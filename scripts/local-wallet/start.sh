#!/usr/bin/env bash
# Starts a local anvil fork of Mezo testnet for trying the dashboard's wallet actions without a real wallet.
# Nothing is sent to the public network: every transaction lands on the fork and disappears when it stops.
# anvil impersonates the owner and operator addresses, so no key or password is involved.
#
# Usage:  scripts/local-wallet/start.sh        (runs anvil in the foreground on 127.0.0.1:8545)
# Then, in app/:
#   VITE_RPC_URL=http://127.0.0.1:8545 \
#   VITE_TEST_WALLET_ACCOUNTS=0xA445987238E1E2C56739C68743a150CdAcF60db7,0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E \
#   npm run dev
# Open the dashboard, press "Connect wallet" and choose "Local test wallet".
# Add VITE_TEST_WALLET_WRONG_CHAIN=1 to start the test wallet on Ethereum, which exercises the switch-network step.
set -euo pipefail

dir="$(cd "$(dirname "$0")" && pwd)"
port="${PORT:-8545}"
rpc="http://127.0.0.1:${port}"
oracle=0x7b7c000000000000000000000000000000000015

tmp="$(mktemp -d)"
trap 'kill "${anvil_pid:-}" 2>/dev/null || true; rm -rf "$tmp"' EXIT

# shanghai: the public node cannot supply the blob gas fields that newer forks need.
anvil --fork-url https://rpc.test.mezo.org --chain-id 31611 --hardfork shanghai \
  --auto-impersonate --host 127.0.0.1 --port "$port" >"$tmp/anvil.log" 2>&1 &
anvil_pid=$!

for _ in $(seq 1 60); do
  cast chain-id --rpc-url "$rpc" >/dev/null 2>&1 && break
  sleep 1
done

forge build --root "$dir" --contracts "$dir" --out "$tmp/out" --cache-path "$tmp/cache" --use 0.8.24 >/dev/null
code="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['deployedBytecode']['object'])" "$tmp/out/MockOracle.sol/MockOracle.json")"
cast rpc anvil_setCode "$oracle" "$code" --rpc-url "$rpc" >/dev/null

echo "Fork ready at ${rpc} (chain 31611). Stop with Ctrl-C."
wait "$anvil_pid"
