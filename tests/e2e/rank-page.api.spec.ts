import {expect, test} from '../support/test';
import {lzWithRun} from '../unit/support/lzStream';

/**
 * The tier list page as search engines and chat apps fetch it. These tests call the page
 * directly, so they run once and need no browser.
 */
test.describe('The tier list page', () => {
  test('a link with a huge title gets a page with a short title in its metadata, fast', async ({request}) => {
    // A link of under 3,000 characters with a 999,000-character title (A43). Its title used to
    // repeat in <title>, og:title, twitter:title and the JSON-LD: a 9 MB page.
    const title = 'x'.repeat(999_000);
    const link = lzWithRun('{"tiers":[{"i":"tier-s","n":"S","t":[]},{"i":"uncategorized","n":"","t":[]}],"title":"{run}"}', 'x', title.length).input;
    expect(link.length).toBeLessThan(3_000);

    const started = Date.now();
    const response = await request.get(`/rank/overwatch/tank?state=${link}`, {timeout: 5_000});
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(Date.now() - started).toBeLessThan(5_000);

    const short = `${'x'.repeat(99)}…`;
    expect(html).toContain(`<title>${short}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${short}"/>`);
    // The editor shows the whole title once (it is the list's own text); nothing repeats it.
    expect(html.split(title).length - 1).toBe(1);
    expect(html.length).toBeLessThan(title.length + 200_000);
  });
});
