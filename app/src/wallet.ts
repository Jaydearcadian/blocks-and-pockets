import { createWalletClient, custom, getAddress, type Address, type WalletClient } from 'viem';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mezoTestnet } from './chain';
import { CHAIN_ID, EXPLORER_URL, RPC_URL } from './config';

// The part of EIP-1193 the dashboard uses. Method names are plain strings, so wallet-specific calls type-check.
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (value: unknown) => void) => void;
  removeListener?: (event: string, listener: (value: unknown) => void) => void;
};

export type AnnouncedProvider = { id: string; name: string; provider: Eip1193Provider };

export const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

export const ADD_CHAIN_PARAMS = {
  chainId: CHAIN_HEX,
  chainName: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER_URL],
};

const USER_REJECTED = 4001;
const UNRECOGNIZED_CHAIN = 4902;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

// Asks the wallet to move to Mezo testnet. Adds the chain when the wallet does not know it yet.
export async function ensureTestnet(provider: Eip1193Provider): Promise<void> {
  if (isTestnetChain(await provider.request({ method: 'eth_chainId' }))) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    if (errorCode(err) !== UNRECOGNIZED_CHAIN) throw err;
    await provider.request({ method: 'wallet_addEthereumChain', params: [ADD_CHAIN_PARAMS] });
  }
  const now = await provider.request({ method: 'eth_chainId' });
  if (!isTestnetChain(now)) {
    throw new Error(`The wallet is still on chain ${String(now)}. Switch it to Mezo testnet (${CHAIN_ID}).`);
  }
}

export async function connectAccount(provider: Eip1193Provider): Promise<{ account: Address; chainId: unknown }> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') {
    throw new Error('The wallet returned no account.');
  }
  return { account: getAddress(accounts[0]), chainId: await provider.request({ method: 'eth_chainId' }) };
}

type AnnounceEvent = CustomEvent<{ info?: { uuid?: string; name?: string }; provider?: Eip1193Provider }>;

// Reports each EIP-6963 wallet on the page, and asks wallets that load later to announce themselves.
export function watchProviders(onAnnounce: (found: AnnouncedProvider) => void): () => void {
  const onEvent = (event: Event) => {
    const detail = (event as AnnounceEvent).detail;
    if (!detail?.provider) return;
    const name = detail.info?.name ?? 'Wallet';
    onAnnounce({ id: detail.info?.uuid ?? name, name, provider: detail.provider });
  };
  window.addEventListener('eip6963:announceProvider', onEvent);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  return () => window.removeEventListener('eip6963:announceProvider', onEvent);
}

// The first announced wallet, otherwise the injected window.ethereum.
export function chooseProvider(announced: AnnouncedProvider[]): Eip1193Provider | undefined {
  if (announced.length > 0) return announced[0].provider;
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
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

type Connection = { provider: Eip1193Provider; account: Address; chainId: unknown };

export function useWallet(): WalletState {
  const announced = useRef<AnnouncedProvider[]>([]);
  const [conn, setConn] = useState<Connection>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(
    () =>
      watchProviders((found) => {
        announced.current = [...announced.current.filter((x) => x.id !== found.id), found];
      }),
    [],
  );

  // Follows account and network changes made inside the wallet.
  const provider = conn?.provider;
  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (value: unknown) => {
      const list = Array.isArray(value) ? (value as string[]) : [];
      setConn((prev) => {
        if (!prev || prev.provider !== provider) return prev;
        return list[0] ? { ...prev, account: getAddress(list[0]) } : undefined;
      });
    };
    const onChain = (chainId: unknown) =>
      setConn((prev) => (prev && prev.provider === provider ? { ...prev, chainId } : prev));
    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, [provider]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      // A wallet that loaded after the page can still answer this request.
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      await pause(150);
      const found = chooseProvider(announced.current);
      if (!found) throw new Error('No wallet found in this browser.');
      const next = await connectAccount(found);
      setConn({ provider: found, account: next.account, chainId: next.chainId });
    } catch (err) {
      setError(errorCode(err) === USER_REJECTED ? 'Connection cancelled in the wallet.' : messageOf(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    if (!conn) return;
    setBusy(true);
    setError(undefined);
    try {
      await ensureTestnet(conn.provider);
      const chainId = await conn.provider.request({ method: 'eth_chainId' });
      setConn((prev) => (prev ? { ...prev, chainId } : prev));
    } catch (err) {
      setError(errorCode(err) === USER_REJECTED ? 'Network switch cancelled in the wallet.' : messageOf(err));
    } finally {
      setBusy(false);
    }
  }, [conn]);

  return {
    connected: conn !== undefined,
    account: conn?.account,
    provider: conn?.provider,
    chainId: conn?.chainId,
    onTestnet: conn !== undefined && isTestnetChain(conn.chainId),
    busy,
    error,
    connect,
    switchNetwork,
  };
}
