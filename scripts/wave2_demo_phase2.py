#!/usr/bin/env python3
"""Wave 2 testnet demo, phase 2 (Mezo testnet, chain 31611).

Picks up after phase 1 (scripts/wave2-demo-phase1.sh) on the shared Trove at V:
1. Accrue interest, wait 3 minutes, accrue again, and check the split by principal.
2. Block 1 repays 10 MUSD. Interest is paid first, from each block's own cash.
3. Buy MUSD for the close with a 0.0001 BTC swap on the testnet MUSD/BTC pool.
4. Show a refused early close while block 1 cannot yet cover its own debt.
5. Top up blocks 1 and 2 so each covers principal plus interest, then close the Trove.
6. Sweep the returned BTC collateral to the owner.
7. Send the tracked MUSD (block cash and overhead cash) to the owner with sweepResidualMUSD.

The owner key is the treasury. Testnet funds only. Each step reads state first, so a rerun
skips finished steps. Every send is simulated first, so a failing call never reaches the chain.
Read calls retry on RPC hiccups. A send that returns no receipt may still have landed, so the
script stops there, and a rerun re-reads state before it sends anything.
Use --dry-run to read state and print the plan without sending anything.
"""
import json
import os
import subprocess
import sys
import time
from decimal import Decimal

DRY = "--dry-run" in sys.argv
RPC = "https://rpc.test.mezo.org"
CHAIN = "31611"
V = os.environ.get("V", "0xf59962C8806E6D2a82808EB4c0b7886dF6fB31cf")
MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"
PF = "0x86bCF0841622a5dAC14A313a15f96A95421b9366"
ROUTER = "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9"
PFAC = "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A"
BTC = "0x7b7c000000000000000000000000000000000000"
OWNER = "0xA445987238e1E2C56739C68743a150CdAcF60db7"
KS = "/root/.foundry/keystores/mezo-testnet-vault-test"
PW = "/root/.config/mezo/mezo-testnet-vault-test.pass"
LOG = os.environ.get("LOG", "/root/moneyblocks-spike/logs/wave2-phase2.log")
ENV = dict(os.environ, PATH="/root/.local/bin:" + os.environ.get("PATH", ""))

E18 = 10**18
REPAY_WEI = 10 * E18
SWAP_BTC_WEI = 10**14  # 0.0001 BTC
SWAP_MIN_OUT = E18  # accept at least 1 MUSD
SWAP_BELOW = 5 * E18  # swap only if the owner holds less MUSD than this
BUFFER = 10**16  # 0.01 MUSD of headroom per block against interest accrued before the close
PHASE1_BLOCK1_PRINCIPAL = 1801_800 * 10**15  # 1801.8 MUSD, block 1 principal after phase 1


def utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def log(msg):
    print(msg, flush=True)
    if not DRY:
        with open(LOG, "a") as f:
            f.write(msg + "\n")


def run(cmd, timeout=240):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, env=ENV, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "", "timed out"
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def read_cmd(cmd, tries=6):
    """Read-only cast command. Retries RPC hiccups such as null responses and timeouts. A revert is final."""
    for attempt in range(tries):
        rc, out, err = run(cmd)
        if rc == 0 or "execution reverted" in err + out:
            return rc, out, err
        time.sleep(2 * (attempt + 1))
    return rc, out, err


def read(cmd):
    rc, out, err = read_cmd(cmd)
    if rc != 0:
        raise RuntimeError(f"{cmd[1]} failed: {err[:300]}")
    return out


def m(x):
    """Wei to a token amount as an exact decimal string (18 decimals)."""
    return format(Decimal(x).scaleb(-18), "f")


def latest_block():
    return int(read(["cast", "block-number", "--rpc-url", RPC]))


def cget(to, sig, *args, blk=None):
    cmd = ["cast", "call", to, sig, *map(str, args)]
    if blk is not None:
        cmd += ["--block", str(blk)]
    out = read(cmd + ["--rpc-url", RPC])
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def cnum(to, sig, *args, blk=None):
    return int(cget(to, sig, *args, blk=blk)[0].split()[0])


