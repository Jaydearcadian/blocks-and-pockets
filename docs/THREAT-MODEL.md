# Threat model

Scope: `src/MoneyblocksVault.sol` on Mezo testnet (chain 31611). Testnet only, not audited. This page lists what the contract is meant to stop, what stops it, and what is not covered. It is a working document written by the author, not an independent review.

## Roles and trust

| Who | Can do | Trusted to |
|---|---|---|
| Owner (the deploying wallet) | Everything the vault allows: create blocks, set payees, grant and revoke mandates, fund, borrow, repay, close, sweep | Act in its own interest. A compromised owner key loses the vault. |
| Operator (one address per block) | `requestTransfer` from its block, inside the mandate | Nothing. Every request is checked against the owner's limits. |
| Anyone | `accrue()` (moves no MUSD) and reads | Nothing. |
| Mezo contracts (BorrowerOperations, TroveManager, PriceFeed, MUSD) | Hold the Trove and the token | Assumed correct. The vault reads their totals and reverts if its own ledger stops matching. |

## Threats and defences

| Threat | Defence in the contract | Evidence |
|---|---|---|
| Operator pays an address the owner did not approve | Per-block recipient allowlist (`RecipientNotAllowed`) | Test and live refusal, see table below |
| Operator pays more than one payment is allowed | Per-transaction cap (`PerTransactionCapExceeded`) | Test and live |
| Operator drains a block over many payments | Lifetime cap counts executed plus pending payments (`MandateTotalCapExceeded`). A new grant does not reset it. | Tests, live #67 |
| Operator keeps spending after revocation or expiry | Mandate checked on request and again on approval (`MandateRevoked`, `MandateExpired`) | Tests, live |
| Operator spends from another block | A mandate belongs to one block. Only that block's operator passes `NotOperator`. | Test, live #56 |
| Owner key used by mistake to spend a pocket | The owner is not the operator, so it cannot call `requestTransfer` | `testOwnerCannotSpendPocketDirectly` |
| Large payment goes out without the owner seeing it | Amounts above the approval threshold wait in `Pending`. The amount is reserved so it cannot be double-spent. | Tests, live |
| One block borrows past its limit | Per-block debt cap (`BlockDebtCapExceeded`) | Test and live |
| Group borrows past safe collateral | Capacity check at the policy ratio (`GroupCapacityExceeded`). Mezo's own checks still apply. | Test, live #29 |
| Ledger drifts away from Mezo | Every ledger action ends with `_checkLedger` and `_checkCash`, which revert on any gap | Fork tie-out tests; the live run's checker compares the vault with Mezo |
| One block's interest is paid by another | Interest is split by principal. Each block pays its own interest from its own cash before a repay. A block that cannot pay blocks the repay (`InterestUnsettled`). | Test, live #44 |
| Close leaves debt behind | `closeGroup` needs every block to cover its debt (`DebtNotCovered`) | Test, live |
| MUSD sent straight to the vault breaks accounting | Sweep refuses until the stray amount is recovered (`CashMismatch`) | Test, live #108 |
| Funds swept while a payment is pending | `CashReserved` | Test, live #105 |

## Not covered

- **Liquidation and redistribution.** Not modelled and not exercised. If Mezo reports pending rewards, ledger actions revert (`PendingRewards`). A liquidated Trove leaves the vault in a state this code does not handle.
- **A compromised owner key.** The owner can change every limit. There is no timelock, multisig or guardian.
- **A compromised operator key.** The loss is bounded by that block's per-payment cap, lifetime cap, pocket cash and payee list, but it is real. The owner revokes with one transaction.
- **Payee compromise or wrong payee.** The vault pays whatever address the owner allowlisted.
- **Evidence field.** `evidence` is a `bytes32` the operator supplies. The contract stores it and does not check it.
- **Oracle risk.** Capacity uses Mezo's price feed. A wrong price changes the capacity check. Mezo's own collateral rules still apply.
- **Token behaviour.** `TransferFailed` fires only if MUSD returns `false` instead of reverting. It was never reached, and this build did not check how MUSD signals failure.
- **Upgradeability.** None. A bug means deploying a new vault. The dashboard checks a vault's code against the compiled contract before it opens a non-demo vault.
- **Reentrancy.** The vault has no reentrancy guard. It sends BTC only in `sweepBTC` (owner only, to an address the owner picks) and calls MUSD and Mezo contracts. No reentrancy test exists.
- **Audit.** None. The state-changing code paths were exercised by the tests and the live run listed here, nothing more.
- **Policy choices still open:** shortfall policy, overhead costs, borrow fees.

