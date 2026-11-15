#!/usr/bin/env python3
"""Live run on Mezo testnet (chain 31611). Plan: docs/superpowers/plans/2026-11-15-live-run.md.

  live_run.py fresh-close   Plan Option A: close the fresh vault 0x26c0... and return its collateral and MUSD.
  live_run.py swap          Buy MUSD with 0.0001 BTC on the testnet pool, only when the owner is short.
  live_run.py deploy        Deploy the new MoneyblocksVault with forge create --broadcast.
  live_run.py run           Plan tasks 2 to 8 on the new vault. Resumes from the ledger.
  live_run.py status        Read-only snapshot of the new vault (or the fresh vault before a deploy).
  Add --dry-run to print the planned sends without sending anything.

Rules enforced by send():
- Every send is simulated with eth_call from its sender first.
- An ok step must simulate as a success. A refusal must simulate to the named error.
  Otherwise the run stops before anything is sent.
- Refusals are sent with an explicit gas limit so they land with status 0. The reason is taken from the
  simulation and replayed at the parent block. This RPC has no debug trace, so the replay is labeled as such.
- Each send is written to logs/live-run/txs.jsonl before its receipt is awaited.
- Keys stay in keystores. cast reads them. This file never prints a key or a password.
"""
import json
import os
import re
import subprocess
import sys
import time
from decimal import Decimal

ROOT = "/root/moneyblocks-spike"
LOGDIR = f"{ROOT}/logs/live-run"
LEDGER = f"{LOGDIR}/txs.jsonl"
RUNLOG = f"{LOGDIR}/run.log"
STATE = f"{LOGDIR}/state.json"
CAST = "/root/.local/bin/cast"
FORGE = "/root/.local/bin/forge"
RPC = "https://rpc.test.mezo.org"
CHAIN = "31611"
ENV = dict(os.environ, PATH="/root/.local/bin:" + os.environ.get("PATH", ""))
DRY = "--dry-run" in sys.argv

OWNER = "0xA445987238e1E2C56739C68743a150CdAcF60db7"
OPERATOR = "0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E"
VENDOR = "0x000000000000000000000000000000000000beef"
UNLISTED = "0x000000000000000000000000000000000000dead"
WALLETS = {
    "owner": (OWNER, "/root/.foundry/keystores/mezo-testnet-vault-test", "/root/.config/mezo/mezo-testnet-vault-test.pass"),
    "operator": (OPERATOR, "/root/.foundry/keystores/mezo-testnet-operator-test", "/root/.config/mezo/mezo-testnet-operator-test.pass"),
}
BO = "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5"
TM = "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0"
PF = "0x86bCF0841622a5dAC14A313a15f96A95421b9366"
MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"
BTC = "0x7b7c000000000000000000000000000000000000"
ROUTER = "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9"
PFAC = "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A"
FRESH = "0x26c046472294Cf3F147e82E36217dE68609bc08B"
PLACEHOLDER = "0x0000000000000000000000000000000000000001"
ZERO = "0x0000000000000000000000000000000000000000"
COLL = 48 * 10**15  # 0.048 BTC
BUF = 10**15  # 0.001 MUSD headroom per block top-up, about 29 minutes of block-1 interest
BUF_OH = 10**14  # 0.0001 MUSD headroom on overhead top-ups
OVERHEAD_MARGIN = 3 * 10**13  # overhead cash funded this far above the interest settled at funding time (about 8 min)
REFUSAL_GAS = 6_000_000  # gas limit for refusals. Gas costs about 146 wei here, so this is not a cost.
OWNER_BTC_TOL = 10**15  # 0.001 BTC allowance for gas paid in BTC on the owner's fresh-close check
DEPLOY_LABEL = "D1 deploy MoneyblocksVault"

CREATE = "createMoneyblock(string,bool,uint256)"
MANDATE = "grantMandate(uint256,address,uint256,uint256,uint64)"
OPEN = "openGroup(uint256,uint256)"
BORROW = "borrow(uint256,uint256)"
REPAY = "repay(uint256,uint256)"
FUNDPOCKET = "fundPocket(uint256,uint256)"
APPROVE = "approve(address,uint256)"
REQUEST = "requestTransfer(uint256,address,uint256,bytes32)"

ERROR_SIGS = [
    "NotOwner()", "NotOperator(uint256)", "ZeroAmount()", "InvalidMandate()", "BlockNotFound(uint256)",
    "BlockNotCross(uint256)", "MandateRevoked(uint256)", "MandateExpired(uint256)",
    "RecipientNotAllowed(uint256,address)", "PerTransactionCapExceeded(uint256,uint256)",
    "MandateTotalCapExceeded(uint256,uint256)", "PocketInsufficient(uint256,uint256,uint256)",
    "BlockDebtCapExceeded(uint256,uint256,uint256)", "GroupCapacityExceeded(uint256,uint256)",
    "GroupNotOpen()", "GroupAlreadyOpen()", "LedgerDirty()", "InterestUnsettled(uint256,uint256,uint256)",
    "RepayExceedsPrincipal(uint256,uint256,uint256)", "DebtNotCovered(uint256,uint256,uint256)",
    "PaymentNotPending(uint256)", "PendingRewards()", "LedgerMismatch()", "CashMismatch()",
    "TransferFailed()", "SendFailed()", "GroupStillOpen()", "NoGroupClosed()",
    "CashReserved(uint256,uint256)", "ZeroAddress()",
]


class Stop(Exception):
    pass


def utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def log(msg):
    line = f"{utc()} {msg}"
    print(line, flush=True)
    if not DRY:
        os.makedirs(LOGDIR, exist_ok=True)
        with open(RUNLOG, "a") as f:
            f.write(line + "\n")


def stop(msg):
    log(f"STOP {msg}")
    raise Stop(msg)


def run(cmd, timeout=240, cwd=None):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, env=ENV, timeout=timeout, cwd=cwd)
    except subprocess.TimeoutExpired:
        return 124, "", "timed out"
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def read_cmd(cmd, tries=6):
    """Retries RPC hiccups such as null responses and timeouts. A revert is final and returned at once."""
    rc, out, err = 1, "", ""
    for attempt in range(tries):
        rc, out, err = run(cmd)
        if rc == 0 or "execution reverted" in err + out:
            return rc, out, err
        time.sleep(2 * (attempt + 1))
    return rc, out, err


