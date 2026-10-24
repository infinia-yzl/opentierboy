import {expect, expectTierList, SHARED_LINKS, test} from '../support/test';

/**
 * Every link people have shared must keep opening exactly as it was shared.
 *
 * The links come from tests/fixtures/shared-links.json. They cover every link format
 * that has shipped (v0, v1 and v2). If one of these tests fails, the app has broken
 * existing links. Fix the app, and never edit the fixture to make the test pass.
 */
test.describe('Shared links', {tag: '@mobile'}, () => {
  for (const link of SHARED_LINKS) {
    test(`${link.id} (${link.format}) opens "${link.expected.title}"`, async ({tierList}) => {
      await tierList.goto(link.path, link.state);
      await expectTierList(tierList, link.expected);
    });
  }

  test('covers every link format that has shipped', () => {
    const formats = Array.from(new Set(SHARED_LINKS.map((link) => link.format)));
    expect(formats.sort()).toEqual(['v0', 'v1', 'v2']);
  });

  test('a damaged link falls back to the template', async ({tierList}) => {
    await tierList.goto('/rank/overwatch/tank', 'this-is-not-a-valid-state');

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(13);
  });
});

test.describe('Link previews', () => {
  test('a shared link previews with its own title and image', async ({page}) => {
    const link = SHARED_LINKS.find((entry) => entry.id === 'link-002')!;
    await page.goto(`${link.path}?state=${link.state}`);

    await expect(page.locator('meta[property="og:title"]'))
      .toHaveAttribute('content', link.expected.title);
    await expect(page.locator('meta[property="og:image"]'))
      .toHaveAttribute('content', new RegExp(escapeRegExp(`/api/og?state=${encodeURIComponent(link.state)}`) + '$'));
  });
});

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
