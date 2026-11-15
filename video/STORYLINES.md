# Blocks & Pockets demo film: three storylines

Reference: "Axiom Product Demo" (Pinterest pin 578149670953750212, 44 s, 16:9).
Grammar taken from it (measured from frames at 2.5 s spacing): white canvas with soft
purple/blue radial blobs, typewriter headline with a blinking caret, a big cursor that clicks
and causes the next shot, real UI pushed in on one panel at a time, list cards stacking in,
one kinetic "Connect with your Community" title, mark then wordmark lockup at the end.
Its content (banking directory, people avatars) is not used.

## Shared look (all three)

The reference's look, not the website's (the website is being retired, so no screenshots of it
and none of its dark styling). White ground #FFFFFF, soft radial blobs in lilac #B9A6F5 and
periwinkle #8FA8F8 at 18 to 25%, light UI cards (white, 1px #E6E8EF border, 16px radius, soft
shadow), ink #1F2330, muted #6B7080, one violet accent #6C5CE7 for the highlighted word and the
cursor's target. Orange #F7931A is used only for Bitcoin prices (e.g. "65,473 USD per BTC") and
nothing else. Display face Inter 500/700, as in the reference's clean sans.

Facts every storyline uses (all from README.md and the live dashboard):
- One Bitcoin-backed loan (a Mezo Trove: BTC collateral, MUSD debt), split into blocks.
- Demo vault checkpoint: group debt 2,021.82 MUSD, collateral ratio 156.7%, cash in blocks 1,820.80 MUSD, 7 refusals on record.
- Blocks: Procurement, Operations (shared Trove), Vendor pocket, Short mandate (prefunded).
- Vendor pocket mandate: 1.50 MUSD per payment, 5.00 lifetime cap, one allowed payee.
- Live run, 15 Nov 2026: 113 transactions, 58 succeeded, 55 refused on purpose, 26 of 30 errors reached on chain.
- Mezo testnet only. Not audited. "Operator key", never "AI agent".

---

## A. One loan, many pockets (recommended: closest to the reference and the easiest pitch to follow)

**Device / form:** the feature as the hook, carried as an object-to-object chain.
One shared Bitcoin loan pours into pockets, an operator key spends inside the limits, the chain says no when it should.

- **First 2 s:** white canvas, blue/teal blobs drifting in. Typewriter: "One Bitcoin loan|" and the caret blinks.
- **Beats:** hook (typewriter, a BTC coin drops into the real Trove card: 2,021.82 MUSD at 156.7%) → reveal (the Trove card splits into the four real block cards, title "Blocks & Pockets") → proof (cursor opens Vendor pocket, grants a mandate: 1.50 per payment, 5.00 cap; the operator key pays the vendor, row turns green) → tension (it tries 2.00 MUSD, the row stamps `PerTransactionCapExceeded`, refused on chain) → payoff (owner clicks Revoke, then the record floods in: 113 transactions, 58 ok, 55 refused on purpose) → claim ("Spend inside the lines") → end card (mark carried in, wordmark wipes, "Try it on Mezo testnet").
- **Look:** the shared look above.
- **Sound:** light electronic bed at ~110 bpm, soft clicks on every cursor press, a low thud on the refusal stamp.
- **Length:** 38 to 44 s.

## B. The no

**Device / form:** the result first, then pull back; a number lands.
Opens on a payment being refused, then rewinds to show why that refusal is the product.

- **First 2 s:** a single payment row slams in, 2.00 MUSD to Vendor, and a red `Refused` stamp hits it on frame 30. Title types under it: "Good."
- **Beats:** hook (the refusal) → tension (what if an operator key could drain your loan?) → reveal (pull back: the row sits inside the Vendor pocket card, inside the vault) → proof (the four limits as four refusals, each a real error name: wrong payee, over per-payment cap, over lifetime cap, revoked) → payoff (the counter climbs to 55 refusals, 58 successes, side by side) → claim ("Every no is on chain") → end card.
- **Look:** the shared look above, with refusal red #E5484D on the stamps only and big tabular numerals.
- **Sound:** tight percussive bed, a stamp hit on each refusal, silence before the payoff count.
- **Length:** 32 to 38 s.

## C. Into the block (the bold one)

**Device / form:** the object is the explanation, as one endless zoom.
The camera never cuts: it dives from a Bitcoin into the Trove, into a block, into a payment, into its explorer record.

- **First 2 s:** a BTC coin fills the frame; the camera pushes into its centre and the coin's ring becomes the Trove card's outline.
- **Beats:** hook (coin) → Trove (collateral and debt read off) → block card (Vendor pocket, its mandate fields light up one by one) → payment row (paid, then a second one refused) → explorer tx (the real live-run transaction, decoded) → pull all the way back out to the dashboard hero → end card.
- **Look:** the shared look above; the zoom trail is the purple/blue blob colours.
- **Sound:** one rising pad that tightens with each zoom level, clicks on each landing.
- **Length:** 30 to 36 s.

---

Assumptions for all three: 1920×1080 at 30 fps, no voiceover, free music and sound effects
(no paid HeyGen voice or avatar), the logo is `app/public/favicon.svg`, and every screen is
rebuilt in the reference style from the real vault data at the demo vault's fixed checkpoint (real labels and numbers, no invented features).
