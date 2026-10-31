import zlib from 'node:zlib';
import {expect, expectTierList, test} from '../support/test';
import {packageItemId, rankingState, templateItemCount, v3LinkJson, v3State} from '../support/links';
import {BLUE_SQUARE, imageFile, noisePng, RED_SQUARE, serveImageSite} from '../support/imageSites';
import {pngDeclaring, pngFile, pngWithSnapshotText, snapshotTextOf} from '../support/snapshotFiles';
import {SCRIPTED_PASTE_SKIP, type TierListPage} from '../pages/TierListPage';
import {SitePage} from '../pages/SitePage';

const TANKS = '/rank/overwatch/tank';
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

/** A 2 x 2 green BMP picture (24 bits per pixel), which browsers show but the store does not keep as it is. */
function greenBmp(): Buffer {
  const file = Buffer.alloc(70);
  file.write('BM', 0, 'latin1');
  file.writeUInt32LE(70, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(2, 18);
  file.writeInt32LE(2, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(16, 34);
  for (const row of [0, 1]) {
    for (const column of [0, 1]) file.writeUIntLE(0x00ff00, 54 + row * 8 + column * 3, 3); // blue, green, red bytes
  }
  return file;
}

/** A small AVIF or HEIC file: an ISO base media "ftyp" box with that brand, then filler. */
function isoMedia(brand: string): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}\0\0\0\0mif1${brand}`, 'latin1'), Buffer.alloc(64)]);
}

/** The refusal of "From your device" for AVIF and HEIC images. */
const AVIF_HEIC_REFUSAL = 'AVIF and HEIC images cannot be added yet. Save the image as PNG, JPEG or WebP and add it again.';

/** A snapshot file as another browser could write it: these device images in row S. */
function listFile(name: string, {title, path, images}: {title: string; path?: string; images: {id: string; label: string; png: Buffer}[]}) {
  const state = v3State({t: title, tp: 3, r: [['S', images.map(({id, label}) => ({d: id, c: label}))], ['A', []], ['B', []], ['', []]]});
  const payload = {
    version: 1,
    state,
    ...(path ? {path} : {}),
    images: images.map(({id, label, png}) => ({id, label, dataUrl: `data:image/png;base64,${png.toString('base64')}`})),
  };
  return pngFile(name, pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload)));
}

/** Seeded random text from the id alphabet: it compresses badly, as long real lists do. */
function randomText(seed: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = seed;
  return (length: number) => Array.from({length}, () => {
    // A 32-bit linear congruential generator; its high bits are the random ones.
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return alphabet[state >>> 26];
  }).join('');
}

type V3Json = {r: unknown[][]};

/**
 * The `state` value of a v3 list with filler items (ids no image set has, random labels) added to
 * its first row, as many as fit under `limit` characters.
 */
function stateNearCap(json: V3Json, limit: number, seed = 5): string {
  const text = randomText(seed);
  const copy = JSON.parse(JSON.stringify(json)) as V3Json;
  const row = copy.r[0];
  const items = row[row.length - 1] as unknown[];
  let state = v3State(copy);
  for (let step = 16; step >= 1; step = Math.floor(step / 2)) {
    for (;;) {
      const added = Array.from({length: step}, () => ({i: `x-${text(14)}`, c: text(48)}));
      items.push(...added);
      const next = v3State(copy);
      if (next.length > limit) {
        items.splice(items.length - step, step);
        break;
      }
      state = next;
    }
  }
  return state;
}

/** The device images (`{d}` items) of a v3 link in the address bar. */
function deviceItemsOf(url: string): number {
  return (v3LinkJson(url) as V3Json).r.flatMap((row) => row[row.length - 1] as object[]).filter((item) => 'd' in item).length;
}

/** Makes a snapshot file the way people do: a list with a device image, Capture Preview, Download. */
async function downloadSnapshotOf(tierList: TierListPage): Promise<Buffer> {
  await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'Tanks with a cat'));
  await tierList.addItemsFromDevice([imageFile('red-square.png')]);
  await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
  await tierList.capturePreview();
  // Download says what the file carries before anyone sends it on (owner decision, 2026-10-31).
  await expect(tierList.sharePanel).toContainText(
    'The file keeps your list and your own pictures. Anyone you send it to can open it here and edit the list.');
  const file = await tierList.downloadCapturedImage();
  expect(file.name).toBe('tanks-with-a-cat.png');
  return file.buffer;
}

const SNAPSHOT_LIST = {
  title: 'Tanks with a cat',
  tiers: [
    {name: 'S', items: ['Mauga']},
    {name: 'A', items: ['Winston']},
    {name: 'B', items: []},
    {name: 'C', items: []},
    {name: 'F', items: []},
    {name: 'Unranked', items: ['red-square']},
  ],
};

test.describe('Snapshot files: Freeze Frame Download, then Open a Freeze Frame (A10)', () => {
  // Each test builds a list, captures and downloads it, then opens the file, often in a second
  // browser: on a busy machine that takes longer than the default 30 seconds.
  test.slow();

  test('a downloaded picture holds the list and its device images, and opens again elsewhere', async ({tierList, openAsVisitor}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    // Still an ordinary PNG, with the list inside.
    expect(snapshot.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const payload = JSON.parse(snapshotTextOf(snapshot) ?? 'null');
    expect(payload).toMatchObject({version: 1, path: TANKS, state: expect.stringMatching(/^3\./)});
    expect(payload.images).toHaveLength(1);
    expect(payload.images[0].dataUrl).toMatch(/^data:image\/(webp|png);base64,/);

    // A friend without the image opens the file in an empty list.
    const friend = await openAsVisitor('/rank');
    await friend.openFile(pngFile('tanks-with-a-cat.png', snapshot));
    await expect(friend.openListDialog).toContainText('Your current list stays one Back step away.');
    await friend.confirmOpenList();

    await expect(friend.page).toHaveURL(new RegExp(`${TANKS}\\?state=3\\.`));
    await expectTierList(friend, SNAPSHOT_LIST);
    await expect.poll(() => friend.itemImageCenterColor('red-square')).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
    const [red, green, blue] = (await friend.itemImageCenterColor('red-square'))!;
    expect(red).toBeGreaterThan(200);
    expect(green).toBeLessThan(60);
    expect(blue).toBeLessThan(60);
    // The image is in the friend's device store now: it survives a reload.
    await friend.reload();
    await expect.poll(() => friend.itemImageHasLoaded('red-square')).toBe(true);
  });

  test('when an image of the file cannot be shown, opening says so, and opening again works', async ({tierList, openAsVisitor}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const friend = await openAsVisitor('/rank');
    await friend.openFile(pngFile('snapshot.png', snapshot));
    await expect(friend.openListDialog).toBeVisible();
    // The first URL is the one the editor draws the image through; the second one shows the tile.
    await friend.failObjectUrl({skip: 1});
    await friend.confirmOpenList();

    await expect(friend.toast('Some images could not be added')).toContainText('red-square: Your browser could not save the image.');
    await expect(friend.itemsIn(friend.unranked)).toHaveText(['red-square']);
    await expect.poll(() => friend.itemShowsUpload('red-square')).toBe(false);

    // Nothing is stuck: the same file opens again, with its image.
    await friend.openFile(pngFile('snapshot.png', snapshot));
    await friend.confirmOpenList();
    await expect.poll(() => friend.itemShowsUpload('red-square')).toBe(true);
  });

  test('opening a snapshot adds exactly one Back step', async ({tierList, openAsVisitor}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const friend = await openAsVisitor(`${TANKS}?state=${rankingState('image-overwatch', {B: ['D.Va']}, 'Before')}`);
    const before = friend.page.url();
    const length = await friend.historyLength();

    await friend.openFile(pngFile('snapshot.png', snapshot));
    await friend.confirmOpenList();

    await expect(friend.title).toHaveText('Tanks with a cat');
    await expect.poll(() => friend.historyLength()).toBe(length + 1);
    await friend.page.goBack();
    await expect(friend.page).toHaveURL(before);
    await expect(friend.title).toHaveText('Before');
    await expect(friend.itemsIn('B')).toHaveText(['D.Va']);
    await friend.page.goForward();
    await expect(friend.title).toHaveText('Tanks with a cat');
  });

  test('Cancel in the dialog keeps the current list', async ({tierList, page}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    await page.keyboard.press('Escape');
    const before = page.url();
    const length = await tierList.historyLength();

    await tierList.openFile(pngFile('snapshot.png', snapshot));
    await expect(tierList.openListDialog).toBeVisible();
    await tierList.cancelOpenList();

    await expect(page).toHaveURL(before);
    await expect.poll(() => tierList.historyLength()).toBe(length);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
    // The dialog has no trigger of its own: focus goes back to Add images, whose menu opened the file.
    await expect(tierList.manageItemsButton).toBeFocused();
  });

  test('opening your own file in the browser that made it uses its images as they are', async ({tierList}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const state = JSON.parse(snapshotTextOf(snapshot) ?? 'null').state;
    await expect.poll(() => tierList.deviceImageCount()).toBe(1);
    await tierList.goto('/rank');

    await tierList.openFile(pngFile('snapshot.png', snapshot));
    await tierList.confirmOpenList();

    // The link is the file's own, and no copy of the image was stored.
    await expect(tierList.page).toHaveURL(new URL(`${TANKS}?state=${state}`, tierList.page.url()).href);
    await expect.poll(() => tierList.deviceImageCount()).toBe(1);
    await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
  });

  test('an image under an id this browser holds shows this browser\'s copy quietly, even when the file holds an AVIF', async ({tierList}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    // The file, edited: its image is now an AVIF file under the same id.
    const payload = JSON.parse(snapshotTextOf(snapshot) ?? 'null');
    payload.images[0].dataUrl = `data:image/avif;base64,${isoMedia('avif').toString('base64')}`;
    await tierList.goto('/rank');

    await tierList.openFile(pngFile('edited.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload))));
    await tierList.confirmOpenList();

    // The AVIF is never read: the tile shows the stored copy, and no message says otherwise.
    await expect.poll(() => tierList.itemShowsUpload('red-square')).toBe(true);
    await expect(tierList.toast('Some images could not be added')).toHaveCount(0);
    await expect.poll(() => tierList.deviceImageCount()).toBe(1);
  });

  test('opening the same file again changes nothing: no new image, link or Recently viewed entry', async ({tierList, openAsVisitor}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const friend = await openAsVisitor('/rank');

    await friend.openFile(pngFile('snapshot.png', snapshot));
    await friend.confirmOpenList();
    const link = friend.page.url();
    const images = await friend.deviceImageCount();
    const length = await friend.historyLength();
    expect(images).toBe(1);

    await friend.openFile(pngFile('snapshot.png', snapshot));
    await friend.confirmOpenList({newAddress: false});
    await expect(friend.page).toHaveURL(link);
    await expect.poll(() => friend.deviceImageCount()).toBe(images);
    await expect.poll(() => friend.historyLength()).toBe(length);

    // A third time from another list: the same link again.
    await friend.goto('/rank');
    await friend.openFile(pngFile('snapshot.png', snapshot));
    await friend.confirmOpenList();
    await expect(friend.page).toHaveURL(link);
    await expect.poll(() => friend.deviceImageCount()).toBe(images);
    const friendSite = new SitePage(friend.page);
    await friendSite.gotoHome();
    await expect(friendSite.recentLinks).toHaveText(['Tanks with a cat']);
  });

  test('Download keeps the list the picture shows, also after a later change', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'As captured'));
    await tierList.capturePreview();
    await page.keyboard.press('Escape');
    await tierList.renameTier('S', 'Best');
    await tierList.setTitle('Changed later');

    await tierList.openImageTab();
    const file = await tierList.downloadCapturedImage();

    expect(file.name).toBe('as-captured.png');
    const payload = JSON.parse(snapshotTextOf(file.buffer) ?? 'null');
    const list = v3LinkJson(`https://example.com${TANKS}?state=${payload.state}`) as {t?: string; r: unknown[][]};
    expect(list.t).toBe('As captured');
    expect(list.r.map((row) => row[row.length - 2])).toEqual(['S', 'A', 'B', 'C', 'F', '']);
  });

  test('a snapshot with a link image and a device image opens with both (A10)', async ({tierList, page, openAsVisitor}) => {
    await serveImageSite(page, 'i.imgur.com');
    await tierList.goto(TANKS, v3State({t: 'Link and device', tp: 3, r: [
      ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'Link image'}]],
      ['A', []], ['B', []], ['', []],
    ]}));
    await tierList.addItemsFromDevice([imageFile('blue-square.png', BLUE_SQUARE)]);
    await expect.poll(() => tierList.itemImageHasLoaded('Link image')).toBe(true);
    await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
    await tierList.capturePreview();
    const file = await tierList.downloadCapturedImage();

    const friend = await openAsVisitor('/rank');
    await serveImageSite(friend.page, 'i.imgur.com');
    await friend.openFile(pngFile(file.name, file.buffer));
    await friend.confirmOpenList();

    await expect(friend.itemsIn('S')).toHaveText(['Mauga', 'Link image']);
    await expect(friend.itemsIn(friend.unranked)).toHaveText(['blue-square']);
    await expect.poll(() => friend.itemImageHasLoaded('Link image')).toBe(true);
    await expect.poll(() => friend.itemImageHasLoaded('blue-square')).toBe(true);
  });

  test('dropping a snapshot file asks to open its list, and Back returns to the list before', async ({tierList, openAsVisitor}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const friend = await openAsVisitor('/rank/overwatch/tank');
    await friend.waitUntilInteractive();
    const before = friend.page.url();
    const entries = await friend.historyLength();

    await friend.dropFile(pngFile('snapshot.png', snapshot));
    await expect(friend.openListDialog).toBeVisible();
    await friend.confirmOpenList();
    await expectTierList(friend, SNAPSHOT_LIST);
    await expect.poll(() => friend.historyLength()).toBe(entries + 1);

    await friend.page.goBack();
    await expect(friend.page).toHaveURL(before);
    await expect(friend.itemsIn(friend.unranked)).toHaveCount(TANK_COUNT);
    await friend.page.goForward();
    await expectTierList(friend, SNAPSHOT_LIST);
  });

  test('pasting a snapshot file asks to open its list too, and Cancel keeps the list', async ({tierList, openAsVisitor, browserName}) => {
    test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
    const snapshot = await downloadSnapshotOf(tierList);
    const friend = await openAsVisitor('/rank');

    await friend.pasteImages([pngFile('snapshot.png', snapshot)]);
    await expect(friend.openListDialog).toBeVisible();
    await friend.cancelOpenList();
    await expect(friend.page).toHaveURL(/\/rank$/);

    await friend.pasteImages([pngFile('snapshot.png', snapshot)]);
    await friend.confirmOpenList();
    await expectTierList(friend, SNAPSHOT_LIST);
  });
});

