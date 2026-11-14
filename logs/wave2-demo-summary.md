# Wave 2 testnet demo: transaction record

Mezo testnet, chain 31611. Testnet funds only. Explorer: https://explorer.test.mezo.org

- Rerun vault (MoneyblocksVault, with `sweepResidualMUSD`): `0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641`. The rerun record is at the end of this file.
- Earlier vault (no sweep function): `0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf`. The sections up to the note below record this vault.
- Owner (treasury, test key): `0xA445987238e1E2C56739C68743a150CdAcF60db7`
- Operator (agent, test key): `0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E`
- Vendor (allowlisted payee): `0x000000000000000000000000000000000000beef`
- Unlisted address (rejected payee): `0x000000000000000000000000000000000000c0de`
- Shared Trove: 0.048 BTC collateral, owned by the vault. Blocks: 1 Procurement (CROSS), 2 Operations (CROSS, cap 40 MUSD), 3 Vendor pocket (ISOLATED).

Logs: `wave2-phase1.log`, `wave2-phase2.log` (earlier vault); `wave2-rerun-phase1.log`, `wave2-rerun-phase2.log`, `wave2-rerun-deploy-broadcast.txt` (rerun). The phase 1 rejection reasons were decoded by replaying each call at the block before it.

## Phase 1 (13:30 to 13:33 UTC, 14 Nov)

| Step | Block | Transaction | Result |
|---|---|---|---|
| Create block 1 Procurement (CROSS, cap 2,500) | 16776211 | `0x06dd386f9668e57d2edb9ff3d335fd08e440d979a5eefbb61e8b742f8a1fc05e` | OK (sent in the first, interrupted run) |
| Create block 2 Operations (CROSS, cap 40) | 16776223 | `0xa62d7329479712c42bbeab7bb6ad4d056ae8f7589b822a9db76b86aa7d75181f` | OK |
| Create block 3 Vendor pocket (ISOLATED) | 16776224 | `0xadc153cc76230ffbf66b1648c926327ec30b0e346fa707a6ae1a17c3178bf2e4` | OK |
| Allow vendor on block 3 | 16776225 | `0xae4c5254d21ed344e334d20643a5a6a73aeec097729584a86daca7e5693c14a7` | OK |
| Grant agent mandate on block 3 (1.5 per transaction, 3 total, 7 days) | 16776226 | `0x92b04f0d250b5adebf5e2acdc88893bdbd4d824642d6fa9d9fe887aa9f8822dc` | OK |
| Approve vault for 2 MUSD | 16776227 | `0x341d793f39164b0830fda173bd7514d08aafc208a39b91b8e7b4af2777be8f7e` | OK |
| Prefund block 3 with 2 MUSD | 16776228 | `0x7a408286b70d641853a98ed4c3f8cd8bea182cf55aa47a1157afb8f7d4fe26ba` | OK |
| Agent pays 0.5 MUSD to vendor (under 1.0 approval threshold) | 16776229 | `0xabfc78c2ea7422e28cb826417e68c74a26a95311d58bd394dfbac2b168875949` | Executed |
| Agent requests 1.2 MUSD (above threshold) | 16776230 | `0x2d0ad8f1d3f50a3bc8fdeb547a87fe3f6ec6f9baede0095b069a46d22f0cea7f` | Pending |
| Owner approves payment 2 | 16776231 | `0x14d1dc90aa043105576fbd81223e32836038a8c1ca5b9af1151812270179e5dc` | Executed |
| REJECT: agent asks 1.6 MUSD, over the 1.5 per-transaction cap | 16776232 | `0xa96e084f36188194bd5bd09ce74b341856dea33ab38fad210b1fd500c4b503b6` | Reverted: `PerTransactionCapExceeded(1.6e18, 1.5e18)` |
| REJECT: agent pays an address not on the allowlist | 16776233 | `0x77ed1e343f7aa797a14ca0a265a109c2dd964bbae1fab95d2b964afe7c2f3f37` | Reverted: `RecipientNotAllowed(3, 0x...c0de)` |
| Open shared Trove with 0.048 BTC, draw 1,800 MUSD into block 1 | 16776234 | `0x0ed1f4842f64b5ab6276e69a8dbbd9a81530604f6eb547f771dbdea4076bb19b` | OK |
| REJECT block limit: block 2 draws 45 MUSD, over its 40 cap | 16776235 | `0xaedbd484cf61525fd36577a92e1f0de2f6eb344f5c56cd583caeb5459d6f74ab` | Reverted: `BlockDebtCapExceeded(2, 45.045e18, 40e18)` |
| Block 2 draws 20 MUSD | 16776236 | `0xf62056d178faf1f7b9d83b066b64b5ac2350e35a7ab3223283a7e84c558d8523` | OK |
| REJECT group capacity: block 1 draws 161.556 MUSD | 16776237 | `0xc355fdb57b491197e89b1e6b9ff09a1f96a5af4066609ad88a1a0c82a8690123` | Reverted: `GroupCapacityExceeded(2183.538e18, 2132.653e18)` |
| Approve vault for 0.5 MUSD overhead | 16776238 | `0x2a1c0cb2175546269128210388efd4e60220d694cc06f6849dd2923b62fc329a` | OK |
| Fund overhead with 0.5 MUSD | 16776239 | `0x749255f686cf14853f4345955b7bf7f7d7b925e312c3ab1dc7019346ecd1fa41` | OK |

