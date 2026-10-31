import {expect, test} from '../support/test';
import {packageItemId, rankingState, v3State} from '../support/links';
import {escapeRegExp} from '../support/regexp';

const TANKS = '/rank/overwatch/tank';

test.describe('Sharing', () => {
  test('the share panel offers the link and an image', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);

    await tierList.openSharePanel();

    await expect(tierList.shareTab('URL')).toBeVisible();
    await expect(tierList.shareTab('Image')).toBeVisible();
    await expect(tierList.copyMarkdownButton).toBeVisible();
  });

  test('Copy Markdown puts a message with the current link on the clipboard', {tag: '@mobile'}, async ({
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

  test('after Back, Share hands out the list on screen with the label settings on screen', async ({
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

  test('on a slow connection, Copy Markdown right after quick changes shares the latest list', async ({
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

  test('a shared link carries the label position and label visibility', async ({tierList, openAsVisitor}) => {
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

  test('a blank list link (/rank/?state=) opens with its label settings, also after a reload', async ({tierList}) => {
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

  test('a v3 link with labels on Top opens with them on Top', {tag: '@mobile'}, async ({tierList}) => {
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

/**
 * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
 * suite stays green while the bug exists. See editor-items.spec.ts for the convention.
 */
test.describe('Known bugs', () => {
  test('the Facebook and X share buttons have names that screen readers can announce', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.openSharePanel();
    // Marked here, after the steps that must work: a failure above fails the test as usual.
    test.fail(true, 'The two buttons hold only an icon (components/ShareButton.tsx), so they have no accessible name.');
    await expect(tierList.socialShareButton(/Facebook/)).toBeVisible({timeout: 2_000});
    await expect(tierList.socialShareButton(/\bX\b|Twitter/)).toBeVisible({timeout: 2_000});
  });
});
