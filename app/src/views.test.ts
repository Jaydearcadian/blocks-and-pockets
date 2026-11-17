import { describe, expect, it } from 'vitest';
import { startSteps } from './guide';
import { routeFor } from './route';
import { DEFAULT_VIEW, VIEWS, nextView, parseHash, viewHref, viewOfSection, viewsFor } from './views';

describe('dashboard views', () => {
  it('has the five views in order', () => {
    expect(VIEWS.map((v) => v.id)).toEqual(['overview', 'blocks', 'actions', 'verify', 'reference']);
  });

  it('opens each view from its hash and stays on the dashboard route', () => {
    for (const v of VIEWS) {
      expect(parseHash(viewHref(v.id))).toEqual({ view: v.id });
      expect(routeFor(viewHref(v.id), '')).toBe('app');
    }
  });

  it('opens the overview for #/app, an empty hash or an unknown view', () => {
    for (const h of ['#/app', '', '#/app/', '#/app/nope', '#/elsewhere']) expect(parseHash(h).view).toBe(DEFAULT_VIEW);
  });

  it('sends an old section anchor to the view that holds it', () => {
    expect(parseHash('#payments')).toEqual({ view: 'blocks', section: 'payments' });
    expect(parseHash('#tieouts')).toEqual({ view: 'verify', section: 'tieouts' });
    expect(parseHash('#glossary')).toEqual({ view: 'reference', section: 'glossary' });
    expect(parseHash('#nothing').view).toBe(DEFAULT_VIEW);
  });

  it('puts every section in exactly one view', () => {
    const ids = VIEWS.flatMap((v) => v.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every start-here step at a section that has a view', () => {
    for (const demo of [true, false]) for (const s of startSteps(demo)) expect(viewOfSection(s.target), s.target).toBeDefined();
  });

  it('links each view to the next and stops at the last', () => {
    expect(nextView('overview')?.id).toBe('blocks');
    expect(nextView('reference')).toBeUndefined();
  });

  it('drops the record from other vaults', () => {
    const verify = (demo: boolean) => viewsFor(demo).find((v) => v.id === 'verify')?.sections.map((s) => s.id);
    expect(verify(true)).toContain('record');
    expect(verify(false)).not.toContain('record');
  });
});