## Phase 2 (13:43 to 14:00 UTC, 14 Nov)

Phase 2 ran in four passes (13:43, 13:52, 13:57, and 13:59 UTC). The first three stopped on RPC null responses. Each stop was checked on chain, and each pass re-read state and skipped finished steps. Every row below was confirmed by receipt on chain. The logs record each stop.

| Step | Block | Transaction | Result |
|---|---|---|---|
| Accrue (sent by the first run, which stopped before logging the hash) | 16776401 | `0xc0601df2b315828a8c0ceb92d419d1910b9d2e099648563985967b454cabe2d0` | OK, 0.000437590759715957 MUSD of interest accrued |
| Accrue | 16776520 | `0xe67b96942ad0ed3fa7caf6cfa725b2ae1d026e60006c2283a19a70289fd29565` | OK, 0.000317141180174815 MUSD accrued, split by principal exact |
| Accrue, after 3 minutes | 16776567 | `0x1dc5cb3e2642aa5a2a5f29ba13e773f2efa38f344450c8927ec899bfbce4487a` | OK, 0.000126215782817048 MUSD accrued, split exact |
| Block 1 repays 10 MUSD | 16776570 | `0x5657c61ceca9f0f5f1ddea2aed5fe13fdfe6ccf966b0295412e3bd7046c2b998` | OK, principal 2,021.82 to 2,011.82 MUSD, settled interest cleared |
| Approve router for 0.0001 BTC | 16776574 | `0xf0751134d3e9412496ea10a4c0f100af513cc0d57d877bdedaedcab05ddb1e53` | OK |
| Swap 0.0001 BTC for MUSD on the testnet pool | 16776575 | `0xfa2b8a6b056ca79ac2054527fc94d902d598f5c035c084364d2c5776f3740729` | OK, owner received 7.817676256580197229 MUSD |
| REJECT close: block 1 cannot yet cover its debt | 16776577 | `0xedfc4035e58df70bf14cd798cb946f55acb2d913af6b6e0b4e91c75f2972e7a2` | Reverted: `DebtNotCovered(1, 1791.800014194970414125, 1789.999201787168798814)` (decoded by replay) |
| Approve vault for 1.840819636877477895 MUSD of close top-ups | 16776578 | `0x5f0c652cb591d5dbb7c84de04978d1c729718da1c7c203defcaa44371949e7e7` | OK |
| Fund block 1 with 1.810810704405165616 MUSD | 16776579 | `0xbdbf496838791520b230c3f2a8895c9079136b3b5d4bd876aa86bf9c47c2990d` | OK |
| Fund block 2 with 0.030008932472312279 MUSD | 16776580 | `0x0d6f21af2a10031bc124248e925672429258878e2280c5cc08aaa90dd05017d3` | OK (the run lost the receipt; block 2 cash confirms it landed) |
| Accrue (sent by the 13:57 pass, which stopped before logging the hash) | 16776598 | `0x0f4bf8e296c6475f0e16fb1e122f26b59130dbac85cc05c18060727847507e2c` | OK |
| Close the group Trove | 16776629 | `0x507084921f886aa284ccb7fc5ca559954a9a6b123fe60afff1e1b919ae5f39e2` | OK. The vault paid 1,811.82 MUSD plus interest. The Trove is inactive and group principal is 0. The 0.048 BTC collateral stays in the vault until the sweep |
| Sweep BTC collateral to the owner | 16776631 | `0xc15bb717b7809f9c4f7811c39ad98f284592bc2f7085b07f3de96b7f5ffe115c` | OK. Owner BTC rose by 0.048, less gas |

