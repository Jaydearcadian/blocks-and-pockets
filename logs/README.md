# Logs

What is evidence and what is working output.

| Path | What | Status |
|---|---|---|
| `live-run/` | The 15 Nov 2026 live run on Mezo testnet: transactions, run ledger, report, dashboard capture. `python3 scripts/live_run_check.py` re-checks it. | **Evidence.** Regenerate only with the checker. |
| `wave2-*.log`, `wave2-rerun-*` | Output of the Wave 2 demo scripts on the demo vault (`0xeb5f…1641`). | Record of that demo. |
| `dashboard-screenshots/`, `judge-review/` | Screenshots from earlier UI versions, before the light redesign. | **Historical.** They show the old dark dashboard. `judge-review/own-vault-deployed-fork.png` shows the demo setup checkpoint, not a deployed fork vault. |
| other `*.txt`, `*.log` | Build, test and fork-test output from development runs. | **Working output.** Counts and timings in them are from the day they ran, not current. |

Current test counts are in the README: 48 Foundry tests, 146 dashboard tests.
