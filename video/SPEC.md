# SPEC: Blocks & Pockets demo film (storyline A, "One loan, many pockets")

GOAL:    a stranger understands "one Bitcoin loan, split into pockets; a key spends only inside the owner's limits, and the chain refuses the rest", and wants to try it on Mezo testnet.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps.
TIME:    43.5 s x 30 = 1305 frames. No music bed (catalog needs a HeyGen sign-in); bundled Pixabay SFX on visible actions only.

LOOK:    the reference film's look (Axiom demo), not the old dashboard's.
         ground #FFFFFF; three radial blobs, lilac #B9A6F5 and periwinkle #8FA8F8, 900-1200 px, 45-55% opacity at their core, fading to 0, drifting 3-6 px/s.
         ink #1F2330; muted #6B7080; card line #E6E8EF; card = white, 1 px line, 28 px radius, shadow 0 24px 60px rgba(31,35,48,0.10).
         accent violet #6C5CE7: the one highlighted word per title, the primary button, the cursor's target. Executed green #1F9D63. Refused red #E5484D (status, stamp, bar segment only).
         Bitcoin orange #F7931A: Bitcoin prices only ("66,000 USD per BTC"). Never on the coin, the logo or anything else.
         Inter 700 display (titles 72-128 px, -0.04em), Inter 400/700 body 28-44 px, tabular numerals on every number.
OBJECTS: the Trove card (collateral, oracle price, group debt, collateral ratio with its 150% target tick); three block cards (Procurement, Operations, Vendor pocket);
         the Vendor pocket panel (mandate fields, Grant/Revoke button, payment rows with real statuses); a coin with the Bitcoin glyph (violet, not orange);
         a plain arrow cursor 72 px (white fill, ink stroke) with no label: it is the owner or the operator key, never an "agent";
         the mark, rebuilt from app/public/favicon.svg's geometry in the film's palette (no orange, white tile).
MOTION:  enter expo.out / power4.out 0.5-0.7 s; camera power2.inOut 0.6 s; exits power3.in, 40-50% shorter than entrances.
         Titles: per-word grey -> ink 0.08 s apart, or whole-line blur 8 -> 0 in 0.18 s; landed titles never move. List rows stagger 60 ms.
         Clicks: cursor scale 1 -> 0.86 -> 1 over 0.2 s; the click causes the next change on the same frame. No click rings, no bounce on UI.
SHOTS (absolute seconds):
  0.0-2.5   Hook. "One Bitcoin loan" types out (caret blinks). Key tick SFX.
  2.5-3.5   Headline lifts to the top; a coin drops into frame centre (pop on landing).
  3.5-7.4   Coin morphs into the Trove card (whoosh). Header, group debt counts to 2,021.82 MUSD, collateral 0.0480 BTC, oracle price 66,000 USD per BTC (orange), ratio bar fills to 156.7% past the 150% tick.
  7.4-10.0  Title swaps to "One loan, many pockets"; the card's side stats clear for the split.
  10.0-15.0 Name reveal "Blocks & Pockets" per letter. Trove card shrinks left; three real block cards fly out of it; lines draw from the Trove to the two shared blocks only. Cursor clicks Vendor pocket; the card grows into the next world.
  15.0-33.0 Vendor pocket panel. "Give a key a limit": fields fill (1.50 per payment, 3.00 lifetime, Vendor payee, approval above 1.00). Click Grant -> "Mandate active".
            Payment #1 0.50 MUSD Automatic -> Executed. #2 1.20 MUSD Waiting for owner -> cursor approves -> Executed.
            #3 1.60 MUSD: push in, "Refused: 1.60 MUSD is over the 1.50 MUSD per-payment cap" (bass hit). Pull back.
            "The owner can pull the key": click Revoke -> "Revoked". #4 0.10 MUSD -> Refused, mandate revoked. Panel exits (whoosh).
  33.0-38.5 Payoff. "Live run on Mezo testnet, 15 Nov 2026": 113 transactions counts up; bar splits into 58 succeeded / 55 refused on purpose. "26 of 30 custom errors reached on chain."
  38.5-43.5 End card. Riser; mark outline lands; cursor clicks it, fill rises (bass hit); wordmark wipes in; "Try it on Mezo testnet", repo URL, "Testnet only. Not audited." hold 2+ s.
BANNED:  dark void; glow, neon, particles; glass cards; three cards in a row; KPI grid; title over dimmed screenshot; logo docked in a corner; every element fading and sliding up;
         titles that drift after landing; click rings; bounce on UI; orange on anything but a Bitcoin price; the old dashboard's dark look or screenshots of the website;
         the words "agent", "AI", "audited", "mainnet", "live users", "seamless", "unlock", "in seconds".
QA:      t=0 (thumbnail not empty), 1.2, 3.2, 6.8, 9.0, 12.5, 14.6, 18.4, 20.4, 22.8, 25.5, 28.6, 30.5, 35.5, 38.0, 41.5, 43.3.
FACTS:   all numbers from the demo vault checkpoint (block 16,777,231 replay) and the 15 Nov live run in README.md / logs/live-run. Testnet only.