## Final state (block 16776631)

- Trove closed. Group principal and collateral are 0. Vault BTC is 0.
- Owner MUSD: 9.494301700133054621. That is 3.517445 before the swap, plus 7.817676 from the swap, minus 1.840820 in top-ups.
- Vault MUSD: 0.819766561897359410, equal to tracked cash: block 1 0.009872, block 2 0.009999, block 3 0.300000, overhead 0.499896. The vault had no owner withdrawal path after close, so this cash stayed in the vault. The note below covers the later sweep.
- No tie-out failed in any pass.
- Foundry at the time of phase 2: 27 of 27 pass (14 hermetic `MoneyblocksSliceTest`, 13 fork `MoneyblocksGroupForkTest`). Log `logs/forge-group-fork-run5.txt`. The current count is in the note below.

## Note added after the phase 2 record

The vault `0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf` was deployed before `sweepResidualMUSD` existed. It keeps the 0.819767 MUSD in the final state above. The contract now has `sweepResidualMUSD(to)`, which sends tracked cash to the owner after a close. It refuses while a group is open, before any close, with a nonzero ledger total, or with reserved cash. Tests: 36 of 36 pass (14 hermetic, 22 fork). Log `logs/forge-residual-run8.txt`. Mutation check: removing each of the six sweep guards in turn fails its target test (log `logs/mutation-check.txt`). The rerun below ran the new function on chain.

## Rerun on a new vault with the residual sweep (14 Nov)

The earlier vault predates `sweepResidualMUSD`, so its 0.82 MUSD cannot move. The rerun deploys the current contract to a new vault and repeats both phases with the same owner, operator, vendor, and shared-Trove design. Testnet funds only.

- New vault: `0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641`. Deploy tx `0x60a99274dcda1fb00860f7c00ca3372f59b38382cea66978580b5a9b62a0ac22`, block 16777200, status 1. Constructor: BorrowerOperations `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5`, TroveManager `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0`, PriceFeed `0x86bCF0841622a5dAC14A313a15f96A95421b9366`, MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, target ratio 15000 bps, approval threshold 1 MUSD. Getters confirmed on chain: owner is the test key, blockCount 0, trove inactive, tracked cash 0.
- The first `forge create` ran without `--broadcast`, so it sent nothing. Its output is `wave2-rerun-deploy-dryrun.txt`. The broadcast output is `wave2-rerun-deploy-broadcast.txt`.
- Logs: `wave2-rerun-phase1.log`, `wave2-rerun-phase2.log`.

### Rerun phase 1 (14:40 to 14:42 UTC)

