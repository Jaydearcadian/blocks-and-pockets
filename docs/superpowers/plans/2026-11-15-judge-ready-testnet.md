# Blocks & Pockets Judge-Ready Testnet Implementation Plan

> **Historical record.** This is the working plan from 15 Nov 2026. Its checkboxes were not ticked as work went on, and some details changed during the build (license is GPL-3.0, deploy-your-own-vault was added later, test counts grew). The README and the code are the current truth.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a public repo and a hosted testnet dashboard in front of AKINDO judges, with current numbers, a deck, a captioned video, and a submission checklist, before the 14:15 UTC cut line.

**Architecture:** No contract changes. Add repo docs and commit the live-run evidence. Add a small "Start here" guide to the existing React dashboard. Build it as a static site and publish it with GitHub Pages from a `gh-pages` branch, so no workflow-scope token is needed.

**Tech Stack:** Solidity 0.8.24 and Foundry (unchanged), React 19, TypeScript, Vite, viem, vitest (node environment, logic tests only), `gh` CLI installed in user space, `agent-browser` for screenshots and the recording.

**Spec:** `docs/superpowers/specs/2026-11-15-judge-ready-testnet-design.md`

## Global Constraints

- Deadline is about 15:00 UTC on 15 Nov. Everything user-visible is live by **14:15 UTC**. If hosting is not live then, fall back to the minimum: public repo, README, refreshed deck, local-run steps, and remove the hosted-demo claim from every document.
- Mezo testnet only (chain 31611). No mainnet, no real funds, no contract changes.
- The name is "Blocks & Pockets", a working name, not trademark-cleared. Repo name is `blocks-and-pockets`. Documents say so.
- Never state: mainnet, audited, live users, a built AI-agent product, or wallet actions tested with a consumer wallet. Say "operator key", not "agent", for the demo. Wallet actions were tested with a test wallet.
- Never print or commit keys, keystores, passwords, or tokens. No git identity changes by me: the author stays `root <root@vultr.guest>`, flagged to the owner.
- No transactions are sent in this plan. `scripts/live_run.py run` sends real testnet transactions and is never run here.
- Do not commit `scripts/wallet-e2e/`, `logs/anvil-fork*.log`, `logs/fork-*`, or `logs/wallet-e2e-*`.
- Numbers come from `logs/live-run/transactions.md` and the cold clone: 113 live transactions (58 succeeded, 55 refused), checker 15 of 15, 26 of 30 guards reached, 40 tests (36 vault plus 4 earlier spike), dashboard 96 tests.
- Dependency limit: no new npm dependencies.

## Review Focus

1. **Subpath hosting:** the site is served from `/blocks-and-pockets/`. A wrong base path gives blank pages or 404 assets. Task 3 loads the live URL in a browser and checks that no request returns 404.
2. **Browser to RPC from another origin:** the hosted page reads `https://rpc.test.mezo.org` from `github.io`. Task 3 checks the CORS preflight first. When the RPC returns null or lags, the page must show its "Could not read" callout and retry, not a blank page.
3. **Visitor with no wallet or the wrong chain:** the page must read fine and must not imply a judge can act on the demo vault. Actions are role-gated to the vault's owner and operator. Task 2 pins the "what you need to try it" copy with a test.
4. **Narrow screen (390 px wide):** the strip and glossary must wrap without horizontal scroll. Task 2 checks a screenshot.
5. **Claims and numbers drifting between documents:** README, UI, deck, form, script, and captions must agree. Task 4 greps each number and each forbidden claim. Task 1 scans for secrets before anything goes public.

---

## File structure

| Path | Responsibility |
|---|---|
| `README.md`, `AGENTS.md`, `LICENSE`, `app/.env.example` | What the project is, how to build, verify, and not break it |
| `.gitignore` | Keep dev-only and scratch files out of commits |
| `app/src/nav.ts` | The section list, shared by the top bar and the guide |
| `app/src/guide.ts` | Pure data for the Start-here strip, glossary, and try-it note |
| `app/src/StartHere.tsx` | Start-here strip and glossary components |
| `app/src/App.tsx`, `app/src/styles.css` | Mount the new components |
| `app/vite.config.ts`, `app/index.html` | Base path from an env var, honest page description |
| `scripts/deploy-pages.sh` | Build and push `app/dist` to `gh-pages` |
| `/root/moneyblocks-research/submission/` | Deck, form draft, script, video, checklist (outside the repo) |

