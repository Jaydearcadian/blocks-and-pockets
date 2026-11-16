# Feedback for Mezo

Notes from building Blocks & Pockets on Mezo testnet (chain 31611) for the AKINDO Mezo Builders Wave 2. Facts are from this build. Where something is a guess, it says so.

## What worked well

- BorrowerOperations, TroveManager and MUSD behaved as documented for open, borrow, add collateral, repay and close. The vault's ledger tied out to `getEntireDebtAndColl` in every fork test and in the live run.
- `getEntireDebtAndColl` returning pending rewards separately made it possible to refuse safely when rewards exist.
- The Blockscout explorer links every transaction and the public RPC served a 113-transaction run.

## Friction

1. **Public RPC limits.** `eth_getLogs` refuses ranges over 10,000 blocks, and the node was flaky at times. The dashboard chunks logs in 9,000-block windows and retries. A documented limit and a backup RPC would help.
2. **No debug trace.** `debug_traceTransaction` is not offered, so a refusal reason cannot be read from a failed transaction. The live-run checker replays the call at the parent block to recover it. A trace endpoint, or revert data on receipts, would remove that workaround.
3. **Oracle on a local fork.** The deployed price oracle bytecode recurses when forked with anvil or forge, so every fork test mocks it (`scripts/local-wallet/MockOracle.sol`). Also, anvil's default hardfork fails with "Excess blob gas not set" against this node, so forks need `--hardfork shanghai`. A note in the docs would save time.
4. **Faucet CAPTCHA.** The faucet needs a CAPTCHA, so amounts and timing are not scriptable. Opening a shared Trove needs about 0.048 BTC and 1,800 MUSD of debt, which is a lot to gather by hand. (This build also bought test MUSD with a testnet pool swap.)
5. **Minimum debt revert text.** A repay that would leave net debt under the minimum reverts with a plain string ("BorrowerOps: Trove's net debt must be greater than minimum"), not a custom error. It is easy to hit and hard to detect programmatically.
6. **Failing-call gas.** The live-run runner sent every call with an explicit gas limit of 3,000,000, so refused transactions show that figure as gas used. Whether the node's own estimate would have been usable was not tested.

## Asks

- Publish the testnet contract addresses and ABIs in one machine-readable file.
- Document how a contract owner is expected to handle a liquidated Trove. This vault does not model it, because there is no way to exercise it safely on testnet.
- Offer contract source verification on the testnet explorer, with the solc settings that Mezo's own contracts use. (Whether this works for `via_ir` builds is untested here.)
