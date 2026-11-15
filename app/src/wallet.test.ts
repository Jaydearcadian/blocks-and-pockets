import { getAddress } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { AGENT } from './config';
import {
  chooseProvider,
  connectAccount,
  ensureTestnet,
  errorCode,
  isTestnetChain,
  messageOf,
  type Eip1193Provider,
} from './wallet';

// A fake wallet. The handler answers each request, and every method it receives is recorded.
function walletWith(handler: (method: string) => unknown) {
  const calls: string[] = [];
  const provider: Eip1193Provider = {
    request: vi.fn(async ({ method }: { method: string; params?: unknown }) => {
      calls.push(method);
      return handler(method);
    }),
  };
  return { provider, calls };
}

describe('chain checks', () => {
  it('accepts Mezo testnet as hex, decimal text, or a number', () => {
    expect(isTestnetChain('0x7b7b')).toBe(true);
    expect(isTestnetChain('31611')).toBe(true);
    expect(isTestnetChain(31611)).toBe(true);
  });

  it('rejects other chains and values that are not chain IDs', () => {
    expect(isTestnetChain('0x1')).toBe(false);
    expect(isTestnetChain('0x7b7c')).toBe(false);
    expect(isTestnetChain('not a chain')).toBe(false);
    expect(isTestnetChain(undefined)).toBe(false);
  });
});

describe('error helpers', () => {
  it('reads a numeric error code and ignores anything else', () => {
    expect(errorCode({ code: 4001 })).toBe(4001);
    expect(errorCode(new Error('plain'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it('shows the short message, the first line, and at most 240 characters', () => {
    expect(messageOf({ shortMessage: 'Short' })).toBe('Short');
    expect(messageOf(new Error('Line one\nLine two'))).toBe('Line one');
    expect(messageOf('x'.repeat(300))).toHaveLength(240);
  });
});

describe('ensureTestnet', () => {
  it('does nothing when the wallet is already on Mezo testnet', async () => {
    const { provider, calls } = walletWith((method) => (method === 'eth_chainId' ? '0x7b7b' : null));
    await ensureTestnet(provider);
    expect(calls).toEqual(['eth_chainId']);
  });

  it('asks the wallet to switch to Mezo testnet', async () => {
    let chain = '0x1';
    const { provider, calls } = walletWith((method) => {
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') chain = '0x7b7b';
      return null;
    });
    await ensureTestnet(provider);
    expect(calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'eth_chainId']);
  });

  it('adds the chain when the wallet does not know it yet', async () => {
    let chain = '0x1';
    const { provider, calls } = walletWith((method) => {
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error('Unknown chain'), { code: 4902 });
      if (method === 'wallet_addEthereumChain') chain = '0x7b7b';
      return null;
    });
    await ensureTestnet(provider);
    expect(calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_chainId']);
  });

  it('fails when the wallet stays on another chain', async () => {
    const { provider } = walletWith((method) => (method === 'eth_chainId' ? '0x1' : null));
    await expect(ensureTestnet(provider)).rejects.toThrow(/still on chain 0x1/);
  });

  it('passes other errors through, such as a rejected switch', async () => {
    const { provider } = walletWith((method) => {
      if (method === 'eth_chainId') return '0x1';
      throw Object.assign(new Error('User rejected'), { code: 4001 });
    });
    await expect(ensureTestnet(provider)).rejects.toMatchObject({ code: 4001 });
  });
});

describe('connectAccount', () => {
  it('returns the first account in checksum form and the current chain', async () => {
    const { provider } = walletWith((method) => (method === 'eth_requestAccounts' ? [AGENT.toLowerCase()] : '0x7b7b'));
    await expect(connectAccount(provider)).resolves.toEqual({ account: getAddress(AGENT), chainId: '0x7b7b' });
  });

  it('fails when the wallet returns no account', async () => {
    const { provider } = walletWith((method) => (method === 'eth_requestAccounts' ? [] : '0x7b7b'));
    await expect(connectAccount(provider)).rejects.toThrow(/no account/);
  });
});

describe('chooseProvider', () => {
  it('prefers the first announced wallet', () => {
    const first = walletWith(() => null).provider;
    const second = walletWith(() => null).provider;
    expect(
      chooseProvider([
        { id: 'a', name: 'A', provider: first },
        { id: 'b', name: 'B', provider: second },
      ]),
    ).toBe(first);
  });

  it('has no injected fallback outside a browser', () => {
    expect(chooseProvider([])).toBeUndefined();
  });
});
