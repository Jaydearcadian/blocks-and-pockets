# Review: Blocks & Pockets demo film

Render: `renders/blocks-and-pockets-demo.mp4`, 43.5 s, 1920x1080, 30 fps, H.264 + AAC, 7.5 MB.

## Creative calls
- Built storyline A ("One loan, many pockets"). B ("The no") and C ("Into the block") are in `STORYLINES.md`.
- Look taken from the reference (white ground, lilac/periwinkle blobs, typewriter opener, big cursor, cards that grow into the next scene, mark-then-wordmark end card), not from the old dashboard.
- Orange #F7931A appears once: the oracle price "66,000 USD per BTC". The coin, the logo and everything else avoid it.
- The mark is `app/public/favicon.svg`'s geometry redrawn in the film's palette (white tile, periwinkle and violet blocks), because the original uses orange and a dark tile.
- The end card points to "Try it on Mezo testnet" and the GitHub repo, since the website is being retired.
- Every number is real: the demo vault's replay checkpoint (group debt 2,021.82 MUSD, 0.0480 BTC, 156.7%, block caps, the Vendor pocket mandate, payments #1 and #2) and the 15 Nov live run (113 / 58 / 55, 26 of 30 errors). The refusal text "1.60 MUSD is over the 1.50 MUSD per-payment cap" is the decoded on-chain refusal. Payment #4's wording ("The owner revoked this mandate") paraphrases the post-revocation refusal in the record.
- The cursor is a plain arrow with no label: the owner or the operator key, never an "agent".

## Measured vs looked at
- `hyperframes check`: passed, 0 errors, 0 warnings (lint, runtime, layout, motion, contrast, craft, audio).
- Looked at: review beat sheet, all four seam strips, phone sheet, and frames at every QA time in `SPEC.md`; six frames decoded from the final MP4.
- Sound: bundled Pixabay SFX only (clicks, pops, whooshes, two bass hits, a riser). Onsets measured in the render line up with the on-screen actions. Nobody has listened to it.
- Music bed: HeyGen catalog track "Minimalist, premium, corporate tech" (75 s), entered at 26 s so its outro lands on the end card, volume 0.5, 1.5 s fade-out. Render measured at -15.2 LUFS integrated, -1.1 dBFS peak.
- No voiceover yet: HeyGen voices need a paid HyperFrames plan on this account; local Kokoro is the free option.

## Weakest shot
- 15.0-15.3 s: the empty panel before its contents arrive reads as a brief blank card.
- The panel's 28-30 px labels are readable at 1080p but small on a phone.

## With more time
- Bigger type in the Vendor pocket panel (fewer fields, or a second punch-in on the mandate fields).
