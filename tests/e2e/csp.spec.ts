import {expect, SHARED_LINKS, test} from '../support/test';
import {packageItemId, rankingState, v3State} from '../support/links';
import {imageFile, serveImageSite} from '../support/imageSites';
import {pngFile} from '../support/snapshotFiles';
import type {CaptureMethod} from '../pages/TierListPage';

/**
 * The Content Security Policy (lib/security/csp.ts, A11). A page that breaks it shows a
 * `securitypolicyviolation` event; every test here expects none.
 */
test.describe('Content Security Policy', () => {
  test('every page sends the policy', async ({page}) => {
    const response = await page.goto('/');
    const policy = response?.headers()['content-security-policy'] ?? '';
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("img-src 'self' https: data: blob:");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('unsafe-eval');
  });

  test('home, a template, a blog article and a shared link load without violations', {tag: '@mobile'}, async ({page, tierList, site, cspViolations}) => {
    await page.goto('/', {waitUntil: 'networkidle'});
    await expect(site.main).toBeVisible();
    await tierList.goto('/rank/overwatch/tank');
    await page.goto('/blog/overwatch-2-karq-tier-list-season-11', {waitUntil: 'networkidle'});
    await expect(site.pageHeading).toBeVisible();
    await tierList.gotoLink(`${SHARED_LINKS[0].path}?state=${SHARED_LINKS[0].state}`);
    await page.waitForLoadState('networkidle');
    await expect.poll(() => cspViolations()).toEqual([]);
  });

  test('Freeze Frame Download, opening the file, a dropped picture and Recently viewed cause no violation', async ({tierList, site, page, cspViolations}) => {
    await tierList.goto('/rank/overwatch/tank', rankingState('image-overwatch', {S: ['Mauga']}, 'CSP snapshot'));
    await tierList.addItemsFromDevice([imageFile('red-square.png')]);
    await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
    await tierList.capturePreview();
    const snapshot = await tierList.downloadCapturedImage();
    await page.keyboard.press('Escape');

    await tierList.goto('/rank');
    await tierList.dropFile(imageFile('blue-square.png'));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue-square']);
    await tierList.openFile(pngFile(snapshot.name, snapshot.buffer));
    await tierList.confirmOpenList();
    await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);

    await site.gotoHome();
    await expect(site.recentLinks.first()).toHaveText('CSP snapshot');
    await page.waitForLoadState('networkidle');
    await expect.poll(() => cspViolations()).toEqual([]);
  });

  for (const method of ['html2canvas-pro', 'Original html2canvas'] as CaptureMethod[]) {
    test(`Freeze Frame with ${method}, with a link image and a device image on screen, causes no violation`, async ({tierList, page, cspViolations}) => {
      await serveImageSite(page, 'i.imgur.com');
      const state = v3State({t: 'CSP', tp: 3, r: [
        ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'Link image'}]],
        ['A', []], ['B', []], ['', []],
      ]});
      await tierList.goto('/rank/overwatch/tank', state);
      await tierList.addItemsFromDevice([imageFile('red-square.png')]);
      await expect.poll(() => tierList.itemImageHasLoaded('Link image')).toBe(true);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);

      await tierList.capturePreview(method);

      await expect(tierList.toast('Image captured successfully')).toBeVisible();
      await expect.poll(() => cspViolations()).toEqual([]);
    });
  }
});
