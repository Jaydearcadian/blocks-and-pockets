#!/usr/bin/env python3
"""Wave 2 testnet demo, revocation step (Mezo testnet, chain 31611).

Runs on the vault after phase 2 closed the shared Trove. Block 3 (Vendor pocket, ISOLATED) keeps the
mandate from phase 1: 1.5 MUSD per transaction, 3 MUSD in total, allowlisted vendor.
1. Owner approves and funds block 3 with 1.3 MUSD.
2. Agent pays 0.2 MUSD to the vendor. Under the 1.0 approval threshold, so it executes now.
3. Agent requests 1.1 MUSD. Above the threshold, so it reserves cash and waits for owner approval.
4. Owner revokes block 3's mandate.
5. Agent requests 0.1 MUSD. Refused with MandateRevoked, although amount, cap, and recipient all pass.
6. Owner tries to approve the waiting 1.1 MUSD payment. Refused with MandateRevoked, because approval
   re-checks the mandate.
7. Owner cancels the waiting payment, which releases its reservation.
8. Owner sweeps the unspent 1.1 MUSD from block 3 back to the owner (sweepResidualMUSD).

The owner key is the treasury and the agent key is the operator. Testnet funds only.
Every send is simulated first. A send that should succeed must simulate cleanly. A send that should be
refused must simulate with the expected error, then it is mined with an explicit gas limit so the refusal
lands on chain with status 0. Start-state checks stop the run if the vault is not in the state phase 2
left, so a rerun after a partial run stops instead of repeating a step.
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
V = os.environ.get("V", "0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641")
MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"
OWNER = "0xA445987238e1E2C56739C68743a150CdAcF60db7"
AGENT = "0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E"
VENDOR = "0x000000000000000000000000000000000000beef"
BLOCK = 3
KS_OWNER = "/root/.foundry/keystores/mezo-testnet-vault-test"
PW_OWNER = "/root/.config/mezo/mezo-testnet-vault-test.pass"
KS_AGENT = "/root/.foundry/keystores/mezo-testnet-operator-test"
PW_AGENT = "/root/.config/mezo/mezo-testnet-operator-test.pass"
LOG = os.environ.get("LOG", "/root/moneyblocks-spike/logs/wave2-revocation.log")
ENV = dict(os.environ, PATH="/root/.local/bin:" + os.environ.get("PATH", ""))

E18 = 10**18
FUND = 13 * 10**17  # 1.3 MUSD, the pocket funding
PAY_NOW = 2 * 10**17  # 0.2 MUSD, under the 1.0 approval threshold
PENDING = 11 * 10**17  # 1.1 MUSD, above the threshold
REFUSED = 10**17  # 0.1 MUSD, inside cap and allowlist
COMMITTED_START = 17 * 10**17  # 1.7 MUSD already executed in phase 1
REVERT_GAS = 400_000
MB_SIG = (
    "moneyblocks(uint256)(string,bool,bool,uint256,uint256,uint256,uint256,uint256,"
    "address,bool,uint64,uint256,uint256,uint256,uint256)"
)
REQ_SIG = "requestTransfer(uint256,address,uint256,bytes32)"
SELECTORS = {"MandateRevoked": "24d3298a"}  # MandateRevoked(uint256)
PAYMENT_STATUS = {0: "None", 1: "Pending", 2: "Executed", 3: "Cancelled"}


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


def ev(text):
    """Evidence label as bytes32, right-padded with zeros (same as cast format-bytes32-string)."""
    return "0x" + text.encode().hex().ljust(64, "0")


def state():
    f = cget(V, MB_SIG, BLOCK)
    return {
        "blockCount": cnum(V, "blockCount()(uint256)"),
        "paymentCount": cnum(V, "paymentCount()(uint256)"),
        "groupsClosed": cnum(V, "groupsClosed()(uint256)"),
        "trove": cget(V, "troveActive()(bool)")[0] == "true",
        "cash": int(f[3].split()[0]),
        "reserved": int(f[4].split()[0]),
        "operator": f[8].lower(),
        "active": f[9] == "true",
        "perTxCap": int(f[11].split()[0]),
        "totalCap": int(f[12].split()[0]),
        "committed": int(f[13].split()[0]),
        "spent": int(f[14].split()[0]),
        "allowed": cget(V, "recipientAllowed(uint256,address)(bool)", BLOCK, VENDOR)[0] == "true",
        "vaultMUSD": cnum(MUSD, "balanceOf(address)(uint256)", V),
        "totalCash": cnum(V, "totalCash()(uint256)"),
        "ownerMUSD": cnum(MUSD, "balanceOf(address)(uint256)", OWNER),
        "vendorMUSD": cnum(MUSD, "balanceOf(address)(uint256)", VENDOR),
    }


def payment(i):
    f = cget(V, "payments(uint256)(uint256,address,uint256,bytes32,uint8)", i)
    return {
        "block": int(f[0].split()[0]),
        "to": f[1].lower(),
        "amount": int(f[2].split()[0]),
        "status": int(f[4].split()[0]),
    }


def show(tag, s):
    log(f"-- {tag} --")
    log(
        f"  block {BLOCK}: cash {m(s['cash'])}, reserved {m(s['reserved'])}, committed {m(s['committed'])}, "
        f"spent {m(s['spent'])}, per-tx cap {m(s['perTxCap'])}, total cap {m(s['totalCap'])}, "
        f"mandate active {s['active']}, vendor allowed {s['allowed']}"
    )
    log(f"  payments counted {s['paymentCount']}, groups closed {s['groupsClosed']}, trove active {s['trove']}")
    log(
        f"  vault MUSD {m(s['vaultMUSD'])}, tracked cash {m(s['totalCash'])}; "
        f"owner MUSD {m(s['ownerMUSD'])}; vendor MUSD {m(s['vendorMUSD'])}"
    )


def expect(tag, ok):
    log(f"  check {'PASS' if ok else 'FAIL'}: {tag}")
    if not ok:
        log(f"check FAILED at {tag}, stopping before any further send")
        sys.exit(1)


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


def decode(sender, to, sig, args, bn):
    """Reason for a refused transaction, from a call at the block before it was mined."""
    _, data, _ = run(["cast", "calldata", sig, *map(str, args)])
    _, out, err = read_cmd(["cast", "call", to, data, "--from", sender, "--block", str(bn - 1), "--rpc-url", RPC])
    for line in (err + "\n" + out).splitlines():
        if "execution reverted" in line:
            return line.strip()[:300]
    return "reason not decoded"


def send(label, sender, to, sig, args, expect_kind, error=None):
    """Simulate, then send one transaction. expect_kind is 'ok' or 'revert'.

    A revert must simulate with `error` (by name or selector). It is then mined with REVERT_GAS so it
    lands on chain with status 0. Returns (tx hash, block number).
    """
    ks, pw = (KS_OWNER, PW_OWNER) if sender == OWNER else (KS_AGENT, PW_AGENT)
    rc, sim, err = read_cmd(["cast", "call", to, sig, *map(str, args), "--from", sender, "--rpc-url", RPC])
    text = sim + "\n" + err
    if expect_kind == "ok":
        if rc != 0:
            log(f"[{label}] SIMULATION FAILED, nothing sent: {err[:400]}")
            sys.exit(1)
        rc, est, err = read_cmd(
            ["cast", "estimate", to, sig, *map(str, args), "--from", sender, "--rpc-url", RPC]
        )
        if rc != 0 or not est.split():
            log(f"[{label}] ESTIMATE FAILED, nothing sent: {err[:400]}")
            sys.exit(1)
        gas = int(est.split()[0]) * 3 // 2
    else:
        if rc == 0 or not (error in text or SELECTORS[error] in text.lower()):
            log(f"[{label}] SIMULATION DID NOT REVERT WITH {error}, nothing sent: {text[:400]}")
            sys.exit(1)
        gas = REVERT_GAS
    cmd = [
        "cast", "send", to, sig, *map(str, args),
        "--rpc-url", RPC, "--chain", CHAIN,
        "--keystore", ks, "--password-file", pw, "--async", "--gas-limit", str(gas),
    ]
    rc, out, err = run(cmd)
    tx = out.splitlines()[-1].strip() if out else ""
    if rc != 0 or not tx.startswith("0x"):
        log(f"[{label}] NO HASH, nothing confirmed, check state before any rerun: {(out + ' ' + err)[:400]}")
        sys.exit(1)
    log(f"[{label}] SENT tx={tx}")
    rec = wait_receipt(tx)
    if rec is None:
        log(f"[{label}] NO RECEIPT YET for tx={tx}, check it on chain before any rerun")
        sys.exit(1)
    status = int(str(rec["status"]), 0)
    bn = int(str(rec["blockNumber"]), 0)
    if (status == 1) != (expect_kind == "ok"):
        log(f"[{label}] UNEXPECTED {'REVERT' if status == 0 else 'SUCCESS'} tx={tx} block={bn}")
        sys.exit(1)
    if status == 1:
        log(f"[{label}] OK tx={tx} block={bn}")
    else:
        log(f"[{label}] REFUSED on chain as expected tx={tx} block={bn}: {decode(sender, to, sig, args, bn)}")
    return tx, bn


def main():
    log(f"== revocation {'dry run' if DRY else 'run'} start {utc()} chain={CHAIN} vault={V} ==")
    s = state()
    show("state at start", s)
    start_ok = (
        s["blockCount"] == 3
        and s["groupsClosed"] >= 1
        and not s["trove"]
        and s["paymentCount"] == 2
        and s["active"]
        and s["operator"] == AGENT.lower()
        and s["allowed"]
        and s["cash"] == 0
        and s["reserved"] == 0
        and s["committed"] == COMMITTED_START
        and s["spent"] == COMMITTED_START
        and s["vaultMUSD"] == 0
        and s["totalCash"] == 0
        and s["ownerMUSD"] >= FUND
    )
    if not start_ok:
        log("start state not as expected, abort")
        sys.exit(1)
    if DRY:
        log("[dry] plan: fund block 3 with 1.3 MUSD; agent pays 0.2 (executes); agent requests 1.1 (pending);")
        log("[dry] owner revokes; agent requests 0.1 (refused, MandateRevoked); owner approves pending 1.1")
        log("[dry] (refused, MandateRevoked); owner cancels pending 1.1; owner sweeps 1.1 back to owner")
        return

    # 1. Fund block 3
    send("owner approves vault for 1.3 MUSD", OWNER, MUSD, "approve(address,uint256)", [V, FUND], "ok")
    send("owner funds block 3 with 1.3 MUSD", OWNER, V, "fundPocket(uint256,uint256)", [BLOCK, FUND], "ok")
    s = state()
    show("after funding", s)
    expect("block 3 cash is 1.3", s["cash"] == FUND)
    expect("vault MUSD equals tracked cash", s["vaultMUSD"] == s["totalCash"] == FUND)

    # 2. Payment inside the mandate, under the threshold: executes now
    before = state()
    send("agent pays 0.2 MUSD to vendor (under the 1.0 threshold)", AGENT, V, REQ_SIG,
         [BLOCK, VENDOR, PAY_NOW, ev("INV-005")], "ok")
    s = state()
    p3 = payment(3)
    expect("payment 3 executed for 0.2 MUSD", p3["status"] == 2 and p3["amount"] == PAY_NOW)
    expect("block 3 cash is 1.1 after the payment", s["cash"] == FUND - PAY_NOW)
    expect("vendor received 0.2 MUSD", s["vendorMUSD"] == before["vendorMUSD"] + PAY_NOW)

    # 3. Payment above the threshold: reserves cash and waits for owner approval
    send("agent requests 1.1 MUSD (above threshold, waits for owner)", AGENT, V, REQ_SIG,
         [BLOCK, VENDOR, PENDING, ev("INV-006")], "ok")
    s = state()
    p4 = payment(4)
    expect("payment 4 pending for 1.1 MUSD", p4["status"] == 1 and p4["amount"] == PENDING)
    expect("1.1 MUSD reserved in block 3", s["reserved"] == PENDING)

    # 4. Owner revokes the mandate
    send("owner revokes block 3 mandate", OWNER, V, "revokeMandate(uint256)", [BLOCK], "ok")
    expect("mandate inactive after revocation", not state()["active"])

    # 5. A new request after revocation is refused, though it is inside cap and allowlist
    send("REJECT agent requests 0.1 MUSD after revocation", AGENT, V, REQ_SIG,
         [BLOCK, VENDOR, REFUSED, ev("INV-007")], "revert", error="MandateRevoked")
    expect("no new payment recorded after the refused request", state()["paymentCount"] == 4)

    # 6. Approving the waiting payment is refused too, because approval re-checks the mandate
    send("REJECT owner approves waiting 1.1 MUSD payment after revocation", OWNER, V, "approvePayment(uint256)",
         [4], "revert", error="MandateRevoked")
    expect("payment 4 still pending after refused approval", payment(4)["status"] == 1)

    # 7. Owner cancels the waiting payment and releases its reservation
    send("owner cancels waiting payment 4", OWNER, V, "cancelPayment(uint256)", [4], "ok")
    s = state()
    expect("payment 4 cancelled", payment(4)["status"] == 3)
    expect("reservation released", s["reserved"] == 0)
    expect("committed back to 1.9 MUSD", s["committed"] == COMMITTED_START + PAY_NOW)

    # 8. Owner sweeps the unspent block 3 cash back to the owner
    owner_before = state()["ownerMUSD"]
    send("owner sweeps unspent 1.1 MUSD from block 3 to owner", OWNER, V, "sweepResidualMUSD(address)", [OWNER], "ok")
    s = state()
    expect("owner received the unspent 1.1 MUSD", s["ownerMUSD"] == owner_before + FUND - PAY_NOW)
    expect("block 3 cash is zero after the sweep", s["cash"] == 0)
    expect("vault MUSD is zero after the sweep", s["vaultMUSD"] == 0 and s["totalCash"] == 0)

    show("final state", state())
    log(f"== revocation done {utc()} ==")


if __name__ == "__main__":
    main()
