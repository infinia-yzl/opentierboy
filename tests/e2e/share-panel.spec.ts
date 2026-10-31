import {expect, test} from '../support/test';
import {packageItemId, rankingState, v3State} from '../support/links';
import {escapeRegExp} from '../support/regexp';
import {imageFile, serveImageSite} from '../support/image-sites';

const TANKS = '/rank/overwatch/tank';

test.describe('share panel', () => {
  test.describe('share link', () => {
    test('renders the tabs URL and Image and button "Copy Markdown" when the user opens the share panel', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.openSharePanel();

      await expect(tierList.shareTab('URL')).toBeVisible();
      await expect(tierList.shareTab('Image')).toBeVisible();
      await expect(tierList.copyMarkdownButton).toBeVisible();
    });

    test('writes Markdown with the title and the v3 link of the list to the clipboard when the user clicks Copy Markdown', {tag: '@mobile'}, async ({
      tierList,
      openAsVisitor,
    }) => {
      await tierList.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.copyMarkdown();

      const markdown = await tierList.clipboardText();
      expect(markdown).toContain('**OVERWATCH - Tank**');
      // The link of the list on screen (A46): this page, written as a v3 link.
      const linkInMarkdown = markdown.match(/\]\((\S+)\)/)?.[1];
      expect(linkInMarkdown).toMatch(new RegExp(`^${escapeRegExp(new URL(TANKS, tierList.page.url()).href)}\\?state=3\\.`));
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('writes the list and label settings on screen to the clipboard link when the user clicks Copy Markdown after Back', async ({
      tierList,
      openAsVisitor,
      page,
    }) => {
      await tierList.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.chooseLabelPosition('Top');
      // Back: Mauga leaves S, and the labels stay on Top, while the address holds the entry
      // before (labels on the left).
      await page.goBack();
      await expect(tierList.itemsIn('S')).toHaveCount(0);

      await tierList.copyMarkdown();

      const linkInMarkdown = (await tierList.clipboardText()).match(/\]\((\S+)\)/)?.[1];
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('S')).toHaveCount(0);
      await expect(friend.itemsIn(friend.unranked)).toHaveText(['Mauga', 'Winston']);
      await friend.openRowOptions();
      await expect(friend.rowOption('Top')).toBeChecked();
      await expect(friend.rowOption('Show Labels')).toBeChecked();
      await friend.closeMenus();
    });

    test('writes the latest list to the clipboard when the user clicks Copy Markdown after 3 quick moves on a slow server', async ({
      tierList,
      openAsVisitor,
    }) => {
      await tierList.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      await tierList.simulateSlowServer(400);

      // The links reach the address one at a time; the share text must not wait for them.
      for (const name of ['Mauga', 'Winston', 'Sigma']) {
        await tierList.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false});
      }
      await tierList.copyMarkdown();

      const linkInMarkdown = (await tierList.clipboardText()).match(/\]\((\S+)\)/)?.[1];
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('F')).toHaveCount(3);
    });

    test('writes the label position and label visibility to the share link when the user changes them', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.chooseLabelPosition('Top');
      await tierList.setItemLabelsVisible(false);

      const friend = await openAsVisitor(await tierList.shareLink());
      await friend.openRowOptions();
      await expect(friend.rowOption('Top')).toBeChecked();
      await expect(friend.rowOption('Hide Labels')).toBeChecked();
      await friend.closeMenus();
      await expect.poll(() => friend.tierLabelIsAbove('S', 'Mauga')).toBe(true);
      await expect(friend.item('Mauga')).toHaveText('');
    });

    test('renders the label settings of the link, also after a reload, when the page opens /rank/?state= with lp and sl', async ({tierList}) => {
      // The landing page's "Create Blank List" opens /rank/; its links carry the settings too.
      const mauga = packageItemId('image-overwatch', 'Mauga');
      await tierList.goto('/rank/', v3State({t: 'Blank list', tp: 5, lp: 'top', sl: false, r: [['S', [mauga]], ['A', []], ['B', []], ['C', []], ['F', []], ['', []]]}));

      await expect(tierList.title).toHaveText('Blank list');
      await tierList.openRowOptions();
      await expect(tierList.rowOption('Top')).toBeChecked();
      await expect(tierList.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect.poll(() => tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);

      await tierList.reload();
      await tierList.openRowOptions();
      await expect(tierList.rowOption('Top')).toBeChecked();
      await expect(tierList.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect(tierList.item('Mauga')).toHaveText('');
    });

    test('renders row labels on top when the page opens a v3 link with lp top', {tag: '@mobile'}, async ({tierList}) => {
      const mauga = packageItemId('image-overwatch', 'Mauga');
      await tierList.goto(TANKS, v3State({tp: 5, lp: 'top', r: [['S', [mauga]], ['A', []], ['B', []], ['C', []], ['F', []], ['', []]]}));

      await tierList.openRowOptions();

      await expect(tierList.rowOption('Top')).toBeChecked();

      await expect(tierList.rowOption('Show Labels')).toBeChecked();

      await tierList.closeMenus();
      await expect.poll(() => tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);
      await expect(tierList.item('Mauga')).toHaveText('Mauga');
    });
  });

  // The share panel says which images the link carries (the board "SharePanel"): link images
  // travel in the link, device images stay in this browser and go along only in a Freeze Frame file.
  test.describe('images in the link', () => {
    test('renders no image note in the share panel when the page opens a list with only image-set items', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      await tierList.openSharePanel();

      await expect(tierList.copyMarkdownButton).toBeVisible();
      await expect(tierList.linkImageNotes).toHaveCount(0);
    });

    test('renders the note "2 images from other sites travel in the link." when the page opens a list with 2 link images', {tag: '@mobile'}, async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS, v3State({t: 'Link images', tp: 3, r: [
        ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'Red'}]],
        ['A', []], ['B', []], ['', [{u: 'https://i.imgur.com/blue.png', c: 'Blue'}]],
      ]}));

      await tierList.openSharePanel();

      await expect(tierList.linkImageNotes).toHaveCount(1);
      await expect(tierList.linkImageNotes).toHaveText(
        '2 images from other sites travel in the link. People who open it load them from those sites.');
    });

    test('renders the note "1 image from your device stays on this device." when the user adds an image from the device', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.addItemsFromDevice([imageFile('red-square.png')]);

      await tierList.openSharePanel();

      await expect(tierList.linkImageNotes).toHaveCount(1);
      await expect(tierList.linkImageNotes).toHaveText(
        '1 image from your device stays on this device. People who open the link see its name. To share it too, download the picture below.');
    });

    test('renders a note for 3 device images and one for 1 link image when the page opens a list with both', {tag: '@mobile'}, async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS, v3State({t: 'Both', tp: 3, r: [
        ['S', [{u: 'https://i.imgur.com/red.png', c: 'Red'}, {d: 'NeverHere1234567', c: 'Cat'}]],
        ['A', [{d: 'NeverHere7654321', c: 'Dog'}]], ['B', []], ['', [{d: 'NeverHere0000001', c: 'Bird'}]],
      ]}));

      await tierList.openSharePanel();

      await expect(tierList.linkImageNotes).toHaveText([
        '3 images from your device stay on this device. People who open the link see their names. To share them too, download the picture below.',
        '1 image from another site travels in the link. People who open it load it from that site.',
      ]);
    });
  });

  /**
   * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
   * suite stays green while the bug exists. See editor-items.spec.ts for the convention.
   */
  test.describe('Known bugs', () => {
    test('renders the Facebook and X share buttons with accessible names when the user opens the share panel', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.openSharePanel();
      // Marked here, after the steps that must work: a failure above fails the test as usual.
      test.fail(true, 'The two buttons hold only an icon (components/ShareButton.tsx), so they have no accessible name.');
      await expect(tierList.socialShareButton(/Facebook/)).toBeVisible({timeout: 2_000});
      await expect(tierList.socialShareButton(/\bX\b|Twitter/)).toBeVisible({timeout: 2_000});
    });
  });
});
