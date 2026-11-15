# Wallet actions: live run on a fresh testnet vault

Written 14 Nov 2026, about 17:20 UTC. Updated 15 Nov 2026 (checks at 06:30 UTC) after a follow-up check (see "Open after the run") and a browser check of the review step (see "Review step check"). The bridge log, deploy file, and fork traces cited here are local files and are not in the commit. The earlier demo record (`app/src/demo-record.json`, `logs/dashboard-chain-check.txt`) covers the rerun vault and is not affected by this run.

> Later state: after this check the vault below was closed. The 15 Nov live run (`logs/live-run/`) used a different, newer vault. Balances described below were true at the time of the check, not now.

## Setup

- Vault: `0x26c046472294Cf3F147e82E36217dE68609bc08B` on Mezo testnet (chain 31611). Deployed at block 16779032 (tx `0xe507c962ba72aa0d2fc974d68950a0d0093f88b721fbf9825ddc7a2832d6382c`, see `logs/wallet-e2e-deploy.json`). Approval threshold 1 MUSD. Target ratio 150%.
- Owner (test wallet): `0xA445987238E1E2C56739C68743a150CdAcF60db7`. Operator (test key): `0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E`. Test payee: `0x000000000000000000000000000000000000bEEF`.
- Dashboard: `app/` in this repo, dev server on 127.0.0.1:5174, with `VITE_VAULT_ADDRESS` set to the vault.
- Wallet: a test wallet injected through EIP-6963 (`scripts/wallet-e2e/inject-wallet.js`). Signing: a local bridge (`scripts/wallet-e2e/bridge.mjs`, 127.0.0.1:8787) runs `cast send --async` with the test keystores. The bridge does not read or print keys or passwords.
- Not covered: a consumer wallet, mainnet, or a hosted build.

## Transactions

All 20 transactions were sent from the dashboard. All 20 were mined with status 1. Times are UTC from `logs/wallet-e2e-bridge.log`. Each call was decoded from the transaction input on chain.

| # | Time (UTC) | Sender | Block | Call | Result |
|---|---|---|---|---|---|
| 1 | 16:51:30 | owner | 16779109 | createMoneyblock "Procurement", cross, cap 2,500 MUSD | OK |
| 2 | 16:51:54 | owner | 16779114 | createMoneyblock "Operations", cross, cap 40 MUSD | OK |
| 3 | 16:52:25 | owner | 16779122 | createMoneyblock "Vendor pocket", isolated | OK |
| 4 | 16:52:53 | owner | 16779129 | setRecipient: payee allowed on block 3 | OK |
| 5 | 16:53:17 | owner | 16779134 | grantMandate on block 1: operator 0xDb41, 1.5 per payment, 5 total | Wrong block. Meant for block 3 |
| 6 | 16:53:39 | owner | 16779139 | MUSD approve 3 MUSD to the vault | OK |
| 7 | 16:53:44 | owner | 16779140 | fundPocket on block 1, 3 MUSD | Wrong block. Meant for block 3 |
| 8 | 16:54:12 | owner | 16779147 | openGroup: 0.048 BTC collateral, 1,800 MUSD drawn into block 1 | OK |
| 9 | 16:57:01 | owner | 16779188 | createMoneyblock "Vendor slice", isolated | Stray block 4, empty |
| 10 | 16:58:48 | owner | 16779214 | setRecipient: payee allowed on block 3 again | OK, duplicate |
| 11 | 16:59:34 | owner | 16779225 | grantMandate on block 1 again, same terms | Wrong block again |
| 12 | 17:01:37 | owner | 16779255 | grantMandate on block 3: 1.5 per payment, 5 total, expires 14 Dec 2026 16:56 UTC | OK |
| 13 | 17:01:53 | owner | 16779258 | MUSD approve 2.7 MUSD to the vault | OK |
| 14 | 17:01:57 | owner | 16779259 | fundPocket on block 3, 2.7 MUSD | OK |
| 15 | 17:03:22 | operator | 16779279 | requestTransfer: 0.5 MUSD to the payee from block 3, evidence INV-0001 | Executed (payment 1) |
| 16 | 17:03:37 | operator | 16779284 | requestTransfer: 1.2 MUSD from block 3, evidence INV-0002 | Waiting for owner (payment 2) |
| 17 | 17:04:29 | owner | 16779296 | cancelPayment 2 | Cancelled |
| 18 | 17:04:45 | owner | 16779300 | revokeMandate on block 1 | OK |
| 19 | 17:05:15 | operator | 16779307 | requestTransfer: 1.2 MUSD from block 3, evidence INV-0004 | Waiting for owner (payment 3) |
| 20 | 17:05:55 | owner | 16779317 | approvePayment 3 | Executed |

## Refused before sending

No transaction was sent for these. They are listed so the run is complete.

- The owner tried to fund 3 MUSD to block 3 while the wallet held 2.77 MUSD. The dashboard's shortfall check stopped it. Rows 13 and 14 are the 2.7 MUSD funding that followed.
- The operator tried to pay the owner's own address. That address is not on block 3's allowlist (`RecipientNotAllowed`).
- The operator tried to request a payment from block 1 after its revocation (`MandateRevoked(1)`).

## State after the run

Read from Mezo testnet with `cast call`, about 17:10 UTC.