def balance(addr, blk):
    return int(read(["cast", "balance", addr, "--block", str(blk), "--rpc-url", RPC]).split()[0])


def read_state(blk):
    g = cget(V, "groupPosition()(uint256,uint256,uint256)", blk=blk)
    s = {
        "blk": blk,
        "coll": int(g[0].split()[0]),
        "principal": int(g[1].split()[0]),
        "interest": int(g[2].split()[0]),
        "totalPrincipal": cnum(V, "totalPrincipal()(uint256)", blk=blk),
        "totalInterest": cnum(V, "totalInterest()(uint256)", blk=blk),
        "ovPrincipal": cnum(V, "overheadPrincipal()(uint256)", blk=blk),
        "ovInterest": cnum(V, "overheadInterest()(uint256)", blk=blk),
        "ovCash": cnum(V, "overheadCash()(uint256)", blk=blk),
        "vaultMUSD": cnum(MUSD, "balanceOf(address)(uint256)", V, blk=blk),
        "totalCash": cnum(V, "totalCash()(uint256)", blk=blk),
        "active": cget(V, "troveActive()(bool)", blk=blk)[0] == "true",
        "ownerMUSD": cnum(MUSD, "balanceOf(address)(uint256)", OWNER, blk=blk),
        "ownerBTC": balance(OWNER, blk),
        "vaultBTC": balance(V, blk),
        "blocks": {},
    }
    for i in (1, 2, 3):
        vals = [int(x.split()[0]) for x in cget(V, "bucketOf(uint256)(uint256,uint256,uint256,uint256)", i, blk=blk)]
        s["blocks"][i] = dict(zip(("cash", "reserved", "principal", "interest"), vals))
    return s


def tieout(s):
    bl = s["blocks"]
    checks = [
        ("Mezo principal equals totalPrincipal", s["principal"] == s["totalPrincipal"]),
        ("Mezo interest is at least the settled totalInterest", s["interest"] >= s["totalInterest"]),
        (
            "buckets plus overhead principal equal totalPrincipal",
            sum(b["principal"] for b in bl.values()) + s["ovPrincipal"] == s["totalPrincipal"],
        ),
        (
            "buckets plus overhead interest equal totalInterest",
            sum(b["interest"] for b in bl.values()) + s["ovInterest"] == s["totalInterest"],
        ),
        ("vault MUSD equals tracked cash", s["vaultMUSD"] == s["totalCash"]),
    ]
    for name, ok in checks:
        log(f"  tie-out {'PASS' if ok else 'FAIL'}: {name}")
    return all(ok for _, ok in checks)


def snapshot(tag, s):
    log(f"-- {tag} (block {s['blk']}) --")
    log(
        f"  group: coll {m(s['coll'])} BTC, principal {m(s['principal'])} MUSD, "
        f"Mezo interest {s['interest']} wei, settled interest {s['totalInterest']} wei"
    )
    log(f"  trove active: {s['active']}, totalPrincipal {m(s['totalPrincipal'])} MUSD")
    for i, b in s["blocks"].items():
        log(
            f"  block {i}: cash {m(b['cash'])}, reserved {m(b['reserved'])}, "
            f"principal {m(b['principal'])}, interest {b['interest']} wei"
        )
    log(f"  overhead: principal {m(s['ovPrincipal'])}, interest {s['ovInterest']} wei, cash {m(s['ovCash'])}")
    log(f"  vault MUSD {m(s['vaultMUSD'])}, tracked cash {m(s['totalCash'])}, vault BTC {m(s['vaultBTC'])}")
    log(f"  owner MUSD {m(s['ownerMUSD'])}, owner BTC {m(s['ownerBTC'])}")
    return tieout(s)


def must(tag, s):
    """Snapshot and tie-out. A failed tie-out stops the run before any further send."""
    if not snapshot(tag, s):
        log(f"tie-out FAILED at {tag}, stopping before any further send")
        sys.exit(1)
    return s


