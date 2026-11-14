import {describe, expect, it} from 'vitest';
import {ignoringBenignPageErrors} from '../../support/machines';

/** A sut whose page oracle reports `messages` the way @xstate/test/playwright does. */
function sutReporting(messages: readonly string[]) {
  return {
    create: async () => ({
      check: async () => {
        throw Object.assign(new Error(`The page reported ${messages.length} error(s)`), {name: 'PlaywrightOracleError', messages});
      },
    }),
  };
}

async function checkOf(messages: readonly string[]) {
  const session = await ignoringBenignPageErrors(sutReporting(messages)).create() as {check: () => Promise<void>};
  return session.check();
}

const RESIZE_LOOP = 'pageerror: ResizeObserver loop completed with undelivered notifications.';
const PREFETCH = 'pageerror: /127.0.0.1:3000/blog?_rsc=Zhvt1 due to access control checks.';

describe('ignoringBenignPageErrors', () => {
  it('returns a passing check when the page reports only browser notices', async () => {
    await expect(checkOf([RESIZE_LOOP])).resolves.toBeUndefined();
    await expect(checkOf([PREFETCH, RESIZE_LOOP])).resolves.toBeUndefined();
  });

  it('throws the oracle error when the page also reports another error', async () => {
    await expect(checkOf([RESIZE_LOOP, 'pageerror: Cannot read properties of undefined'])).rejects.toMatchObject({name: 'PlaywrightOracleError'});
    await expect(checkOf(['console.error: ResizeObserver loop completed with undelivered notifications. Extra'])).rejects.toMatchObject({name: 'PlaywrightOracleError'});
  });
});
