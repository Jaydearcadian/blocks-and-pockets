import { isAddress } from 'viem';

export const CHAIN_ID = 31611;
// VITE_RPC_URL points a build at a local fork of Mezo testnet for tests. Hosted builds use the public RPC.
export const RPC_URL = (import.meta.env as Record<string, string | undefined>).VITE_RPC_URL?.trim() || 'https://rpc.test.mezo.org';
export const EXPLORER_URL = 'https://explorer.test.mezo.org';
export const POLL_MS = 20_000;

// The dashboard shows the demo vault. A visitor can open another testnet vault with ?vault=0x...&from=<deploy block>,
// and a build can set VITE_VAULT_ADDRESS and VITE_DEPLOY_BLOCK. The query wins over the env variables.
// Payee events are read from the deploy block.
export const DEMO_VAULT = '0xeb5feb3be4252a27fFF7cffdCfd0cE3DbBDD1641' as const;
const DEFAULT_DEPLOY_BLOCK = 16777200n;

type Env = Record<string, string | undefined>;

export function resolveVault(
  search: string,
  env: Env,
): { vault: `0x${string}`; deployBlock: bigint; isDemo: boolean } {
  const params = new URLSearchParams(search);
  const fromQuery = params.get('vault')?.trim();
  const fromEnv = env.VITE_VAULT_ADDRESS?.trim();
  if (fromEnv && !isAddress(fromEnv)) throw new Error('VITE_VAULT_ADDRESS is not an address');

  let vault: `0x${string}` = (fromEnv || DEMO_VAULT) as `0x${string}`;
  let blockText = env.VITE_DEPLOY_BLOCK?.trim();
  if (fromQuery && isAddress(fromQuery)) {
    vault = fromQuery;
    const from = params.get('from')?.trim();
    blockText = from !== undefined && /^\d+$/.test(from) ? from : undefined;
  }
  const deployBlock = blockText && /^\d+$/.test(blockText) ? BigInt(blockText) : DEFAULT_DEPLOY_BLOCK;
  return { vault, deployBlock, isDemo: vault.toLowerCase() === DEMO_VAULT.toLowerCase() };
}

const env = import.meta.env as Env;
const resolved = resolveVault(typeof location === 'undefined' ? '' : location.search, env);
export const VAULT = resolved.vault;
export const IS_DEMO_VAULT = resolved.isDemo;
export const DEPLOY_BLOCK = resolved.deployBlock;

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