def check_split(before, after):
    """Independent check: interest accrued between two settlements splits by principal, residue to overhead."""
    accrued = after["totalInterest"] - before["totalInterest"]
    total = after["totalPrincipal"]
    exp1 = accrued * after["blocks"][1]["principal"] // total
    exp2 = accrued * after["blocks"][2]["principal"] // total
    expov = accrued - exp1 - exp2
    got = (
        after["blocks"][1]["interest"] - before["blocks"][1]["interest"],
        after["blocks"][2]["interest"] - before["blocks"][2]["interest"],
        after["ovInterest"] - before["ovInterest"],
    )
    ok = got == (exp1, exp2, expov)
    log(
        f"  split by principal, accrued {accrued} wei: block 1 {got[0]}, block 2 {got[1]}, "
        f"overhead {got[2]} (expected {exp1}, {exp2}, {expov}): {'PASS' if ok else 'FAIL'}"
    )
    return ok


def logged(text):
    """True if an earlier run already logged this text. Used for a step that changes no state."""
    if not os.path.exists(LOG):
        return False
    with open(LOG) as f:
        return any(text in ln for ln in f)


def decode(to, sig, args, bn):
    _, data, _ = run(["cast", "calldata", sig, *map(str, args)])
    _, out, err = read_cmd(
        ["cast", "call", to, data, "--from", OWNER, "--block", str(bn - 1), "--rpc-url", RPC]
    )
    for line in (err + "\n" + out).splitlines():
        if "execution reverted" in line:
            return line.strip()[:300]
    return "reason not decoded"


def wait_receipt(tx, tries=60):
    """Poll for a receipt through read calls, which tolerate RPC null responses. None if still missing."""
    for _ in range(tries):
        rc, out, _ = run(["cast", "receipt", tx, "--rpc-url", RPC, "--json"], timeout=30)
        if rc == 0:
            try:
                r = json.loads(out)
                if r.get("blockNumber"):
                    return r
            except ValueError:
                pass
        time.sleep(3)
    return None


def send(label, expect, to, sig, *args, gas=None):
    """Send one owner transaction. expect is 'ok' or 'revert'. Returns (tx hash, block number)."""
    if DRY:
        log(f"[dry] {label}")
        return None
    if expect == "ok":
        rc, _, err = read_cmd(["cast", "call", to, sig, *map(str, args), "--from", OWNER, "--rpc-url", RPC])
        if rc != 0:
            log(f"[{label}] SIMULATION FAILED, nothing sent: {err[:400]}")
            sys.exit(1)
        if not gas:
            # Pad the estimate by half. The first repay (tx 0x1a12826d...) reverted in block 16777299
            # with a 2,906,942 gas limit, and a later estimate was 2,918,501. The cause is not
            # confirmed. Unused gas is refunded.
            rc, est, err = read_cmd(["cast", "estimate", to, sig, *map(str, args), "--from", OWNER, "--rpc-url", RPC])
            if rc != 0 or not est.split():
                log(f"[{label}] ESTIMATE FAILED, nothing sent: {err[:400]}")
                sys.exit(1)
            gas = int(est.split()[0]) * 3 // 2
    cmd = [
        "cast", "send", to, sig, *map(str, args),
        "--rpc-url", RPC, "--chain", CHAIN,
        "--keystore", KS, "--password-file", PW, "--async",
    ]
    if gas:
        cmd += ["--gas-limit", str(gas)]
    rc, out, err = run(cmd)
    tx = out.splitlines()[-1].strip() if out else ""
    if rc != 0 or not tx.startswith("0x"):
        log(f"[{label}] NO HASH, nothing confirmed, a rerun re-reads state: {(out + ' ' + err)[:400]}")
        sys.exit(1)
    log(f"[{label}] SENT tx={tx}")
    rec = wait_receipt(tx)
    if rec is None:
        log(f"[{label}] NO RECEIPT YET for tx={tx}, check it on chain before any rerun")
        sys.exit(1)
    status = int(str(rec["status"]), 0)
    bn = int(str(rec["blockNumber"]), 0)
    if expect == "ok" and status != 1:
        log(f"[{label}] UNEXPECTED REVERT tx={tx} block={bn}")
        sys.exit(1)
    if expect == "revert" and status != 0:
        log(f"[{label}] UNEXPECTED SUCCESS tx={tx} block={bn}")
        sys.exit(1)
    if status == 1:
        log(f"[{label}] OK tx={tx} block={bn}")
    else:
        log(f"[{label}] REVERTED as expected tx={tx} block={bn}: {decode(to, sig, args, bn)}")
    return tx, bn


