import fs from 'node:fs';
import path from 'node:path';
import {expect, expectTierList, test} from '../support/test';
import {rankingState, templateItemCount} from '../support/links';
import {imageFile, serveImageSite} from '../support/image-sites';
import {pngFile} from '../support/snapshot-files';
import type {TierListPage} from '../pages/tier-list-page';
import golden from '../fixtures/snapshots/snapshots.json';

const TANKS = '/rank/overwatch/tank';
const SUPPORT = '/rank/overwatch/sup';

/** The golden Freeze Frame files (tests/fixtures/snapshots, append-only). */
const SNAPSHOTS = path.resolve(__dirname, '../fixtures/snapshots');

/** The template buttons of the landing page: card, template title, package and tag. */
const TEMPLATES = [
  {set: 'THE FINALS', title: 'All Items', packageName: 'image-reachthefinals', tag: 'all'},
  {set: 'THE FINALS', title: 'Light Build', packageName: 'image-reachthefinals', tag: 'light'},
  {set: 'THE FINALS', title: 'Medium Build', packageName: 'image-reachthefinals', tag: 'medium'},
  {set: 'THE FINALS', title: 'Heavy Build', packageName: 'image-reachthefinals', tag: 'heavy'},
  {set: 'OVERWATCH', title: 'All Heroes', packageName: 'image-overwatch', tag: 'h_all'},
  {set: 'OVERWATCH', title: 'Tank', packageName: 'image-overwatch', tag: 'tank'},
  {set: 'OVERWATCH', title: 'Damage', packageName: 'image-overwatch', tag: 'dps'},
  {set: 'OVERWATCH', title: 'Support', packageName: 'image-overwatch', tag: 'sup'},
];

/** What a template button says about its item count: rounded down to 10 with "+", exact below 10. */
function countOf(count: number): {text: string; words: string} {
  if (count < 10) return {text: String(count), words: `${count} ${count === 1 ? 'item' : 'items'}`};
  const rounded = count - (count % 10);
  return {text: `${rounded}+`, words: `about ${rounded} items`};
}

/** Opens two lists, Tanks list then Support list. The editor records a list once it has started in the browser. */
async function openTwoLists(tierList: TierListPage) {
  await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Tanks list'));
  await tierList.waitUntilInteractive();
  await tierList.goto(SUPPORT, rankingState('image-overwatch', {S: ['Ana']}, 'Support list'));
  await tierList.waitUntilInteractive();
}

