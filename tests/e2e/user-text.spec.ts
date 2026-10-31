import {expect, test} from '../support/test';
import {v3State} from '../support/links';
import {imageFile} from '../support/imageSites';
import {escapeRegExp} from '../support/regexp';

/**
 * User text is shown as text (review rules: cross-site scripting). Titles, row names and labels
 * come from links anyone can make, so each one here holds markup that would set
 * window.__otbInjected if the page ran it.
 */
const IMG_MARKUP = '<img src=x onerror="window.__otbInjected=1">';
const SCRIPT_MARKUP = '<script>window.__otbInjected=2</script>';
const CLOSING_MARKUP = '"></title></script><svg onload="window.__otbInjected=3">';

const TANKS = '/rank/overwatch/tank';
const LIST_WITH_MARKUP = v3State({
  t: `Title ${IMG_MARKUP}`,
  tp: 3,
  r: [
    [`S ${SCRIPT_MARKUP}`, [{i: 'image-unknown-gone.webp', c: `Item ${IMG_MARKUP}`}]],
    ['A', [{u: 'https://images.example.org/a.png', c: `Link ${CLOSING_MARKUP}`}]],
    ['B', []],
    ['', []],
  ],
});

test.describe('User text shows as text', () => {
  test('markup in a shared list shows as plain text in the editor, the tab title and Recently viewed', {tag: '@mobile'}, async ({tierList, site}) => {
    await tierList.goto(TANKS, LIST_WITH_MARKUP);
    await tierList.waitUntilInteractive();

    await expect(tierList.title).toHaveText(`Title ${IMG_MARKUP}`);
    await expect(tierList.tier(`S ${SCRIPT_MARKUP}`)).toBeVisible();
    await expect(tierList.itemsIn(`S ${SCRIPT_MARKUP}`)).toHaveText([`Item ${IMG_MARKUP}`]);
    // A link image's tile also names its site under the label.
    await expect(tierList.itemsIn('A')).toContainText([`Link ${CLOSING_MARKUP}`]);
    await expect(tierList.page).toHaveTitle(new RegExp(escapeRegExp(`Title ${IMG_MARKUP}`)));
    await expect.poll(() => tierList.injectedMarkupRan()).toBe(false);

    await site.gotoHome();
    await expect(site.recentLinks).toHaveText([`Title ${IMG_MARKUP}`]);
    await expect.poll(() => tierList.injectedMarkupRan()).toBe(false);
  });

  test('markup typed into the title and a row name stays text, also after a reload', async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.setTitle(CLOSING_MARKUP);
    await tierList.renameTier('S', SCRIPT_MARKUP);
    await expect(tierList.title).toHaveText(CLOSING_MARKUP);
    await expect(tierList.tier(SCRIPT_MARKUP)).toBeVisible();

    await tierList.reload();
    await expect(tierList.title).toHaveText(CLOSING_MARKUP);
    await expect(tierList.tier(SCRIPT_MARKUP)).toBeVisible();
    await expect(tierList.page).toHaveTitle(new RegExp(escapeRegExp(CLOSING_MARKUP)));
    await expect.poll(() => tierList.injectedMarkupRan()).toBe(false);
  });

  test('a picture whose file name holds markup gets that name as its label', async ({tierList}) => {
    await tierList.goto(TANKS);
    // The label is the name before its first dot, so the markup has none.
    await tierList.addItemsFromDevice([imageFile('<img src=x onerror=__otbInjected=4>.png')]);
    await expect(tierList.item('<img src=x onerror=__otbInjected=4>')).toBeVisible();
    await expect.poll(() => tierList.injectedMarkupRan()).toBe(false);
  });

  test('the page the server sends escapes the markup of a shared list', async ({page}) => {
    const response = await page.request.get(`${TANKS}?state=${encodeURIComponent(LIST_WITH_MARKUP)}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    // The server writes the title into the page (heading, <title>, link preview tags). Each
    // copy must be escaped, so the markup never appears as it was typed.
    for (const markup of [IMG_MARKUP, SCRIPT_MARKUP, CLOSING_MARKUP]) expect(html).not.toContain(markup);
    expect(html).toContain('Title &lt;img');
  });
});
