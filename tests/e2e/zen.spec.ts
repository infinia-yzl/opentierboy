import {expect, test} from '../support/test';
import {SCRIPTED_PASTE_SKIP} from '../pages/tier-list-page';
import {imageFile, serveImageSite} from '../support/image-sites';

const TANKS = '/rank/overwatch/tank';

test.describe('zen', () => {
  test('renders no button "Add row", "Row options", "Add images" or "Share" when the user turns on Zen', {tag: '@mobile'}, async ({
    tierList,
  }) => {
    await tierList.goto(TANKS);
    const toolbar = [tierList.addRowButton, tierList.rowOptionsButton, tierList.manageItemsButton, tierList.shareButton];

    await tierList.setZenMode(true);

    await expect(tierList.toast('Entered Zen Mode')).toBeVisible();
    for (const button of toolbar) {
      await expect(button).toBeHidden();
    }
    await expect(tierList.item('Mauga')).toBeVisible();

    await tierList.setZenMode(false);

    for (const button of toolbar) {
      await expect(button).toBeVisible();
    }
  });

  test('renders no menu item "Delete" in the item menu when the user turns on Zen', async ({tierList, page}) => {
    await tierList.goto(TANKS);
    await tierList.setZenMode(true);

    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await tierList.setZenMode(false);
    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toBeVisible();
  });

  // Zen turns off adding and removing items (its toast says so). Dropped and pasted links add
  // nothing in Zen, and the drop overlay stays away. Dropped and pasted picture files are added in
  // Zen, as they were before links could be dropped.
  test.describe('dropping and pasting', () => {
    test('renders no drop overlay when the user drags a link over the editor in Zen', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);

      await tierList.dragLinkOver('https://i.imgur.com/red.png');
      // The overlay would stay until the drag ends: turning Zen off first lets the page render.
      await tierList.setZenMode(false);

      await expect(tierList.dropOverlay).toHaveCount(0);
    });

    test('writes 1 history entry, for the picture only, when the user drops a link and then a picture in Zen', async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.dropText({uriList: 'https://i.imgur.com/red.png', plain: 'https://i.imgur.com/red.png'});
      await tierList.dropFile(imageFile('blue-square.png'));

      await expect(tierList.item('blue-square')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
      await expect(tierList.item('red')).toHaveCount(0);
    });

    test('writes 1 history entry, for the picture only, when the user pastes an image address and then a picture in Zen', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.pasteText('https://i.imgur.com/red.png');
      await tierList.pasteImages([imageFile('blue-square.png')]);

      await expect(tierList.item('blue-square')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
      await expect(tierList.item('red')).toHaveCount(0);
    });
  });
});
