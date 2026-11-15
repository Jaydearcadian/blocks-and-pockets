import { describe, expect, it } from 'vitest';
import { DEMO_VAULT, LIVE_RUN_VAULT, resolveVault } from './config';

const OTHER = '0x4c716Be7F97EaC8B3dc1c5593649a387751C9835';
const ENV_VAULT = '0x26c046472294Cf3F147e82E36217dE68609bc08B';
const DEFAULT_BLOCK = 16777200n;

describe('resolveVault', () => {
  it('returns the demo vault with no parameters', () => {
    const r = resolveVault('', {});
    expect(r.vault).toBe(DEMO_VAULT);
    expect(r.deployBlock).toBe(DEFAULT_BLOCK);
    expect(r.isDemo).toBe(true);
    expect(r.warning).toBeUndefined();
  });

  it('accepts a valid ?vault and ?from', () => {
    const r = resolveVault(`?vault=${OTHER}&from=16794952`, {});
    expect(r.vault).toBe(OTHER);
    expect(r.deployBlock).toBe(16794952n);
    expect(r.isDemo).toBe(false);
    expect(r.warning).toBeUndefined();
  });

  it('rejects a malformed address, falls back to the demo vault, and says so', () => {
    for (const search of ['?vault=0x1234', '?vault=not-an-address', `?vault=${OTHER}00`]) {
      const r = resolveVault(`${search}&from=16800000`, {});
      expect(r.vault, search).toBe(DEMO_VAULT);
      expect(r.deployBlock, search).toBe(DEFAULT_BLOCK);
      expect(r.isDemo, search).toBe(true);
      expect(r.warning, search).toMatch(/not a valid address/i);
    }
  });

  it('treats an empty ?vault as absent, with no warning', () => {
    const r = resolveVault('?vault=', {});
    expect(r.vault).toBe(DEMO_VAULT);
    expect(r.warning).toBeUndefined();
  });

  it('accepts lowercase, uppercase, and wrong-checksum spellings and returns the checksummed address', () => {
    const body = OTHER.slice(2);
    for (const spelling of [OTHER.toLowerCase(), `0x${body.toUpperCase()}`, `0x${body.slice(0, 5).toUpperCase()}${body.slice(5).toLowerCase()}`]) {
      const r = resolveVault(`?vault=${spelling}&from=16794952`, {});
      expect(r.vault, spelling).toBe(OTHER);
      expect(r.isDemo, spelling).toBe(false);
    }
  });

  it('prefers the query over the env variable', () => {
    const env = { VITE_VAULT_ADDRESS: ENV_VAULT, VITE_DEPLOY_BLOCK: '100' };
    expect(resolveVault('', env).vault).toBe(ENV_VAULT);
    expect(resolveVault('', env).deployBlock).toBe(100n);
    const r = resolveVault(`?vault=${OTHER}&from=16800000`, env);
    expect(r.vault).toBe(OTHER);
    expect(r.deployBlock).toBe(16800000n);
  });

  it('ignores a ?from that is not a whole number, and says so', () => {
    for (const from of ['abc', '-5', '1.5', '']) {
      const r = resolveVault(`?vault=${OTHER}&from=${from}`, {});
      expect(r.deployBlock, from).toBe(DEFAULT_BLOCK);
      expect(r.warning, from).toMatch(/deploy block/i);
    }
  });

  it('raises a ?from below the first Mezo vault block to that block, so one page load never scans from block 0', () => {
    for (const from of ['0', '1', '16777199']) {
      const r = resolveVault(`?vault=${OTHER}&from=${from}`, {});
      expect(r.deployBlock, from).toBe(DEFAULT_BLOCK);
      expect(r.warning, from).toMatch(/deploy block/i);
    }
    expect(resolveVault(`?vault=${OTHER}&from=16777200`, {}).deployBlock).toBe(DEFAULT_BLOCK);
  });

  it('treats the demo vault address as the demo in any letter case', () => {
    expect(resolveVault(`?vault=${DEMO_VAULT.toLowerCase()}`, {}).isDemo).toBe(true);
  });

  it('knows the live-run vault', () => {
    expect(LIVE_RUN_VAULT.toLowerCase()).toBe('0x4c716be7f97eac8b3dc1c5593649a387751c9835');
  });
});
