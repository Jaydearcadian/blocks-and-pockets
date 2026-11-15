import { describe, expect, it } from 'vitest';
import { DEMO_VAULT, resolveVault } from './config';

const OTHER = '0x4c716Be7F97EaC8B3dc1c5593649a387751C9835';
const ENV_VAULT = '0x26c046472294Cf3F147e82E36217dE68609bc08B';

describe('resolveVault', () => {
  it('returns the demo vault with no parameters', () => {
    const r = resolveVault('', {});
    expect(r.vault).toBe(DEMO_VAULT);
    expect(r.deployBlock).toBe(16777200n);
    expect(r.isDemo).toBe(true);
  });

  it('accepts a valid ?vault and ?from', () => {
    const r = resolveVault(`?vault=${OTHER}&from=16794952`, {});
    expect(r.vault).toBe(OTHER);
    expect(r.deployBlock).toBe(16794952n);
    expect(r.isDemo).toBe(false);
  });

  it('rejects a malformed address and falls back to the demo vault', () => {
    for (const search of ['?vault=0x1234', '?vault=not-an-address', `?vault=${OTHER}00`, '?vault=']) {
      const r = resolveVault(`${search}&from=5`, {});
      expect(r.vault, search).toBe(DEMO_VAULT);
      expect(r.deployBlock, search).toBe(16777200n);
      expect(r.isDemo, search).toBe(true);
    }
  });

  it('prefers the query over the env variable', () => {
    const env = { VITE_VAULT_ADDRESS: ENV_VAULT, VITE_DEPLOY_BLOCK: '100' };
    expect(resolveVault('', env).vault).toBe(ENV_VAULT);
    expect(resolveVault('', env).deployBlock).toBe(100n);
    const r = resolveVault(`?vault=${OTHER}&from=200`, env);
    expect(r.vault).toBe(OTHER);
    expect(r.deployBlock).toBe(200n);
  });

  it('ignores a ?from that is not a whole number', () => {
    for (const from of ['abc', '-5', '1.5', '']) {
      expect(resolveVault(`?vault=${OTHER}&from=${from}`, {}).deployBlock, from).toBe(16777200n);
    }
  });

  it('treats the demo vault address as the demo in any letter case', () => {
    expect(resolveVault(`?vault=${DEMO_VAULT.toLowerCase()}`, {}).isDemo).toBe(true);
  });
});