def cget(to, sig, *args, blk=None):
    if DRY:
        return ["0"] * 20  # dry run reads nothing from the chain
    cmd = [CAST, "call", to, sig, *map(str, args), "--rpc-url", RPC]
    if blk is not None:
        cmd += ["--block", str(blk)]
    rc, out, err = read_cmd(cmd)
    if rc != 0:
        raise RuntimeError(f"read {sig} failed: {err[:300]}")
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def num(text):
    return int(text.split()[0])


def cnum(to, sig, *args, blk=None):
    return num(cget(to, sig, *args, blk=blk)[0])


def balance(addr):
    if DRY:
        return 0
    rc, out, err = read_cmd([CAST, "balance", addr, "--rpc-url", RPC])
    if rc != 0:
        raise RuntimeError(f"balance failed: {err[:300]}")
    return num(out)


def block_ts():
    if DRY:
        return 1_800_000_000
    rc, out, err = read_cmd([CAST, "block", "latest", "--rpc-url", RPC, "-f", "timestamp"])
    if rc != 0:
        raise RuntimeError(f"block read failed: {err[:300]}")
    return num(out)


def wei(x):
    return str(int(Decimal(str(x)) * 10**18))


def m(x):
    return format(Decimal(int(x)).scaleb(-18), "f")


def ev(text):
    return "0x" + text.encode().hex().ljust(64, "0")


def load_state():
    if os.path.exists(STATE):
        with open(STATE) as f:
            return json.load(f)
    return {}


def save_state(st):
    if DRY:
        return
    os.makedirs(LOGDIR, exist_ok=True)
    with open(STATE, "w") as f:
        json.dump(st, f, indent=2)


def load_ledger():
    rows = {}
    if os.path.exists(LEDGER):
        with open(LEDGER) as f:
            for ln in f:
                if ln.strip():
                    row = json.loads(ln)
                    rows[row["label"]] = row  # the last line for a label is its latest state
    return rows


DONE = load_ledger()
# Step ids (T4.5, FC3, ...) confirmed before this process started. Their checks ran when the step did.
EARLIER = {k.split(" ", 1)[0] for k in DONE}


def append_ledger(rec):
    if DRY:
        return
    os.makedirs(LOGDIR, exist_ok=True)
    with open(LEDGER, "a") as f:
        f.write(json.dumps(rec) + "\n")


_ERRS = {}


def error_table():
    if not _ERRS:
        for sig in ERROR_SIGS:
            rc, out, _ = run([CAST, "sig", sig])
            if rc == 0 and re.fullmatch(r"0x[0-9a-fA-F]{8}", out.strip()):
                _ERRS[out.strip().lower()] = sig
    return _ERRS


def words(hexdata):
    return [hexdata[i:i + 64] for i in range(0, len(hexdata), 64)]


def decode_args(types, body):
    out = []
    ws = words(body)
    for i, t in enumerate(types):
        if i >= len(ws):
            break
        w = ws[i]
        out.append("0x" + w[-40:] if t == "address" else str(int(w, 16)))
    return out


def decode_error_string(body):
    off = int(body[0:64], 16) * 2
    n = int(body[off:off + 64], 16)
    return bytes.fromhex(body[off + 64: off + 64 + 2 * n]).decode("utf-8", "replace")


def revert_info(text):
    """(name, description, args) from a failed call. name is 'reason' for a string revert, 'unknown' if undecoded."""
    m_ = re.search(r'data:\s*"?(0x[0-9a-fA-F]*)"?', text)
    if m_ and len(m_.group(1)) >= 10:
        data = m_.group(1)[2:].lower()
        sel = "0x" + data[:8]
        body = data[8:]
        if sel == "0x08c379a0":
            reason = decode_error_string(body)
            return "reason", reason, [reason]
        sig = error_table().get(sel)
        if sig:
            name = sig.split("(")[0]
            inner = sig[sig.index("(") + 1:-1]
            types = inner.split(",") if inner else []
            args = decode_args(types, body)
            return name, f"{name}({', '.join(args)})" if args else name, args
        return "unknown", f"unknown error selector {sel}", []
    m_ = re.search(r"execution reverted:\s*([^\n]+)", text)
    if m_:
        reason = m_.group(1).split(", data")[0].strip()
        return "reason", reason, [reason]
    return "undecoded", text.strip()[:300], []


def sim(sender, to, sig, args, value=0, blk=None):
    if DRY:
        return False, "", "dry run: no simulation"
    args = [str(a) for a in args]
    cmd = [CAST, "call", to, sig, *args, "--from", sender, "--rpc-url", RPC]
    if value:
        cmd += ["--value", str(value)]
    if blk is not None:
        cmd += ["--block", str(blk)]
    rc, out, err = read_cmd(cmd)
    return rc == 0, out, err + "\n" + out


def sim_settled(sender, to, sig, args, value, expect):
    """Simulates until the answer is stable. Reads can come from an RPC node a block behind the last receipt. A
    refusal needs two matching answers, and a contradiction of the expectation is retried before the run stops."""
    want = expect.split(":", 1)[1] if expect != "ok" else None
    prev = None
    ok, out, text = sim(sender, to, sig, args, value)
    for _ in range(6):
        if expect == "ok":
            if ok:
                return ok, out, text
        else:
            name, desc, _ = revert_info(text) if not ok else ("", "", [])
            consistent = (not ok) and (want in name or want in desc)
            if consistent and prev == (name, desc):
                return ok, out, text
            prev = (name, desc)
        time.sleep(3)
        ok, out, text = sim(sender, to, sig, args, value)
    return ok, out, text


def replay_settled(rec, blk):
    """Replays a refused call at its parent block. Retries while the node gives no answer, so a lagging node is not
    recorded as the cause."""
    ok, out, text = sim(rec["from"], rec["to"], rec["fn"], rec["args"], rec["value"], blk=blk)
    for _ in range(4):
        if ok or "execution reverted" in text:
            break
        time.sleep(3)
        ok, out, text = sim(rec["from"], rec["to"], rec["fn"], rec["args"], rec["value"], blk=blk)
    return ok, out, text


def wait_receipt(tx, tries=100):
    for _ in range(tries):
        rc, out, _ = run([CAST, "receipt", tx, "--rpc-url", RPC, "--json"], timeout=40)
        if rc == 0:
            try:
                r = json.loads(out)
                if r.get("blockNumber"):
                    return r
            except ValueError:
                pass
        time.sleep(3)
    return None


