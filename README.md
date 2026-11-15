# Blocks & Pockets

One Bitcoin-backed loan, split into blocks of spending money. An operator key spends from its block only inside the owner's limits, and the owner can revoke that key at any time.

**Live dashboard (Mezo testnet):** https://jaydearcadian.github.io/blocks-and-pockets/  
**Repo:** https://github.com/Jaydearcadian/blocks-and-pockets

Built on [Mezo](https://mezo.org) for the AKINDO Mezo Builders Wave 2 (Track 1, DeFi). The vault holds one Mezo Trove (BTC collateral, MUSD debt) and splits the borrowed MUSD into "blocks". Each block has its own cash, its own recipients and its own spending limits.

> **Read this first**
> - Mezo **testnet only** (chain 31611). No mainnet deployment, no real funds.
> - **Not audited.** Do not put user funds in it.
> - "Blocks & Pockets" is a **working name** and has not been cleared as a trademark.
> - The "agent" in the pitch is an **operator key** (a normal wallet the owner authorises). No AI-agent product is built.
> - Foundry tests and the dashboard tests are simulations. The live evidence is the chain record linked below.

## How it works

| Term | Meaning |
|---|---|
| Trove | A Mezo position: BTC collateral locked, MUSD borrowed against it. |
| Block | A named bucket of spending money inside the vault. |
| Prefunded block (isolated) | Funded with MUSD the owner already holds. Never touches the Trove. |
| Shared block (cross) | Borrows from the one shared Trove. The vault tracks each block's own debt. |
| Mandate | The owner lets the operator key pay a block's allowed recipients, up to a limit. |
| Approval threshold | Payments above this amount wait until the owner approves them. |

The owner can revoke a mandate at any time, and every payment that breaks a limit is refused on chain.

## What is live

The contract is `src/MoneyblocksVault.sol` (670 lines, Solidity 0.8.24, 30 custom errors, 19 write functions).

| Vault | Address | Role |
|---|---|---|
| Live-run vault | [`0x4c716Be7F97EaC8B3dc1c5593649a387751C9835`](https://explorer.test.mezo.org/address/0x4c716Be7F97EaC8B3dc1c5593649a387751C9835) | The 15 Nov live run. Closed at the end, balances swept to zero. |
| Fresh vault | [`0x26c046472294Cf3F147e82E36217dE68609bc08B`](https://explorer.test.mezo.org/address/0x26c046472294Cf3F147e82E36217dE68609bc08B) | Wallet-bridge check on 14 Nov. Closed. |
| Demo vault | [`0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641`](https://explorer.test.mezo.org/address/0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641) | The dashboard's default vault (37 recorded rows, 7 refused). Empty. |

**Live run, 15 Nov 2026:** 113 owner and operator transactions, **58 succeeded and 55 were refused on purpose** (each refusal tests a guard). All 19 write functions succeeded at least once. 26 of the 30 custom errors were reached on chain. Not reached: `LedgerDirty`, `LedgerMismatch`, `PendingRewards`, `TransferFailed`. Liquidation was not exercised. Every transaction, with its decoded call, result and explorer link, is in [`logs/live-run/transactions.md`](logs/live-run/transactions.md).

### Check it yourself (read-only)

```sh
python3 scripts/live_run_check.py
```

This reads the public testnet RPC, decodes the chain and compares it with the run ledger in `logs/live-run/`. It sends nothing and needs no keys. It expects **15 of 15 checks to pass**. It uses only the Python standard library plus `cast` and `forge` from Foundry.

## Build and test

Needs Node 26 with npm, and [Foundry](https://getfoundry.sh) 1.9 or newer (forge downloads solc 0.8.24).

```sh
forge build
forge test          # 40 tests, about 45 s; the fork tests read the public Mezo testnet RPC
cd app
npm ci
npm run typecheck
npm test            # 100 tests
npm run build
npm run dev         # http://127.0.0.1:5173
```

To point the dashboard at another testnet vault, copy `app/.env.example` to `app/.env.local` and set `VITE_VAULT_ADDRESS` and `VITE_DEPLOY_BLOCK`.

## Repo map

| Path | What |
|---|---|
| `src/MoneyblocksVault.sol` | The vault contract. |
| `src/TroveVaultSpike.sol` | The earlier one-Trove spike. |
| `test/` | Foundry tests: 14 slice, 22 group fork (oracle mocked), 4 earlier spike fork. |
| `app/` | React + TypeScript + viem dashboard. Reads the chain directly. |
| `scripts/live_run.py` | The runner that produced the live run. It sends testnet transactions. Do not run `run` without the owner's wallets. |
| `scripts/live_run_check.py` | The read-only checker. |
| `logs/live-run/` | Live-run record: report, JSON, ledger, run log, dashboard capture. |
| `docs/superpowers/` | Design and plan for the judge-ready push. |

## Limits and what is not built

- Liquidation and redistribution are not modelled. If Mezo reports pending rewards, or its totals stop matching the vault ledger, ledger actions revert.
- Not audited. Policy choices such as the shortfall policy, overhead costs and borrow fees are open.
- The dashboard's wallet actions were tested through a test-wallet bridge, not a consumer wallet such as MetaMask.
- Actions are role-gated to a vault's owner and operator wallets. A visitor can read and verify the demo vault but cannot act on it.
- Opening a Trove group needs about 0.048 BTC of testnet collateral and at least 1,800 MUSD of debt.
- An older testnet spike vault (`0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf`) still holds 0.819767 MUSD and has no recovery path.
- Known unexplained revert: the demo vault's first `repay` reverted once (block 16777299) and succeeded on retry.

## License

GPL-3.0, matching the SPDX headers in the Solidity files. See `LICENSE`.