test.describe('Snapshot links near the cap of 13,000 characters', () => {
  test.slow();

  test('a file whose link would pass the cap once its images get their ids here is refused before anything is stored', async ({tierList}) => {
    await tierList.goto('/rank');
    const text = randomText(11);
    // 50 images with 16-character ids, as the store makes them; here they would get 27 characters.
    const images = Array.from({length: 50}, (_, index) => ({id: `img${String(index).padStart(3, '0')}${text(10)}`, label: `Image ${index}`, png: RED_SQUARE}));
    const json = {t: 'Near the cap', tp: 3, r: [['A', []], ['S', images.map(({id, label}) => ({d: id, c: label}))], ['B', []], ['', []]]};
    const state = stateNearCap(json, 13_000);
    expect(state.length).toBeGreaterThan(12_800);
    const payload = {version: 1, state, images: images.map(({id, label, png}) => ({id, label, dataUrl: `data:image/png;base64,${png.toString('base64')}`}))};

    await tierList.openFile(pngFile('near-cap.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload))));

    await expect(tierList.toast('Could not open the file')).toContainText('This file is too large to open as a list.');
    await expect(tierList.openListDialog).toHaveCount(0);
    await expect.poll(() => tierList.deviceImageCount()).toBe(0);
  });

  test('Download keeps the list only when it opens in any browser, and such a file opens elsewhere', async ({tierList, page, openAsVisitor}) => {
    await tierList.goto('/rank');
    const files = Array.from({length: 30}, (_, index) => imageFile(`pic${String(index).padStart(2, '0')}.png`, noisePng(12, 12, index + 1)));
    await tierList.addItemsFromDevice(files, {timeout: 60_000});
    await expect.poll(() => deviceItemsOf(page.url())).toBe(30);
    const json = v3LinkJson(page.url()) as V3Json;

    // Just under the cap as written: opened elsewhere, the images' longer ids would pass it.
    const written = stateNearCap(json, 13_000);
    expect(written.length).toBeGreaterThan(12_800);
    await tierList.goto('/rank', written);
    await expect.poll(() => tierList.itemShowsUpload('pic00')).toBe(true);
    await tierList.capturePreview();
    const picture = await tierList.downloadCapturedImageWithoutList();
    expect(snapshotTextOf(picture.buffer)).toBeNull();

    // Further under the cap: the file keeps the list, and a friend opens it with its images.
    await tierList.goto('/rank', stateNearCap(json, 12_300));
    await expect.poll(() => tierList.itemShowsUpload('pic00')).toBe(true);
    await tierList.capturePreview();
    const file = await tierList.downloadCapturedImage();
    expect(snapshotTextOf(file.buffer)).not.toBeNull();
    const friend = await openAsVisitor('/rank');
    await friend.openFile(pngFile(file.name, file.buffer));
    await friend.confirmOpenList();
    await expect.poll(() => deviceItemsOf(friend.page.url())).toBe(30);
    await expect.poll(() => friend.itemShowsUpload('pic29')).toBe(true);
  });
});

test.describe('Opening a list while the server is slow', () => {
  test.slow();

  test('Open list holds the editor until the list is in the address; a paste right after goes onto it', async ({tierList, page, browserName}) => {
    test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Old list'));
    const before = await tierList.historyLength();
    await tierList.simulateSlowServer(1_000);
    await tierList.openFile(listFile('snapshot.png', {title: 'Snapshot list', path: TANKS, images: [{id: 'snapImage001', label: 'From the file', png: RED_SQUARE}]}));

    await tierList.startOpeningList();
    // Meanwhile a paste (it lands in the dialog) adds nothing, and Escape does not close it.
    await tierList.pasteImages([imageFile('early.png', BLUE_SQUARE)], tierList.openListDialog);
    await page.keyboard.press('Escape');
    await expect(tierList.openListDialog).toContainText('Opening the list…');
    await expect(tierList.openListDialog).toBeHidden();
    await expect(tierList.itemsIn('S')).toHaveText(['From the file']);
    await expect(tierList.title).toHaveText('Snapshot list');

    // Right after: a paste goes onto the opened list, as its own Back step.
    await tierList.pasteImages([imageFile('late.png', BLUE_SQUARE)]);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['late']);
    await expect.poll(() => tierList.historyLength(), {timeout: 15_000}).toBe(before + 2);
    await page.goBack();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await expect(tierList.itemsIn('S')).toHaveText(['From the file']);
    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.title).toHaveText('Old list');

    // Recently viewed has the file's list (recorded once it was in the address).
    const site = new SitePage(page);
    await site.gotoHome();
    await expect(site.recentLinks.filter({hasText: 'Snapshot list'})).toHaveCount(1);
  });
});