def finish(label, rec, expect):
    """Waits for the receipt, records it, and checks the status and the revert reason against the expectation."""
    r = wait_receipt(rec["tx"])
    if r is None:
        stop(f"[{label}] no receipt yet for {rec['tx']}. It may still land. Check the chain before any rerun.")
    status = int(str(r["status"]), 0)
    bn = int(str(r["blockNumber"]), 0)
    gas_used = int(str(r.get("gasUsed", "0")), 0)
    gas_limit = int(rec.get("gasLimit") or 0)
    if expect == "ok" and status != 1:
        stop(f"[{label}] UNEXPECTED REVERT tx {rec['tx']} block {bn}")
    if expect != "ok" and status != 0:
        stop(f"[{label}] UNEXPECTED SUCCESS tx {rec['tx']} block {bn}")
    replay_name, replay = "", ""
    if status == 0:
        ok2, _, text2 = replay_settled(rec, bn - 1)
        if ok2:
            replay_name = "none"
            replay = "replay at the parent block succeeded, so the on-chain cause is not identified"
        else:
            replay_name, replay, _ = revert_info(text2)
    done = {**rec, "block": bn, "status": status, "gasUsed": gas_used, "replay_name": replay_name,
            "replay": replay, "utc": utc()}
    append_ledger(done)
    DONE[label] = done
    if status == 1:
        log(f"[{label}] OK block {bn} gas {gas_used}")
        return done
    log(f"[{label}] REVERTED block {bn} gas {gas_used}: {rec.get('sim', '')} | replay: {replay}")
    if gas_limit and gas_used >= gas_limit:
        stop(f"[{label}] used its whole gas limit {gas_limit}, so it may be out of gas, not the named guard")
    if expect != "ok":
        want = expect.split(":", 1)[1]
        if want not in replay_name and want not in replay:
            stop(f"[{label}] reverted on chain, but the parent-block replay says '{replay}', not {want}")
    return done


def send(label, who, to, sig, args=(), expect="ok", value=0, gas=None):
    """Simulates, sends, and confirms one transaction. expect is 'ok' or 'revert:<ErrorName>'."""
    args = [str(a) for a in args]
    value = int(value)
    prior = DONE.get(label)
    if prior and "status" in prior:
        log(f"[{label}] already on chain: tx {prior['tx']}, status {prior['status']}, not sent again")
        return prior
    if prior and "tx" in prior:
        log(f"[{label}] sent earlier as {prior['tx']}, no receipt on record, waiting for it")
        return finish(label, prior, expect)
    sender, ks, pw = WALLETS[who]
    if DRY:
        extra = f" value {value}" if value else ""
        log(f"[dry] {label}: {who} -> {sig} {' '.join(args)}{extra} (expect {expect})")
        return {"dry": True, "sim_args": []}

    ok, _, text = sim_settled(sender, to, sig, args, value, expect)
    sim_desc, sim_args = "", []
    if expect == "ok":
        if not ok:
            stop(f"[{label}] simulation reverted, nothing sent: {revert_info(text)[1]}")
    else:
        want = expect.split(":", 1)[1]
        if ok:
            stop(f"[{label}] expected {want}, but the simulation succeeded. Nothing sent.")
        name, sim_desc, sim_args = revert_info(text)
        if want not in name and want not in sim_desc:
            stop(f"[{label}] expected {want}, simulation says {sim_desc}. Nothing sent.")

    # A send logged without a hash keeps its nonce. A rerun reuses that nonce, so the same action cannot land twice.
    if prior and "nonce" in prior:
        nonce = int(prior["nonce"])
        gas = int(prior.get("gasLimit") or 0) or gas
    else:
        rc, out, err = read_cmd([CAST, "nonce", sender, "--rpc-url", RPC])
        if rc != 0 or not out.split():
            stop(f"[{label}] nonce read failed, nothing sent: {err[:200]}")
        nonce = int(out.split()[0])

    if gas is None:
        if expect == "ok":
            ecmd = [CAST, "estimate", to, sig, *args, "--from", sender, "--rpc-url", RPC]
            if value:
                ecmd += ["--value", str(value)]
            rc, est, etext = read_cmd(ecmd)
            if rc != 0 or not est.split():
                stop(f"[{label}] estimate failed, nothing sent: {etext[:200]}")
            gas = int(est.split()[0]) * 3 // 2
        else:
            gas = REFUSAL_GAS

    pend = {"label": label, "who": who, "from": sender, "to": to, "fn": sig, "args": args, "value": value,
            "expect": expect, "gasLimit": gas, "nonce": nonce, "sent_utc": utc(), "sim": sim_desc,
            "sim_args": sim_args}
    append_ledger(pend)
    DONE[label] = pend
    cmd = [CAST, "send", to, sig, *args, "--rpc-url", RPC, "--chain", CHAIN,
           "--keystore", ks, "--password-file", pw, "--async", "--gas-limit", str(gas), "--nonce", str(nonce)]
    if value:
        cmd += ["--value", str(value)]
    rc, out, err = run(cmd)
    tx = out.splitlines()[-1].strip() if out else ""
    if rc != 0 or not re.fullmatch(r"0x[0-9a-fA-F]{64}", tx):
        stop(f"[{label}] no transaction hash. Nonce {nonce} from {sender} stays in the ledger, and a rerun reuses it. "
             f"Check the chain first: {(out + ' ' + err)[:300]}")
    rec = {**pend, "tx": tx}
    append_ledger(rec)
    DONE[label] = rec
    log(f"[{label}] SENT {tx}")
    return finish(label, rec, expect)


def arg_int(rec, idx, default):
    sa = rec.get("sim_args") or []
    return int(sa[idx]) if len(sa) > idx else default


def topup(rec, buf, default):
    """Shortfall from a DebtNotCovered(id, debt, available) simulation, plus headroom."""
    sa = rec.get("sim_args") or []
    if len(sa) == 3:
        return int(sa[1]) - int(sa[2]) + buf
    return default


def earlier_step(name):
    """True when a check belongs to a step that an earlier process confirmed. The chain has moved on since, so a
    point-in-time check for that step is not evaluated again. Invariant checks have no step id and always run."""
    head = name.split(" ", 1)[0]
    return any(head == s or head.startswith(s + ".") or s.startswith(head + ".") for s in EARLIER)


def check(name, cond):
    if DRY:
        return
    if earlier_step(name):
        log(f"  check skipped, its step was confirmed in an earlier run: {name}")
        return
    log(f"  check {'PASS' if cond else 'FAIL'}: {name}")
    if not cond:
        stop(f"check failed: {name}")


