import {describe, expect, it} from 'vitest';
import {SECURITY_HEADERS} from '@/lib/security/headers';

describe('SECURITY_HEADERS', () => {
  it('returns Referrer-Policy, X-Content-Type-Options, Permissions-Policy and Cross-Origin-Opener-Policy when read', () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map(({key, value}) => [key, value]))).toEqual({
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    });
  });
});
