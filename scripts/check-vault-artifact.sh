#!/usr/bin/env bash
# Fails when app/src/vaultArtifact.json no longer matches the compiled contract.
# After a change to src/MoneyblocksVault.sol, run `forge build` and `python3 scripts/export-vault-artifact.py`.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
forge build >/dev/null 2>&1
python3 - <<'PY'
import json, subprocess, sys
want_creation = subprocess.run(["forge", "inspect", "src/MoneyblocksVault.sol:MoneyblocksVault", "bytecode"], capture_output=True, text=True, check=True).stdout.strip()
want_runtime = subprocess.run(["forge", "inspect", "src/MoneyblocksVault.sol:MoneyblocksVault", "deployedBytecode"], capture_output=True, text=True, check=True).stdout.strip()
have = json.load(open("app/src/vaultArtifact.json"))
if have["bytecode"] != want_creation or have["runtime"] != want_runtime:
    sys.exit("MISMATCH: run python3 scripts/export-vault-artifact.py")
print("vaultArtifact.json matches the compiled contract")
PY