def snap(V):
    s = {}
    g = cget(V, "groupPosition()(uint256,uint256,uint256)")
    s["coll"], s["principal"], s["interest"] = num(g[0]), num(g[1]), num(g[2])
    s["active"] = cget(V, "troveActive()(bool)")[0] == "true"
    fields = {
        "totalPrincipal": "totalPrincipal()(uint256)",
        "totalInterest": "totalInterest()(uint256)",
        "ovPrincipal": "overheadPrincipal()(uint256)",
        "ovInterest": "overheadInterest()(uint256)",
        "ovCash": "overheadCash()(uint256)",
        "groupsClosed": "groupsClosed()(uint256)",
        "blockCount": "blockCount()(uint256)",
        "paymentCount": "paymentCount()(uint256)",
        "totalCash": "totalCash()(uint256)",
        "approvalThreshold": "approvalThreshold()(uint256)",
    }
    for key, sig in fields.items():
        s[key] = cnum(V, sig)
    s["vaultMUSD"] = cnum(MUSD, "balanceOf(address)(uint256)", V)
    s["vaultBTC"] = balance(V)
    s["ownerMUSD"] = cnum(MUSD, "balanceOf(address)(uint256)", OWNER)
    s["ownerBTC"] = balance(OWNER)
    s["operatorBTC"] = balance(OPERATOR)
    s["blocks"] = {}
    for i in range(1, s["blockCount"] + 1):
        vals = [num(x) for x in cget(V, "bucketOf(uint256)(uint256,uint256,uint256,uint256)", i)]
        s["blocks"][i] = dict(zip(("cash", "reserved", "principal", "interest"), vals))
    return s


def snap_dry():
    return {"coll": 0, "principal": 0, "interest": 0, "active": False, "totalPrincipal": 0, "totalInterest": 0,
            "ovPrincipal": 0, "ovInterest": 0, "ovCash": 0, "groupsClosed": 0, "blockCount": 4,
            "paymentCount": 0, "totalCash": 0, "approvalThreshold": 0, "vaultMUSD": 0, "vaultBTC": 0,
            "ownerMUSD": 0, "ownerBTC": 0, "operatorBTC": 0,
            "blocks": {i: {"cash": 0, "reserved": 0, "principal": 0, "interest": 0} for i in range(1, 5)}}


def tieout(s):
    b = s["blocks"]
    return [
        ("Mezo principal equals totalPrincipal", s["principal"] == s["totalPrincipal"]),
        ("Mezo interest is at least totalInterest", s["interest"] >= s["totalInterest"]),
        ("block principal plus overhead principal equal totalPrincipal",
         sum(x["principal"] for x in b.values()) + s["ovPrincipal"] == s["totalPrincipal"]),
        ("block interest plus overhead interest equal totalInterest",
         sum(x["interest"] for x in b.values()) + s["ovInterest"] == s["totalInterest"]),
        ("vault MUSD equals tracked cash", s["vaultMUSD"] == s["totalCash"]),
        ("reserved cash never exceeds block cash", all(x["reserved"] <= x["cash"] for x in b.values())),
    ]


def tie(tag, V, strict=True):
    s = snap_dry() if DRY else snap(V)
    if DRY:
        return s
    blocks = ", ".join(f"{i} {m(x['cash'])} (reserved {m(x['reserved'])})" for i, x in s["blocks"].items())
    log(f"-- {tag}: trove active {s['active']}, group {m(s['coll'])} BTC, principal {m(s['principal'])}, "
        f"Mezo interest {s['interest']} wei, settled {s['totalInterest']} wei")
    log(f"   blocks: {blocks}; overhead cash {m(s['ovCash'])}, overhead interest {s['ovInterest']} wei")
    log(f"   vault MUSD {m(s['vaultMUSD'])}, tracked {m(s['totalCash'])}, vault BTC {m(s['vaultBTC'])}; "
        f"owner MUSD {m(s['ownerMUSD'])}, owner BTC {m(s['ownerBTC'])}")
    for name, ok in tieout(s):
        if strict:
            check(name, ok)
        else:
            log(f"  tie-out {'PASS' if ok else 'FAIL'}: {name}")
    return s


def wait_until(ts_target, why):
    if DRY:
        return
    while True:
        now = block_ts()
        if now > ts_target:
            return
        log(f"waiting {ts_target - now + 1} s {why}")
        time.sleep(min(ts_target - now + 1, 30))


def phase_deploy():
    st = load_state()
    if st.get("vault") and "deploy_block" in st:
        log(f"vault already deployed at {st['vault']} in block {st['deploy_block']}, not deployed again")
        return st["vault"]
    if DRY:
        log("[dry] forge create src/MoneyblocksVault.sol:MoneyblocksVault (6 constructor args)")
        return PLACEHOLDER
    if not st.get("vault"):
        ks, pw = WALLETS["owner"][1], WALLETS["owner"][2]
        cmd = [FORGE, "create", "src/MoneyblocksVault.sol:MoneyblocksVault", "--rpc-url", RPC,
               "--keystore", ks, "--password-file", pw, "--broadcast", "--json",
               "--constructor-args", BO, TM, PF, MUSD, "15000", wei("1")]
        rc, out, err = run(cmd, timeout=900, cwd=ROOT)
        found = re.search(r"\{.*\}", out, re.S)
        if rc != 0 or not found:
            stop(f"forge create failed, nothing recorded: {(out + ' ' + err)[-400:]}")
        res = json.loads(found.group(0))
        vault, dtx = res["deployedTo"], res["transactionHash"]
        # Saved before the receipt wait, so a rerun waits for this deploy instead of deploying again.
        st["vault"], st["deploy_tx"] = vault, dtx
        save_state(st)
        rec = {"label": DEPLOY_LABEL, "who": "owner", "from": OWNER, "to": vault,
               "fn": "constructor", "args": [BO, TM, PF, MUSD, "15000", wei("1")], "value": 0, "expect": "ok",
               "tx": dtx, "sent_utc": utc(), "sim": "", "sim_args": []}
        append_ledger(rec)
        DONE[DEPLOY_LABEL] = rec
        log(f"deploy sent: vault {vault}, tx {dtx}")
    prior = DONE.get(DEPLOY_LABEL)
    if not prior or "tx" not in prior or prior["to"].lower() != st["vault"].lower():
        stop("vault recorded in state but its deploy is missing from the ledger. Check the chain before any rerun.")
    done = prior if "status" in prior else finish(DEPLOY_LABEL, prior, "ok")
    vault = st["vault"]
    code = read_cmd([CAST, "code", vault, "--rpc-url", RPC])[1]
    check("contract code present at the deployed address", code not in ("", "0x"))
    checks = [
        ("owner", cget(vault, "owner()(address)")[0].lower() == OWNER.lower()),
        ("targetRatioBps 15000", num(cget(vault, "targetRatioBps()(uint256)")[0]) == 15000),
        ("approvalThreshold 1 MUSD", num(cget(vault, "approvalThreshold()(uint256)")[0]) == 10**18),
        ("borrowerOperations", cget(vault, "borrowerOperations()(address)")[0].lower() == BO.lower()),
        ("troveManager", cget(vault, "troveManager()(address)")[0].lower() == TM.lower()),
        ("priceFeed", cget(vault, "priceFeed()(address)")[0].lower() == PF.lower()),
        ("musd", cget(vault, "musd()(address)")[0].lower() == MUSD.lower()),
    ]
    for name, ok in checks:
        check(f"deployed vault reads back {name}", ok)
    st["deploy_block"] = done["block"]
    save_state(st)
    log(f"vault deployed at {vault} in block {done['block']}")
    return vault


