import {expect, test} from '../support/test';
import {rankingState} from '../support/links';

const TANKS = '/rank/overwatch/tank';

test.describe('Sharing', () => {
  test('the share panel offers the link and an image', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);

    await tierList.openSharePanel();

    await expect(tierList.sharePanel.getByRole('tab', {name: 'URL'})).toBeVisible();
    await expect(tierList.sharePanel.getByRole('tab', {name: 'Image'})).toBeVisible();
    await expect(tierList.sharePanel.getByRole('button', {name: 'Copy Markdown'})).toBeVisible();
  });

  test('Copy Markdown puts a message with the current link on the clipboard', {tag: '@mobile'}, async ({
    tierList,
    context,
    browserName,
    openAsVisitor,
  }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium lets a test grant clipboard read access.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    const link = await tierList.shareLink();

    await tierList.copyMarkdown();

    const markdown = await tierList.clipboardText();
    expect(markdown).toContain('**OVERWATCH - Tank**');
    const linkInMarkdown = markdown.match(/\]\((\S+)\)/)?.[1];
    expect(linkInMarkdown).toBe(link);
    const friend = await openAsVisitor(linkInMarkdown!);
    await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
  });
});
