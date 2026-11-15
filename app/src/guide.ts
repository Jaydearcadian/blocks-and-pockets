// Copy for the Start-here strip, the glossary, and the "what you need to try it" note.
// Pure data so tests can pin the claims: what a visitor can do on this page is limited by the contract's roles.

export const FAUCET_URL = 'https://faucet.test.mezo.org';
// Smallest BTC collateral that opens a shared Trove group on Mezo testnet (about 1,800 MUSD of debt).
export const TROVE_MIN_BTC = '0.048';

export type StartStep = { title: string; body: string; target: string };

export const START_STEPS: StartStep[] = [
  {
    title: 'See what happened',
    body: 'Each block card shows its own cash, debt and spending limits. Use the replay buttons to step through the demo.',
    target: 'blocks',
  },
  {
    title: 'Check it against the chain',
    body: 'Every number is read from Mezo testnet at the block shown. Five tie-out checks compare the vault books with Mezo.',
    target: 'tieouts',
  },
  {
    title: 'Try it with a testnet wallet',
    body: 'Connect a testnet wallet to review and send owner or operator actions. See what you need before you try.',
    target: 'actions',
  },
];

export type GlossaryEntry = { term: string; meaning: string };

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Trove',
    meaning: 'A Mezo position. Bitcoin is locked as collateral and MUSD, a dollar stablecoin, is borrowed against it.',
  },
  {
    term: 'Block',
    meaning: 'A named bucket of spending money inside the vault, with its own cash, recipients and limits.',
  },
  {
    term: 'Shared block',
    meaning: 'A block that borrows from the one shared Trove. The vault tracks how much debt belongs to each block.',
  },
  {
    term: 'Prefunded slice',
    meaning: 'A block funded with MUSD the owner already holds. It never touches the Trove.',
  },
  {
    term: 'Mandate',
    meaning: 'The owner lets the operator wallet pay a block\u2019s approved recipients, up to a limit, until it is revoked.',
  },
  {
    term: 'Operator',
    meaning: 'A wallet the owner authorises to request payments. In this demo it is a plain key, not an AI product.',
  },
  {
    term: 'Approval threshold',
    meaning: 'Payments above this amount wait until the owner approves them.',
  },
  {
    term: 'Collateral ratio',
    meaning: 'The value of the locked Bitcoin divided by the debt. A higher ratio is safer.',
  },
];

export const TRY_NEEDS: string[] = [
  'Actions on a vault are limited to that vault\u2019s owner and operator wallets, so a visitor with another wallet cannot act on the demo vault.',
  `Opening a shared Trove group needs about ${TROVE_MIN_BTC} BTC of testnet collateral and at least 1,800 MUSD of debt.`,
  'A prefunded slice needs MUSD only, plus a little testnet BTC for gas.',
  'The testnet faucet is protected by a CAPTCHA, so amounts are not guaranteed.',
];
