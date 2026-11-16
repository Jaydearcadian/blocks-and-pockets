# Blocks & Pockets

One Bitcoin-backed loan, split into blocks of spending money. An operator key spends from its block only inside the owner's limits, and the owner can revoke that key at any time.

**Live dashboard (Mezo testnet):** https://jaydearcadian.github.io/blocks-and-pockets/  
The site opens on a landing page. The dashboard is at `#/app`, and any `?vault=` link opens it directly.  
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

The contract is `src/MoneyblocksVault.sol` (669 lines, Solidity 0.8.24, 30 custom errors, 19 write functions).

| Vault | Address | Role |
|---|---|---|
| Live-run vault | [`0x4c716Be7F97EaC8B3dc1c5593649a387751C9835`](https://explorer.test.mezo.org/address/0x4c716Be7F97EaC8B3dc1c5593649a387751C9835) ([open in the dashboard](https://jaydearcadian.github.io/blocks-and-pockets/?vault=0x4c716Be7F97EaC8B3dc1c5593649a387751C9835&from=16794952)) | The 15 Nov live run. Closed at the end, balances swept to zero. |
| Fresh vault | [`0x26c046472294Cf3F147e82E36217dE68609bc08B`](https://explorer.test.mezo.org/address/0x26c046472294Cf3F147e82E36217dE68609bc08B) | Wallet-bridge check on 14 Nov. Closed. |
| Demo vault | [`0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641`](https://explorer.test.mezo.org/address/0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641) | The dashboard's default vault (37 recorded rows, 7 refused). Empty. |

**Live run, 15 Nov 2026:** 113 owner and operator transactions, **58 succeeded and 55 were refused on purpose** (each refusal tests a guard). All 19 write functions succeeded at least once. 26 of the 30 custom errors were reached on chain. Not reached: `LedgerDirty`, `LedgerMismatch`, `PendingRewards`, `TransferFailed`. Liquidation was not exercised. Every transaction, with its decoded call, result and explorer link, is in [`logs/live-run/transactions.md`](logs/live-run/transactions.md).

The live-run vault's source is verified on the Mezo testnet explorer (Blockscout, solc 0.8.24, `via_ir`, 200 optimizer runs): open its [Contract tab](https://explorer.test.mezo.org/address/0x4c716Be7F97EaC8B3dc1c5593649a387751C9835?tab=contract). The explorer lists the other two vaults as the same contract by matching bytecode, not as separately verified.

### Check it yourself (read-only)

```sh
python3 scripts/live_run_check.py
```

This reads the public testnet RPC, decodes the chain and compares it with the run ledger in `logs/live-run/`. It sends nothing and needs no keys. It expects **15 of 15 checks to pass**. It uses only the Python standard library plus `cast` and `forge` from Foundry.

## Try it yourself

Actions on a vault are limited to its owner and operator wallets, so a visitor cannot act on the demo vault. The dashboard's Actions section has a **Deploy my vault** card instead. Connect a Mezo testnet wallet, deploy a fresh copy of the contract (testnet gas only), open the link it gives you, and you are the owner. You can then create blocks, set payees, grant mandates (you can name your own address as the operator) and change the approval threshold. Moving MUSD needs MUSD in your wallet, and opening a Trove group needs about 0.048 BTC.

The wallet button (sidebar) uses [RainbowKit](https://rainbowkit.com) and [wagmi](https://wagmi.sh). The dialog lists browser wallets (MetaMask, Rabby, Coinbase Wallet, any injected wallet). Mobile wallets through WalletConnect are off until a `VITE_WALLETCONNECT_PROJECT_ID` is set, and the hosted build has none.

**Try the wallet actions without a real wallet.** `scripts/local-wallet/start.sh` starts a local fork of Mezo testnet where anvil signs for the owner and operator addresses, so no key is involved and nothing reaches the public network. Run the dashboard with `VITE_RPC_URL=http://127.0.0.1:8545` and `VITE_TEST_WALLET_ACCOUNTS=<owner>,<operator>` (see `app/.env.example`), then choose "Local test wallet" in the connect dialog. That option exists only when the page and the RPC are both on this machine.

How well this is tested: on a local fork of Mezo testnet, with the price feed mocked (its oracle does not run on a fork) and an injected test wallet, I deployed a vault from the dashboard, opened it by link, was recognised as its owner, and created a block through the review step. A fork cannot run repay or close, so those owner actions were not tried this way. The same connect, review and sign path was run again after the move to RainbowKit and wagmi, with the local test wallet on a fork (a block was created). It has **not** been run with a consumer wallet such as MetaMask or as a live testnet deployment from the hosted page. Before any non-demo vault is opened, the page compares its on-chain code with the compiled contract and refuses look-alikes; unit tests cover that check, the link parsing and the deploy request.

## Build and test

Needs Node 26 with npm, and [Foundry](https://getfoundry.sh) 1.9 or newer (forge downloads solc 0.8.24).

```sh
forge build
forge test          # 48 tests, about 45 s; the fork tests read the public Mezo testnet RPC
cd app
npm ci
npm run typecheck
npm test            # 146 tests
npm run build
npm run dev         # http://127.0.0.1:5173
```

To open another testnet vault, add `?vault=0x…&from=<deploy block>` to the page URL, or copy `app/.env.example` to `app/.env.local` and set `VITE_VAULT_ADDRESS` and `VITE_DEPLOY_BLOCK`. After a change to `src/MoneyblocksVault.sol`, run `scripts/check-vault-artifact.sh` (it checks that `app/src/vaultArtifact.json` still matches the compiled contract).

## Repo map

| Path | What |
|---|---|
| `src/MoneyblocksVault.sol` | The vault contract. |
| `src/TroveVaultSpike.sol` | The earlier one-Trove spike. |
| `test/` | Foundry tests: 19 slice, 25 group fork (oracle mocked), 4 earlier spike fork. |
| `app/` | React + TypeScript + viem dashboard. Reads the chain directly. |
| `scripts/live_run.py` | The runner that produced the live run. It sends testnet transactions. Do not run `run` without the owner's wallets. |
| `scripts/live_run_check.py` | The read-only checker. |
| `scripts/local-wallet/` | Starts a local fork of Mezo testnet for trying wallet actions with no real wallet. |
| `logs/live-run/` | Live-run record: report, JSON, ledger, run log, dashboard capture. `logs/README.md` says which other logs are evidence and which are old working output. |
| `docs/THREAT-MODEL.md` | Roles, defences, what is not covered, and each custom error mapped to its tests and live refusals. |
| `SECURITY.md` | How to report a problem, key handling, known limits. |
| `feedback.md` | Notes for Mezo from this build. |
| `docs/superpowers/` | Design and plan for the judge-ready push. |

## Limits and what is not built

- Liquidation and redistribution are not modelled. If Mezo reports pending rewards, or its totals stop matching the vault ledger, ledger actions revert.
- Not audited. Policy choices such as the shortfall policy, overhead costs and borrow fees are open.
- The dashboard's wallet actions were tested through a test-wallet bridge (live testnet) and an injected test wallet (local fork), not a consumer wallet such as MetaMask.
- Actions are role-gated to a vault's owner and operator wallets. A visitor can read and verify the demo vault but cannot act on it.
- Opening a Trove group needs about 0.048 BTC of testnet collateral and at least 1,800 MUSD of debt.
- An older testnet spike vault (`0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf`) still holds 0.819767 MUSD and has no recovery path.
- Known unexplained revert: the demo vault's first `repay` reverted once (block 16777299) and succeeded on retry.

## License

GPL-3.0, matching the SPDX headers in the Solidity files. See `LICENSE`.
