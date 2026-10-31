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
test.describe('Shared links', {tag: '@mobile'}, () => {
  for (const link of SHARED_LINKS) {
    test(`${link.id} (${link.format}) opens "${link.expected.title}"`, async ({tierList}) => {
      await tierList.goto(link.path, link.state);
      await expectTierList(tierList, link.expected);
    });
  }

  test('a damaged link falls back to the template', async ({tierList}) => {
    await tierList.goto('/rank/overwatch/tank', 'this-is-not-a-valid-state');

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(templateItemCount('image-overwatch', 'tank'));
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

test.describe('Unknown items', () => {
  test('an item the app does not know shows its label on the placeholder image', {tag: '@mobile'}, async ({tierList}) => {
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
test.describe('Links with item ids named like built-in object members', () => {
  for (const id of ['constructor', 'toString', '__proto__']) {
    test(`an item with the id "${id}" shows its label like any unknown item`, async ({tierList, openAsVisitor}) => {
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
test.describe('Links with bad data', () => {
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
    test(`a link with ${link.name} still opens a tier list`, async ({tierList}) => {
      await tierList.gotoAndSettle('/rank/overwatch/tank', stateFromJson(link.json));

      await expect(tierList.crashMessage).toBeHidden();
      await expect(tierList.title).toBeVisible();
      await expect(tierList.tiers.first()).toBeVisible();
    });
  }

  test('an item that appears twice in a link shows once, at its first place', async ({tierList}) => {
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

  test('two rows with the same id each take their own drops', async ({tierList, openAsVisitor}) => {
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

  test('a link with a huge tier name falls back to the template', async ({tierList}) => {
    // A million characters of tier name in a link of about 2,600 characters.
    await tierList.goto('/rank/overwatch/tank', hugeTierNameState());

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(templateItemCount('image-overwatch', 'tank'));
  });
});
