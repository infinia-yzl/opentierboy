import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import {BLUE_SQUARE, imageFile, noisePng, RED_SQUARE} from '../support/imageSites';
import {pngFile} from '../support/snapshotFiles';
import {SCRIPTED_PASTE_SKIP, type SentRequest} from '../pages/TierListPage';

/**
 * Product rule 5: pictures from a device never reach the server. Each test records every
 * request the page sends while pictures are added in one way, and checks that no request
 * carries a picture's bytes, in its body or in its address.
 */
const TANKS = '/rank/overwatch/tank';

function carriesPicture(request: SentRequest, picture: Buffer): boolean {
  const base64 = picture.toString('base64');
  const inAddress = [base64, encodeURIComponent(base64), 'data:image'].some((text) => request.url.includes(text));
  // The PNG signature, or the picture itself, as bytes or as base64 text.
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const inBody = request.body.includes(signature) || request.body.includes(picture) || request.body.includes(base64) || request.body.includes('data:image');
  return inAddress || inBody;
}

function expectNoPictureSent(requests: SentRequest[], pictures: Buffer[]) {
  // data: and blob: addresses stay in the browser; only network requests count.
  const network = requests.filter((request) => /^https?:/.test(request.url));
  // The editor still talks to the server (page data for each Back step), so check that it did.
  expect(network.length).toBeGreaterThan(0);
  for (const request of network) {
    for (const picture of pictures) {
      expect(carriesPicture(request, picture), `${request.method} ${request.url}`).toBe(false);
    }
  }
}

test.describe('Pictures from a device never reach the server (rule 5)', () => {
  test('uploading, dropping and capturing a list with pictures sends none of them', async ({tierList}) => {
    // A bigger picture than the test squares, so its bytes are unmistakable.
    const photo = noisePng(48, 48, 7);
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Private pictures'));
    const sent = tierList.recordRequests();

    await tierList.addItemsFromDevice([imageFile('photo.png', photo)]);
    await tierList.dropFile(imageFile('dropped.png', BLUE_SQUARE));
    await expect(tierList.itemsIn(tierList.unranked)).toContainText(['photo', 'dropped']);
    await expect.poll(() => tierList.itemImageHasLoaded('dropped')).toBe(true);
    await tierList.capturePreview();
    await tierList.downloadCapturedImage();

    expectNoPictureSent(sent(), [photo, BLUE_SQUARE]);
  });

  test('pasting a picture sends nothing of it', async ({tierList, browserName}) => {
    test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
    await tierList.goto(TANKS);
    const sent = tierList.recordRequests();

    await tierList.pasteImages([imageFile('pasted.png', RED_SQUARE)]);
    await expect(tierList.itemsIn(tierList.unranked)).toContainText(['pasted']);
    await expect.poll(() => tierList.itemImageHasLoaded('pasted')).toBe(true);

    expectNoPictureSent(sent(), [RED_SQUARE]);
  });

  test('opening a Freeze Frame file with pictures sends none of them, nor the file', async ({tierList, openAsVisitor}) => {
    const photo = noisePng(40, 40, 11);
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Shared pictures'));
    await tierList.addItemsFromDevice([imageFile('photo.png', photo)]);
    await expect.poll(() => tierList.itemImageHasLoaded('photo')).toBe(true);
    await tierList.capturePreview();
    const file = await tierList.downloadCapturedImage();

    const friend = await openAsVisitor('/rank');
    const sent = friend.recordRequests();
    await friend.openFile(pngFile(file.name, file.buffer));
    await friend.confirmOpenList();
    await expect(friend.itemsIn(friend.unranked)).toHaveText(['photo']);
    await expect.poll(() => friend.itemImageHasLoaded('photo')).toBe(true);

    // The file is itself a PNG: its bytes must not leave either.
    expectNoPictureSent(sent(), [file.buffer.subarray(0, 4096)]);
  });
});
