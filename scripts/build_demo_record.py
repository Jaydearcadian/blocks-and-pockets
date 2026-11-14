#!/usr/bin/env python3
"""Builds app/src/demo-record.json from the testnet demo logs.

The record lists every transaction the demo sent to the rerun vault, in order:
- setup (phase 1 log, one run),
- interest, repay, close, and sweep (phase 2 log, last run only; the first run stopped on a reverted repay),
- mandate revocation (revocation log, one run).

Each row is either executed (receipt status 1) or refused (receipt status 0). The dashboard reads every
receipt from the chain and decodes every refusal, so this file is a pointer list, not a claim.
Checkpoints are block numbers the dashboard can read the vault at, to replay the demo.

Run from the repo root: python3 scripts/build_demo_record.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGS = ROOT / "logs"
OUT = ROOT / "app" / "src" / "demo-record.json"

VAULT = "0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641"
CHAIN_ID = 31611
DEPLOY = {
    "tx": "0x60a99274dcda1fb00860f7c00ca3372f59b38382cea66978580b5a9b62a0ac22",
    "block": 16777200,  # from the deploy receipt (status 1)
}

ROW = re.compile(
    r"^\[(?P<label>.+?)\] (?P<kind>OK|REVERTED as expected|REFUSED on chain as expected) "
    r"tx=(?P<tx>0x[0-9a-fA-F]{64}) block=(?P<block>\d+)"
)

PHASES = [
    {"id": "setup", "title": "Setup and guardrails"},
    {"id": "settle", "title": "Interest, repay, close, sweep"},
    {"id": "revoke", "title": "Mandate revocation"},
]

# Checkpoint label -> row label whose block the dashboard reads the vault at.
CHECKPOINTS = [
    ("setup", "Setup", "fund overhead with 0.5 MUSD"),
    ("repaid", "Repaid", "block 1 repays 10 MUSD"),
    ("closed", "Trove closed", "close the group Trove"),
    ("swept", "Swept", "sweep tracked MUSD to the owner"),
    ("revoked", "Revoked", "owner revokes block 3 mandate"),
]


def rows_from(path: Path, marker: str, phase: str):
    lines = path.read_text().splitlines()
    starts = [i for i, ln in enumerate(lines) if ln.startswith(marker)]
    if not starts:
        sys.exit(f"marker not found in {path.name}: {marker!r}")
    rows = []
    for ln in lines[starts[-1]:]:
        m = ROW.match(ln)
        if not m:
            continue
        rows.append(
            {
                "phase": phase,
                "label": m["label"],
                "result": "executed" if m["kind"] == "OK" else "refused",
                "tx": m["tx"],
                "block": int(m["block"]),
            }
        )
    return rows


def main():
    rows = []
    rows += rows_from(LOGS / "wave2-rerun-phase1.log", "== phase 1 start", "setup")
    rows += rows_from(LOGS / "wave2-rerun-phase2.log", "== phase 2 run start", "settle")
    rows += rows_from(LOGS / "wave2-revocation.log", "== revocation run start", "revoke")

    seen = set()
    for r in rows:
        if r["tx"] in seen:
            sys.exit(f"duplicate tx in record: {r['tx']}")
        seen.add(r["tx"])

    checkpoints = []
    for cid, label, row_label in CHECKPOINTS:
        matches = [r for r in rows if r["label"] == row_label]
        if len(matches) != 1:
            sys.exit(f"checkpoint {cid}: expected one row labelled {row_label!r}, found {len(matches)}")
        checkpoints.append({"id": cid, "label": label, "block": matches[0]["block"]})

    record = {
        "chainId": CHAIN_ID,
        "vault": VAULT,
        "deploy": DEPLOY,
        "sources": [
            "logs/wave2-rerun-phase1.log",
            "logs/wave2-rerun-phase2.log (last run)",
            "logs/wave2-revocation.log",
        ],
        "phases": PHASES,
        "rows": rows,
        "checkpoints": checkpoints,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(record, indent=2) + "\n")

    refused = sum(1 for r in rows if r["result"] == "refused")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} rows ({refused} refused), {len(checkpoints)} checkpoints")


if __name__ == "__main__":
    main()
