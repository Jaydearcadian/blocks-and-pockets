import { DEMO_VAULT, LIVE_RUN_VAULT } from './config';

// Copy for the Start-here strip, the glossary, and the "what you need to try it" note.
// Pure data so tests can pin the claims: what a visitor can do on this page is limited by the contract's roles.

export const FAUCET_URL = 'https://faucet.test.mezo.org';
// Smallest BTC collateral that opens a shared Trove group on Mezo testnet (about 1,800 MUSD of debt).
export const TROVE_MIN_BTC = '0.048';

export type StartStep = { title: string; body: string; target: string };

const REPO_URL = 'https://github.com/Jaydearcadian/blocks-and-pockets';

// The replay buttons exist only for the demo vault, so another vault's copy does not mention them.
export function startSteps(isDemo: boolean): StartStep[] {
  return [
    {
      title: 'See what happened',
      body: isDemo
        ? 'Each block card shows its own cash, debt and spending limits. Use the replay buttons to step through the demo.'
        : 'Each block card shows its own cash, debt and spending limits. The payments table lists every request and its result.',
      target: 'blocks',
    },
    {
      title: 'Check it against the chain',
      body: 'Every number is read from Mezo testnet at the block shown. Five tie-out checks compare the vault books with Mezo.',
      target: 'tieouts',
    },
    {
      title: 'Try it with a testnet wallet',
      body: 'Deploy your own vault from a testnet wallet, then review and send owner and operator actions on it. See what you need first.',
      target: 'actions',
    },
  ];
}

export const START_STEPS: StartStep[] = startSteps(true);

export const balancesSubtitle = (isDemo: boolean): string =>
  isDemo ? 'The vault and the two test wallets, at the block shown.' : "The vault and its owner's wallet, at the block shown.";

export type VaultNotice = { title: string; body: string; recordUrl?: string };

// A banner for any vault other than the demo, so a visitor always knows which vault the page is showing.
export function vaultNotice(vault: string): VaultNotice | undefined {
  const v = vault.toLowerCase();
  if (v === DEMO_VAULT.toLowerCase()) return undefined;
  if (v === LIVE_RUN_VAULT.toLowerCase()) {
    return {
      title: 'The live-run vault, closed',
      body: `This is the vault from the 15 Nov live run: 113 transactions on Mezo testnet (58 succeeded, 55 refused on purpose). It was closed and swept to zero at the end, so balances read 0. The payments table and the record below show what happened.`,
      recordUrl: `${REPO_URL}/blob/main/logs/live-run/transactions.md`,
    };
  }
  return {
    title: 'Viewing another vault',
    body: `Vault ${vault}. This is not the demo vault. Only act on a vault you deployed or trust.`,
  };
}

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
  'Actions on a vault are limited to that vault\u2019s owner and operator wallets, so a visitor with another wallet cannot act on the demo vault. Deploy your own vault in the Actions section to act as an owner.',
  `Opening a shared Trove group needs about ${TROVE_MIN_BTC} BTC of testnet collateral and at least 1,800 MUSD of debt.`,
  'A prefunded slice needs MUSD only, plus a little testnet BTC for gas.',
  'The testnet faucet is protected by a CAPTCHA, so amounts are not guaranteed.',
];

export const OWN_VAULT_NOTES: string[] = [
  'This deploys a new copy of the vault contract from your wallet. You become its owner. It costs testnet gas only.',
  'Then you can create blocks, set payees, grant mandates (you can name your own address as the operator), and change the approval threshold.',
  'Moving MUSD needs MUSD in your wallet, and opening a Trove group needs about 0.048 BTC of testnet collateral.',
];
