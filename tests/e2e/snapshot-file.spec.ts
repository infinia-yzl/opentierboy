import zlib from 'node:zlib';
import {expect, expectTierList, test} from '../support/test';
import {packageItemId, rankingState, v3LinkJson, v3State} from '../support/links';
import {BLUE_SQUARE, imageFile, RED_SQUARE, serveImageSite} from '../support/imageSites';
import {pngDeclaring, pngFile, pngWithSnapshotText, snapshotTextOf} from '../support/snapshotFiles';
import type {TierListPage} from '../pages/TierListPage';
import {SitePage} from '../pages/SitePage';

const TANKS = '/rank/overwatch/tank';

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

/** Makes a snapshot file the way people do: a list with a device image, Capture Preview, Download. */
async function downloadSnapshotOf(tierList: TierListPage): Promise<Buffer> {
  await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'Tanks with a cat'));
  await tierList.addItemsFromDevice([imageFile('red-square.png')]);
  await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
  await tierList.capturePreview();
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

test.describe('Snapshot files: Freeze Frame Download, then Open file (A10)', () => {
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

  test('opening a snapshot adds exactly one Back step', async ({tierList, openAsVisitor}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const friend = await openAsVisitor(`${TANKS}?state=${rankingState('image-overwatch', {B: ['D.Va']}, 'Before')}`);
    const before = friend.page.url();
    const length = await friend.historyLength();

    await friend.openFile(pngFile('snapshot.png', snapshot));
    await friend.confirmOpenList();

    await expect(friend.title).toHaveText('Tanks with a cat');
    expect(await friend.historyLength()).toBe(length + 1);
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
    expect(await tierList.historyLength()).toBe(length);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
    // The dialog has no trigger of its own: focus goes back to Open file.
    await expect(tierList.openFileButton).toBeFocused();
  });

  test('opening your own file in the browser that made it uses its images as they are', async ({tierList}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const state = JSON.parse(snapshotTextOf(snapshot) ?? 'null').state;
    expect(await tierList.deviceImageCount()).toBe(1);
    await tierList.goto('/rank');

    await tierList.openFile(pngFile('snapshot.png', snapshot));
    await tierList.confirmOpenList();

    // The link is the file's own, and no copy of the image was stored.
    expect(tierList.page.url()).toBe(new URL(`${TANKS}?state=${state}`, tierList.page.url()).href);
    expect(await tierList.deviceImageCount()).toBe(1);
    await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
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
    expect(friend.page.url()).toBe(link);
    expect(await friend.deviceImageCount()).toBe(images);
    expect(await friend.historyLength()).toBe(length);

    // A third time from another list: the same link again.
    await friend.goto('/rank');
    await friend.openFile(pngFile('snapshot.png', snapshot));
    await friend.confirmOpenList();
    expect(friend.page.url()).toBe(link);
    expect(await friend.deviceImageCount()).toBe(images);
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

  test('dropping or pasting a snapshot file asks to open its list too', async ({tierList, openAsVisitor}) => {
    const snapshot = await downloadSnapshotOf(tierList);
    const friend = await openAsVisitor('/rank');

    await friend.dropFile(pngFile('snapshot.png', snapshot));
    await expect(friend.openListDialog).toBeVisible();
    await friend.cancelOpenList();

    await friend.pasteImages([pngFile('snapshot.png', snapshot)]);
    await friend.confirmOpenList();
    await expectTierList(friend, SNAPSHOT_LIST);
  });
});

test.describe('Opening other files', () => {
  test('an ordinary picture becomes an item, from Open file and from a drop', async ({tierList}) => {
    await tierList.goto('/rank');

    await tierList.openFile(imageFile('red-square.png'));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
    await expect(tierList.toast('Items Added')).toBeVisible();
    await expect(tierList.openListDialog).toHaveCount(0);

    await tierList.dropFile(imageFile('blue-square.png', BLUE_SQUARE));
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square', 'blue-square']);
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

  test('SVG and BMP files become items through Open file and drops, as from your device', async ({tierList}) => {
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

  test('a drop while a menu is open does nothing', async ({tierList, page}) => {
    await tierList.goto('/rank');
    await tierList.openManageItemsMenu();

    await tierList.dropFile(imageFile('red-square.png'), {onPage: true});

    await page.keyboard.press('Escape');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await expect(tierList.toast('Items Added')).toHaveCount(0);
  });

  test('a drop while a dialog is open does nothing', async ({tierList, page}) => {
    await tierList.goto('/rank');
    await tierList.openUploadDialog();

    await tierList.dropFile(imageFile('red-square.png'), {onPage: true});

    await expect(tierList.uploadDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tierList.uploadDialog).toBeHidden();
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    await expect(tierList.toast('Items Added')).toHaveCount(0);
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
