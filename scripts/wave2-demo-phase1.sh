#!/usr/bin/env bash
# Wave 2 testnet demo, phase 1 (Mezo testnet, chain 31611).
# The owner key acts as treasury. The operator key acts as the agent. Testnet funds only.
set -uo pipefail
export PATH="/root/.local/bin:$PATH"

RPC=https://rpc.test.mezo.org
CHAIN=31611
V=${V:-0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf}
MUSD=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
PF=0x86bCF0841622a5dAC14A313a15f96A95421b9366
OP=0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E
VENDOR=$(printf '0x%040x' 48879)    # 0x...beef, allowlisted payee
UNLISTED=$(printf '0x%040x' 49374)  # 0x...c0de, not allowlisted
KS_OWNER=/root/.foundry/keystores/mezo-testnet-vault-test
PW_OWNER=/root/.config/mezo/mezo-testnet-vault-test.pass
KS_OP=/root/.foundry/keystores/mezo-testnet-operator-test
PW_OP=/root/.config/mezo/mezo-testnet-operator-test.pass
LOG=${LOG:-/root/moneyblocks-spike/logs/wave2-phase1.log}
COLL_ETH=0.048ether
COLL_WEI=48000000000000000
BLOCK2_CAP=40000000000000000000 # 40 MUSD local cap for Operations

log() { printf '%s\n' "$*" | tee -a "$LOG"; }
call() { cast call "$@" --rpc-url "$RPC"; }

