import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Landing, { CTA_WORDS, MENUS, NAV, PROOF, RECEIPTS, WORDMARK, scrollToSection, vaultLink } from './Landing';
import { routeFor } from './route';

const html = renderToStaticMarkup(createElement(Landing));
const section = (id: string) => {
  const a = html.indexOf(`id="${id}"`);
  return html.slice(a, html.indexOf('</section>', a));
};

describe('landing page', () => {
  it('has a section for every menu link', () => {
    expect(NAV.length).toBeGreaterThanOrEqual(5);
    for (const n of NAV) expect(html).toContain(`id="${n.id}"`);
  });

  it('gives every menu item a section or a link', () => {
    for (const m of MENUS) for (const it of m.items) expect(Boolean(it.section) !== Boolean(it.href), it.title).toBe(true);
  });

  it('keeps visitors on the landing route when they click a section link', () => {
    const hrefs = [...html.matchAll(/href="(#[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      if (h === '#/app') continue;
      expect(routeFor(h, ''), `href ${h}`).toBe('landing');
    }
  });

  it('renders the mobile menu closed and wired to its panel', () => {
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toMatch(/aria-label="Open menu" aria-expanded="false" aria-controls="lp-m-body"/);
    expect(html).toMatch(/id="lp-m-body" aria-hidden="true" inert=""/);
    for (const m of MENUS) expect(html).toContain(`id="lp-m-${m.id}"`);
  });

  it('renders the desktop dropdown closed', () => {
    expect(html).toMatch(/id="lp-dd" data-open="false"/);
    for (const m of MENUS) expect(html).toContain(`>${m.label}<`);
  });

  it('has a footer with product, evidence and project links', () => {
    const footer = html.slice(html.indexOf('<footer'));
    for (const heading of ['Product', 'Evidence', 'Project']) expect(footer).toContain(`<h4>${heading}</h4>`);
    expect(footer).toContain('THREAT-MODEL.md');
    expect(footer).toContain('Not audited');
  });

  it('spells the footer wordmark one letter at a time, hidden from screen readers', () => {
    expect(html).toMatch(/class="lp-wm" data-armed="false" data-in="false" aria-hidden="true"/);
    const wm = html.slice(html.indexOf('class="lp-wm"'));
    expect((wm.slice(0, wm.indexOf('</div>')).match(/<span/g) ?? []).length).toBe(WORDMARK.length);
  });

  it('answers questions in a numbered FAQ with the first one open', () => {
    const faq = section('faq');
    expect((faq.match(/class="lp-acc-item"/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(faq).toContain('lp-acc-num');
    expect(faq.match(/aria-expanded="true"/g)?.length).toBe(1);
  });

  it('states the proof numbers from the live run', () => {
    expect(PROOF.map((p) => p.value)).toEqual(['113', '58', '55', '26 / 30', '15 / 15']);
  });

  it('links every receipt to a full transaction hash on the explorer', () => {
    expect(RECEIPTS.length).toBe(6);
    for (const r of RECEIPTS) {
      expect(r.tx).toMatch(/^0x[0-9a-f]{64}$/);
      expect(html).toContain(`https://explorer.test.mezo.org/tx/${r.tx}`);
    }
    expect(RECEIPTS.find((r) => r.n === 53)?.reason).toBe('PerTransactionCapExceeded(1.6, 1.5)');
  });

  it('gives the cycling CTA a full sentence for screen readers', () => {
    const cta = html.slice(html.indexOf('lp-cta-band'));
    expect(cta).toContain('Give every block a limit, a payee list, an end date and an off switch.');
    expect(cta).toContain(CTA_WORDS[0]);
  });

  it('does not claim things that were not done', () => {
    expect(html).not.toMatch(/mainnet (live|launch)|audited by|AI agent product/i);
    expect(html).toContain('Liquidation was not run on chain');
  });

  it('leaves the click alone when the section is missing', () => {
    const doc = { getElementById: () => null } as unknown as Document;
    expect(scrollToSection('nope', doc)).toBe(false);
  });

  it('turns a typed vault address into a dashboard link', () => {
    const a = '0x4c716Be7F97EaC8B3dc1c5593649a387751C9835';
    expect(vaultLink(` ${a} `)).toBe(`?vault=${a}`);
    expect(vaultLink(a.toLowerCase())).toBe(`?vault=${a}`);
    expect(routeFor('', vaultLink(a) ?? '')).toBe('app');
  });

  it('rejects text that is not an address', () => {
    expect(vaultLink('')).toBeNull();
    expect(vaultLink('hello')).toBeNull();
    expect(vaultLink('0x1234')).toBeNull();
  });

  it('has the full section map', () => {
    for (const id of ['pieces', 'platform', 'rules', 'compare', 'enforced', 'proof', 'uses', 'faq', 'read']) expect(html).toContain(`id="${id}"`);
    expect((html.match(/<section/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });
});
