# Wave 2 testnet demo: transaction record

Mezo testnet, chain 31611. Testnet funds only. Explorer: https://explorer.test.mezo.org

- Vault (MoneyblocksVault): `0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf`
- Owner (treasury, test key): `0xA445987238e1E2C56739C68743a150CdAcF60db7`
- Operator (agent, test key): `0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E`
- Vendor (allowlisted payee): `0x000000000000000000000000000000000000beef`
- Unlisted address (rejected payee): `0x000000000000000000000000000000000000c0de`
- Shared Trove: 0.048 BTC collateral, owned by the vault. Blocks: 1 Procurement (CROSS), 2 Operations (CROSS, cap 40 MUSD), 3 Vendor pocket (ISOLATED).

Logs: `wave2-phase1.log`, `wave2-phase2.log`. The phase 1 rejection reasons were decoded by replaying each call at the block before it.

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

The vault `0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf` was deployed before `sweepResidualMUSD` existed. It keeps the 0.819767 MUSD in the final state above. The contract now has `sweepResidualMUSD(to)`, which sends tracked cash to the owner after a close. It refuses while a group is open, before any close, with a nonzero ledger total, or with reserved cash. Tests: 36 of 36 pass (14 hermetic, 22 fork). Log `logs/forge-residual-run8.txt`. Mutation check: removing each of the six sweep guards in turn fails its target test (log `logs/mutation-check.txt`). No testnet transaction has used the new function yet, so a new deployment is needed to show it on chain.
