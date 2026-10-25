import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import type {CaptureMethod} from '../pages/TierListPage';

const TANKS = '/rank/overwatch/tank';
const METHODS: CaptureMethod[] = ['html2canvas-pro', 'Original html2canvas'];

// "Freeze Frame" turns the page into an image with html2canvas. These tests guard it
// against styling changes that the capture libraries cannot read, for example new CSS
// colour functions in a framework upgrade.
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
        // The capture covers the width of the page, at the screen's pixel density.
        expect(Math.abs(image.width - image.pageWidth * image.devicePixelRatio), 'image width')
          .toBeLessThanOrEqual(2);
        expect(image.height, 'image height').toBeGreaterThanOrEqual(300 * image.devicePixelRatio);
        expect(image.height, 'image height').toBeLessThanOrEqual(image.pageHeight * image.devicePixelRatio + 2);
        // A real picture of the list has many colours (tier gradients, item images).
        expect(image.distinctColors, 'colours in the image').toBeGreaterThan(50);
        // The gradients alone have that many, so also look inside one item tile: its image and
        // label must be in the capture, about as colourful as on the page.
        const tileColors = await tierList.capturedColorsInColumn(tile.box);
        expect(tileColors, `colours in the "Mauga" tile (page shows ${tile.colors})`)
          .toBeGreaterThanOrEqual(tile.colors * 0.5);
        // The page background shows in the corner, so it follows the colour scheme.
        if (colorScheme === 'dark') {
          expect(image.cornerBrightness, 'dark page background').toBeLessThan(60);
        } else {
          expect(image.cornerBrightness, 'light page background').toBeGreaterThan(200);
        }
        expect(consoleErrors, 'errors in the browser console').toEqual([]);
      });
    }
  });
}
