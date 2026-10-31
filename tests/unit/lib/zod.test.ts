import {afterAll, describe, expect, it} from 'vitest';
import {installFunctionTrap} from '../support/functionTrap';

// No static import of zod or lib/zod here: the trap must be in place before zod loads.
const trap = installFunctionTrap();
afterAll(() => trap.restore());

describe('lib/zod (amendment A39)', () => {
  it('throws EvalError when new Function runs under the trap', () => {
    expect(() => new Function('return 1')).toThrow(EvalError);
    expect(trap.attempts).toEqual(['return 1']);
    trap.attempts.length = 0;
  });

  it('returns parse results without calling new Function when lib/zod builds and parses schemas', async () => {
    const {z} = await import('@/lib/zod');

    // The schema of components/ItemCreator.tsx, built at module level there.
    const formSchema = z.object({
      files: z.any().refine((files) => files?.length > 0, 'At least one file is required.'),
    });
    const nested = z.object({
      name: z.string().min(1),
      count: z.number().int(),
      tags: z.array(z.string()).optional(),
      inner: z.object({flag: z.boolean()}).strict(),
    });

    for (let round = 0; round < 3; round++) {
      expect(formSchema.safeParse({files: ['a.png']}).success).toBe(true);
      const empty = formSchema.safeParse({files: []});
      expect(empty.success).toBe(false);
      expect(empty.error?.issues[0]?.message).toBe('At least one file is required.');
      expect(nested.parse({name: 'x', count: 2, inner: {flag: true}})).toEqual({name: 'x', count: 2, inner: {flag: true}});
      expect(nested.safeParse({name: '', count: 1.5, inner: {flag: true, extra: 1}}).error?.issues.map((issue) => issue.path.join('.'))).toEqual(['name', 'count', 'inner']);
    }
    await expect(nested.parseAsync({name: 'y', count: 1, inner: {flag: false}})).resolves.toMatchObject({name: 'y'});

    expect(trap.attempts).toEqual([]);
  });
});
