# Security

Blocks & Pockets is a **Mezo testnet prototype**. It is not audited and holds no real funds. Do not put real funds in it.

## Reporting a problem

Open an issue on https://github.com/Jaydearcadian/blocks-and-pockets/issues, or message the repo owner on GitHub (@Jaydearcadian). Because the project is testnet-only, public reports are fine. If you find something that would matter on mainnet, say so in the title and keep exploit detail for a direct message.

## What to read

- [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md): roles, what each limit stops, what is not covered, and a table that ties each of the 30 custom errors to its tests and its live refusals.
- [`logs/live-run/transactions.md`](logs/live-run/transactions.md): the 113 transactions of the 15 Nov live run. `python3 scripts/live_run_check.py` re-checks them read-only (15 of 15).

## Handling keys

- No private keys, keystores, passwords or tokens are in this repo. Wallet files live outside it.
- The dashboard never asks for a key. It signs through the connected wallet, after a review step that names the sender, the vault and the action.
- The local test wallet (`scripts/local-wallet/`) holds no key either. It only exists when the page and the RPC are both on loopback, and it refuses message-signing methods.
- The deploy script for the hosted site refuses a dirty tree, `app/.env*` files and `VITE_*` variables, so a local setting cannot be baked into the public build.

## Known limits

See "Limits and what is not built" in the README and "Not covered" in the threat model. In short: no liquidation handling, no audit, no multisig or timelock on the owner, and the wallet actions were tested with a test wallet, not with MetaMask or another consumer wallet.
