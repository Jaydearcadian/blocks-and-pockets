# Blocks & Pockets: judge-ready testnet submission (design)

Written 15 Nov 2026, about 12:15 UTC. Size: small change set, short design.

## Intent and why

The AKINDO Wave 2 deadline is about 15:00 UTC on 15 Nov. That is the 10:00 US Eastern reading of "11/15 10:00 Deadline". Two cached page snapshots agree on it, but AKINDO states no time zone.

The contract is proven on Mezo testnet: 113 transactions on the new vault, 58 succeeded and 55 refused, with an independent checker passing 15 of 15. The submission around it is not ready. Judges are told to look for "it works as expected; users can fully test all features; no clear security flaws", and Wave 2 is ranked against 104 other submissions, with more complete and ready projects scoring higher.

The goal is to make the existing work openable, understandable, and testable by a judge in the time left.

## Goals

1. A public GitHub repo, `blocks-and-pockets`, that a person or an AI can read, build, and verify from a clean clone.
2. A hosted dashboard (GitHub Pages) that a judge can open without installing anything. The first screen explains the product and says how to try it.
3. The deck and the AKINDO form answers show the current numbers.
4. A 2-minute captioned screen recording that follows the pitch script.
5. A final checklist the owner can follow to submit.

## Non-goals

- No contract changes. The deployed vaults stay as they are.
- No mainnet deployment and no real funds.
- No new product features, and no liquidation loss allocation.
- No AKINDO submission by me. I draft, the owner submits.

## Anti-goals (a failure even if it technically works)

- Claiming mainnet, an audit, live users, a built AI agent product, or wallet actions tested with a consumer wallet.
- Presenting testnet transactions as usage.
- A broken or wrong demo link. One broken link devalues the rest.
- Secrets, keystores, or passwords in the repo or the hosted build.

## Constraints

- Time box: everything user-visible must be live by 14:15 UTC. That leaves 45 minutes of buffer before the deadline.
- Cut line: if hosting is not live by 14:15 UTC, fall back to the minimum. That means a public repo with the README, the refreshed deck, and clear local-run steps, with the hosted-demo claim removed from every document.
- Name: "Blocks & Pockets" is a working name and is not trademark-cleared. Documents say so.
- Git author is `root <root@vultr.guest>`. I will not change the identity. The owner can set one with `git config` and run `git commit --amend --reset-author` before the push.
- Needs from the owner, which I cannot invent: team information, Wave 1 history (or "new team"), a one-line business model, and a GitHub login by device code.

## Approaches

| | Approach | Trade-off | Decision |
|---|---|---|---|
| A | Judge-ready testnet: repo hygiene, UI explainer, hosting, deck refresh, video | About 2 hours. Covers the "users can test" criterion. | **Chosen by the owner** |
| B | Minimum: public repo, README, deck refresh | About 1 hour. Misses "users can fully test". | Fallback at the cut line |
| C | Mainnet deployment | Unaudited contract, 0.048 BTC of real collateral, no time to review. AKINDO accepts testnet. | Rejected |

Publishing route (owner's choice): install `gh` in user space, the owner approves a device-code login in their own browser, then I create the repo, push, and enable Pages. No token is pasted into chat.

Video (owner's choice): I record a captioned screen recording of the hosted dashboard. The owner adds a voiceover and uploads it.

## Design of the parts

**Repo hygiene.** Add `README.md` (what it is, what is live, how to build and test, how to verify the live run, honest limits), `AGENTS.md` (commands, layout, rules, what not to touch), `LICENSE` (GPL-3.0, to match the SPDX headers in the contract), and `.env.example` for the dashboard's optional vault and RPC overrides. Commit the live-run evidence: `scripts/live_run.py`, `scripts/live_run_check.py`, the plan, the spec, and `logs/live-run/`. Do not commit `scripts/wallet-e2e/` (dev-only signing bridge), the anvil and fork logs, or any keystore or password path.

**UI explainer.** The hero already says it in one sentence. Add a "Start here" strip near the top with three steps (see what happened, check it against the chain, try it with a testnet wallet), a plain glossary (block, mandate, shared Trove, prefunded slice, operator), and an honest "what you need to try it" note: Mezo testnet wallet, testnet BTC from the faucet, and that opening a Trove group needs 0.048 BTC while a prefunded slice needs only MUSD. Keep the existing sections. Run typecheck, the 96 tests, and the build, then review a screenshot.

**Hosting.** Build with the Vite base path for the repo name and deploy the static output with GitHub Pages. The hosted build points at the demo vault by default and reads the chain live. Verify the live URL in a browser, including that it reads Mezo testnet.

**Deck and form.** Refresh the numbers (113 live transactions, 40 tests, 26 of 30 guards reached, the hosted link and repo link) and rebuild the deck. Update the AKINDO draft and the pitch script to match.

**Video.** Captioned screen recording of the hosted dashboard, about 2 minutes, following `pitch-script.md`. Output as a video file the owner can upload.

## Left to the builder

File layout, exact wording of the README and glossary, caption timing, and the Pages workflow details. Each is my call and goes in the plan.