test.describe('Files in turn', () => {
  test.slow();

  test('on a slow server, 55 quick pastes each become their own history entry', async ({tierList, page, browserName}) => {
    test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
    await tierList.goto('/rank');
    await tierList.simulateSlowServer(200);
    // More than the 50 writes the editor keeps waiting: none may be merged.
    const newEntries = await tierList.countNewHistoryEntries();
    const groups = Array.from({length: 55}, (_, index) => [imageFile(`q${String(index).padStart(2, '0')}.png`, noisePng(8, 8, index + 1))]);

    await tierList.pasteImagesAtOnce(groups);

    await expect.poll(newEntries, {timeout: 60_000}).toBe(55);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(55);
    await expect.poll(() => deviceItemsOf(page.url())).toBe(55);
    // Back undoes the last paste only.
    await page.goBack();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(54);
  });

  test('Back while pastes wait: the rest are not added, and Forward still leads to the first', async ({tierList, page, browserName}) => {
    test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    const before = await tierList.historyLength();
    // The first picture is tiny; the second is large, so it is still being stored at Back.
    await tierList.pasteImagesAtOnce([
      [imageFile('b00.png', noisePng(8, 8, 1))],
      [imageFile('b01.png', noisePng(1600, 1600, 2))],
      [imageFile('b02.png', noisePng(8, 8, 3))],
      [imageFile('b03.png', noisePng(8, 8, 4))],
    ]);
    await expect.poll(() => tierList.historyLength(), {intervals: [50]}).toBe(before + 1);

    await page.goBack();

    const notAdded = tierList.toast('Files not added');
    await expect(notAdded).toContainText('You went Back or Forward before they were added:');
    await expect(notAdded).toContainText('b03.png');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    // Nothing replaced the Forward entry: it holds the first picture only.
    await page.goForward();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['b00']);
    await expect.poll(() => tierList.historyLength()).toBe(before + 1);
  });

  test('leaving the editor while pastes wait reaches the other page: no later add cancels the way out', async ({tierList, page, browserName}) => {
    test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Leaving'));
    const before = await tierList.historyLength();
    // Each picture takes a moment to store, so most still wait when the visitor leaves.
    await tierList.pasteImagesAtOnce(Array.from({length: 8}, (_, index) => [imageFile(`l${index}.png`, noisePng(700, 700, index + 1))]));
    await expect.poll(() => tierList.historyLength()).toBeGreaterThan(before);

    await tierList.leaveForHome();

    const site = new SitePage(page);
    await expect(site.recentLinks.filter({hasText: 'Leaving'})).toHaveCount(1);
    await expect(page).toHaveURL(/^[^?]*\/$/);
  });

  test('pictures waiting behind a list file are not added, and a message says so', async ({tierList, browserName}) => {
    test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
    await tierList.goto('/rank');
    const snapshot = listFile('list.png', {title: 'A list', images: [{id: 'listImage001', label: 'In the file', png: RED_SQUARE}]});
    await tierList.waitUntilInteractive();
    // A paste, a dropped list file and another paste, all at once.
    await tierList.sendFileEventsAtOnce([
      {event: 'paste', file: imageFile('first.png', BLUE_SQUARE)},
      {event: 'drop', file: snapshot},
      {event: 'paste', file: imageFile('second.png', RED_SQUARE)},
    ]);

    await expect(tierList.openListDialog).toBeVisible();
    await expect(tierList.toast('Files not added')).toContainText('A list file was being opened, so they were not added: second.png.');
    await tierList.cancelOpenList();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['first']);
  });
});

