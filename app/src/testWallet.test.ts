import { getAddress } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { createTestWallet, isLoopback, parseAccounts, testWalletEnabled } from './testWallet';

const OWNER = getAddress('0xa445987238e1e2c56739c68743a150cdacf60db7');
const OPERATOR = getAddress('0xdb41eb73ee78e2b4fb7fb5aaf877cb49626e2e3e');
const ACCOUNTS = parseAccounts(`${OWNER}, ${OPERATOR}`);

function wallet(over: { startChainId?: number } = {}) {
  const calls: { method: string; params: unknown }[] = [];
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown };
    calls.push({ method: body.method, params: body.params });
    const result = body.method === 'fail_me' ? undefined : `0xresult-${body.method}`;
    const error = body.method === 'fail_me' ? { code: 3, message: 'execution reverted' } : undefined;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result, error }));
  }) as unknown as typeof fetch;
  const w = createTestWallet({ rpcUrl: 'http://127.0.0.1:8545', accounts: ACCOUNTS, chainId: 31611, fetchFn, ...over });
  return { w, calls };
}

describe('when the test wallet is offered', () => {
  it('needs accounts, a loopback RPC and a loopback page', () => {
    expect(testWalletEnabled(ACCOUNTS, 'http://127.0.0.1:8545', '127.0.0.1')).toBe(true);
    expect(testWalletEnabled(ACCOUNTS, 'http://localhost:8545', 'localhost')).toBe(true);
    expect(testWalletEnabled([], 'http://127.0.0.1:8545', '127.0.0.1')).toBe(false);
  });

  it('is never offered against a public RPC or on a hosted page', () => {
    expect(testWalletEnabled(ACCOUNTS, 'https://rpc.test.mezo.org', '127.0.0.1')).toBe(false);
    expect(testWalletEnabled(ACCOUNTS, 'http://127.0.0.1:8545', 'jaydearcadian.github.io')).toBe(false);
    expect(testWalletEnabled(ACCOUNTS, 'not a url', '127.0.0.1')).toBe(false);
  });

  it('recognises loopback names', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('example.com')).toBe(false);
  });

  it('parses a comma list into checksum addresses and rejects a bad address', () => {
    expect(parseAccounts(OWNER.toLowerCase())).toEqual([OWNER]);
    expect(parseAccounts(undefined)).toEqual([]);
    expect(() => parseAccounts('0x1234')).toThrow();
  });
});

describe('test wallet requests', () => {
  it('shows no accounts until the page asks, then the first one', async () => {
    const { w } = wallet();
    expect(await w.request({ method: 'eth_accounts' })).toEqual([]);
    expect(await w.request({ method: 'eth_requestAccounts' })).toEqual([OWNER]);
    expect(await w.request({ method: 'eth_accounts' })).toEqual([OWNER]);
  });

  it('starts on the wrong chain when asked, and refuses to send until it is switched', async () => {
    const { w, calls } = wallet({ startChainId: 1 });
    await w.request({ method: 'eth_requestAccounts' });
    expect(await w.request({ method: 'eth_chainId' })).toBe('0x1');
    const tx = { method: 'eth_sendTransaction', params: [{ from: OWNER, to: OPERATOR }] };
    await expect(w.request(tx)).rejects.toMatchObject({ code: 4901 });
    expect(calls).toEqual([]);
    const changed = vi.fn();
    w.on?.('chainChanged', changed);
    await w.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7b7b' }] });
    expect(changed).toHaveBeenCalledWith('0x7b7b');
    await expect(w.request(tx)).resolves.toBe('0xresult-eth_sendTransaction');
  });

  it('refuses to switch to a chain it does not know', async () => {
    const { w } = wallet();
    await expect(
      w.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] }),
    ).rejects.toMatchObject({ code: 4902 });
  });

  it('sends only from the active account, and follows an account change', async () => {
    const { w, calls } = wallet();
    await w.request({ method: 'eth_requestAccounts' });
    const fromOperator = { method: 'eth_sendTransaction', params: [{ from: OPERATOR }] };
    await expect(w.request(fromOperator)).rejects.toMatchObject({ code: 4100 });
    const changed = vi.fn();
    w.on?.('accountsChanged', changed);
    w.use(1);
    expect(changed).toHaveBeenCalledWith([OPERATOR]);
    await expect(w.request(fromOperator)).resolves.toBe('0xresult-eth_sendTransaction');
    expect(calls).toHaveLength(1);
    expect(() => w.use(5)).toThrow(/No test account/);
  });

  it('does not send before the page connects', async () => {
    const { w } = wallet();
    await expect(
      w.request({ method: 'eth_sendTransaction', params: [{ from: OWNER }] }),
    ).rejects.toMatchObject({ code: 4100 });
  });

  it('passes reads to the node and reports its errors', async () => {
    const { w, calls } = wallet();
    await expect(w.request({ method: 'eth_blockNumber' })).resolves.toBe('0xresult-eth_blockNumber');
    await expect(w.request({ method: 'fail_me' })).rejects.toMatchObject({ code: 3, message: 'execution reverted' });
    expect(calls.map((c) => c.method)).toEqual(['eth_blockNumber', 'fail_me']);
  });

  it('never signs messages', async () => {
    const { w, calls } = wallet();
    await expect(w.request({ method: 'personal_sign', params: ['0x00', OWNER] })).rejects.toMatchObject({ code: 4200 });
    await expect(w.request({ method: 'eth_signTypedData_v4', params: [OWNER, '{}'] })).rejects.toMatchObject({ code: 4200 });
    expect(calls).toEqual([]);
  });

  it('stops listening when asked', async () => {
    const { w } = wallet();
    await w.request({ method: 'eth_requestAccounts' });
    const changed = vi.fn();
    w.on?.('accountsChanged', changed);
    w.removeListener?.('accountsChanged', changed);
    w.use(1);
    expect(changed).not.toHaveBeenCalled();
  });
});