---

### Task 0: Start the GitHub login early

The owner must approve a device code, so this runs first and waits while other tasks proceed.

**Files:** none in the repo.

**Interfaces:**
- Produces: an authenticated `gh` at `/root/.local/bin/gh` with scope `repo`. Task 3 uses it.

- [ ] **Step 1: Install gh in user space.** Download the latest `linux_amd64` tarball and the checksums file from `https://github.com/cli/cli/releases/latest`, verify the SHA-256, extract `bin/gh` to `/root/.local/bin/gh`. Run: `/root/.local/bin/gh --version`. Expected: a version string, exit 0.
- [ ] **Step 2: Start the device login.** Run `gh auth login --hostname github.com --git-protocol https --web --scopes repo` in the background with output to `/tmp/gh-login.log`. Read the one-time code and URL from the log and show them to the owner. Do not ask for a token.
- [ ] **Step 3: Confirm.** After the owner approves, run `gh auth status`. Expected: "Logged in to github.com" with scope `repo`. Record the account name for Task 3. If the owner has not approved by 13:30 UTC, flag it as the main risk to the cut line.

### Task 1: Repo hygiene and evidence commit

**Files:**
- Create: `README.md`, `AGENTS.md`, `LICENSE`, `app/.env.example`
- Modify: `.gitignore`
- Add to git: `scripts/live_run.py`, `scripts/live_run_check.py`, `docs/superpowers/`, `logs/live-run/`, `logs/judge-review/`

**Interfaces:**
- Produces: a clean `git status` and a clean-clone build that Task 3 publishes.

