import { describe, expect, it } from 'vitest';
import type { Address, PublicClient, WalletClient } from 'viem';
import { BORROWER_OPERATIONS, MUSD, PRICE_FEED, TROVE_MANAGER } from './config';
import { APPROVAL_THRESHOLD, TARGET_RATIO_BPS, deployArgs, deployData, deployVault, vaultLink } from './deploy';
import { resolveVault } from './config';
import artifact from './vaultArtifact.json';

const ACCOUNT = '0xa445987238e1e2c56739c68743a150cdacf60db7' as Address;
const NEW_VAULT = '0x4c716Be7F97EaC8B3dc1c5593649a387751C9835' as Address;
const HASH = `0x${'ab'.repeat(32)}` as const;

type Fakes = {
  estimate?: () => Promise<bigint>;
  deploy?: (args: { gas?: bigint }) => Promise<`0x${string}`>;
  receipt?: () => Promise<{ status: 'success' | 'reverted'; blockNumber: bigint; contractAddress?: Address | null }>;
};

function deps(f: Fakes) {
  const steps: string[] = [];
  const sent: { gas?: bigint }[] = [];
  const publicClient = {
    estimateGas: f.estimate ?? (async () => 3_000_000n),
    waitForTransactionReceipt:
      f.receipt ?? (async () => ({ status: 'success' as const, blockNumber: 77n, contractAddress: NEW_VAULT })),
  } as unknown as PublicClient;
  const wallet = {
    deployContract: async (args: { gas?: bigint }) => {
      sent.push(args);
      return (f.deploy ?? (async () => HASH))(args);
    },
  } as unknown as WalletClient;
  return { steps, sent, d: { publicClient, wallet, account: ACCOUNT, step: (t: string) => steps.push(t) } };
}

describe('deploy arguments', () => {
  it('passes the Mezo contracts, a 150% target ratio, and a 1 MUSD approval threshold', () => {
    expect(deployArgs()).toEqual([BORROWER_OPERATIONS, TROVE_MANAGER, PRICE_FEED, MUSD, 15_000n, 10n ** 18n]);
    expect(TARGET_RATIO_BPS).toBe(15_000n);
    expect(APPROVAL_THRESHOLD).toBe(10n ** 18n);
  });

  it('builds creation data that is the bytecode followed by six encoded arguments', () => {
    const data = deployData();
    expect(data.startsWith(artifact.bytecode)).toBe(true);
    expect((data.length - artifact.bytecode.length) / 2).toBe(6 * 32);
  });

  it('makes a link that resolveVault reads back', () => {
    const link = vaultLink('https://example.github.io/blocks-and-pockets/', NEW_VAULT, 16795000n);
    expect(link).toBe(`https://example.github.io/blocks-and-pockets/?vault=${NEW_VAULT}&from=16795000`);
    const r = resolveVault(new URL(link).search, {});
    expect(r.vault).toBe(NEW_VAULT);
    expect(r.deployBlock).toBe(16795000n);
    expect(r.isDemo).toBe(false);
  });
});

describe('deployVault', () => {
  it('returns the new address and block, with 1.5 times the estimated gas', async () => {
    const { d, sent, steps } = deps({});
    const out = await deployVault(d);
    expect(out).toEqual({ kind: 'confirmed', hash: HASH, address: NEW_VAULT, block: 77n });
    expect(sent[0].gas).toBe(4_500_000n);
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it('reports a rejected signature as cancelled and sends nothing else', async () => {
    const { d } = deps({
      deploy: async () => {
        throw Object.assign(new Error('User rejected'), { code: 4001 });
      },
    });
    expect(await deployVault(d)).toEqual({ kind: 'cancelled' });
  });

  it('reports a wallet error as failed with its message', async () => {
    const { d } = deps({
      deploy: async () => {
        throw new Error('insufficient funds for gas');
      },
    });
    const out = await deployVault(d);
    expect(out.kind).toBe('failed');
    expect(out.kind === 'failed' && out.text).toContain('insufficient funds');
  });

  it('refuses before asking the wallet when the gas estimate fails', async () => {
    const { d, sent } = deps({
      estimate: async () => {
        throw new Error('execution reverted');
      },
    });
    const out = await deployVault(d);
    expect(out.kind).toBe('refused');
    expect(sent).toHaveLength(0);
  });

  it('reports a reverted deployment with its hash', async () => {
    const { d } = deps({ receipt: async () => ({ status: 'reverted', blockNumber: 9n, contractAddress: null }) });
    const out = await deployVault(d);
    expect(out.kind).toBe('reverted');
    expect(out.kind === 'reverted' && out.hash).toBe(HASH);
  });

  it('reports a missing receipt as failed and names the hash', async () => {
    const { d } = deps({
      receipt: async () => {
        throw new Error('timeout');
      },
    });
    const out = await deployVault(d);
    expect(out.kind).toBe('failed');
    expect(out.kind === 'failed' && out.text).toContain(HASH);
  });

  it('reports a success receipt with no contract address as failed', async () => {
    const { d } = deps({ receipt: async () => ({ status: 'success', blockNumber: 9n, contractAddress: null }) });
    expect((await deployVault(d)).kind).toBe('failed');
  });
});