# tx <owner|op> <label> <ok|revert> <to> <signature> [args...]
# Optional env: VALUE (payable amount), GAS (gas limit; used for transactions that are expected to revert).
tx() {
  local who="$1" label="$2" expect="$3" to="$4" sig="$5"
  shift 5
  local ks pw out parsed st extra=()
  if [ "$who" = op ]; then ks=$KS_OP; pw=$PW_OP; else ks=$KS_OWNER; pw=$PW_OWNER; fi
  if [ -n "${VALUE:-}" ]; then extra+=(--value "$VALUE"); fi
  if [ -n "${GAS:-}" ]; then extra+=(--gas-limit "$GAS"); fi
  out=$(cast send "$to" "$sig" "$@" "${extra[@]}" --rpc-url "$RPC" --chain "$CHAIN" \
        --keystore "$ks" --password-file "$pw" --json 2>&1) || true
  parsed=$(printf '%s' "$out" | python3 -c '
import json, sys
try:
    r = json.loads(sys.stdin.read())
    print(r["transactionHash"], int(str(r["status"]), 0), int(str(r["blockNumber"]), 0))
except Exception:
    pass
')
  if [ -z "$parsed" ]; then
    log "[$label] NO RECEIPT: $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-500)"
    exit 1
  fi
  read -r TX_HASH st TX_BLOCK <<< "$parsed"
  if [ "$expect" = ok ] && [ "$st" != 1 ]; then log "[$label] UNEXPECTED REVERT $TX_HASH"; exit 1; fi
  if [ "$expect" = revert ] && [ "$st" != 0 ]; then log "[$label] UNEXPECTED SUCCESS $TX_HASH"; exit 1; fi
  if [ "$st" = 1 ]; then
    log "[$label] OK tx=$TX_HASH block=$TX_BLOCK"
  else
    log "[$label] REVERTED as expected tx=$TX_HASH block=$TX_BLOCK"
  fi
}

snapshot() {
  local blk; blk=$(cast block-number --rpc-url "$RPC")
  log "-- state at block $blk --"
  log "  groupPosition (coll, principal, interest): $(call $V 'groupPosition()(uint256,uint256,uint256)' --block $blk | tr '\n' ' ')"
  log "  totalPrincipal, totalInterest: $(call $V 'totalPrincipal()(uint256)' --block $blk), $(call $V 'totalInterest()(uint256)' --block $blk)"
  for id in 1 2 3; do
    log "  block $id (cash, reserved, principal, interest): $(call $V 'bucketOf(uint256)(uint256,uint256,uint256,uint256)' $id --block $blk | tr '\n' ' ')"
  done
  log "  overhead principal, interest, cash: $(call $V 'overheadPrincipal()(uint256)' --block $blk), $(call $V 'overheadInterest()(uint256)' --block $blk), $(call $V 'overheadCash()(uint256)' --block $blk)"
  log "  vault MUSD balance, totalCash: $(call $MUSD 'balanceOf(address)(uint256)' $V --block $blk), $(call $V 'totalCash()(uint256)' --block $blk)"
  log "  groupCapacity: $(call $V 'groupCapacity()(uint256)' --block $blk)"
  log "  vendor MUSD balance: $(call $MUSD 'balanceOf(address)(uint256)' $VENDOR --block $blk)"
}

log "== phase 1 start $(date -u +%FT%TZ) chain=$(cast chain-id --rpc-url "$RPC") =="
BC=$(call $V 'blockCount()(uint256)')
if [ "$BC" -gt 3 ]; then log "unexpected blockCount $BC, abort"; exit 1; fi
if [ "$BC" -ge 1 ]; then
  log "resuming: blockCount is $BC. Block 1 was created in tx 0x06dd386f9668e57d2edb9ff3d335fd08e440d979a5eefbb61e8b742f8a1fc05e (block 16776211) before an RPC error stopped the first run."
fi

PRICE=$(call $PF 'fetchPrice()(uint256)' | awk '{print $1}')
CAP=$(python3 -c "print(${COLL_WEI}*${PRICE}//10**18*10000//15000)")
A_REJECT=$(python3 -c "print(${CAP}-2021820000000000000000+50000000000000000000)")
log "oracle price (18-dec USD per BTC): $PRICE"
log "group capacity at 150% policy for 0.048 BTC (18-dec MUSD): $CAP"
log "block 1 rejected draw, 50 MUSD over capacity (18-dec): $A_REJECT"
python3 -c "import sys; sys.exit(0 if ${CAP} > 2046900000000000000000 else 1)" || { log "capacity too low for a clean demo, abort"; exit 1; }

# Blocks: 1 Procurement (CROSS), 2 Operations (CROSS, local cap 40), 3 Vendor pocket (ISOLATED slice)
if [ "$BC" -lt 1 ]; then tx owner "block 1 Procurement, CROSS, local cap 2500" ok $V 'createMoneyblock(string,bool,uint256)' "Procurement" true 2500000000000000000000; fi
if [ "$BC" -lt 2 ]; then tx owner "block 2 Operations, CROSS, local cap 40" ok $V 'createMoneyblock(string,bool,uint256)' "Operations" true $BLOCK2_CAP; fi
if [ "$BC" -lt 3 ]; then tx owner "block 3 Vendor pocket, ISOLATED slice" ok $V 'createMoneyblock(string,bool,uint256)' "Vendor pocket" false 0; fi

# Slice: allowlist, operator mandate (per-tx 1.5, lifetime 3, 7 days), prefunded with 2 MUSD
tx owner "allow vendor on block 3" ok $V 'setRecipient(uint256,address,bool)' 3 "$VENDOR" true
EXPIRY=$(( $(cast block latest --rpc-url "$RPC" -f timestamp) + 604800 ))
tx owner "grant agent mandate on block 3" ok $V 'grantMandate(uint256,address,uint256,uint256,uint64)' 3 "$OP" 1500000000000000000 3000000000000000000 "$EXPIRY"
tx owner "approve vault for 2 MUSD" ok $MUSD 'approve(address,uint256)' $V 2000000000000000000
tx owner "prefund block 3 with 2 MUSD" ok $V 'fundPocket(uint256,uint256)' 3 2000000000000000000

tx op "agent pays 0.5 MUSD to vendor (under the 1.0 approval threshold)" ok $V 'requestTransfer(uint256,address,uint256,bytes32)' 3 "$VENDOR" 500000000000000000 "$(cast format-bytes32-string INV-001)"
tx op "agent requests 1.2 MUSD (above threshold, waits for owner)" ok $V 'requestTransfer(uint256,address,uint256,bytes32)' 3 "$VENDOR" 1200000000000000000 "$(cast format-bytes32-string INV-002)"
tx owner "owner approves payment 2" ok $V 'approvePayment(uint256)' 2
GAS=2000000 tx op "REJECT slice: agent asks 1.6 MUSD, over the 1.5 per-transaction cap" revert $V 'requestTransfer(uint256,address,uint256,bytes32)' 3 "$VENDOR" 1600000000000000000 "$(cast format-bytes32-string INV-003)"
GAS=2000000 tx op "REJECT slice: agent pays an address not on the allowlist" revert $V 'requestTransfer(uint256,address,uint256,bytes32)' 3 "$UNLISTED" 100000000000000000 "$(cast format-bytes32-string INV-004)"

# Shared Trove: 0.048 BTC collateral, 1,800 MUSD drawn into block 1 (Mezo minimum)
VALUE=$COLL_ETH tx owner "open shared Trove with 0.048 BTC, draw 1,800 MUSD into block 1" ok $V 'openGroup(uint256,uint256)' 1 1800000000000000000000

# Rejection 1: local block limit. Block 2 may hold 40 MUSD of debt, so a 45 draw fails there first.
GAS=2000000 tx owner "REJECT block limit: block 2 draws 45 MUSD, over its 40 cap" revert $V 'borrow(uint256,uint256)' 2 45000000000000000000
tx owner "block 2 draws 20 MUSD (inside its cap and the group)" ok $V 'borrow(uint256,uint256)' 2 20000000000000000000

# Rejection 2: group capacity. Block 1 is under its own cap, but the group is at the 150% policy.
GAS=2000000 tx owner "REJECT group capacity: block 1 draws over the group capacity" revert $V 'borrow(uint256,uint256)' 1 "$A_REJECT"

tx owner "approve vault for 0.5 MUSD overhead" ok $MUSD 'approve(address,uint256)' $V 500000000000000000
tx owner "fund overhead with 0.5 MUSD" ok $V 'fundOverhead(uint256)' 500000000000000000

snapshot
log "== phase 1 done $(date -u +%FT%TZ) =="