| Step | Block | Transaction | Result |
|---|---|---|---|
| block 1 Procurement, CROSS, local cap 2500 | 16777214 | `0x5a11444366d05f956895f1f0ef55ad726d058f21a911d9f6b4394ed2500004e0` | OK |
| block 2 Operations, CROSS, local cap 40 | 16777215 | `0x24ca0a0b300a252fec114e2a091acb64d0ca1287205490bd1a91863c406b54ac` | OK |
| block 3 Vendor pocket, ISOLATED slice | 16777216 | `0x54502a164a4e3dc8c134d9bb52e929e92d069cdcbfeba01fb8e3da8d74a0bf71` | OK |
| allow vendor on block 3 | 16777217 | `0xabc9d1ddbddf86ccdbf6e875be38e6c91ce760b9d6d06065a220c4a3069e2d3c` | OK |
| grant agent mandate on block 3 | 16777218 | `0xfc9b15676dd74c64c0a837940c5b9ab974de30b8a3ac126f4c708e9bc7011509` | OK |
| approve vault for 2 MUSD | 16777219 | `0x3ce2d5604b2611aea3a350b780667b14d1ef024155c0366d50d200212d4f5e3c` | OK |
| prefund block 3 with 2 MUSD | 16777220 | `0xcc04f68a5ae8486b1096345592a8eab17e078df032aee8c23ddd8dfa5806283b` | OK |
| agent pays 0.5 MUSD to vendor (under the 1.0 approval threshold) | 16777221 | `0x99bc9678e90dd641dfb2f3a648c315deca3be9b1be8348f37a84228d68c7996c` | OK |
| agent requests 1.2 MUSD (above threshold, waits for owner) | 16777222 | `0xf9c19972d75501f9a19fecb45cef5bc0f7120cc9cb71c454cd464a6a8b4c009a` | OK |
| owner approves payment 2 | 16777223 | `0x22e8e78d3d246da77b0c429804dd7272da210da15b0888ed332b24df2dcfbfa4` | OK |
| REJECT slice: agent asks 1.6 MUSD, over the 1.5 per-transaction cap | 16777224 | `0x48eae5a6aa6c94cffc7f29c1d0135ef3f4a97bc308d668822bc952528e23e753` | Reverted as expected: `PerTransactionCapExceeded(1.6e18, 1.5e18)` |
| REJECT slice: agent pays an address not on the allowlist | 16777225 | `0x4134c6d0e803fc0c048380ad12c53de1b4c22c91e6742cc47837df6c13addfb8` | Reverted as expected: `RecipientNotAllowed(3, 0x...c0de)` |
| open shared Trove with 0.048 BTC, draw 1,800 MUSD into block 1 | 16777226 | `0x9697de9cc23f4be1b4c4f16e4836218edc1f8bd1ad6d5c9fe99d21c0166f8193` | OK |
| REJECT block limit: block 2 draws 45 MUSD, over its 40 cap | 16777227 | `0x65c6c85d3f119f8534978a118c8b635b98e050101816e80ed5d1e6f170625f4c` | Reverted as expected: `BlockDebtCapExceeded(2, 45.045e18, 40e18)` |
| block 2 draws 20 MUSD (inside its cap and the group) | 16777228 | `0x0434e0a14762660a7cabd98eb22142232be2a2b3f5f48bf4a492f73a53d97872` | OK |
| REJECT group capacity: block 1 draws over the group capacity | 16777229 | `0xe0e758ea25b05d86be6a9c2e3c7e61b7e675a3ec37e5a6d06d494c4df48e8539` | Reverted as expected: `GroupCapacityExceeded(2159.201602073696172005e18, 2111.30040032e18)` |
| approve vault for 0.5 MUSD overhead | 16777230 | `0x8f2d6524894fa5fe8d3af49fef186408e7184cf094fbb6876891c3da370237b5` | OK |
| fund overhead with 0.5 MUSD | 16777231 | `0xaa7c6a280795e97ebaf4f6673a0e64c13163284b1d7b393a47956a5c492d2d39` | OK |

After phase 1: trove principal 2,021.82 MUSD (block 1 1,801.80, block 2 20.02, and the 200 MUSD gas deposit). Tracked cash 1,820.80 MUSD (block 1 1,800, block 2 20, block 3 0.30, overhead 0.50). Owner MUSD 6.99. Vendor MUSD 3.46, cumulative with the 1.76 from the earlier run. Group capacity 2,111.99 MUSD. Every tie-out passed.

### Rerun phase 2 (14:42 to 14:53 UTC)

Run 1 rows are marked. Run 1 stopped at the repay, and run 2 finished the sequence.

