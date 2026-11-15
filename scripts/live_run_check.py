#!/usr/bin/env python3
"""Independent checker for the Mezo testnet live run. Sends nothing.

Shares no code with scripts/live_run.py. It scans blocks over JSON-RPC for every transaction sent by the owner or
operator, takes selectors and event topics from forge inspect of the compiled contract, decodes calldata with cast,
decodes revert data by hand, and replays each refused call at its parent block. It then compares the chain with the
runner's ledger (read as data only) and reads the end state. Writes logs/live-run/transactions.md and .json.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f"{ROOT}/logs/live-run"
LEDGER = f"{OUT}/txs.jsonl"
RPC = "https://rpc.test.mezo.org"
# The RPC answers 403 (Cloudflare 1010) to Python's default user agent.
UA = "moneyblocks-live-check/1.0"
EXPLORER = "https://explorer.test.mezo.org/tx/"
ENV = dict(os.environ, PATH=os.path.expanduser("~/.foundry/bin") + os.pathsep + os.environ.get("PATH", ""))
CAST = shutil.which("cast", path=ENV["PATH"]) or "cast"
FORGE = shutil.which("forge", path=ENV["PATH"]) or "forge"

START_BLOCK = 16794930  # a few blocks before the fresh-vault close (first run transaction at 16794938)
OWNER = "0xa445987238e1e2c56739c68743a150cdacf60db7"
OPERATOR = "0xdb41eb73ee78e2b4fb7fb5aaf877cb49626e2e3e"
ACCOUNTS = {OWNER: "owner", OPERATOR: "operator"}
NEW = "0x4c716be7f97eac8b3dc1c5593649a387751c9835"
FRESH = "0x26c046472294cf3f147e82e36217de68609bc08b"
MUSD = "0x118917a40faf1cd7a13db0ef56c86de7973ac503"
BTC = "0x7b7c000000000000000000000000000000000000"
ROUTER = "0x9a1ff7fe3a0f69959a3fba1f1e5ee18e1a9cd7e9"
TM = "0xe47c80e8c23f6b4a1ae41c34837a0599d5d16bb0"
TARGET_NAMES = {NEW: "new vault", FRESH: "fresh vault", MUSD: "MUSD", BTC: "BTC token", ROUTER: "Router"}

WRITE_FNS = [
    "createMoneyblock", "setRecipient", "grantMandate", "revokeMandate", "setApprovalThreshold", "fundPocket",
    "fundOverhead", "recoverUnallocatedMUSD", "sweepBTC", "requestTransfer", "approvePayment", "cancelPayment",
    "openGroup", "addCollateral", "borrow", "repay", "closeGroup", "sweepResidualMUSD", "accrue",
]
# Argument kinds for display: id, amt (18-decimal token amount), addr, pid, bool, uint, bytes32, str, route.
ARG_KINDS = {
    "createMoneyblock": ["str", "bool", "amt"], "setRecipient": ["id", "addr", "bool"],
    "grantMandate": ["id", "addr", "amt", "amt", "uint"], "revokeMandate": ["id"],
    "setApprovalThreshold": ["amt"], "fundPocket": ["id", "amt"], "fundOverhead": ["amt"],
    "recoverUnallocatedMUSD": ["addr"], "sweepBTC": ["addr"],
    "requestTransfer": ["id", "addr", "amt", "bytes32"], "approvePayment": ["pid"], "cancelPayment": ["pid"],
    "openGroup": ["id", "amt"], "addCollateral": [], "borrow": ["id", "amt"], "repay": ["id", "amt"],
    "closeGroup": [], "sweepResidualMUSD": ["addr"], "accrue": [],
    "approve": ["addr", "amt"], "transfer": ["addr", "amt"], "swapExactTokensForTokens": ["amt", "amt", "route", "addr", "uint"],
}
EXTRA_SIGS = [
    "approve(address,uint256)", "transfer(address,uint256)",
    "swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256)",
]
# Guards the plan says this testnet cannot reach. Listed apart from the reached guards, never counted as covered.
NOT_COVERED = {
    "LedgerDirty": "unreachable through normal flows",
    "PendingRewards": "unreachable through normal flows",
    "TransferFailed": "needs a token that returns false instead of reverting",
    "LedgerMismatch": "needs an outside change to the Trove",
}
# Refusal kinds whose guard is the revert text itself, not a custom error name.
TEXT_GUARDS = ("reason", "panic", "undecoded", "unknown")


def sh(cmd, cwd=None, timeout=240):
    p = subprocess.run(cmd, capture_output=True, text=True, env=ENV, cwd=cwd, timeout=timeout)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def rpc_batch(calls):
    """calls: list of (method, params). Returns one response per call, retrying calls that got no answer."""
    results = [None] * len(calls)
    pending = list(range(len(calls)))
    last_err = ""
    for attempt in range(10):
        if not pending:
            break
        body = [{"jsonrpc": "2.0", "id": i, "method": calls[i][0], "params": calls[i][1]} for i in pending]
        try:
            req = urllib.request.Request(RPC, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                resp = json.loads(r.read())
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"[:200]
            time.sleep(2 * (attempt + 1))
            continue
        if isinstance(resp, dict):
            resp = [resp]
        by_id = {x.get("id"): x for x in resp}
        still = []
        for i in pending:
            x = by_id.get(i)
            if x is not None and (x.get("result") is not None or "error" in x):
                results[i] = x
            else:
                still.append(i)
        pending = still
        if pending:
            time.sleep(2 * (attempt + 1))
    if pending:
        raise RuntimeError(f"RPC gave no answer for {len(pending)} calls: {last_err}")
    return results


def rpc1(method, params):
    return rpc_batch([(method, params)])[0]


def utc_iso(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def fmt_amt(v):
    # Integer arithmetic only: a float here rounds 0.05 to 0.050000000000000003.
    whole, frac = divmod(int(v), 10**18)
    s = f"{whole}.{frac:018d}".rstrip("0").rstrip(".")
    return s if s else "0"


def cread(to, sig, *args):
    rc, out, err = sh([CAST, "call", to, sig, *map(str, args), "--rpc-url", RPC])
    if rc != 0:
        raise RuntimeError(f"read {sig} failed: {err[:200]}")
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def cnum(to, sig, *args):
    return int(cread(to, sig, *args)[0].split()[0])


def load_tables():
    def inspect(kind):
        rc, out, err = sh([FORGE, "inspect", "src/MoneyblocksVault.sol:MoneyblocksVault", kind, "--json"], cwd=ROOT)
        if rc != 0:
            raise RuntimeError(f"forge inspect {kind} failed: {err[:200]}")
        return json.loads(out)

    methods, errors, events = inspect("methods"), inspect("errors"), inspect("events")
    sel = {"0x" + v.lower().replace("0x", ""): k for k, v in methods.items()}
    for sig in EXTRA_SIGS:
        rc, out, _ = sh([CAST, "sig", sig])
        sel[out.strip().lower()] = sig
    esel = {"0x" + v.lower().replace("0x", ""): k for k, v in errors.items()}
    topics = {v.lower(): k for k, v in events.items()}
    return sel, esel, topics, methods, errors, events


def decode_call(sig, data):
    if sig.endswith("()"):
        return []
    rc, out, err = sh([CAST, "calldata-decode", sig, data])
    if rc != 0:
        return [f"decode failed: {err[:120]}"]
    # Strip cast's numeric annotation such as "1000000 [1e6]", but leave an array that starts with "[" alone.
    return [re.sub(r"(?<=\S)\s+\[[^\]]*\]$", "", ln.strip()) for ln in out.splitlines() if ln.strip()]


def decode_revert(data, esel):
    """Returns (name, text). name is 'reason' for Error(string), 'panic' for Panic(uint256), and 'unknown' if the
    selector is not in the ABI."""
    d = data[2:].lower()
    sel, body = "0x" + d[:8], d[8:]
    if sel == "0x08c379a0":
        off = int(body[0:64], 16) * 2
        n = int(body[off:off + 64], 16)
        return "reason", bytes.fromhex(body[off + 64:off + 64 + 2 * n]).decode("utf-8", "replace")
    if sel == "0x4e487b71":
        return "panic", f"Panic(0x{int(body[0:64], 16):x})"
    if sel not in esel:
        return "unknown", f"unknown selector {sel}"
    sig = esel[sel]
    name = sig.split("(")[0]
    types = [t for t in sig[sig.index("(") + 1:-1].split(",") if t]
    words = [body[i:i + 64] for i in range(0, len(body), 64)]
    vals = ["0x" + words[i][-40:] if t == "address" else str(int(words[i], 16)) for i, t in enumerate(types)]
    return name, f"{name}({', '.join(vals)})" if vals else name


def show_args(fn, raw_lines):
    if not raw_lines:
        return "no arguments"
    kinds = ARG_KINDS.get(fn)
    if kinds is None or len(kinds) != len(raw_lines):
        return "; ".join(raw_lines)
    out = []
    for k, v in zip(kinds, raw_lines):
        if k == "amt" and v.isdigit():
            out.append(f"{fmt_amt(v)}")
        elif k == "addr":
            out.append(TARGET_NAMES.get(v.lower(), ACCOUNTS.get(v.lower(), v)))
        else:
            out.append(v)
    return ", ".join(out)


def guard_of(r):
    """The guard a refusal hit: the custom error name, or the revert text for the kinds in TEXT_GUARDS."""
    if r["reason"] in TEXT_GUARDS:
        return r["reason_text"]
    return r["reason"] or "?"


def result_text(r):
    if r["status"] == 1:
        return "ok"
    if r["reason"] == "none":
        return "refused, but the same call did not revert at the parent block"
    if r["reason"] == "reason":
        return f'refused: revert message "{r["reason_text"]}"'
    return f"refused: {r['reason_text']}"


def main():
    t0 = time.time()
    print("loading ABI tables from forge inspect", flush=True)
    sel, esel, topics, methods, errors, events = load_tables()

    head = int(rpc1("eth_blockNumber", [])["result"], 16)
    print(f"scanning blocks {START_BLOCK}..{head} for owner and operator transactions", flush=True)
    nums = list(range(START_BLOCK, head + 1))
    blocks = {}
    for i in range(0, len(nums), 60):
        chunk = nums[i:i + 60]
        for n, x in zip(chunk, rpc_batch([("eth_getBlockByNumber", [hex(n), True]) for n in chunk])):
            blocks[n] = x["result"]
    found = []
    for n in nums:
        for tx in blocks[n]["transactions"]:
            if (tx.get("from") or "").lower() in ACCOUNTS:
                found.append((n, tx))
    receipts = rpc_batch([("eth_getTransactionReceipt", [tx["hash"]]) for _, tx in found])

    ledger = {}
    if os.path.exists(LEDGER):
        with open(LEDGER) as f:
            for ln in f:
                if ln.strip():
                    row = json.loads(ln)
                    if "tx" in row:
                        ledger[row["tx"].lower()] = row

    rows = []
    for idx, ((bn, tx), rec) in enumerate(zip(found, receipts), start=1):
        rcpt = rec["result"]
        status = int(rcpt["status"], 16)
        gas_used = int(rcpt["gasUsed"], 16)
        to = (tx.get("to") or "").lower()
        frm = ACCOUNTS[tx["from"].lower()]
        value = int(tx.get("value", "0x0"), 16)
        data = tx.get("input", "0x")
        if not to:
            fn, args, fn_sig = "constructor", ["6 constructor arguments"], None
        else:
            fn_sig = sel.get(data[:10].lower(), "unknown selector " + data[:10])
            fn = fn_sig.split("(")[0]
            args = show_args(fn, decode_call(fn_sig, data)) if fn_sig in methods or fn_sig in EXTRA_SIGS else [data[:10]]
            args = [args] if isinstance(args, str) else args
        reason_name, reason_text, replay = "", "", ""
        if status == 0 and to:
            rr = rpc1("eth_call", [{"from": tx["from"], "to": tx["to"], "data": data, "value": hex(value)},
                                   hex(bn - 1)])
            if "error" in rr and rr["error"].get("data"):
                reason_name, reason_text = decode_revert(rr["error"]["data"], esel)
                replay = "parent-block replay"
            elif "error" in rr:
                reason_name, reason_text = "undecoded", rr["error"].get("message", "")[:200]
                replay = "parent-block replay"
            else:
                reason_name, reason_text = "none", "replay at the parent block succeeded"
                replay = "parent-block replay"
        ev_names = []
        for lg in rcpt.get("logs", []):
            t0_ = (lg.get("topics") or [""])[0].lower()
            ev_names.append(topics.get(t0_, "unknown").split("(")[0])
        exp = ledger.get(tx["hash"].lower(), {})
        expect = exp.get("expect", "NOT IN LEDGER")
        if expect == "ok":
            match = status == 1
        elif expect.startswith("revert:"):
            want = expect.split(":", 1)[1]
            match = status == 0 and (want == reason_name or want in reason_text)
        else:
            match = False
        rows.append({
            "n": idx, "block": bn, "utc": utc_iso(int(blocks[bn]["timestamp"], 16)), "hash": tx["hash"],
            "from": frm, "to": TARGET_NAMES.get(to, to or "contract creation"), "to_addr": to,
            "fn": fn, "args": args, "value_btc": fmt_amt(value) if value else "", "status": status,
            "gasUsed": gas_used, "reason": reason_name, "reason_text": reason_text, "replay": replay,
            "events": sorted(set(ev_names)), "step": exp.get("label", "NOT IN LEDGER"), "expect": expect,
            "match": match,
        })

    chain_hashes = {r["hash"].lower() for r in rows}
    ledger_hashes = set(ledger)
    only_chain = sorted(chain_hashes - ledger_hashes)
    only_ledger = sorted(ledger_hashes - chain_hashes)
    in_range_ledger = sorted(h for h in ledger_hashes if ledger[h].get("block") and ledger[h]["block"] >= START_BLOCK)

    # End state, read at the chain head.
    vault_reads = {
        "troveActive": cread(NEW, "troveActive()(bool)")[0],
        "totalPrincipal": cnum(NEW, "totalPrincipal()(uint256)"),
        "totalInterest": cnum(NEW, "totalInterest()(uint256)"),
        "overheadPrincipal": cnum(NEW, "overheadPrincipal()(uint256)"),
        "overheadInterest": cnum(NEW, "overheadInterest()(uint256)"),
        "overheadCash": cnum(NEW, "overheadCash()(uint256)"),
        "groupsClosed": cnum(NEW, "groupsClosed()(uint256)"),
        "blockCount": cnum(NEW, "blockCount()(uint256)"),
        "paymentCount": cnum(NEW, "paymentCount()(uint256)"),
        "totalCash": cnum(NEW, "totalCash()(uint256)"),
        "vaultMUSD": cnum(MUSD, "balanceOf(address)(uint256)", NEW),
        "vaultBTC": int(sh([CAST, "balance", NEW, "--rpc-url", RPC])[1].split()[0]),
        "ownerMUSD": cnum(MUSD, "balanceOf(address)(uint256)", OWNER),
        "ownerBTC": int(sh([CAST, "balance", OWNER, "--rpc-url", RPC])[1].split()[0]),
        "operatorBTC": int(sh([CAST, "balance", OPERATOR, "--rpc-url", RPC])[1].split()[0]),
        "trove_status_mezo": cread(TM, "getTroveStatus(address)(uint8)", NEW)[0],
    }
    mezo = cread(TM, "getEntireDebtAndColl(address)(uint256,uint256,uint256,uint256,uint256,uint256)", NEW)
    mezo_vals = [int(x.split()[0]) for x in mezo]
    blocks_end = {}
    for i in range(1, vault_reads["blockCount"] + 1):
        vals = [int(x.split()[0]) for x in cread(NEW, "bucketOf(uint256)(uint256,uint256,uint256,uint256)", i)]
        blocks_end[i] = dict(zip(("cash", "reserved", "principal", "interest"), vals))
    payments_end = {}
    for pid in range(1, vault_reads["paymentCount"] + 1):
        vals = cread(NEW, "payments(uint256)(uint256,address,uint256,bytes32,uint8)", pid)
        payments_end[pid] = {"block": int(vals[0].split()[0]), "to": vals[1], "amount": int(vals[2].split()[0]),
                             "status": int(vals[4].split()[0])}

    checks = []

    def chk(name, cond):
        checks.append({"check": name, "pass": bool(cond)})

    chk("chain scan matches the runner ledger (every owner or operator tx is in the ledger)", not only_chain)
    chk("every runner ledger transaction is on chain", not only_ledger)
    chk("every transaction matches its expectation (ok or the named refusal)", all(r["match"] for r in rows))
    chk("vault trove closed (Mezo status 2, closed by owner)", vault_reads["trove_status_mezo"] == "2")
    chk("Mezo position zero after close", mezo_vals[0] == 0 and mezo_vals[1] == 0 and mezo_vals[2] == 0)
    chk("group ledger zero after close", vault_reads["totalPrincipal"] == 0 and vault_reads["totalInterest"] == 0
        and vault_reads["overheadPrincipal"] == 0 and vault_reads["overheadInterest"] == 0)
    chk("overhead cash swept to zero", vault_reads["overheadCash"] == 0)
    chk("vault MUSD equals tracked cash (both zero after the final sweep)",
        vault_reads["vaultMUSD"] == vault_reads["totalCash"] == 0)
    chk("vault BTC swept to zero", vault_reads["vaultBTC"] == 0)
    chk("every block cash and reservation is zero", all(b["cash"] == 0 and b["reserved"] == 0 for b in blocks_end.values()))
    chk("no payment left pending (status 1)", all(p["status"] != 1 for p in payments_end.values()))
    chk("exactly one group closed on the new vault", vault_reads["groupsClosed"] == 1)

    fresh_state = {
        "troveActive": cread(FRESH, "troveActive()(bool)")[0],
        "groupsClosed": cnum(FRESH, "groupsClosed()(uint256)"),
        "vaultMUSD": cnum(MUSD, "balanceOf(address)(uint256)", FRESH),
        "vaultBTC": int(sh([CAST, "balance", FRESH, "--rpc-url", RPC])[1].split()[0]),
    }

    chk("fresh vault closed: trove inactive, one group closed, MUSD and BTC swept to zero",
        fresh_state["troveActive"] == "false" and fresh_state["groupsClosed"] == 1
        and fresh_state["vaultMUSD"] == 0 and fresh_state["vaultBTC"] == 0)

    # Coverage from the chain: successes and refusals per write function on the new vault.
    cov = {f: {"ok": 0, "refused": {}} for f in WRITE_FNS}
    for r in rows:
        if r["to_addr"] != NEW or r["fn"] not in cov:
            continue
        if r["status"] == 1:
            cov[r["fn"]]["ok"] += 1
        else:
            g = guard_of(r)
            cov[r["fn"]]["refused"][g] = cov[r["fn"]]["refused"].get(g, 0) + 1
    fns_ok = all(cov[f]["ok"] >= 1 for f in WRITE_FNS)
    chk("all 19 write functions succeed at least once on the new vault", fns_ok)

    reached = {}
    for r in rows:
        if r["status"] == 0:
            key = guard_of(r)
            reached[key] = reached.get(key, 0) + 1
    guards = sorted(v.split("(")[0] for v in errors.keys())
    not_reached = [g for g in guards if g not in reached and g not in NOT_COVERED]
    not_covered = [g for g in guards if g in NOT_COVERED and g not in reached]
    refused_rows = [r for r in rows if r["status"] == 0]
    chk("every refusal reverted on chain with the named guard (replay)", all(r["match"] for r in refused_rows))

    summary = {
        "generated_utc": utc_iso(int(time.time())), "chain_head": head, "scan_from": START_BLOCK,
        "transactions": len(rows), "succeeded": sum(1 for r in rows if r["status"] == 1),
        "refused_on_chain": len(refused_rows), "ledger_rows_in_range": len(in_range_ledger),
        "only_on_chain": only_chain, "only_in_ledger": only_ledger, "checks": checks,
        "new_vault_end": vault_reads, "mezo_position_end": mezo_vals, "blocks_end": blocks_end,
        "payments_end": payments_end, "fresh_vault_end": fresh_state, "coverage": cov,
        "guards_reached": reached, "guards_not_reached": not_reached, "guards_not_covered": not_covered,
        "elapsed_s": round(time.time() - t0, 1),
    }
    with open(f"{OUT}/transactions.json", "w") as f:
        json.dump({"summary": summary, "transactions": rows}, f, indent=2, default=str)

    write_md(rows, summary, ledger)
    for c in checks:
        print(("PASS " if c["pass"] else "FAIL ") + c["check"], flush=True)
    print(f"transactions {len(rows)}, succeeded {summary['succeeded']}, refused {summary['refused_on_chain']}, "
          f"ledger rows in range {len(in_range_ledger)}", flush=True)
    print(f"wrote {OUT}/transactions.md and transactions.json", flush=True)
    return 0 if all(c["pass"] for c in checks) else 1


def md_cell(s):
    return str(s).replace("|", "\\|").replace("\n", " ")


def write_md(rows, s, ledger):
    L = []
    L.append("# Live run transactions: Mezo testnet (chain 31611)")
    L.append("")
    L.append(f"Checked at {s['generated_utc']} UTC from chain head {s['chain_head']}. Scan from block {s['scan_from']}. "
             "Every owner and operator transaction in the range is listed. Decoded with forge inspect (selectors, "
             "errors, events) and cast calldata-decode. Refusal reasons come from a replay of the same call at the "
             "parent block, not from a debug trace, which this RPC does not offer.")
    L.append("")
    L.append("## Result")
    L.append("")
    L.append(f"- Transactions: {s['transactions']}. Succeeded (status 1): {s['succeeded']}. Refused on chain "
             f"(status 0): {s['refused_on_chain']}.")
    L.append(f"- Runner ledger rows in range: {s['ledger_rows_in_range']}. On chain only: {len(s['only_on_chain'])}. "
             f"In ledger only: {len(s['only_in_ledger'])}" + (f" ({', '.join(s['only_in_ledger'])})" if s["only_in_ledger"] else "") + ".")
    L.append("")
    L.append("| Check | Result |")
    L.append("|---|---|")
    for c in s["checks"]:
        L.append(f"| {md_cell(c['check'])} | {'PASS' if c['pass'] else 'FAIL'} |")
    L.append("")
    v = s["new_vault_end"]
    L.append("## End state")
    L.append("")
    L.append(f"- New vault {NEW}: trove status {v['trove_status_mezo']} (2 = closed by owner), groups closed "
             f"{v['groupsClosed']}, vault MUSD {fmt_amt(v['vaultMUSD'])}, vault BTC {fmt_amt(v['vaultBTC'])}.")
    L.append(f"- Owner: {fmt_amt(v['ownerMUSD'])} MUSD, {fmt_amt(v['ownerBTC'])} BTC. Operator: {fmt_amt(v['operatorBTC'])} BTC.")
    fv = s["fresh_vault_end"]
    L.append(f"- Fresh vault {FRESH}: trove active {fv['troveActive']}, groups closed {fv['groupsClosed']}, "
             f"MUSD {fmt_amt(fv['vaultMUSD'])}, BTC {fmt_amt(fv['vaultBTC'])}.")
    L.append("")
    L.append("## Coverage of the 19 write functions (new vault, chain evidence)")
    L.append("")
    L.append("| Function | Succeeded | Refused on chain (guard (count)) |")
    L.append("|---|---|---|")
    for f in WRITE_FNS:
        c = s["coverage"][f]
        ref = ", ".join(f"{k} ({n})" for k, n in sorted(c["refused"].items())) or "none"
        L.append(f"| {f} | {c['ok']} | {md_cell(ref)} |")
    L.append("")
    L.append("## Guards")
    L.append("")
    L.append("Reached on chain (refused; custom error name, or revert text for other reverts): "
             + ", ".join(f"{k} ({n})" for k, n in sorted(s["guards_reached"].items())))
    L.append("")
    L.append("Not reached on this run: " + (", ".join(s["guards_not_reached"]) or "none"))
    L.append("")
    L.append("Not covered live, stated in advance: "
             + (", ".join(f"{g} ({NOT_COVERED[g]})" for g in s["guards_not_covered"]) or "none"))
    L.append("")
    L.append("## Transactions")
    L.append("")
    L.append("| # | UTC | Block | Step (runner label) | From | To | Function | Arguments | Result | Gas used | Tx |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        result = result_text(r)
        if not r["match"]:
            result += " [MISMATCH with expectation]"
        args = r["args"] if isinstance(r["args"], str) else ", ".join(r["args"])
        if r["value_btc"]:
            args = (args + "; " if args else "") + f"value {r['value_btc']} BTC"
        L.append(f"| {r['n']} | {r['utc'][11:]} | {r['block']} | {md_cell(r['step'])} | {r['from']} | "
                 f"{md_cell(r['to'])} | {r['fn']} | {md_cell(args)} | {md_cell(result)} | {r['gasUsed']} | "
                 f"[{r['hash'][:10]}…]({EXPLORER}{r['hash']}) |")
    L.append("")
    L.append("## Caveats")
    L.append("")
    L.append("- Refusal reasons are decoded from a replay at the parent block. This RPC has no debug trace, so the replay "
             "shows the revert that the same call hits at that block. It is not a trace of the failed transaction.")
    L.append("- This RPC reports gas used for refused transactions as half the gas limit. Gas costs about 146 wei, so "
             "it does not change any result.")
    L.append("- The checker sends nothing. It reads the chain and the runner's ledger.")
    L.append("- Four refused calls (T4.3, T4.6, T5.9, T8.14) attach 0.0001 BTC. The plan names those refusals without a "
             "BTC amount. The runner uses the 0.048 BTC collateral elsewhere, but the sending wallets held less than that "
             "at those points. A simulation of T4.3 stopped the runner with insufficient balance for transfer "
             "(run.log, 11:12:04), so nothing was sent. Each of the four still reverts with the guard the plan names, "
             "shown in the Result column.")
    with open(f"{OUT}/transactions.md", "w") as f:
        f.write("\n".join(L) + "\n")


if __name__ == "__main__":
    sys.exit(main())
