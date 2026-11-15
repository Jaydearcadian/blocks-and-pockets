#!/usr/bin/env python3
"""Writes app/src/vaultArtifact.json from the compiled vault: creation bytecode, runtime bytecode, and the byte
ranges where the compiler inlines immutable values. Run `forge build` first. The dashboard uses it to deploy a
vault and to recognise a vault's code. scripts/check-vault-artifact.sh checks that the file is current."""
import json
import os
import subprocess

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
target = "src/MoneyblocksVault.sol:MoneyblocksVault"
inspect = lambda kind: subprocess.run(["forge", "inspect", target, kind], capture_output=True, text=True, check=True).stdout.strip()
built = json.load(open("out/MoneyblocksVault.sol/MoneyblocksVault.json"))["deployedBytecode"]
ranges = sorted({(r["start"], r["length"]) for refs in built["immutableReferences"].values() for r in refs})
out = {
    "contract": target,
    "solc": "0.8.24",
    "bytecode": inspect("bytecode"),
    "runtime": inspect("deployedBytecode"),
    "immutableRanges": [list(r) for r in ranges],
}
assert out["runtime"] == built["object"] or out["runtime"] == "0x" + built["object"].removeprefix("0x")
with open("app/src/vaultArtifact.json", "w") as f:
    json.dump(out, f, indent=1)
    f.write("\n")
print("wrote app/src/vaultArtifact.json", len(out["bytecode"]), len(out["runtime"]), len(ranges), "ranges")