| Step | Block | Transaction | Result |
|---|---|---|---|
| accrue interest to now (run 1) | 16777250 | `0x3bdc5ef8c1597517a4cfcb85ca5c560c739f56d662ace64421d93f72a98f82d7` | OK |
| accrue interest again after 3 minutes (run 1) | 16777297 | `0xf4b7f43a584792b19764b058b976f6ff052c6f594a6971152e4b871936ee036a` | OK |
| block 1 repays 10 MUSD (run 1) | 16777299 | `0x1a12826d24edfa564e5d5aba314fb1b45df9238c0df5ef76cd3efdb05652151e` | Unexpected revert, see note |
| accrue interest to now | 16777337 | `0x768c9584906f25d6c97612a0387952884b5f378313a2a1bc6db3022a9e5bd7d4` | OK |
| accrue interest again after 3 minutes | 16777383 | `0x48e28be158100d16c42049880b5ad3b13be6526e2acff8aa0824fc160a166c19` | OK |
| block 1 repays 10 MUSD | 16777386 | `0xb66097809a1ff7645b023089e37d1f04492a7fe9c393b4215dd2a9f5d436c240` | OK |
| REJECT close: block 1 cannot yet cover its own debt | 16777389 | `0x31e9888dff62225da550b86cb11807b961c2bd677dc402ae2c181ceb1f925478` | Reverted as expected: `DebtNotCovered(1, 1791.800003974591715955, 1789.999620306485873545)` |
| approve vault for 1.840383867922351937 MUSD of close top-ups | 16777390 | `0xd213ca08e16a308e5a586dd4f2165d1547baa3fe99b4c89376f3f1c1b9a1ccfc` | OK |
| fund block 1 pocket with 1.810379693514126455 MUSD for the close | 16777391 | `0x083690e033dbae19078c58c9e20640cec428ce082696c92113ee17ca416a9789` | OK |
| fund block 2 pocket with 0.030004174408225482 MUSD for the close | 16777392 | `0x6420ffc81451c57c5b617aa8c3f28f4607eda541f879c1129a67c3d76c6873bc` | OK |
| close the group Trove | 16777394 | `0x6b157ba879817678e45166ac34a1f001e02343a2fadfa05f749ade835388e1ad` | OK |
| sweep BTC collateral to the owner | 16777396 | `0x822cd9fb2439a78c9311d7cf8bb8a8db2be062519761ca13d12ff962964a752c` | OK |
| sweep tracked MUSD to the owner | 16777398 | `0x49ad3bf23cd937c362023d88b25beacb32ecdb13cfe4144b7bc9e4ae1eef2f83` | OK |

Notes:

- Run 1 stopped at the repay. Tx `0x1a12826d...` reverted in block 16777299 with status 0. It used 2,745,285 gas of a 2,906,942 limit. Simulations at blocks 16777298, 16777299, and 16777300 all succeeded, so the cause is not confirmed. A reverted transaction changes no vault state, and only the owner's gas was spent. The script now pads each owner send's gas estimate by half. Run 2 repaid the same 10 MUSD with the padded gas (block 16777386).
- Each accrual split the interest by principal exactly.
- The swap was skipped. The owner held 6.99 MUSD, above the 5 MUSD threshold. No BTC was swapped in this rerun.
- Top-ups totaled 1.840383867922351937 MUSD (block 1 1.810379693514126455, block 2 0.030004174408225482).
- The close moved the vault's MUSD from 1,812.639957853977785936 to 0.819937453325657049. It burned 1,811.820020400652128887 MUSD, which is debt less the 200 MUSD gas deposit, plus interest. The Trove is inactive and principal is 0.
- Final state at block 16777399: vault MUSD 0, vault BTC 0, tracked cash 0. Owner MUSD 5.973855285536359733, which is 6.994301700133054621 minus 1.840383867922351937 plus 0.819937453325657049. Owner BTC 0.049299990267595366, which includes the returned 0.048 BTC less gas.
- The residual sweep moved 0.819937453325657049 MUSD to the owner (block 1 0.00998, block 2 0.0099998, block 3 0.3, overhead 0.49996). The `ResidualSwept` event matches.
- The earlier vault `0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf` still holds 0.819767 MUSD. It has no function that moves tracked cash.
