# AGENTS.md

Instructions for AI coding agents working in this repo. Read `README.md` first for what the project is and what it does not claim.

## Toolchain

- Node 26 with npm (the dashboard in `app/`).
- Foundry 1.9 or newer (`forge`, `cast`). `forge` downloads solc 0.8.24 itself (`foundry.toml`, `via_ir = true`).
- Python 3 (standard library only) for `scripts/live_run_check.py`.

## Commands

From the repo root:

```sh
forge build
forge test                      # 48 tests, about 45 s. The fork tests read https://rpc.test.mezo.org.
scripts/check-vault-artifact.sh      # run after any contract change; fails if app/src/vaultArtifact.json is stale
python3 scripts/live_run_check.py   # read-only, expects "15 of 15" PASS; rewrites logs/live-run/transactions.md
```

From `app/`:

```sh
npm ci
npm run typecheck
npm test                        # vitest, node environment, logic tests only (145)
npm run build                   # typecheck, then vite build
npm run dev                     # http://127.0.0.1:5173
```

All of these must exit 0 before you commit.

## Layout

- `src/MoneyblocksVault.sol`: the vault. `src/TroveVaultSpike.sol`: the earlier spike.
- `test/`: Foundry tests (`MoneyblocksSlice.t.sol`, `MoneyblocksGroupFork.t.sol`, `TroveVaultFork.t.sol`).
- `app/src/`: React, TypeScript, viem, wagmi and RainbowKit (`wagmiConfig.ts`, `useWallet.ts`, `testWallet.ts`). `config.ts` holds chain and contract addresses. `chain.ts` and `model.ts` read and derive state. `txflow.ts` and `actions.ts` build wallet transactions behind a review step.
- `logs/live-run/`: evidence from the 15 Nov live run. Treat as a record. Regenerate only with the checker.
- `scripts/`: demo and live-run tooling. `live_run.py` sends transactions.

## Rules

- **Mezo testnet only** (chain 31611). Never add mainnet addresses or configuration.
- **Do not send transactions** and do not run `scripts/live_run.py run`, `cast send`, or `forge create --broadcast` unless the owner asks for it in this session. The checker and the tests send nothing.
- **Never print, log or commit keys, keystores, passwords or tokens.** Wallet files live outside the repo. `app/.env.local` is ignored.
- Do not change the deployed addresses in `app/src/config.ts` or edit the Solidity contract unless the task is a contract change. A contract change needs new tests and a new deployment.
- Do not claim more than the evidence shows. No "audited", "mainnet", "live users" or "agent product". Say "operator key". Foundry and dashboard tests are simulations, not live evidence.
- The name "Blocks & Pockets" is a working name.
- Keep dependencies unchanged unless asked. Match existing code style. Add a test with every behaviour change.

## Known caveats

See "Limits and what is not built" in `README.md`. In short: no liquidation modelling, not audited, wallet actions tested only with a test wallet, actions are role-gated to a vault's owner and operator.