def phase_fresh_close():
    V = FRESH
    pending = "FC1 approve 0.01 MUSD overhead (fresh vault)" not in DONE
    if pending:
        s = tie("fresh vault before close", V)
        check("fresh vault trove is active", s["active"])
        check("fresh vault has not closed before", s["groupsClosed"] == 0)
        coll_before, owner_btc_before = s["coll"], s["ownerBTC"]
    send("FC1 approve 0.01 MUSD overhead (fresh vault)", "owner", MUSD, APPROVE, [V, wei("0.01")])
    send("FC2 fundOverhead 0.01 MUSD (fresh vault)", "owner", V, "fundOverhead(uint256)", [wei("0.01")])
    send("FC3 closeGroup (fresh vault)", "owner", V, "closeGroup()", [])
    s = tie("fresh vault after close", V)
    check("fresh vault trove is closed", not s["active"])
    check("collateral returned to the fresh vault", s["vaultBTC"] == (coll_before if pending else s["vaultBTC"]))
    send("FC4 sweepBTC to owner (fresh vault)", "owner", V, "sweepBTC(address)", [OWNER])
    residue = s["totalCash"]
    owner_musd_before = s["ownerMUSD"]
    send("FC5 sweepResidualMUSD to owner (fresh vault)", "owner", V, "sweepResidualMUSD(address)", [OWNER])
    s = tie("fresh vault after sweeps", V)
    check("fresh vault holds no MUSD and no BTC", s["vaultMUSD"] == 0 and s["vaultBTC"] == 0)
    if pending:
        check("owner BTC rose by the returned collateral, less gas",
              owner_btc_before + coll_before - OWNER_BTC_TOL <= s["ownerBTC"] <= owner_btc_before + coll_before)
        check("owner MUSD rose by the residue", s["ownerMUSD"] == owner_musd_before + residue)
    log(f"fresh vault closed: owner BTC {m(s['ownerBTC'])}, owner MUSD {m(s['ownerMUSD'])}")


def phase_swap():
    musd = cnum(MUSD, "balanceOf(address)(uint256)", OWNER)
    if musd >= int(wei("3.6")) and "SW2 swap 0.0001 BTC for MUSD (testnet pool)" not in DONE:
        log(f"owner holds {m(musd)} MUSD, enough for the run, no swap")
        return
    if cnum(BTC, "allowance(address,address)(uint256)", OWNER, ROUTER) < int(wei("0.0001")):
        send("SW1 approve router to spend 0.0001 BTC", "owner", BTC, APPROVE, [ROUTER, wei("0.0001")])
    st = load_state()
    if "swap_deadline" not in st:
        st["swap_deadline"] = block_ts() + 1200
        save_state(st)
    send("SW2 swap 0.0001 BTC for MUSD (testnet pool)", "owner", ROUTER,
         "swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256)",
         [wei("0.0001"), wei("1"), f"[({BTC},{MUSD},false,{PFAC})]", OWNER, st["swap_deadline"]])
    tie("after swap", FRESH if DRY else load_state().get("vault", FRESH), strict=False)
    log(f"owner MUSD after swap {m(cnum(MUSD, 'balanceOf(address)(uint256)', OWNER))}")


