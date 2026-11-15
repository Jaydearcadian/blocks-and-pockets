import { describe, expect, it } from 'vitest';
import { FAUCET_URL, GLOSSARY, START_STEPS, TRY_NEEDS, TROVE_MIN_BTC } from './guide';
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
});
