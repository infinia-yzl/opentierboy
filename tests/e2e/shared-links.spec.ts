import {expect, expectTierList, SHARED_LINKS, test} from '../support/test';
import {hugeTierNameState, rawState, stateFromJson, templateItemCount} from '../support/links';
import {escapeRegExp} from '../support/regexp';

/**
 * Every link people have shared must keep opening exactly as it was shared.
 *
 * The links come from tests/fixtures/shared-links.json. They cover every link format
 * that has shipped (v0, v1 and v2). If one of these tests fails, the app has broken
 * existing links. Fix the app, and never edit the fixture to make the test pass.
 */
test.describe('shared links', () => {
  test.describe('golden links', {tag: '@mobile'}, () => {
    for (const link of SHARED_LINKS) {
      test(`renders "${link.expected.title}" and its rows when the page opens ${link.id} (${link.format})`, async ({tierList}) => {
        await tierList.goto(link.path, link.state);
        await expectTierList(tierList, link.expected);
      });
    }

    test('renders the template when the page opens a link with a state parameter that does not decode', async ({tierList}) => {
      await tierList.goto('/rank/overwatch/tank', 'this-is-not-a-valid-state');

      await expect(tierList.title).toHaveText('OVERWATCH - Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(templateItemCount('image-overwatch', 'tank'));
    });
  });

  test.describe('link preview tags', () => {
    test('renders og:title and og:image of the list when the page opens a shared link', async ({page, tierList}) => {
      const link = SHARED_LINKS.find((entry) => entry.id === 'link-002')!;
      await page.goto(`${link.path}?state=${link.state}`);

      await expect(tierList.metaTag('og:title'))
        .toHaveAttribute('content', link.expected.title);
      await expect(tierList.metaTag('og:image'))
        .toHaveAttribute('content', new RegExp(escapeRegExp(`/api/og?state=${encodeURIComponent(link.state)}`) + '$'));
    });
  });

  test.describe('unknown items', () => {
    test('renders the label and the placeholder image when the page opens a link with an unknown item id', {tag: '@mobile'}, async ({tierList}) => {
      // For example an image from a set that was removed, or an upload from another device.
      await tierList.goto('/rank/overwatch/tank', rawState({
        tiers: [{i: 'tier-s', n: 'S', t: [{i: 'unknown-item-x', c: 'Mystery'}]}, {i: 'uncategorized', n: '', t: []}],
      }));

      await expect(tierList.itemsIn('S')).toHaveText(['Mystery']);
      await expect.poll(() => tierList.itemImageHasLoaded('Mystery'), {message: 'placeholder image'}).toBe(true);
    });
  });

  // Names that every JavaScript object has. A link may hold them as item ids, and they must work
  // like any other unknown id: a placeholder tile with the stored label, which can be dragged.
  test.describe('item ids named like Object.prototype members', () => {
    for (const id of ['constructor', 'toString', '__proto__']) {
      test(`renders the label and the placeholder image of the item id "${id}" when the page opens a link with it`, async ({tierList, openAsVisitor}) => {
        await tierList.goto('/rank/overwatch/tank', rawState({
          title: 'Odd item ids',
          tiers: [
            {i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}, {i: id, c: 'Mystery'}, {i: 'k3j9x0a1b', c: 'my cat'}]},
            {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-win.webp'}]},
          ],
        }));

        await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Mystery', 'my cat']);
        await expect.poll(() => tierList.itemImageHasLoaded('Mystery'), {message: 'placeholder image'}).toBe(true);

        // The tile can be dragged like any other, and the next saved link keeps the item.
        await tierList.dragItemToTier('Mystery', 'Unranked');
        await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston', 'Mystery']);
        await tierList.renameTier('S', 'Top');
        const visitor = await openAsVisitor(await tierList.shareLink());
        await expect(visitor.itemsIn('Top')).toHaveText(['Mauga', 'my cat']);
        await expect(visitor.itemsIn(visitor.unranked)).toHaveText(['Winston', 'Mystery']);
      });
    }
  });

  // Links that decode but hold data the app never writes, or far more data than any real list.
  // The page still works: it falls back to the template, like a damaged link, or leaves out the
  // part that would break the editor.
  test.describe('links with bad data', () => {
    const unranked = {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-win.webp'}]};
    const badLinks = [
      {
        name: 'a tier name that is an object',
        json: {title: 'Bad tier name', tiers: [{i: 'tier-s', n: {text: 'S'}, t: [{i: 'image-overwatch-mau.webp'}]}, unranked]},
      },
      {
        name: 'a title that is an object',
        json: {title: {text: 'Bad title'}, tiers: [{i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}]}, unranked]},
      },
      {name: 'no tiers at all', json: {tiers: []}},
    ];
    for (const link of badLinks) {
      test(`renders the title and rows, and no Application error, when the page opens a link with ${link.name}`, async ({tierList}) => {
        await tierList.gotoAndSettle('/rank/overwatch/tank', stateFromJson(link.json));

        await expect(tierList.crashMessage).toBeHidden();
        await expect(tierList.title).toBeVisible();
        await expect(tierList.tiers.first()).toBeVisible();
      });
    }

    test('renders a repeated item once, at its first place, when the page opens a link with the item twice', async ({tierList}) => {
      await tierList.goto('/rank/overwatch/tank', rawState({
        tiers: [
          {i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}, {i: 'image-overwatch-win.webp'}]},
          {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-mau.webp'}, {i: 'image-overwatch-sig.webp'}]},
        ],
      }));

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma']);
      // Each tile has its own drag id again, so dragging works.
      await tierList.dragItemToTier('Mauga', 'Unranked');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma', 'Mauga']);
    });

    test('renders each drop in its own row when the user drags items into 2 rows with the same id', async ({tierList, openAsVisitor}) => {
      await tierList.goto('/rank/overwatch/tank', rawState({
        tiers: [
          {i: 'tier-s', n: 'S', t: []},
          {i: 'tier-s', n: 'A', t: []},
          {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-mau.webp'}, {i: 'image-overwatch-win.webp'}]},
        ],
      }));

      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      const visitor = await openAsVisitor(await tierList.shareLink());
      await expect(visitor.itemsIn('S')).toHaveText(['Mauga']);
      await expect(visitor.itemsIn('A')).toHaveText(['Winston']);
    });

    test('renders the template when the page opens a link with a 1,000,000-character row name', async ({tierList}) => {
      // A million characters of tier name in a link of about 2,600 characters.
      await tierList.goto('/rank/overwatch/tank', hugeTierNameState());

      await expect(tierList.title).toHaveText('OVERWATCH - Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(templateItemCount('image-overwatch', 'tank'));
    });
  });
});
