import { describe, expect, it } from 'vitest';
import {
  FAUCET_URL,
  GLOSSARY,
  OWN_VAULT_NOTES,
  START_STEPS,
  TRY_NEEDS,
  TROVE_MIN_BTC,
  balancesSubtitle,
  startSteps,
  vaultNotice,
} from './guide';
import { DEMO_VAULT, LIVE_RUN_VAULT } from './config';
import { NAV } from './nav';

describe('start-here guide', () => {
  it('has three steps and every target is a section id in NAV', () => {
    expect(START_STEPS).toHaveLength(3);
    const ids = new Set(NAV.map((n) => n.id));
    for (const s of START_STEPS) {
      expect(ids.has(s.target), `${s.title} targets ${s.target}`).toBe(true);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(20);
    }
  });

  it('defines block, shared block, prefunded slice, mandate, operator, Trove, and approval threshold', () => {
    const terms = GLOSSARY.map((g) => g.term.toLowerCase());
    for (const t of ['block', 'shared block', 'prefunded slice', 'mandate', 'operator', 'trove', 'approval threshold']) {
      expect(terms, `missing ${t}`).toContain(t);
    }
    for (const g of GLOSSARY) expect(g.meaning.length).toBeGreaterThan(20);
  });

  it('says opening a Trove group needs 0.048 BTC and a prefunded slice needs MUSD only', () => {
    expect(TROVE_MIN_BTC).toBe('0.048');
    const text = TRY_NEEDS.join(' ');
    expect(text).toContain('0.048 BTC');
    expect(text.toLowerCase()).toMatch(/prefunded slice[^.]*musd only/);
    expect(FAUCET_URL).toBe('https://faucet.test.mezo.org');
  });

  it("says actions are limited to the vault's owner and operator wallets", () => {
    const text = TRY_NEEDS.join(' ').toLowerCase();
    expect(text).toMatch(/owner and operator wallets/);
    expect(text).toMatch(/cannot act on|can't act on|cannot send/);
    expect(text).not.toMatch(/anyone can (send|act|spend)/);
  });

  it('points a visitor to deploying their own vault, for testnet gas only, with them as owner', () => {
    expect(TRY_NEEDS.join(' ').toLowerCase()).toContain('deploy your own vault');
    const text = OWN_VAULT_NOTES.join(' ').toLowerCase();
    expect(text).toContain('you become its owner');
    expect(text).toContain('testnet gas only');
    expect(OWN_VAULT_NOTES.join(' ')).toContain('0.048 BTC');
  });

  it('mentions the replay buttons only when the demo vault is shown', () => {
    expect(startSteps(true)[0].body.toLowerCase()).toContain('replay');
    expect(startSteps(false)[0].body.toLowerCase()).not.toContain('replay');
    expect(startSteps(false)).toHaveLength(3);
    expect(START_STEPS).toEqual(startSteps(true));
  });

  it('names the test wallets in the balances subtitle only for the demo vault', () => {
    expect(balancesSubtitle(true).toLowerCase()).toContain('test wallets');
    expect(balancesSubtitle(false).toLowerCase()).not.toContain('test wallets');
  });

  it('uses "operator key" and never "agent" in the visitor-facing copy', () => {
    const all = [
      ...START_STEPS.map((x) => x.title + x.body),
      ...GLOSSARY.map((g) => g.term + g.meaning),
      ...TRY_NEEDS,
      ...OWN_VAULT_NOTES,
      balancesSubtitle(true),
      balancesSubtitle(false),
    ].join(' ');
    expect(all).not.toMatch(/\bagents?\b/i);
  });
});

describe('vaultNotice', () => {
  it('gives no notice for the demo vault', () => {
    expect(vaultNotice(DEMO_VAULT)).toBeUndefined();
  });

  it('describes the live-run vault as closed, and links the record of its 113 transactions', () => {
    const n = vaultNotice(LIVE_RUN_VAULT.toLowerCase());
    expect(n?.body).toMatch(/113 transactions/);
    expect(n?.body).toMatch(/closed/i);
    expect(n?.recordUrl).toContain('/logs/live-run/transactions.md');
  });

  it('warns that another vault is not the demo and to act only on vaults the visitor trusts', () => {
    const other = '0x26c046472294Cf3F147e82E36217dE68609bc08B';
    const n = vaultNotice(other);
    expect(n?.title).toMatch(/another vault/i);
    expect(n?.body).toContain(other);
    expect(n?.body).toMatch(/not the demo/i);
    expect(n?.body).toMatch(/deployed or trust/i);
    expect(n?.recordUrl).toBeUndefined();
  });
});
