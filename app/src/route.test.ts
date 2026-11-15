import { describe, expect, it } from 'vitest';
import { routeFor } from './route';

describe('routeFor', () => {
  it('opens the landing page for a bare address', () => {
    expect(routeFor('', '')).toBe('landing');
    expect(routeFor('#', '')).toBe('landing');
    expect(routeFor('#/', '')).toBe('landing');
  });

  it('opens the app on #/app and on any in-page anchor', () => {
    expect(routeFor('#/app', '')).toBe('app');
    expect(routeFor('#blocks', '')).toBe('app');
    expect(routeFor('#tieouts', '')).toBe('app');
  });

  it('opens the app for a vault link, which always means "show me that vault"', () => {
    expect(routeFor('', '?vault=0x4c716Be7F97EaC8B3dc1c5593649a387751C9835&from=16794952')).toBe('app');
    expect(routeFor('#/', '?vault=0x4c716Be7F97EaC8B3dc1c5593649a387751C9835')).toBe('app');
  });

  it('ignores unrelated query values', () => {
    expect(routeFor('', '?utm_source=x')).toBe('landing');
  });
});