- [ ] **Step 1: Ignore dev-only files.** Append to `.gitignore`: `scripts/wallet-e2e/`, `logs/anvil-fork*.log`, `logs/fork-*`, `logs/wallet-e2e-*`, `app/.env`, `app/.env.local`. Run `git status --short`. Expected: none of those paths listed.
- [ ] **Step 2: Write `LICENSE`.** MIT, copyright "Blocks & Pockets contributors" (my call, the owner can change it). Run `head -3 LICENSE`.
- [ ] **Step 3: Write `app/.env.example`.** Two commented lines: `VITE_VAULT_ADDRESS` (another testnet vault) and `VITE_DEPLOY_BLOCK` (that vault's deploy block). No values that look like secrets.
- [ ] **Step 4: Write `README.md`.** Sections in this order: one-paragraph pitch (copy the dashboard's hero sentence); an honesty box (testnet prototype, unaudited, not for user funds, working name); what is live (the three vault addresses with explorer links, and a link to `logs/live-run/transactions.md` with 113 transactions, 58 succeeded, 55 refused, checker 15 of 15, 26 of 30 guards reached; the four unreached guards named); build and test commands (exact, below); how to re-verify the live run (`python3 scripts/live_run_check.py`, read-only, sends nothing); repo map; limits and what is not built (liquidation loss allocation, audit, hosted wallet testing).
- [ ] **Step 5: Write `AGENTS.md`.** Toolchain (Node 26 with npm, Foundry 1.9 or newer, solc 0.8.24 is downloaded by forge); commands: `forge build`, `forge test` (40 tests, about 45 s, the fork tests need the public RPC), and in `app/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run dev` (port 5173); layout; rules (testnet only; never send transactions or run `scripts/live_run.py run` without the owner's approval; never print keys; keystore and password files live outside the repo; do not change deployed addresses in `app/src/config.ts`); known caveats from the README.
- [ ] **Step 6: Scan for secrets.** Run `git add -N` on the new paths, then `git diff -U0 | rg -n -i 'private.?key|mnemonic|seed phrase|BEGIN [A-Z ]*PRIVATE|password\s*[:=]|ghp_|github_pat_'`. Expected: no matches except words in prose that name the rule. Also list any 64-hex strings that are not transaction hashes or the deploy hash (`git diff -U0 | rg -o '0x[0-9a-fA-F]{64}'`, compare with `logs/live-run/txs.jsonl` hashes). Expected: every one is a public transaction hash.
- [ ] **Step 7: Commit.** Two commits: `Add README, AGENTS.md, license, and env example`, then `Add the live run, its independent checker, and the design and plan`. Each message ends with the Co-authored-by line.
- [ ] **Step 8: Cold-clone check.** `git clone /root/moneyblocks-spike /tmp/cold2`, then run the README's commands verbatim: `forge build`, `forge test`, and in `app/`: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Expected: every exit code 0, 40 forge tests and 96 vitest tests pass. If a command in the README fails, fix the README, not the check.

### Task 2: UI Start-here strip, glossary, and try-it note

**Files:**
- Create: `app/src/nav.ts`, `app/src/guide.ts`, `app/src/guide.test.ts`, `app/src/StartHere.tsx`
- Modify: `app/src/App.tsx` (move `NAV` out, mount `<StartHere />` after `<Hero />`, add the glossary section before Contracts), `app/src/styles.css`, `app/index.html`

**Interfaces:**
- Produces: `NAV: { id: string; label: string }[]` from `nav.ts` (the current list moved verbatim; App still filters out `record` when the vault is not the demo vault).
- Produces from `guide.ts`: `FAUCET_URL: string` (`https://faucet.test.mezo.org`), `TROVE_MIN_BTC: string` (`'0.048'`), `START_STEPS: { title: string; body: string; target: string }[]` (exactly 3), `GLOSSARY: { term: string; meaning: string }[]`, `TRY_NEEDS: string[]`.
- Consumes: `NAV` ids as `target` values in `START_STEPS`.

- [ ] **Step 1: Write the failing tests** in `app/src/guide.test.ts`:
  - `START_STEPS has three steps and every target is a section id in NAV`
  - `glossary defines block, shared block, prefunded slice, mandate, operator, Trove, and approval threshold`
  - `try-it note says opening a Trove group needs 0.048 BTC and a prefunded slice needs MUSD only` (assert on `TROVE_MIN_BTC` and on `TRY_NEEDS` text)
  - `try-it note says actions are limited to the vault's owner and operator wallets` (this pins Review Focus 3; the text must not suggest a judge can act on the demo vault)
- [ ] **Step 2: Run to confirm failure.** Run in `app/`: `npx vitest run src/guide.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `nav.ts` and `guide.ts`.** Copy: step 1 "See what happened" (target the record or blocks section), step 2 "Check it against the chain" (target `record` or `tieouts`, explorer links), step 3 "Try it with a testnet wallet" (target `actions`). Plain words, no jargon beyond the glossary. Faucet note says it is protected by a CAPTCHA.
- [ ] **Step 4: Run tests, expect PASS.** `npx vitest run src/guide.test.ts`.
- [ ] **Step 5: Implement `StartHere.tsx`** exporting `StartHere()` (three-card strip with anchor links) and `Glossary()` (definition list). Mount in `App.tsx`. Add styles that reuse existing tokens and wrap at 390 px. Update `index.html` description to say "dashboard with testnet wallet actions", not "read-only".
- [ ] **Step 6: Verify.** In `app/`: `npm run typecheck`, `npm test`, `npm run build`. Expected: exit 0, all tests pass (96 plus the new ones). Start `npm run dev`, screenshot 1440x900 and 390x844 with `agent-browser` (using the saved `LD_LIBRARY_PATH` under `/root/.cache/dashboard-chrome-libs`), and read both images: the strip is visible on the first screen at 1440 wide, and there is no horizontal scroll at 390 (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] **Step 7: Commit** `Add a Start-here guide and glossary to the dashboard`.

### Task 3: Publish the repo and host the dashboard

**Files:**
- Modify: `app/vite.config.ts` (add `base: process.env.VITE_BASE ?? '/'`, fix the "Local only" comment)
- Create: `scripts/deploy-pages.sh`
- Modify: `README.md` (add the live URL and repo link)

**Interfaces:**
- Consumes: authenticated `gh` from Task 0, the committed tree from Tasks 1 and 2.
- Produces: `https://<account>.github.io/blocks-and-pockets/` serving the build, and the public repo URL. Tasks 4 to 6 use both.

- [ ] **Step 1: Check CORS before relying on it.** `curl -s -D- -o /dev/null -X OPTIONS -H 'Origin: https://example.github.io' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' https://rpc.test.mezo.org`. Expected: an `access-control-allow-origin` header that allows the origin. If it does not, stop and tell the owner: a hosted page cannot read the chain, and the hosted-demo claim must go.
- [ ] **Step 2: Implement `scripts/deploy-pages.sh`.** Builds with `VITE_BASE=/<repo>/`, copies `app/dist` into a temporary worktree on an orphan `gh-pages` branch, commits, and force-pushes only that branch. Takes the repo name as an argument and fails if `gh auth status` fails.
- [ ] **Step 3: Create the repo.** `gh repo create blocks-and-pockets --public --description "<description from the draft>" --source . --remote origin` (without `--push`). Run `git ls-files | wc -l` and `git status --short`; confirm only the approved set is tracked and nothing from the exclusion list is.
- [ ] **Step 4: Push `main`.** `git push -u origin main`. Expected: success.
- [ ] **Step 5: Deploy and enable Pages.** Run `scripts/deploy-pages.sh blocks-and-pockets`, then `gh api -X POST repos/<account>/blocks-and-pockets/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'`. Poll `gh api repos/<account>/blocks-and-pockets/pages --jq .status` until `built`.
- [ ] **Step 6: Verify the live URL in a browser.** `curl -sI` returns 200. Open it with `agent-browser`, wait for network idle, and confirm: the H1 "Blocks & Pockets" is present, a "Block N" chip shows a real block number, the tie-outs section reports 5 of 5 passing, and `agent-browser network requests` shows no 404 and no CORS error. Screenshot the first viewport.
- [ ] **Step 7: Link in the README** (live URL and repo URL), commit `Add the hosted dashboard link`, push, and redeploy only if `app/` changed.

### Task 4: Deck, form draft, and script refresh

Can run in parallel with Tasks 2 and 3 by a worker subagent, because it touches only files outside the repo.

**Files:** `/root/moneyblocks-research/submission/outputs/blocks-and-pockets.pptx`, `/root/moneyblocks-research/akindo-wave2-draft.md`, `/root/moneyblocks-research/submission/pitch-script.md`.

**Interfaces:**
- Consumes: the numbers in Global Constraints; the live URL and repo URL from Task 3 (placeholders until then, filled at the end).

- [ ] **Step 1: Load the `powerpoint` skill** and rebuild the 10-slide deck with current numbers: slide 6 shows 113 live transactions (58 succeeded, 55 refused) and the checker result; slide 8 shows 40 tests, 26 of 30 guards reached, and names the four not reached; slide 9 says the dashboard is hosted on testnet (only if Task 3 passed) and that wallet actions were tested with a test wallet; slide 10 carries the repo and live links. Keep the working-name note.
- [ ] **Step 2: Update the form draft** (`akindo-wave2-draft.md`): testnet link and vault addresses, the 113-transaction table link, hosted URL, repo URL, track, status, and readiness lines; a "what changed" field only if the owner reports a Wave 1 entry; mark team, business model, and Wave 1 as the owner's to fill.
- [ ] **Step 3: Update `pitch-script.md`** so segment 6 and 8 use the new numbers and segment 9 matches the hosted state.
- [ ] **Step 4: Verify.** Render every slide to an image and read slides 1, 6, 8, 9, 10. Then run: `rg -n '\b36 (of 36|tests)|\b37 rows|\b7 refusals' <the three files>` and confirm remaining matches are intentional (the older demo's 37 rows and 7 refusals may stay when labelled as the first demo). Run: `rg -n -i 'mainnet|audited|live users|production' <the three files>` and confirm each hit is a negation or a "next steps" line.

### Task 5: Captioned screen recording

**Files:** `/root/moneyblocks-research/submission/outputs/blocks-and-pockets-pitch.webm`, `/root/moneyblocks-research/submission/record_pitch.py`

**Interfaces:**
- Consumes: the live URL from Task 3 (or the local preview of the same build if hosting is late), and the timed segments in `pitch-script.md`.
- Produces: a silent webm of about 120 seconds, 1440x900, with a caption bar for each script segment.

- [ ] **Step 1: Write `record_pitch.py`.** Drives `agent-browser` through the ten script segments: for each, scroll to the matching section, inject a fixed caption bar with the segment text, wait for the segment's duration. Total wall time must be 120 s plus or minus 5 s.
- [ ] **Step 2: Record.** `agent-browser record start`, run the script, `record stop`. Save one screenshot per caption change to `/root/moneyblocks-research/submission/tmp/video-frames/`.
- [ ] **Step 3: Verify.** The file exists and is larger than 500 KB. Compare script wall time to 120 s. View at least four of the saved frames and confirm captions are readable and match the page section. Note there is no `ffmpeg` here, so the file stays webm and has no audio.

### Task 6: Final checklist

**Files:** `/root/moneyblocks-research/submission/final-checklist.md`

- [ ] **Step 1: Write the checklist** with each AKINDO form field and its final text, the links, the files to upload, the owner's remaining inputs (team, Wave 1, business model, voiceover, YouTube or Loom upload for the video), the `git config` and `--reset-author` commands for the author identity, and the deadline with its unconfirmed time zone.
- [ ] **Step 2: Verify every link.** For each URL in the checklist run `curl -s -o /dev/null -w '%{http_code}'`. Expected: 200 for the repo, Pages URL, explorer vault pages, and `logs/live-run/transactions.md` on GitHub. Run `gh repo view blocks-and-pockets --json visibility`. Expected: `PUBLIC`.
- [ ] **Step 3: Final numbers check.** Re-run `python3 scripts/live_run_check.py` (read-only). Expected: exit 0, 15 of 15 pass. Confirm the owner nonce is still 178 (`cast nonce`), so nothing was sent.

### Task 7 (stretch, only with the owner's OK and only if Tasks 1 to 3 are live by 13:30 UTC): a try-it path for judges

Without this, a judge can read, replay, and verify everything but cannot send a transaction, because actions are limited to a vault's owner and operator and a judge owns no vault.

**Files:**
- Modify: `app/src/config.ts` (resolve the vault from `?vault=0x…&from=<block>` before the env variable; guard for `location` being undefined in tests)
- Create: `app/src/deploy.ts`, `app/src/vaultArtifact.json` (ABI and creation bytecode exported from `forge inspect`), `app/src/config.test.ts`
- Modify: `app/src/ActionsPanel.tsx` (a "Create my vault" card when the connected wallet has no role)

**Interfaces:**
- Produces: `resolveVault(search: string, env: Record<string, string | undefined>): { vault: Address; deployBlock: bigint; isDemo: boolean }` and `deployVault(wallet: WalletConnection): Promise<{ address: Address; block: bigint; hash: Hex }>` that deploys with constructor arguments BorrowerOperations, TroveManager, PriceFeed, MUSD (from `config.ts`), `targetRatioBps` 15000, `approvalThreshold` 1 MUSD, then returns a link `?vault=<address>&from=<block>`.

- [ ] **Step 1: Tests first** in `config.test.ts`: `resolveVault returns the demo vault with no parameters`, `resolveVault accepts a valid ?vault and ?from`, `resolveVault rejects a malformed address and falls back to the demo vault`, `resolveVault prefers the query over the env variable`.
- [ ] **Step 2: Run, expect FAIL. Implement, run, expect PASS.**
- [ ] **Step 3: Verify the artifact.** `forge inspect src/MoneyblocksVault.sol:MoneyblocksVault bytecode` must equal `vaultArtifact.json`'s bytecode (script check, not a vitest).
- [ ] **Step 4: Implement the card and `deployVault`; typecheck, test, build.** The card uses the existing review-before-signing flow in `txflow.ts`.
- [ ] **Step 5: Do not claim it works without a live check.** Deploying from a wallet sends a real testnet transaction, which this plan otherwise avoids. Ask the owner before the first deploy test, and list the result honestly in the README.

---

## Self-review

- **Spec coverage:** repo for people and AIs (Tasks 1, 3); hosted dashboard with an explaining first screen (Tasks 2, 3); current numbers in deck and form (Task 4); captioned recording (Task 5); submission checklist (Task 6); cut line and fallback (Global Constraints, Task 3 Step 1). The spec's "no new product features" is respected; Task 7 is gated and needs the owner's OK.
- **Type consistency:** `NAV` and `START_STEPS.target` ids agree; `resolveVault` returns `deployBlock` as `bigint` like `DEPLOY_BLOCK` in `config.ts`.
- **Proportion:** the plan holds signatures, test names, and commands, not code bodies.

## Schedule (UTC, targets)

| Time | Work |
|---|---|
| 12:35 | Task 0 starts and waits on the owner; Task 4 starts in parallel (worker) |
| 12:40 to 13:05 | Task 1 |
| 13:05 to 13:40 | Task 2 |
| 13:40 to 14:00 | Task 3 |
| 14:00 to 14:15 | Task 5 against the live URL, Task 6 |
| 14:15 | Cut line. If hosting is not live, fall back and edit the documents |
| 14:15 to 14:45 | Buffer and the owner's own inputs |
| 15:00 | AKINDO deadline (time zone unconfirmed) |
