import {afterAll, describe, expect, it} from 'vitest';
import {installFunctionTrap} from '../support/functionTrap';

/**
 * The reason for lib/zod: plain zod calls new Function when it builds an object schema. If
 * this test starts failing after a zod upgrade, zod stopped probing, and lib/zod may no longer
 * be needed (keep it anyway: it is harmless).
 */
const trap = installFunctionTrap();
afterAll(() => trap.restore());

describe('zod without lib/zod', () => {
  it('calls new Function when it builds an object schema (a CSP violation in the browser)', async () => {
    const z = await import('zod');
    const schema = z.object({name: z.string()});
    expect(trap.attempts.length).toBeGreaterThan(0);
    // zod catches the refusal and still parses.
    expect(schema.parse({name: 'x'})).toEqual({name: 'x'});
  });
});
