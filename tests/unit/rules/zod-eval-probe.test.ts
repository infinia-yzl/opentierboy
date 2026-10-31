import {afterAll, describe, expect, it} from 'vitest';
import {installFunctionTrap} from '../support/function-trap';

/**
 * The reason for lib/zod: plain zod calls new Function when it builds an object schema. If
 * this test starts failing after a zod upgrade, zod stopped probing, and lib/zod may no longer
 * be needed (keep it anyway: it is harmless).
 */
const trap = installFunctionTrap();
afterAll(() => trap.restore());

describe('zod', () => {
  it('writes at least 1 new Function attempt to the trap when z.object builds a schema (a CSP violation)', async () => {
    const z = await import('zod');
    const schema = z.object({name: z.string()});
    expect(trap.attempts.length).toBeGreaterThan(0);
    // zod catches the refusal and still parses.
    expect(schema.parse({name: 'x'})).toEqual({name: 'x'});
  });
});