## Every custom error: where it is tested and where it fired

"Tests" are Foundry tests that assert the error by selector (the group tests run on a fork of Mezo testnet with the price oracle mocked). "Live" is the transaction number in [`logs/live-run/transactions.md`](../logs/live-run/transactions.md), where the vault refused the call on chain.

| Error | Foundry tests | Live refusals |
|---|---|---|
| `NotOwner` | `testResidualSweepAfterClose`, `testStrangerCannotChangeMandate` | #14, #16, #20, #23, #32, #35, #40, #42, #60, #65, #88 |
| `NotOperator` | `testOwnerCannotSpendPocketDirectly`, `testStrangerCannotRequestPayment` | #56 |
| `ZeroAmount` | `testSecondSweepHasNothingToMove`, `testZeroAmountRejects` | #22, #31, #34, #38, #45, #55, #113 |
| `InvalidMandate` | `testGrantMandateRejectsPastExpiryAndZeroOperator` | #19 |
| `BlockNotFound` | `testUnknownBlockRejects` | #17, #39 |
| `BlockNotCross` | `testIsolatedBlockCannotDraw` | #21, #30 |
| `MandateRevoked` | `testRevocationStopsPendingPaymentAtApproval`, `testRevokedMandateRejectsNewRequests` | #71, #73 |
| `MandateExpired` | `testExpiredMandateRejects`, `testPendingPaymentCannotBeApprovedAfterExpiry` | #85, #86 |
| `RecipientNotAllowed` | `testRecipientOutsideAllowlistRejects` | #54, #77 |
| `PerTransactionCapExceeded` | `testPerTransactionCapRejects` | #53 |
| `MandateTotalCapExceeded` | `testLifetimeCapRejects`, `testRegrantKeepsWhatWasAlreadyCommitted` | #67 |
| `PocketInsufficient` | `testPocketInsufficientRejects`, `testReservationReducesAvailableCash` | #62 |
| `BlockDebtCapExceeded` | `testBlockLimitRejectsDraw` | #24, #28 |
| `GroupCapacityExceeded` | `testGroupCapacityRejectsDraw` | #29 |
| `GroupNotOpen` | `testDrawRequiresAnOpenGroup` | #99, #100, #101, #102 |
| `GroupAlreadyOpen` | `testOpenTwiceRejected` | #26 |
| `LedgerDirty` | none | none |
| `InterestUnsettled` | `testBlockShortfallBlocksGroupRepay` | #44 |
| `RepayExceedsPrincipal` | `testRepayAbovePrincipalRejects` | #50 |
| `DebtNotCovered` | `testCloseRefusedWhileABlockCannotCoverItsDebt` | #89, #92, #95 |
| `PaymentNotPending` | `testCancelReleasesReservation` | #59, #64 |
| `PendingRewards` | none | none |
| `LedgerMismatch` | none | none |
| `CashMismatch` | `testStrayMUSDBlocksSweepUntilRecovered` | #108 |
| `TransferFailed` | none | none |
| `SendFailed` | none | #103 |
| `GroupStillOpen` | `testResidualSweepRefusedAfterReopen`, `testResidualSweepRefusedWhileOpen` | #87 |
| `NoGroupClosed` | `testResidualSweepRefusedBeforeAnyClose` | #9 |
| `CashReserved` | `testResidualSweepWaitsForReservations` | #105 |
| `ZeroAddress` | `testResidualSweepRejectsZeroAddress` | #111 |

Four errors were not reached live: `LedgerDirty`, `LedgerMismatch`, `PendingRewards`, `TransferFailed`. They need conditions normal use cannot produce, such as an outside change to the Trove. `LedgerDirty`, `PendingRewards`, `LedgerMismatch` and `TransferFailed` also have no Foundry test. `SendFailed` was reached live but has no Foundry test.