def phase_run(V):
    st = load_state()
    pay = st.setdefault("pay", {})
    pid = {}

    def record_payment(label):
        if label not in pay:
            pay[label] = cnum(V, "paymentCount()(uint256)")
            save_state(st)
        return pay[label]

    L_X = "T7.6 waiting payment X 0.5 MUSD to vendor"
    L_Y = "T7.10 waiting payment Y 0.5 MUSD to vendor"
    L_W = "T7.18 waiting payment W 0.2 MUSD to vendor"
    L_V = "T7.24 waiting payment V 0.2 MUSD to vendor"
    L_P4 = "T7.33 pending payment P4 0.3 MUSD on block 4"

    # Task 2: a refusal before any group opens.
    send("T2.1 refuse sweepResidualMUSD before any group opens", "owner", V,
         "sweepResidualMUSD(address)", [OWNER], expect="revert:NoGroupClosed")
    check("T2 vault owner is the owner wallet", cget(V, "owner()(address)")[0].lower() == OWNER.lower())

    # Task 3: blocks, recipients, mandates.
    send("T3.1 createMoneyblock 1 Procurement (cross, cap 2500)", "owner", V, CREATE, ["Procurement", "true", wei("2500")])
    send("T3.2 createMoneyblock 2 Operations (cross, cap 40)", "owner", V, CREATE, ["Operations", "true", wei("40")])
    send("T3.3 createMoneyblock 3 Vendor pocket (isolated)", "owner", V, CREATE, ["Vendor pocket", "false", "0"])
    send("T3.4 createMoneyblock 4 Short mandate (isolated)", "owner", V, CREATE, ["Short mandate", "false", "0"])
    check("T3 four blocks exist", cnum(V, "blockCount()(uint256)") == 4)
    send("T3.5 refuse createMoneyblock from operator", "operator", V, CREATE, ["Rogue", "false", "0"], expect="revert:NotOwner")
    send("T3.6 setRecipient block 3: vendor allowed", "owner", V, "setRecipient(uint256,address,bool)", [3, VENDOR, "true"])
    send("T3.7 refuse setRecipient from operator", "operator", V, "setRecipient(uint256,address,bool)", [3, VENDOR, "true"], expect="revert:NotOwner")
    send("T3.8 refuse setRecipient on block 99", "owner", V, "setRecipient(uint256,address,bool)", [99, VENDOR, "true"], expect="revert:BlockNotFound")
    if "exp3" not in st:
        st["exp3"] = block_ts() + 30 * 86400
        save_state(st)
    send("T3.9 grantMandate block 3: operator, 1.5 per payment, 5 total, 30 days", "owner", V, MANDATE,
         [3, OPERATOR, wei("1.5"), wei("5"), st["exp3"]])
    send("T3.10 refuse grantMandate with expiry in the past", "owner", V, MANDATE,
         [3, OPERATOR, wei("1.5"), wei("5"), block_ts() - 60], expect="revert:InvalidMandate")
    send("T3.11 refuse grantMandate from operator", "operator", V, MANDATE,
         [3, OPERATOR, wei("1.5"), wei("5"), st["exp3"]], expect="revert:NotOwner")
    tie("after Task 3", V)

    # Task 4: open the group.
    send("T4.1 refuse openGroup on isolated block 3", "owner", V, OPEN, [3, wei("1800")], value=COLL, expect="revert:BlockNotCross")
    send("T4.2 refuse openGroup with no BTC", "owner", V, OPEN, [1, wei("1800")], value=0, expect="revert:ZeroAmount")
    send("T4.3 refuse openGroup from operator", "operator", V, OPEN, [1, wei("1800")], value=int(wei("0.0001")), expect="revert:NotOwner")
    send("T4.4 refuse openGroup on block 2 above its 40 cap", "owner", V, OPEN, [2, wei("1800")], value=COLL, expect="revert:BlockDebtCapExceeded")
    send("T4.5 openGroup on block 1: 1800 MUSD against 0.048 BTC", "owner", V, OPEN, [1, wei("1800")], value=COLL)
    s = tie("after openGroup", V)
    check("T4.5 trove active with 0.048 BTC and 2001.8 MUSD principal",
          s["active"] and s["coll"] == COLL and s["principal"] == int(wei("2001.8")))
    check("T4.5 block 1 holds 1800 cash and 1801.8 principal",
          s["blocks"][1]["cash"] == int(wei("1800")) and s["blocks"][1]["principal"] == int(wei("1801.8")))
    send("T4.6 refuse second openGroup", "owner", V, OPEN, [1, wei("1800")], value=int(wei("0.0001")), expect="revert:GroupAlreadyOpen")

    # Task 5: borrow, collateral, accrual.
    send("T5.1 borrow 20 MUSD into block 2", "owner", V, BORROW, [2, wei("20")])
    if "t5" not in st:
        st["t5"] = block_ts()
        save_state(st)
    tie("after borrow", V)
    send("T5.2 refuse borrow 45 into block 2 (cap 40)", "owner", V, BORROW, [2, wei("45")], expect="revert:BlockDebtCapExceeded")
    send("T5.3 refuse borrow 300 into block 1 (group capacity)", "owner", V, BORROW, [1, wei("300")], expect="revert:GroupCapacityExceeded")
    send("T5.4 refuse borrow into isolated block 3", "owner", V, BORROW, [3, wei("1")], expect="revert:BlockNotCross")
    send("T5.5 refuse borrow of zero", "owner", V, BORROW, [2, "0"], expect="revert:ZeroAmount")
    send("T5.6 refuse borrow from operator", "operator", V, BORROW, [2, wei("20")], expect="revert:NotOwner")
    send("T5.7 addCollateral 0.0005 BTC", "owner", V, "addCollateral()", [], value=int(wei("0.0005")))
    s = tie("after addCollateral", V)
    check("T5.7 collateral is 0.0485 BTC", s["coll"] == COLL + int(wei("0.0005")))
    send("T5.8 refuse addCollateral with no BTC", "owner", V, "addCollateral()", [], value=0, expect="revert:ZeroAmount")
    send("T5.9 refuse addCollateral from operator", "operator", V, "addCollateral()", [], value=int(wei("0.0001")), expect="revert:NotOwner")
    wait_until(st["t5"] + 60, "so interest accrues before the operator calls accrue")
    send("T5.10 accrue from the operator wallet", "operator", V, "accrue()", [])
    s = tie("after accrue", V)
    check("T5.10 interest is settled", s["totalInterest"] > 0)

    # Task 6: pockets, threshold, overhead, repay.
    send("T6.1 approve 1 MUSD for the block 3 pocket", "owner", MUSD, APPROVE, [V, wei("1")])
    send("T6.2 refuse fundPocket of zero", "owner", V, FUNDPOCKET, [3, "0"], expect="revert:ZeroAmount")
    send("T6.3 refuse fundPocket on block 99", "owner", V, FUNDPOCKET, [99, wei("1")], expect="revert:BlockNotFound")
    send("T6.4 refuse fundPocket from operator", "operator", V, FUNDPOCKET, [3, wei("1")], expect="revert:NotOwner")
    send("T6.5 fundPocket block 3 with 1 MUSD", "owner", V, FUNDPOCKET, [3, wei("1")])
    send("T6.6 refuse setApprovalThreshold from operator", "operator", V, "setApprovalThreshold(uint256)", [wei("0.1")], expect="revert:NotOwner")
    send("T6.7 setApprovalThreshold 0.1 MUSD", "owner", V, "setApprovalThreshold(uint256)", [wei("0.1")])
    send("T6.8 refuse repay 0.5 while overhead interest is unfunded", "owner", V, REPAY, [1, wei("0.5")], expect="revert:InterestUnsettled")
    send("T6.9 refuse fundOverhead of zero", "owner", V, "fundOverhead(uint256)", ["0"], expect="revert:ZeroAmount")
    send("T6.10 accrue, so the overhead interest is settled", "owner", V, "accrue()", [])
    s = tie("before overhead funding", V)
    fund_oh = s["ovInterest"] + OVERHEAD_MARGIN if "T6.12 fundOverhead just above the overhead interest" not in DONE else 0
    send("T6.11 approve overhead funding", "owner", MUSD, APPROVE, [V, str(fund_oh)])
    send("T6.12 fundOverhead just above the overhead interest", "owner", V, "fundOverhead(uint256)", [str(fund_oh)])
    if not DRY and "T6.13 repay 0.5 from block 1" not in DONE:
        ok_rep, _, text_rep = sim(OWNER, V, REPAY, [1, wei("0.5")])
        if not ok_rep:
            name, desc, sa = revert_info(text_rep)
            if name == "InterestUnsettled" and len(sa) == 3 and sa[0] == "0":
                extra = max(int(sa[1]) - int(sa[2]) + 10**12, 10**12)
                log(f"repay needs {m(extra)} more overhead for its own settlement, funding it")
                send("T6.12b approve extra overhead funding", "owner", MUSD, APPROVE, [V, str(extra)])
                send("T6.12c fundOverhead extra for the repay settlement", "owner", V, "fundOverhead(uint256)", [str(extra)])
            else:
                stop(f"repay 0.5 failed for an unexpected reason: {desc}")
    send("T6.13 repay 0.5 from block 1", "owner", V, REPAY, [1, wei("0.5")])
    s = tie("after repay", V)
    check("T6.13 settled interest cleared", s["totalInterest"] == 0 and s["ovInterest"] == 0)
    send("T6.14 refuse repay of 2000 (above block 1 principal)", "owner", V, REPAY, [1, wei("2000")], expect="revert:RepayExceedsPrincipal")
    send("T6.15 refuse repay of 25 (Mezo minimum net debt)", "owner", V, REPAY, [1, wei("25")], expect="revert:BorrowerOps")

    # Task 7: payments and owner review.
    send("T7.1 instant payment 0.05 MUSD to vendor (under threshold)", "operator", V, REQUEST,
         [3, VENDOR, wei("0.05"), ev("INV-001")])
    send("T7.2 refuse 1.6 MUSD to vendor (above 1.5 per-payment cap)", "operator", V, REQUEST,
         [3, VENDOR, wei("1.6"), ev("INV-002")], expect="revert:PerTransactionCapExceeded")
    send("T7.3 refuse payment to an unlisted address", "operator", V, REQUEST,
         [3, UNLISTED, wei("0.05"), ev("INV-003")], expect="revert:RecipientNotAllowed")
    send("T7.4 refuse payment of zero", "operator", V, REQUEST, [3, VENDOR, "0", ev("INV-004")], expect="revert:ZeroAmount")
    send("T7.5 refuse request from owner", "owner", V, REQUEST, [3, VENDOR, wei("0.05"), ev("INV-005")], expect="revert:NotOperator")
    send(L_X, "operator", V, REQUEST, [3, VENDOR, wei("0.5"), ev("INV-006")])
    record_payment(L_X)
    send("T7.7 cancel payment X", "owner", V, "cancelPayment(uint256)", [pay[L_X]])
    send("T7.8 refuse cancel of X again", "owner", V, "cancelPayment(uint256)", [pay[L_X]], expect="revert:PaymentNotPending")
    send("T7.9 refuse cancel from operator", "operator", V, "cancelPayment(uint256)", [pay[L_X]], expect="revert:NotOwner")
    send(L_Y, "operator", V, REQUEST, [3, VENDOR, wei("0.5"), ev("INV-007")])
    record_payment(L_Y)
    send("T7.11 refuse 0.46 MUSD (only 0.45 unreserved)", "operator", V, REQUEST,
         [3, VENDOR, wei("0.46"), ev("INV-008")], expect="revert:PocketInsufficient")
    send("T7.12 owner approves payment Y", "owner", V, "approvePayment(uint256)", [pay[L_Y]])
    send("T7.13 refuse approve of Y again", "owner", V, "approvePayment(uint256)", [pay[L_Y]], expect="revert:PaymentNotPending")
    send("T7.14 refuse approve from operator", "operator", V, "approvePayment(uint256)", [pay[L_Y]], expect="revert:NotOwner")
    committed = num(cget(V, "moneyblocks(uint256)(string,bool,bool,uint256,uint256,uint256,uint256,uint256,address,bool,uint64,uint256,uint256,uint256,uint256)", 3)[13])
    send("T7.15 lower block 3 total cap to committed plus 0.05", "owner", V, MANDATE,
         [3, OPERATOR, wei("1.5"), str(committed + int(wei("0.05"))), st["exp3"]])
    send("T7.16 refuse 0.1 MUSD under the lowered total cap", "operator", V, REQUEST,
         [3, VENDOR, wei("0.1"), ev("INV-009")], expect="revert:MandateTotalCapExceeded")
    send("T7.17 restore block 3 total cap to 5", "owner", V, MANDATE, [3, OPERATOR, wei("1.5"), wei("5"), st["exp3"]])
    send(L_W, "operator", V, REQUEST, [3, VENDOR, wei("0.2"), ev("INV-010")])
    record_payment(L_W)
    send("T7.19 revoke block 3 mandate", "owner", V, "revokeMandate(uint256)", [3])
    send("T7.20 refuse approve of W after revoke", "owner", V, "approvePayment(uint256)", [pay[L_W]], expect="revert:MandateRevoked")
    send("T7.21 cancel W", "owner", V, "cancelPayment(uint256)", [pay[L_W]])
    send("T7.22 refuse new request after revoke", "operator", V, REQUEST, [3, VENDOR, wei("0.05"), ev("INV-011")], expect="revert:MandateRevoked")
    send("T7.23 restore block 3 mandate", "owner", V, MANDATE, [3, OPERATOR, wei("1.5"), wei("5"), st["exp3"]])
    send(L_V, "operator", V, REQUEST, [3, VENDOR, wei("0.2"), ev("INV-012")])
    record_payment(L_V)
    send("T7.25 remove vendor from block 3", "owner", V, "setRecipient(uint256,address,bool)", [3, VENDOR, "false"])
    send("T7.26 refuse approve of V after recipient removed", "owner", V, "approvePayment(uint256)", [pay[L_V]], expect="revert:RecipientNotAllowed")
    send("T7.27 cancel V", "owner", V, "cancelPayment(uint256)", [pay[L_V]])
    send("T7.28 restore vendor on block 3", "owner", V, "setRecipient(uint256,address,bool)", [3, VENDOR, "true"])
    if "exp4" not in st:
        st["exp4"] = block_ts() + 300
        save_state(st)
    send("T7.29 grantMandate block 4: operator, 0.5 per payment, 2 total, 300 s", "owner", V, MANDATE,
         [4, OPERATOR, wei("0.5"), wei("2"), st["exp4"]])
    send("T7.30 allow vendor on block 4", "owner", V, "setRecipient(uint256,address,bool)", [4, VENDOR, "true"])
    send("T7.31 approve 0.5 MUSD for the block 4 pocket", "owner", MUSD, APPROVE, [V, wei("0.5")])
    send("T7.32 fundPocket block 4 with 0.5 MUSD", "owner", V, FUNDPOCKET, [4, wei("0.5")])
    send(L_P4, "operator", V, REQUEST, [4, VENDOR, wei("0.3"), ev("INV-013")])
    record_payment(L_P4)
    wait_until(st["exp4"] + 5, "until the block 4 mandate expires")
    send("T7.34 refuse approve of P4 after expiry", "owner", V, "approvePayment(uint256)", [pay[L_P4]], expect="revert:MandateExpired")
    send("T7.35 refuse new request after expiry", "operator", V, REQUEST, [4, VENDOR, wei("0.05"), ev("INV-014")], expect="revert:MandateExpired")
    tie("after Task 7", V)

    # Task 8: close, sweep.
    send("T8.1 refuse sweepResidualMUSD while the group is open", "owner", V, "sweepResidualMUSD(address)", [OWNER], expect="revert:GroupStillOpen")
    send("T8.2 refuse closeGroup from operator", "operator", V, "closeGroup()", [], expect="revert:NotOwner")
    r = send("T8.3 refuse closeGroup while block 1 cannot cover its debt", "owner", V, "closeGroup()", [], expect="revert:DebtNotCovered")
    check("T8.3 refusal names block 1", arg_int(r, 0, 1) == 1)
    x1 = topup(r, BUF, int(wei("1.81")))
    send("T8.4 approve block 1 top-up", "owner", MUSD, APPROVE, [V, str(x1)])
    send("T8.5 fundPocket block 1 for the close", "owner", V, FUNDPOCKET, [1, str(x1)])
    r = send("T8.6 refuse closeGroup while block 2 cannot cover its debt", "owner", V, "closeGroup()", [], expect="revert:DebtNotCovered")
    check("T8.6 refusal names block 2", arg_int(r, 0, 2) == 2)
    x2 = topup(r, BUF, int(wei("0.022")))
    send("T8.7 approve block 2 top-up", "owner", MUSD, APPROVE, [V, str(x2)])
    send("T8.8 fundPocket block 2 for the close", "owner", V, FUNDPOCKET, [2, str(x2)])
    if DRY or not ok_close_now(V):
        r = send("T8.9 refuse closeGroup while overhead cannot cover its interest", "owner", V, "closeGroup()", [], expect="revert:DebtNotCovered")
        check("T8.9 refusal names overhead", arg_int(r, 0, 0) == 0)
        y = topup(r, BUF_OH, int(wei("0.0002")))
        send("T8.10 approve overhead top-up", "owner", MUSD, APPROVE, [V, str(y)])
        send("T8.11 fundOverhead for the interest accrued since the repay", "owner", V, "fundOverhead(uint256)", [str(y)])
    else:
        log("overhead cash already covers its interest, so the overhead refusal is not reachable at this point")
    send("T8.12 closeGroup (blocks and overhead covered)", "owner", V, "closeGroup()", [])
    s = tie("after close", V)
    check("T8.12 trove closed and group ledger at zero",
          not s["active"] and s["totalPrincipal"] == 0 and s["totalInterest"] == 0 and s["ovPrincipal"] == 0)
    send("T8.13 refuse closeGroup after close", "owner", V, "closeGroup()", [], expect="revert:GroupNotOpen")
    send("T8.14 refuse addCollateral after close", "owner", V, "addCollateral()", [], value=int(wei("0.0001")), expect="revert:GroupNotOpen")
    send("T8.15 refuse borrow after close", "owner", V, BORROW, [2, wei("1")], expect="revert:GroupNotOpen")
    send("T8.16 refuse repay after close", "owner", V, REPAY, [1, wei("0.1")], expect="revert:GroupNotOpen")
    send("T8.17 refuse sweepBTC to the MUSD token", "owner", V, "sweepBTC(address)", [MUSD], expect="revert:SendFailed")
    send("T8.18 sweepBTC collateral to owner", "owner", V, "sweepBTC(address)", [OWNER])
    send("T8.19 refuse sweepResidualMUSD while P4 is reserved", "owner", V, "sweepResidualMUSD(address)", [OWNER], expect="revert:CashReserved")
    send("T8.20 cancel P4 (block 4 reserve)", "owner", V, "cancelPayment(uint256)", [pay[L_P4]])
    send("T8.21 owner sends 0.01 MUSD straight to the vault (outside the ledger)", "owner", MUSD, "transfer(address,uint256)", [V, wei("0.01")])
    send("T8.22 refuse sweepResidualMUSD with stray MUSD", "owner", V, "sweepResidualMUSD(address)", [OWNER], expect="revert:CashMismatch")
    send("T8.23 recoverUnallocatedMUSD moves the 0.01 MUSD to owner", "owner", V, "recoverUnallocatedMUSD(address)", [OWNER])
    send("T8.24 recoverUnallocatedMUSD again (moves nothing)", "owner", V, "recoverUnallocatedMUSD(address)", [OWNER])
    send("T8.25 refuse sweepResidualMUSD to the zero address", "owner", V, "sweepResidualMUSD(address)", [ZERO], expect="revert:ZeroAddress")
    s_before = tie("before residual sweep", V)
    send("T8.26 sweepResidualMUSD to owner", "owner", V, "sweepResidualMUSD(address)", [OWNER])
    s = tie("after residual sweep", V)
    check("T8.26 vault MUSD and BTC are zero", s["vaultMUSD"] == 0 and s["vaultBTC"] == 0 and s["totalCash"] == 0)
    send("T8.27 refuse second sweepResidualMUSD", "owner", V, "sweepResidualMUSD(address)", [OWNER], expect="revert:ZeroAmount")
    tie("final", V)
    log(f"final owner MUSD {m(s['ownerMUSD'])}, owner BTC {m(s['ownerBTC'])}; before sweep owner MUSD {m(s_before['ownerMUSD'])}")


def ok_close_now(V):
    """True if closeGroup would succeed right now (simulation only)."""
    ok, _, _ = sim(OWNER, V, "closeGroup()", [])
    return ok


def main():
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    cmd = positional[0] if positional else "status"
    try:
        if cmd == "fresh-close":
            phase_fresh_close()
        elif cmd == "swap":
            phase_swap()
        elif cmd == "deploy":
            phase_deploy()
        elif cmd == "run":
            st = load_state()
            V = st.get("vault") or (PLACEHOLDER if DRY else None)
            if not V:
                stop("no vault recorded. Run deploy first.")
            phase_run(V)
        elif cmd == "status":
            st = load_state()
            tie("status", st.get("vault", FRESH), strict=False)
        else:
            print(__doc__)
            sys.exit(2)
    except (Stop, RuntimeError) as e:
        log(f"run stopped: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