test.describe('Opening other files', () => {
  test('an ordinary picture becomes an item, from Open a Freeze Frame and from a drop', async ({tierList}) => {
    await tierList.goto('/rank');

    await tierList.openFile(imageFile('red-square.png'));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
    await expect(tierList.toast('Items Added')).toBeVisible();
    await expect(tierList.openListDialog).toHaveCount(0);

    await tierList.dropFile(imageFile('blue-square.png', BLUE_SQUARE));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square', 'blue-square']);
    await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
  });

  test('a dropped picture is one Back step, and Forward brings it back with its image', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.waitUntilInteractive();
    const before = page.url();
    const entries = await tierList.historyLength();

    await tierList.dropFile(imageFile('blue-square.png', BLUE_SQUARE));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue-square']);
    await expect(page).not.toHaveURL(before);
    await expect.poll(() => tierList.historyLength()).toBe(entries + 1);

    await page.goBack();
    await expect(page).toHaveURL(before);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await page.goForward();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue-square']);
    await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
  });

  test('a PNG with a damaged minor chunk is still added as a picture', async ({tierList}) => {
    await tierList.goto('/rank');
    // A tEXt chunk with a wrong CRC, just before IEND: picture viewers still show the image.
    const text = Buffer.from('Comment\0hello', 'latin1');
    const broken = Buffer.alloc(12 + text.length);
    broken.writeUInt32BE(text.length, 0);
    broken.write('tEXt', 4, 'latin1');
    text.copy(broken, 8);
    broken.writeUInt32BE(0xdeadbeef, 8 + text.length);
    const file = Buffer.concat([RED_SQUARE.subarray(0, RED_SQUARE.length - 12), broken, RED_SQUARE.subarray(RED_SQUARE.length - 12)]);

    await tierList.openFile(pngFile('damaged-chunk.png', file));

    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['damaged-chunk']);
    await expect.poll(() => tierList.itemImageHasLoaded('damaged-chunk')).toBe(true);
  });

  test('a damaged snapshot or one from a newer version shows a plain message', async ({tierList}) => {
    await tierList.goto('/rank');

    await tierList.openFile(pngFile('broken.png', pngWithSnapshotText(RED_SQUARE, 'this is not JSON')));
    await expect(tierList.toast('Could not open the file')).toContainText('This file is damaged, or it was not made by OpenTierBoy.');

    await tierList.openFile(pngFile('newer.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify({version: 2, state: '3.abc'}))));
    await expect(tierList.toast('Could not open the file').filter({hasText: 'newer version'})).toBeVisible();

    await expect(tierList.openListDialog).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('AVIF and HEIC images inside a snapshot get the refusal of "From your device"; the others open', async ({tierList}) => {
    await tierList.goto('/rank');
    const state = v3State({t: 'Mixed images', tp: 3, r: [
      ['S', [{d: 'pngImage0001', c: 'Red'}, {d: 'avifImage001', c: 'Photo'}, {d: 'heicImage001', c: 'Phone'}]],
      ['A', []], ['B', []], ['', []],
    ]});
    const payload = {version: 1, state, images: [
      {id: 'pngImage0001', label: 'Red', dataUrl: `data:image/png;base64,${RED_SQUARE.toString('base64')}`},
      {id: 'avifImage001', label: 'Photo', dataUrl: `data:image/avif;base64,${isoMedia('avif').toString('base64')}`},
      // HEIC bytes that claim to be a PNG: the bytes decide.
      {id: 'heicImage001', label: 'Phone', dataUrl: `data:image/png;base64,${isoMedia('heic').toString('base64')}`},
    ]};

    await tierList.openFile(pngFile('mixed.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload))));
    await tierList.confirmOpenList();

    const refused = tierList.toast('Some images could not be added');
    await expect(refused).toContainText(`Photo: ${AVIF_HEIC_REFUSAL}`);
    await expect(refused).toContainText(`Phone: ${AVIF_HEIC_REFUSAL}`);
    await expect(tierList.itemsIn('S')).toHaveText(['Red', 'Photo', 'Phone']);
    await expect.poll(() => tierList.itemShowsUpload('Red')).toBe(true);
    // Only the PNG was stored; the refused images show no picture.
    await expect.poll(() => tierList.deviceImageCount()).toBe(1);
    await expect.poll(() => tierList.itemShowsUpload('Photo')).toBe(false);
    await expect.poll(() => tierList.itemShowsUpload('Phone')).toBe(false);
  });

  test('an image bomb inside a snapshot is refused before it is decoded', async ({tierList}) => {
    await tierList.goto('/rank');
    // A tiny PNG that declares 12000 x 12000 pixels: decoding it would take seconds and gigabytes.
    const bomb = pngDeclaring(RED_SQUARE, 12_000, 12_000);
    const payload = {version: 1, state: '3.abc', images: [{id: 'bombImage001', label: 'Bomb', dataUrl: `data:image/png;base64,${bomb.toString('base64')}`}]};
    const file = pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload));

    const time = await tierList.timeToOpenFile(pngFile('image-bomb.png', file), 'This file is damaged, or it was not made by OpenTierBoy.');

    // Measured in the page from receiving the file to the message.
    expect(time).toBeLessThan(1_000);
    await expect(tierList.openListDialog).toHaveCount(0);
  });

  test('a snapshot whose link is too long to open as an address is refused as too large', async ({tierList}) => {
    await tierList.goto('/rank');
    // Labels that do not compress: add items until the link passes the 13,000-character cap. It
    // stays under the ~15,850 characters at which the server itself would refuse the address.
    let seed = 7;
    const noise = () => Array.from({length: 40}, () => String.fromCharCode(97 + ((seed = (seed * 48271) % 2147483647) % 26))).join('');
    const items: {i: string; c: string}[] = [];
    let state = '';
    while (state.length <= 13_200) {
      items.push({i: `x-${noise()}`, c: noise()});
      state = v3State({t: 'Long', r: [['S', items], ['', []]]});
    }
    expect(state.length).toBeLessThan(15_000);

    await tierList.openFile(pngFile('long.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify({version: 1, state, images: []}))));

    await expect(tierList.toast('Could not open the file')).toContainText('This file is too large to open as a list.');
    await expect(tierList.openListDialog).toHaveCount(0);
  });

  test('files that are not pictures are refused with a message', async ({tierList}) => {
    await tierList.goto('/rank');
    const text = {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture')};
    const pdf = {name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%âãÏÓ\n')};

    await tierList.dropFile(text);
    await expect(tierList.toast('Could not open the file')).toContainText('notes.txt: This file is not a picture.');
    await tierList.openFile(pdf);
    await expect(tierList.toast('Could not open the file').filter({hasText: 'scan.pdf'})).toBeVisible();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('SVG and BMP files become items through Open a Freeze Frame and drops, as from your device', async ({tierList}) => {
    await tierList.goto('/rank');
    const svg = {
      name: 'drawing.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#00f"/><script>alert(1)</script></svg>'),
    };

    await tierList.openFile(svg);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['drawing']);
    await tierList.dropFile({name: 'tiny.bmp', mimeType: 'image/bmp', buffer: greenBmp()});
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['drawing', 'tiny']);

    // Both were drawn again as plain pictures: the SVG's script never runs.
    await expect.poll(async () => (await tierList.itemImageCenterColor('drawing'))?.[2] ?? 0).toBeGreaterThan(200);
    await expect.poll(async () => (await tierList.itemImageCenterColor('tiny'))?.[1] ?? 0).toBeGreaterThan(200);
  });

  test('AVIF and HEIC files get the refusal of "From your device", and nothing is stored', async ({tierList}) => {
    await tierList.goto('/rank');

    await tierList.dropFile({name: 'photo.heic', mimeType: 'image/heic', buffer: isoMedia('heic')});
    await expect(tierList.toast('Some images could not be added').filter({hasText: 'photo'})).toContainText(AVIF_HEIC_REFUSAL);
    await tierList.openFile({name: 'picture.avif', mimeType: 'image/avif', buffer: isoMedia('avif')});
    await expect(tierList.toast('Some images could not be added').filter({hasText: 'picture'})).toContainText(AVIF_HEIC_REFUSAL);
    // A browser may give a .heic file no type at all: its bytes decide.
    await tierList.dropFile({name: 'IMG_0001.HEIC', mimeType: '', buffer: isoMedia('heic')});
    await expect(tierList.toast('Some images could not be added').filter({hasText: 'IMG_0001'})).toContainText(AVIF_HEIC_REFUSAL);

    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await expect.poll(() => tierList.deviceImageCount()).toBe(0);
  });

  test('a drop while a menu is open does nothing', async ({tierList, page}) => {
    await tierList.goto('/rank');
    await tierList.openManageItemsMenu();

    await tierList.dropFile(imageFile('red-square.png'), {onto: tierList.openMenu});

    await page.keyboard.press('Escape');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await expect(tierList.toast('Items Added')).toHaveCount(0);
    // The same drop with the menu closed adds the picture, so nothing above was missed by timing.
    await tierList.dropFile(imageFile('red-square.png'));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
  });

  test('a drop while a dialog is open does nothing', async ({tierList, page}) => {
    await tierList.goto('/rank');
    await tierList.openUploadDialog();

    await tierList.dropFile(imageFile('red-square.png'), {onto: tierList.uploadDialog});

    await expect(tierList.uploadDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tierList.uploadDialog).toBeHidden();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await expect(tierList.toast('Items Added')).toHaveCount(0);
    // The same drop with the dialog closed adds the picture.
    await tierList.dropFile(imageFile('red-square.png'));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
  });

  test('a decompression bomb is refused quickly', async ({tierList}) => {
    await tierList.goto('/rank');
    // 64 MB of zeros in about 64 KB: far over the 10 MB text cap.
    const bomb = pngWithSnapshotText(RED_SQUARE, '', {compressedText: zlib.deflateSync(Buffer.alloc(64 * 1024 * 1024))});
    expect(bomb.length).toBeLessThan(100_000);

    const time = await tierList.timeToOpenFile(pngFile('bomb.png', bomb), 'This file is too large to open as a list.');
    expect(time).toBeLessThan(5_000);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });
});
