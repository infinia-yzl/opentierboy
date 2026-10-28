import {expect, test} from '../support/test';
import {packageItemId, rankingState, v3State} from '../support/links';
import {serveImageSite} from '../support/imageSites';
import type {CaptureMethod} from '../pages/TierListPage';

const TANKS = '/rank/overwatch/tank';
const METHODS: CaptureMethod[] = ['html2canvas-pro', 'Original html2canvas'];

// "Freeze Frame" draws the list card (components/ListCard.tsx, the layout link previews use)
// with html2canvas. These tests guard it against styling changes that the capture libraries
// cannot read, for example new CSS colour functions in a framework upgrade.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Freeze Frame in ${colorScheme} mode`, () => {
    // The site follows the system colour scheme until a visitor picks a theme.
    test.use({colorScheme});

    for (const method of METHODS) {
      test(`Capture Preview with ${method} shows an image of the tier list`, {tag: '@mobile'}, async ({
        tierList,
        consoleErrors,
      }) => {
        await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston', 'D.Va']}));
        const tile = await tierList.tileColorsOnScreen('Mauga');

        await tierList.capturePreview(method);

        await expect(tierList.toast('Failed to capture image')).toHaveCount(0);
        await expect(tierList.toast('Image captured successfully')).toBeVisible();
        const image = await tierList.capturedImageDetails();
        // The card is 1200 CSS pixels wide, drawn at twice the size on screens with dense pixels.
        const scale = image.devicePixelRatio >= 2 ? 2 : 1;
        expect(image.width, 'image width').toBe(1200 * scale);
        expect(image.height, 'image height').toBeGreaterThanOrEqual(300 * scale);
        expect(image.height, 'image height').toBeLessThanOrEqual(1200 * scale);
        // A real picture of the list has many colours (tier gradients, item images).
        expect(image.distinctColors, 'colours in the image').toBeGreaterThan(50);
        // The gradients alone have that many, so also look inside the first tile: Mauga's image
        // and name must be in the capture, about as colourful as on the page.
        const tileColors = await tierList.capturedCardTileColors();
        expect(tileColors, `colours in the "Mauga" tile (page shows ${tile.colors})`)
          .toBeGreaterThanOrEqual(tile.colors * 0.5);
        // The card has its own dark background in both colour schemes.
        expect(image.cornerBrightness, 'dark card background').toBeLessThan(40);
        expect(consoleErrors, 'errors in the browser console').toEqual([]);
      });
    }
  });
}

// Link images come from other sites. A canvas that draws an image without its site's consent
// (CORS) cannot be exported, so the capture draws such images as label tiles (A10).
test.describe('Freeze Frame with link images', () => {
  for (const method of METHODS) {
    test(`Capture Preview with ${method} succeeds with link images on screen`, async ({tierList, page, consoleErrors}) => {
      await serveImageSite(page, 'i.imgur.com');
      await serveImageSite(page, 'upload.wikimedia.org', {cors: false});
      await tierList.goto(TANKS, v3State({t: 'Link images', tp: 3, r: [
        ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'With CORS'}]],
        ['A', [{u: 'https://upload.wikimedia.org/red.png', c: 'Without CORS'}]], ['B', []], ['', []],
      ]}));
      await expect.poll(() => tierList.itemImageHasLoaded('With CORS')).toBe(true);
      await expect.poll(() => tierList.itemImageHasLoaded('Without CORS')).toBe(true);

      await tierList.capturePreview(method);

      await expect(tierList.toast('Failed to capture image')).toHaveCount(0);
      await expect(tierList.toast('Image captured successfully')).toBeVisible();
      const image = await tierList.capturedImageDetails();
      expect(image.distinctColors, 'colours in the image').toBeGreaterThan(50);
      // The browser reports the refused CORS check of the site without CORS; nothing else may fail.
      expect(consoleErrors.filter((error) => !error.includes('upload.wikimedia.org') && !error.includes('net::ERR_FAILED')), 'errors in the browser console').toEqual([]);
    });
  }
});