def main():
    log(f"== phase 2 {'dry run' if DRY else 'run'} start {utc()} chain={CHAIN} ==")
    s = read_state(latest_block())
    if not snapshot("state at start", s) or not s["active"]:
        log("start state not as expected, abort")
        sys.exit(1)
    if DRY:
        for i in (1, 2):
            debt = cnum(V, "blockDebtNow(uint256)(uint256)", i, blk=s["blk"])
            need = debt + BUFFER - s["blocks"][i]["cash"]
            log(f"[dry] block {i} top-up before close would be {m(max(need, 0))} MUSD")
        log(
            "[dry] plan: accrue, wait 180 s, accrue, repay 10 MUSD from block 1, "
            "swap 0.0001 BTC if owner MUSD < 5, refused close, top-ups, closeGroup, sweepBTC"
        )
        return

    owner_btc_start = s["ownerBTC"]

    # 1. Interest accrues on the group debt. Settle it, wait, and settle again.
    #    Runs only before the repay. After the repay the earlier checks are already in the log.
    if s["blocks"][1]["principal"] == PHASE1_BLOCK1_PRINCIPAL:
        bn = send("accrue interest to now", "ok", V, "accrue()")[1]
        s = read_state(bn)
        if not check_split(read_state(bn - 1), s):
            log("split check FAILED, stopping before any further send")
            sys.exit(1)
        must("after first accrue", s)
        log("waiting 180 seconds so interest accrues")
        time.sleep(180)
        bn = send("accrue interest again after 3 minutes", "ok", V, "accrue()")[1]
        s = read_state(bn)
        if not check_split(read_state(bn - 1), s):
            log("split check FAILED, stopping before any further send")
            sys.exit(1)
        must("after second accrue", s)
    else:
        log("block 1 already repaid, skipping the accrue steps")

    # 2. Block 1 repays 10 MUSD. Interest is paid first, from each block's own cash.
    if s["blocks"][1]["principal"] == PHASE1_BLOCK1_PRINCIPAL:
        bn = send("block 1 repays 10 MUSD", "ok", V, "repay(uint256,uint256)", 1, REPAY_WEI)[1]
        before, s = read_state(bn - 1), read_state(bn)
        ok = (
            s["totalPrincipal"] == before["totalPrincipal"] - REPAY_WEI
            and s["totalInterest"] == 0
            and s["ovInterest"] == 0
            and all(b["interest"] == 0 for b in s["blocks"].values())
        )
        log(
            f"  repay check: principal {m(before['totalPrincipal'])} -> {m(s['totalPrincipal'])} MUSD, "
            f"settled interest cleared: {'PASS' if ok else 'FAIL'}"
        )
        if not ok:
            sys.exit(1)
        must("after block 1 repay", s)
    else:
        log("block 1 principal already reduced, skipping repay")

    # 3. Buy MUSD for the close with a swap on the testnet MUSD/BTC pool.
    if s["ownerMUSD"] < SWAP_BELOW:
        musd_before = s["ownerMUSD"]
        if cnum(BTC, "allowance(address,address)(uint256)", OWNER, ROUTER) < SWAP_BTC_WEI:
            send("approve router to spend 0.0001 BTC", "ok", BTC, "approve(address,uint256)", ROUTER, SWAP_BTC_WEI)
        deadline = int(read(["cast", "block", "latest", "--rpc-url", RPC, "-f", "timestamp"])) + 1200
        bn = send(
            "swap 0.0001 BTC for MUSD on the testnet pool",
            "ok",
            ROUTER,
            "swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256)",
            SWAP_BTC_WEI,
            SWAP_MIN_OUT,
            f"[({BTC},{MUSD},false,{PFAC})]",
            OWNER,
            deadline,
        )[1]
        s = must("after swap", read_state(bn))
        log(
            f"  owner MUSD {m(musd_before)} -> {m(s['ownerMUSD'])} "
            f"(received {m(s['ownerMUSD'] - musd_before)})"
        )
    else:
        log(f"owner already holds {m(s['ownerMUSD'])} MUSD, skipping swap")

    # 4. A close must be refused while block 1 cannot yet cover its own debt.
    bn = s["blk"]
    debt1 = cnum(V, "blockDebtNow(uint256)(uint256)", 1, blk=bn)
    label = "REJECT close: block 1 cannot yet cover its own debt"
    if s["active"] and s["blocks"][1]["cash"] < debt1:
        if logged(f"[{label}] REVERTED as expected"):
            log(f"[{label}] already logged by an earlier run, not sent again")
        else:
            bn = send(label, "revert", V, "closeGroup()", gas=2_000_000)[1]

    # 5. Top up each block so it covers principal plus interest at close, with 0.01 MUSD headroom.
    needs = {}
    for i in (1, 2):
        debt = cnum(V, "blockDebtNow(uint256)(uint256)", i, blk=s["blk"])
        cash = s["blocks"][i]["cash"]
        log(f"  block {i} owes {m(debt)} MUSD now and holds {m(cash)} MUSD")
        if cash < debt + E18 // 1000:
            needs[i] = debt + BUFFER - cash
    if needs:
        bn = send(
            f"approve vault for {m(sum(needs.values()))} MUSD of close top-ups",
            "ok",
            MUSD,
            "approve(address,uint256)",
            V,
            sum(needs.values()),
        )[1]
        for i in sorted(needs):
            bn = send(
                f"fund block {i} pocket with {m(needs[i])} MUSD for the close",
                "ok",
                V,
                "fundPocket(uint256,uint256)",
                i,
                needs[i],
            )[1]
    else:
        log("blocks already cover their debt, skipping top-ups")
    s = must("before close", read_state(bn))

    # 6. Close the Trove. Mezo burns the debt minus the 200 MUSD gas deposit from the vault.
    if s["active"]:
        bn = send("close the group Trove", "ok", V, "closeGroup()")[1]
    s = must("after close", read_state(bn))

    # 7. Return the BTC collateral to the owner.
    if s["vaultBTC"] > 0:
        send("sweep BTC collateral to the owner", "ok", V, "sweepBTC(address)", OWNER)
    s = must("after BTC sweep", read_state(latest_block()))

    # 8. Send the MUSD the ledger tracks (block cash and overhead cash) to the owner. The contract
    #    refuses this while a group is open, so it runs after the close.
    if s["vaultMUSD"] > 0:
        owner_musd_start, tracked = s["ownerMUSD"], s["vaultMUSD"]
        bn = send("sweep tracked MUSD to the owner", "ok", V, "sweepResidualMUSD(address)", OWNER)[1]
        s = must("after residual sweep", read_state(bn))
        if s["vaultMUSD"] != 0 or s["totalCash"] != 0 or s["ownerMUSD"] != owner_musd_start + tracked:
            log("residual sweep check FAILED, stopping")
            sys.exit(1)
        log(f"residual sweep moved {m(tracked)} MUSD to the owner, vault MUSD now {m(s['vaultMUSD'])}")
    else:
        log("no MUSD tracked in the vault, skipping the residual sweep")
    s = must("final", read_state(latest_block()))
    log(f"owner BTC {m(owner_btc_start)} at this run's start, {m(s['ownerBTC'])} at end")
    log(f"== phase 2 done {utc()} tie-out PASS ==")


if __name__ == "__main__":
    main()
