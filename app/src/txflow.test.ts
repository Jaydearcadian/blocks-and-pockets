import { encodeErrorResult, parseEther, type Hex } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vaultAbi } from './abi';
import { reasonFor } from './chain';
import { OWNER, VENDOR } from './config';
import { decodeRevert, reasonLine, runCall, type Deps } from './txflow';

vi.mock('./chain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chain')>()),
  reasonFor: vi.fn(),
}));

const HASH: Hex = `0x${'ab'.repeat(32)}`;

// The error a node returns when the vault refuses a call with a named error.
function revertedWith(errorName: string, args: readonly unknown[]): Error {
  const data = encodeErrorResult({ abi: vaultAbi, errorName, args } as Parameters<typeof encodeErrorResult>[0]);
  return Object.assign(new Error('execution reverted'), { data });
}

type Opts = {
  musd?: bigint;
  allowance?: bigint;
  btc?: bigint;
  simulateError?: Error;
  walletError?: Error;
  receipt?: 'success' | 'reverted';
};

// Fake clients. Each send the wallet signs is recorded with its function name and gas limit.
function fakeDeps(opts: Opts = {}) {
  const sent: { functionName: string; gas?: bigint }[] = [];
  const publicClient = {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
      functionName === 'balanceOf' ? (opts.musd ?? parseEther('5')) : (opts.allowance ?? 0n),
    ),
    getBalance: vi.fn(async () => opts.btc ?? parseEther('1')),
    simulateContract: vi.fn(async (req: Record<string, unknown>) => {
      if (opts.simulateError) throw opts.simulateError;
      return { request: req };
    }),
    estimateContractGas: vi.fn(async () => 100_000n),
    waitForTransactionReceipt: vi.fn(async () => ({ status: opts.receipt ?? 'success', blockNumber: 42n })),
  };
  const wallet = {
    writeContract: vi.fn(async (req: { functionName: string; gas?: bigint }) => {
      if (opts.walletError) throw opts.walletError;
      sent.push({ functionName: req.functionName, gas: req.gas });
      return HASH;
    }),
  };
  const deps = { publicClient, wallet, account: OWNER, step: () => undefined } as unknown as Deps;
  return { deps, sent, publicClient, wallet };
}

describe('decodeRevert and reasonLine', () => {
  it('reads a named error from the revert data', () => {
    expect(decodeRevert(revertedWith('MandateRevoked', [3n]))).toEqual({ name: 'MandateRevoked', args: [3n] });
  });

  it('keeps the selector when the error is not in the ABI', () => {
    expect(decodeRevert({ data: '0xdeadbeef00' })).toEqual({ raw: '0xdeadbeef' });
  });

  it('has no reason without revert data', () => {
    expect(decodeRevert(new Error('network down'))).toBeUndefined();
  });

  it('writes a named reason with its error name, and an undecoded one with its selector', () => {
    expect(reasonLine({ name: 'MandateRevoked', args: [3n] })).toContain('(MandateRevoked)');
    expect(reasonLine({ raw: '0xdeadbeef' })).toBe('Reverted with an error this dashboard does not decode (0xdeadbeef)');
    expect(reasonLine({ raw: 'replay did not revert' })).toBe('replay did not revert');
  });
});

describe('runCall', () => {
  beforeEach(() => {
    vi.mocked(reasonFor).mockReset();
  });

  it('approves MUSD, then sends the call with 1.5 times the estimated gas', async () => {
    const f = fakeDeps({ musd: parseEther('5'), allowance: 0n });
    const out = await runCall(f.deps, {
      functionName: 'fundPocket',
      args: [3n, parseEther('1')],
      approve: parseEther('1'),
    });
    expect(out).toEqual({ kind: 'confirmed', hash: HASH, block: 42n });
    expect(f.sent.map((s) => s.functionName)).toEqual(['approve', 'fundPocket']);
    expect(f.sent[1].gas).toBe(150_000n);
  });

  it('skips the approval when the allowance already covers the call', async () => {
    const f = fakeDeps({ musd: parseEther('5'), allowance: parseEther('1') });
    await runCall(f.deps, { functionName: 'fundPocket', args: [3n, parseEther('1')], approve: parseEther('1') });
    expect(f.sent.map((s) => s.functionName)).toEqual(['fundPocket']);
  });

  it('refuses before anything is sent when the wallet lacks the MUSD', async () => {
    const f = fakeDeps({ musd: parseEther('0.5') });
    const out = await runCall(f.deps, { functionName: 'fundPocket', args: [3n, parseEther('1')], approve: parseEther('1') });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.text).toContain('0.50 MUSD');
    expect(out.text).toContain('1.00 MUSD');
    expect(f.publicClient.simulateContract).not.toHaveBeenCalled();
    expect(f.wallet.writeContract).not.toHaveBeenCalled();
  });

  it('refuses before anything is sent when the wallet lacks the BTC collateral', async () => {
    const f = fakeDeps({ btc: parseEther('0.01') });
    const out = await runCall(f.deps, {
      functionName: 'openGroup',
      args: [1n, parseEther('1800')],
      value: parseEther('0.041'),
    });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.text).toContain('BTC');
    expect(f.wallet.writeContract).not.toHaveBeenCalled();
  });

  it('refuses a call the vault would revert, with the reason, and sends nothing', async () => {
    const f = fakeDeps({ simulateError: revertedWith('MandateRevoked', [3n]) });
    const out = await runCall(f.deps, { functionName: 'requestTransfer', args: [3n, VENDOR, parseEther('0.1'), ZERO] });
    expect(out.kind).toBe('refused');
    if (out.kind !== 'refused') throw new Error('expected a refusal');
    expect(out.text).toContain('MandateRevoked');
    expect(f.wallet.writeContract).not.toHaveBeenCalled();
  });

  it('reports a rejection in the wallet as cancelled', async () => {
    const f = fakeDeps({ walletError: Object.assign(new Error('User rejected'), { code: 4001 }) });
    const out = await runCall(f.deps, { functionName: 'accrue', args: [] });
    expect(out).toEqual({ kind: 'cancelled' });
  });

  it('reports another wallet error as failed, with its message', async () => {
    const f = fakeDeps({ walletError: new Error('nonce too low') });
    const out = await runCall(f.deps, { functionName: 'accrue', args: [] });
    expect(out).toEqual({ kind: 'failed', text: 'nonce too low' });
  });

  it('reports a receipt that reverted on chain with the decoded reason', async () => {
    const f = fakeDeps({ receipt: 'reverted' });
    vi.mocked(reasonFor).mockResolvedValueOnce({ name: 'RecipientNotAllowed', args: [3n, VENDOR] });
    const out = await runCall(f.deps, { functionName: 'requestTransfer', args: [3n, VENDOR, parseEther('0.1'), ZERO] });
    expect(out.kind).toBe('reverted');
    if (out.kind !== 'reverted') throw new Error('expected a revert');
    expect(out.hash).toBe(HASH);
    expect(out.text).toContain('RecipientNotAllowed');
  });
});

const ZERO: Hex = `0x${'0'.repeat(64)}`;
