import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from '../src/app/routes';

describe('Flow routes', () => {
  it('canonicalizes legacy entry points without losing module deep links', () => {
    expect(parseRoute('').route).toEqual({ name: 'today' });
    expect(parseRoute('#home').route).toEqual({ name: 'today' });
    expect(parseRoute('#review').route).toEqual({ name: 'progress', view: 'attention' });
    expect(parseRoute('#graphs').route).toEqual({ name: 'progress', view: 'overview' });
    expect(parseRoute('#import').route).toEqual({ name: 'packs', mode: 'manage' });
    expect(parseRoute('#module/a%2Fb').route).toEqual({ name: 'module', moduleId: 'a/b' });
  });

  it('round trips study and custom session routes', () => {
    const routes = [
      { name: 'moduleCustom', moduleId: '日本史/近代' } as const,
      { name: 'study', sessionId: 'session/1', phase: 'checkpoint' } as const,
      { name: 'study', sessionId: 'session/1', phase: 'complete' } as const
    ];
    for (const route of routes) expect(parseRoute(routeHash(route)).route).toEqual(route);
  });
});