test.describe('home', () => {
  test('renders the cards THE FINALS, OVERWATCH and Your own list with its two actions when the landing page opens', {tag: '@mobile'}, async ({site}) => {
    await site.gotoHome();

    await expect(site.cardTitles).toHaveText(['THE FINALS', 'OVERWATCH', 'Your own list']);
    await expect(site.ownListCard.getByRole('link', {name: 'Create Blank List'})).toHaveAttribute('href', /^\/rank\/?$/);
    await expect(site.ownListCard.getByRole('button', {name: 'Open a Freeze Frame'})).toBeVisible();
  });

  test('renders the drop area of Your own list when the landing page opens on a wide screen', async ({site}) => {
    await site.gotoHome();

    await expect(site.dropArea).toBeVisible();
    await expect(site.ownListCard).toContainText('Images start a new list. A Freeze Frame reopens as an editable list.');
  });

  test('renders no drop area when the landing page opens on a phone', {tag: '@mobile'}, async ({site, isMobile}) => {
    test.skip(!isMobile, 'The drop area is hidden on phones only.');
    await site.gotoHome();

    await expect(site.ownListCard.getByRole('button', {name: 'Open a Freeze Frame'})).toBeVisible();
    await expect(site.dropArea).toBeHidden();
  });

  test('renders a picture, the rounded item count and the accessible name on each template button when the page opens', {tag: '@mobile'}, async ({site}) => {
    await site.gotoHome();

    for (const set of ['THE FINALS', 'OVERWATCH']) {
      await expect(site.templateButtons(set)).toHaveCount(TEMPLATES.filter((template) => template.set === set).length);
    }
    for (const {set, title, packageName, tag} of TEMPLATES) {
      const count = countOf(templateItemCount(packageName, tag));
      const button = site.templateButton(set, `${title}, ${count.words}`);
      await expect(button, `${title} names its count`).toBeVisible();
      await expect(button).toContainText(count.text);
      const picture = button.getByRole('img');
      await expect(picture).toHaveAttribute('alt', /\S/);
      await expect.poll(() => site.imageHasLoaded(picture), {message: `the picture of ${title} loads`}).toBe(true);
    }
    await expect(site.templateButton('THE FINALS', `All Items, ${countOf(templateItemCount('image-reachthefinals')).words}`).getByRole('img'))
      .toHaveAccessibleName('SLEDGEHAMMER');
    await expect(site.templateButton('OVERWATCH', `Tank, ${countOf(templateItemCount('image-overwatch', 'tank')).words}`).getByRole('img'))
      .toHaveAccessibleName('Reinhardt');
  });

  test('renders the set background, the underline and white counts when the user hovers the card THE FINALS', async ({site}) => {
    await site.gotoHome();
    const allItems = `All Items, ${countOf(templateItemCount('image-reachthefinals')).words}`;
    const before = await site.cardLayers('THE FINALS');
    expect(before.background).toMatchObject({opacity: '0', backgroundImage: expect.stringContaining('/splash/')});
    expect(before.underline?.backgroundImage).toContain('/splash/');

    await site.hoverCard('THE FINALS');

    const after = await site.cardLayers('THE FINALS');
    expect(after.background).toMatchObject({opacity: '1', backgroundImage: before.background?.backgroundImage});
    expect(after.underline).toEqual(before.underline);
    // The count turns white at 70 % (alpha 0.7 × 255 ≈ 179).
    await expect.poll(async () => {
      const [red, green, blue, alpha] = await site.templateCountColour('THE FINALS', allItems);
      return red === 255 && green === 255 && blue === 255 && Math.abs(alpha - 179) <= 2;
    }, {message: 'the count is white at 70 %'}).toBe(true);
    // OVERWATCH is not hovered: its background stays hidden.
    expect((await site.cardLayers('OVERWATCH')).background?.opacity).toBe('0');
  });

  test('renders no section "Recently viewed" when the landing page opens before any list was opened', {tag: '@mobile'}, async ({site}) => {
    await site.gotoHome();
    await expect(site.heading('Create a New Tier List')).toBeVisible();
    await expect(site.recentlyViewed).toHaveCount(0);
  });

  test('renders the opened lists, newest first, and no template page when the landing page opens', {tag: '@mobile'}, async ({tierList, site}) => {
    await openTwoLists(tierList);
    // A template without a list is not recorded.
    await tierList.goto(TANKS);
    await tierList.waitUntilInteractive();

    await site.gotoHome();
    await expect(site.recentlyViewed).toContainText('Lists you opened in this browser. Bookmark one to open it anywhere.');
    await expect(site.recentLinks).toHaveText(['Support list', 'Tanks list']);
  });

  test('renders the pinned list first, also after a reload, when the user pins it', {tag: '@mobile'}, async ({tierList, site, page}) => {
    await openTwoLists(tierList);
    await site.gotoHome();

    await site.recentPinButton('Tanks list').click();

    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'true');
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);
    await page.reload();
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);
    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'true');
  });

  test('renders the list in its opened place when the user unpins it', {tag: '@mobile'}, async ({tierList, site}) => {
    await openTwoLists(tierList);
    await site.gotoHome();
    await site.recentPinButton('Tanks list').click();
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);

    await site.recentPinButton('Tanks list').click();

    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'false');
    await expect(site.recentLinks).toHaveText(['Support list', 'Tanks list']);
  });

  test('renders the other lists, also after a reload, when the user removes a list', {tag: '@mobile'}, async ({tierList, site, page}) => {
    await openTwoLists(tierList);
    await site.gotoHome();

    await site.removeRecentLink('Support list');

    await expect(site.recentLinks).toHaveText(['Tanks list']);
    await page.reload();
    await expect(site.recentLinks).toHaveText(['Tanks list']);
  });

  test('renders the list with its title and items when the user clicks it in Recently viewed', {tag: '@mobile'}, async ({tierList, site}) => {
    await openTwoLists(tierList);
    await site.gotoHome();

    await site.recentLink('Tanks list').click();

    await expect(tierList.title).toHaveText('Tanks list');
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });

  test('renders the list once in Recently viewed, with its opened title, when the user edits it after opening', async ({tierList, site}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'Edited list'));
    await tierList.setTitle('New title');
    await tierList.renameTier('A', 'Great');
    await tierList.dragItemToTier('Winston', 'S');

    await site.gotoHome();
    await expect(site.recentLinks).toHaveText(['Edited list']);
  });

  test('renders the page name OVERWATCH - Tank in Recently viewed when the opened link has no title', {tag: '@mobile'}, async ({tierList, site}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.waitUntilInteractive();
    await site.gotoHome();
    await expect(site.recentLinks).toHaveText(['OVERWATCH - Tank']);
  });

  test.describe('opening files', () => {
    for (const entry of golden) {
      test(`renders the list of ${entry.file} one Back step from home when the user chooses it with Open a Freeze Frame`, async ({site, tierList, page}) => {
        for (const host of new Set(entry.linkImages.map((url) => new URL(url).hostname))) await serveImageSite(page, host);
        await site.gotoHome();

        await site.openFreezeFrame(pngFile(entry.file, fs.readFileSync(path.join(SNAPSHOTS, entry.file))));
        await expect(site.openListDialog).toContainText('This page stays one Back step away.');
        await site.confirmOpenList();

        await expect(page).toHaveURL(new RegExp(`${entry.path}\\?state=3\\.`));
        await expectTierList(tierList, {title: entry.title, tiers: entry.tiers});
        for (const label of entry.pictures) {
          await expect.poll(() => tierList.itemImageHasLoaded(label), {message: `the picture ${label} loads`}).toBe(true);
        }
        await page.goBack();
        await expect(site.heading('Create a New Tier List')).toBeVisible();
      });
    }

    test('renders the landing page and no list when the user cancels Open the list in this file?', async ({site, page}) => {
      const entry = golden[0];
      await site.gotoHome();

      await site.openFreezeFrame(pngFile(entry.file, fs.readFileSync(path.join(SNAPSHOTS, entry.file))));
      await site.openListDialog.getByRole('button', {name: 'Cancel'}).click();

      await expect(site.openListDialog).toBeHidden();
      await expect(site.ownListCard.getByRole('button', {name: 'Open a Freeze Frame'})).toBeFocused();
      await expect(page).toHaveURL(/\/$/);
    });

    test('renders a new list with the picture in Unranked, one Back step from home, when the user drops it on the drop area', async ({site, tierList, page}) => {
      await site.gotoHome();

      await site.dropOnDropArea(imageFile('red-square.png'));

      await expect(page).toHaveURL(/\/rank\?state=3\./);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
      await page.goBack();
      await expect(site.heading('Create a New Tier List')).toBeVisible();
    });

    test('renders the dialog Open the list in this file? when the user drops a Freeze Frame on the drop area', async ({site}) => {
      const entry = golden[0];
      await site.gotoHome();

      await site.dropOnDropArea(pngFile(entry.file, fs.readFileSync(path.join(SNAPSHOTS, entry.file))));

      await expect(site.openListDialog).toContainText('This page stays one Back step away.');
    });
  });
});
