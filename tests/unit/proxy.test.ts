import {NextRequest} from 'next/server';
import {describe, expect, it} from 'vitest';
import {proxy} from '@/proxy';

const INK = '1.H4SwggIghgdlB0A+nd$-';
const request = (path: string) => new NextRequest(`https://opentierboy.com${path}`);
const rewriteOf = (path: string) => proxy(request(path)).headers.get('x-middleware-rewrite');

describe('proxy', () => {
  it('returns a rewrite to /rank/~list with the state and ink values as written when the address has both', () => {
    expect(rewriteOf(`/rank/overwatch/tank?state=3.abc+d&ink=${INK}`)).toBe(`https://opentierboy.com/rank/~list/overwatch/tank?state=3.abc+d&ink=${INK}`);
  });

  it('returns no rewrite when the address has an ink value and no state value', () => {
    const response = proxy(request(`/rank/overwatch/tank?ink=${INK}`));
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('returns 404 when the address has an ink value on a template path that does not exist', () => {
    expect(proxy(request(`/rank/nope/nope?ink=${INK}`)).status).toBe(404);
  });

  it('returns 308 to the hyphenated path with the state and ink values when the address has an old tag path', () => {
    const response = proxy(request(`/rank/overwatch/h_all?state=3.abc&ink=${INK}`));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`https://opentierboy.com/rank/overwatch/h-all?state=3.abc&ink=${INK}`);
  });
});
