#!/usr/bin/env bash
# Fails when app/src/vaultArtifact.json no longer matches the compiled contract.
# Run it after any change to src/MoneyblocksVault.sol, then refresh the JSON from `forge inspect`.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
want="$(forge inspect src/MoneyblocksVault.sol:MoneyblocksVault bytecode)"
have="$(python3 -c 'import json;print(json.load(open("app/src/vaultArtifact.json"))["bytecode"])')"
if [ "$want" = "$have" ]; then echo "vaultArtifact.json matches the compiled contract"; else echo "MISMATCH: refresh app/src/vaultArtifact.json" >&2; exit 1; fi
