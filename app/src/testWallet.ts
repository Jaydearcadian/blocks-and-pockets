import { getAddress, toHex, type Address } from 'viem';
import type { Eip1193Provider } from './wallet';

// A keyless test wallet for local runs. It is an EIP-1193 provider that holds no private key. It sends every
// request to a local node (anvil on a fork of Mezo testnet, started with --auto-impersonate), and that node
// signs for the listed addresses. It is only offered when the page and the RPC are both on this machine.

export type TestWalletOptions = {
  rpcUrl: string;
  accounts: Address[];
  chainId: number;
  // The chain the wallet starts on. Defaults to chainId. A different value exercises the switch-network path.
  startChainId?: number;
  fetchFn?: typeof fetch;
};

export type TestWallet = Eip1193Provider & {
  // Makes another listed account the active one and announces it, as a wallet's account switcher would.
  use: (index: number) => void;
};

const BLOCKED = /^(eth_sign|eth_signTypedData|personal_)/;

export function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

export function parseAccounts(text: string | undefined): Address[] {
  return (text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => getAddress(part));
}

// True only when accounts are listed and both the RPC and the page are on loopback.
export function testWalletEnabled(accounts: Address[], rpcUrl: string, pageHost: string): boolean {
  if (accounts.length === 0) return false;
  try {
    return isLoopback(new URL(rpcUrl).hostname) && isLoopback(pageHost);
  } catch {
    return false;
  }
}

function fail(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export function createTestWallet(options: TestWalletOptions): TestWallet {
  const { rpcUrl, accounts, chainId } = options;
  const send = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const listeners: Record<string, ((value: unknown) => void)[]> = {};
  const emit = (event: string, value: unknown) => (listeners[event] ?? []).slice().forEach((fn) => fn(value));
  let active = 0;
  let connected = false;
  let chain = options.startChainId ?? chainId;
  let nextId = 1;

  async function forward(method: string, params: unknown): Promise<unknown> {
    const res = await send(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params: params ?? [] }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { code?: number; message?: string } };
    if (body.error) throw fail(body.error.code ?? -32000, body.error.message ?? 'The node refused the request');
    return body.result;
  }

  return {
    async request({ method, params }) {
      if (BLOCKED.test(method)) throw fail(4200, `The test wallet does not sign messages: ${method}`);
      switch (method) {
        case 'eth_requestAccounts':
          connected = true;
          return [accounts[active]];
        case 'eth_accounts':
          return connected ? [accounts[active]] : [];
        case 'eth_chainId':
          return toHex(chain);
        case 'net_version':
          return String(chain);
        case 'wallet_switchEthereumChain': {
          const wanted = (params as { chainId?: string }[] | undefined)?.[0]?.chainId;
          if (wanted === undefined || BigInt(wanted) !== BigInt(chainId)) {
            throw fail(4902, 'The test wallet only knows the chain it was started for');
          }
          chain = chainId;
          emit('chainChanged', toHex(chain));
          return null;
        }
        case 'wallet_addEthereumChain':
          chain = chainId;
          emit('chainChanged', toHex(chain));
          return null;
        case 'eth_sendTransaction': {
          if (!connected) throw fail(4100, 'The test wallet is not connected');
          if (chain !== chainId) throw fail(4901, 'The wallet is on another network');
          const tx = (params as { from?: string }[] | undefined)?.[0];
          if (!tx?.from || tx.from.toLowerCase() !== accounts[active].toLowerCase()) {
            throw fail(4100, 'The sending account is not the connected account');
          }
          return forward(method, params);
        }
        default:
          return forward(method, params);
      }
    },
    on(event, fn) {
      (listeners[event] ??= []).push(fn);
    },
    removeListener(event, fn) {
      listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
    },
    use(index) {
      if (!Number.isInteger(index) || index < 0 || index >= accounts.length) {
        throw fail(4100, `No test account at index ${index}`);
      }
      active = index;
      if (connected) emit('accountsChanged', [accounts[active]]);
    },
  };
}
