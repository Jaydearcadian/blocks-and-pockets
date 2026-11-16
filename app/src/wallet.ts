import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { mezoTestnet } from './chain';
import { CHAIN_ID } from './config';

// The part of EIP-1193 the dashboard uses. Method names are plain strings, so wallet-specific calls type-check.
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (value: unknown) => void) => void;
  removeListener?: (event: string, listener: (value: unknown) => void) => void;
};

export const USER_REJECTED = 4001;

// Wallets report chain IDs as hex strings. Decimal strings and numbers are accepted too.
export function isTestnetChain(value: unknown): boolean {
  if (typeof value === 'number') return value === CHAIN_ID;
  if (typeof value !== 'string') return false;
  try {
    return BigInt(value.trim()) === BigInt(CHAIN_ID);
  } catch {
    return false;
  }
}

export function errorCode(err: unknown): number | undefined {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'number' ? code : undefined;
}

// One line for a message on screen. viem's short message is used when there is one.
export function messageOf(err: unknown): string {
  const short = (err as { shortMessage?: unknown } | null | undefined)?.shortMessage;
  const text = typeof short === 'string' ? short : err instanceof Error ? err.message : String(err);
  return text.split('\n')[0].slice(0, 240);
}

// A viem wallet client that signs through the wallet. The account is fixed when the client is made.
export function walletFor(provider: Eip1193Provider, account: Address): WalletClient {
  return createWalletClient({
    account,
    chain: mezoTestnet,
    transport: custom(provider as unknown as Parameters<typeof custom>[0]),
  });
}

export type WalletState = {
  connected: boolean;
  account?: Address;
  provider?: Eip1193Provider;
  chainId?: unknown;
  onTestnet: boolean;
  busy: boolean;
  error?: string;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
};
