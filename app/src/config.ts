export const CHAIN_ID = 31611;
export const RPC_URL = 'https://rpc.test.mezo.org';
export const EXPLORER_URL = 'https://explorer.test.mezo.org';
export const POLL_MS = 20_000;
// The vault's deploy block. Payee events are read from here.
export const DEPLOY_BLOCK = 16777200n;

export const VAULT = '0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641' as const;
export const MUSD = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503' as const;
export const PRICE_FEED = '0x86bCF0841622a5dAC14A313a15f96A95421b9366' as const;
export const BORROWER_OPERATIONS = '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5' as const;
export const TROVE_MANAGER = '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0' as const;
export const OWNER = '0xA445987238e1E2C56739C68743a150CdAcF60db7' as const;
export const AGENT = '0xDb41Eb73ee78e2B4fb7fb5aaf877CB49626E2E3E' as const;
export const VENDOR = '0x000000000000000000000000000000000000bEEF' as const;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// Names for the demo's test addresses. Keys are lowercase.
export const KNOWN_NAMES: Record<string, string> = {
  [OWNER.toLowerCase()]: 'Owner (treasury)',
  [AGENT.toLowerCase()]: 'Agent (operator)',
  [VENDOR.toLowerCase()]: 'Vendor (test payee)',
};

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddress(addr: string): string {
  return `${EXPLORER_URL}/address/${addr}`;
}