| Item | Value |
|---|---|
| Trove | Open. Collateral 0.048 BTC. Principal 2,001.80 MUSD: 1,801.80 on blocks, plus the 200 MUSD gas deposit. Interest 0.00056 MUSD accrued on Mezo, not yet attributed to a block |
| Block 1 "Procurement" (cross) | Cash 1,803.00. Principal 1,801.80. Mandate revoked. The operator address is still recorded |
| Block 2 "Operations" (cross) | Empty. Cap 40 MUSD |
| Block 3 "Vendor pocket" (isolated) | Cash 1.00. Spent 1.70. Committed 1.70. Mandate active: 1.5 per payment, 5 total, expires 14 Dec 2026 16:56 UTC. Payee allowed |
| Block 4 "Vendor slice" (isolated) | Empty. Stray |
| Vault MUSD | 1,804.00, equal to the total of block cash |
| Payee MUSD | 5.36, including the 1.70 from this run |
| Owner MUSD and BTC | 0.0739 MUSD, 0.0013 BTC |
| Payments | 3. Payment 1 executed (0.5 MUSD), payment 2 cancelled (1.2 MUSD), payment 3 executed (1.2 MUSD) |
| Group | Open. Not closed. `groupsClosed` is 0 |

## Leftover state (not cleaned up)

1. Block 1 still holds the 3 MUSD from the wrong-block funding, and its 1,801.80 MUSD principal is open. Block 1 holds enough cash to cover its own debt (1,803 against 1,801.80), so the close does not need a repayment first. The group stays open for the reason in "Open after the run". The tracked leftover cash moves only after a close, through the owner-only sweep.
2. Block 3's mandate is still active until 14 Dec 2026, 16:56 UTC. The operator could still request up to 1.00 MUSD, the block's remaining cash.
3. Block 4 is empty and stays as is. The contract has no delete function.
4. The trove is open with 0.048 BTC of collateral.

## Open after the run

- **Simulation mismatch, not reproduced (15 Nov).** On 14 Nov, public RPC `eth_call` simulations of `closeGroup()` and `repay(1, 1)` appeared to revert with an overhead interest due of 7.49 MUSD. That figure came from an 8-byte value (`0x67ed76622cca0000`), which is not a complete ABI-encoded revert payload, so the earlier decode was probably wrong. I did not confirm the source. On 15 Nov at 06:30 UTC, `closeGroup()` reverts with `DebtNotCovered`: due 0.0031 MUSD, available 0, because overhead cash is 0. The due is 10% of the trove interest from `groupPosition()`, which read 0.0310 MUSD at that time. That interest matches about 1% a year on 2,001.80 MUSD since the 0.00056 MUSD reading at 17:10 UTC on 14 Nov. Nothing was sent based on either simulation, and the group stays open.
- **Local fork limit.** A local anvil fork cannot run `repay` or `closeGroup`. Each call recurses until the EVM reverts (`logs/fork-trace-repay.txt`, `logs/fork-trace-close.txt`). The spike's Foundry fork tests mock the oracle and cover repay, close, and sweep.
- **Repay revert on the rerun vault, unconfirmed.** The first repay attempt on the rerun vault reverted on chain at block 16777299. The retry succeeded at block 16777386. The cause is still not confirmed.
- **Fork log labels.** In `logs/fork-close-check.txt`, the lines for `accrue`, `approve`, `fundOverhead`, and `sweepBTC` say FAILED. Those transactions succeeded on the fork. The check missed the status line's format. The `closeGroup` and `sweepResidualMUSD` failures are real, because the group is open.

## Fix found after the run

The Mezo RPC rejects `eth_getLogs` ranges over 10,000 blocks. The dashboard read the vault's events in one range, so its live view failed once the vault was more than 10,000 blocks old. The fresh vault passed that point on 15 Nov. The read now uses 9,000-block windows (`logWindows` in `app/src/chain.ts`), with a test in `app/src/chain.test.ts`. The demo vault's live view had the same problem.

## What went wrong, and the lesson

- The three wrong-block transactions (rows 5, 7, and 11) came from the test automation choosing block 1 in a collapsed action card. The contract ran exactly what it was given.
- The action form picks the target block from a select inside a card. A confirmation that names the sender, the block, and the action before signing would catch this kind of error. Built after this run (see "Review step check").

## Review step check (15 Nov)

The review step was added after the run above. Every action now opens a review box before anything is signed. The box names the sending wallet, the block, and the action. Confirm sends, and Cancel discards. Both checks below used the fresh vault on the dashboard at 127.0.0.1:5174. Neither Confirm was clicked.

- Owner, create a block (vault-wide). The review named the owner wallet and said the action is vault-wide. Cancel showed "Create a block: review cancelled" and "Nothing was sent."
- Operator, request a payment from block 3. The review named the operator wallet for block 3 (`0xDb41…`), "Block 3 · Vendor pocket · prefunded", and the request: 0.1 MUSD to the test payee, labelled REVIEW-CHECK. Cancel showed "Request a payment: review cancelled" and "Nothing was sent."

Chain state was the same before and after the two cancels: owner nonce 90, operator nonce 14, blockCount 4, paymentCount 3, vault MUSD 1,804, owner MUSD 0.0739. Screenshots: `logs/dashboard-screenshots/confirm-review-owner.png` and `logs/dashboard-screenshots/confirm-review-operator.png`.

Not checked in the browser: the review for approving or cancelling a waiting payment. The fresh vault has no waiting payment, and making one would send a transaction. Unit tests cover that path in `app/src/actions.test.ts`.

## Verification

- Receipts: each of the 20 transactions was read back from Mezo with `cast receipt`, status 1.
- Calls: each row's function and arguments were decoded from `cast tx <hash> input` with `cast calldata-decode`.
- State: `blockCount`, `moneyblocks`, `payments`, `groupPosition`, `totalCash`, and MUSD `balanceOf` were read with `cast call`.
