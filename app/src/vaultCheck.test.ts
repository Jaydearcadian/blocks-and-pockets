import { describe, expect, it } from 'vitest';
import type { Address, Hex, PublicClient } from 'viem';
import { BORROWER_OPERATIONS, MUSD, PRICE_FEED, TROVE_MANAGER } from './config';
import { codeMatches, verifyVault } from './vaultCheck';
import artifact from './vaultArtifact.json';

const RUNTIME = artifact.runtime as Hex;
const VAULT = '0x4c716Be7F97EaC8B3dc1c5593649a387751C9835' as Address;
const OTHER = '0x00000000000000000000000000000000000000aa' as Address;

// Changes one byte (two hex characters) at a byte offset.
function flip(code: string, byteOffset: number): Hex {
  const i = 2 + byteOffset * 2;
  const next = code.slice(i, i + 2) === 'ff' ? '00' : 'ff';
  return (code.slice(0, i) + next + code.slice(i + 2)) as Hex;
}

function clientFor(code: Hex | undefined, getters: Record<string, Address>) {
  return {
    getCode: async () => code,
    readContract: async ({ functionName }: { functionName: string }) => getters[functionName],
  } as unknown as PublicClient;
}

const GOOD = { borrowerOperations: BORROWER_OPERATIONS, troveManager: TROVE_MANAGER, priceFeed: PRICE_FEED, musd: MUSD };

describe('codeMatches', () => {
  it('accepts the compiled runtime code', () => {
    expect(codeMatches(RUNTIME)).toBe(true);
  });

  it('ignores the bytes where immutable values are inlined', () => {
    const [start] = artifact.immutableRanges[0];
    expect(codeMatches(flip(RUNTIME, start + 31))).toBe(true);
  });

  it('rejects a change to any other byte', () => {
    const inImmutable = new Set<number>();
    for (const [s, l] of artifact.immutableRanges) for (let b = s; b < s + l; b++) inImmutable.add(b);
    let probe = 100;
    while (inImmutable.has(probe)) probe++;
    expect(codeMatches(flip(RUNTIME, probe))).toBe(false);
  });

  it('rejects empty code, other lengths, and unrelated contracts', () => {
    expect(codeMatches('0x')).toBe(false);
    expect(codeMatches((RUNTIME + '00') as Hex)).toBe(false);
    expect(codeMatches(RUNTIME.slice(0, -2) as Hex)).toBe(false);
    expect(codeMatches('0x6080604052')).toBe(false);
  });
});

describe('verifyVault', () => {
  it('accepts a vault with the right code that points at the Mezo testnet contracts', async () => {
    expect(await verifyVault(clientFor(RUNTIME, GOOD), VAULT)).toEqual({ ok: true });
  });

  it('refuses an address with no code', async () => {
    const r = await verifyVault(clientFor(undefined, GOOD), VAULT);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/no contract/i);
  });

  it('refuses a contract that is not this vault', async () => {
    const r = await verifyVault(clientFor('0x6080604052', GOOD), VAULT);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/not a Blocks & Pockets vault/);
  });

  it('refuses a copy of the vault that points at a different MUSD', async () => {
    const r = await verifyVault(clientFor(RUNTIME, { ...GOOD, musd: OTHER }), VAULT);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/musd/i);
  });

  it('refuses a copy that points at a different Trove manager, borrower operations, or price feed', async () => {
    for (const k of ['troveManager', 'borrowerOperations', 'priceFeed']) {
      const r = await verifyVault(clientFor(RUNTIME, { ...GOOD, [k]: OTHER }), VAULT);
      expect(r.ok, k).toBe(false);
    }
  });

  it('reports a failed read as unable to check, not as a vault', async () => {
    const client = {
      getCode: async () => {
        throw new Error('network down');
      },
    } as unknown as PublicClient;
    const r = await verifyVault(client, VAULT);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/could not check/i);
  });
});
