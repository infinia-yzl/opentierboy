import type {Page, TestInfo} from '@playwright/test';
import {expect, test} from '../support/test';
import {modelSut} from '../support/model-sut';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {itemExtractorModel, itemExtractorViewOf, type ItemExtractorEvent, type ItemExtractorSnapshot} from '../models/item-extractor';
import {SitePage} from '../pages/site-page';
import type {TierListPage} from '../pages/tier-list-page';
import {EXTRACTOR_MENU_ITEM} from '../pages/extractor';
import {rankingState} from '../support/links';
import {CROWDED_PICTURE, EXTRACTOR_GRID, gridPng, picturePng, PLAIN_PICTURE, ROW_OF_THREE} from '../support/extractor-pictures';

const TANKS = '/rank/overwatch/tank';
const LIST = rankingState('image-overwatch', {S: ['Mauga']}, 'Tanks');
const GRID_PICTURE = picturePng('heroes.png', gridPng());
const PICTURE_SIZE = {width: 1280, height: 480};
const NOT_A_PICTURE = {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture')};

async function itemPictureSize(tierList: TierListPage, name: string): Promise<{width: number; height: number}> {
  const image = tierList.itemImage(name);
  await expect.poll(() => tierList.deviceImages.itemShowsUpload(name), {message: `${name} should show its picture from this browser`}).toBe(true);
  return image.evaluate(async (img: HTMLImageElement) => {
    const stored = new Image();
    stored.src = img.currentSrc;
    await stored.decode();
    return {width: stored.naturalWidth, height: stored.naturalHeight};
  });
}

test.describe('extractor', () => {
  test.describe('dialog', () => {
    test.beforeEach(async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
    });

    test('renders 8 borders named "Item n of 8" and "8 items found" when the user chooses a picture of a drawn grid', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);

      await expect(extractor.text('8 items found')).toBeVisible();
      await expect(extractor.borders).toHaveCount(8);
      await expect(extractor.border(1, 8)).toBeVisible();
      await expect(extractor.previewTiles).toHaveCount(8);
      await expect(extractor.createButton(8)).toBeEnabled();
    });

    test('renders 300 borders and "Up to 300 items in one picture." when the user chooses a picture of 527 tiles', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(CROWDED_PICTURE);

      await expect(extractor.text('Up to 300 items in one picture.')).toBeVisible();
      await expect(extractor.text('300 items found')).toBeVisible();
      await expect(extractor.borders).toHaveCount(300);
    });

    test('renders the focus on the button "Add images" when the user closes the dialog with Escape', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);

      await extractor.close();

      await expect(tierList.manageItemsButton).toBeFocused();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders an empty dialog when the user opens it again after closing it with a picture', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);
      await extractor.close();

      await extractor.open();

      await expect(extractor.chooseButton).toBeVisible();
      await expect(extractor.borders).toHaveCount(0);
    });

    test('renders the borders in reading order when the user chooses a picture of a drawn grid', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);

      const first = await extractor.borderBox(extractor.border(1, 8));
      const fifth = await extractor.borderBox(extractor.border(5, 8));
      const second = await extractor.borderBox(extractor.border(2, 8));
      expect(Math.abs(first.x - EXTRACTOR_GRID.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(first.y - EXTRACTOR_GRID.top)).toBeLessThanOrEqual(2);
      expect(second.x).toBeGreaterThan(first.x);
      expect(fifth.y).toBeGreaterThan(first.y);
    });

    test('renders "No items found" and a drawn border "Item 1 of 1" when the user chooses a plain picture and draws a border', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(PLAIN_PICTURE);
      await expect(extractor.text('No items found. Draw a border around one item.')).toBeVisible();
      await expect(extractor.borders).toHaveCount(0);
      await expect(extractor.createButton(0)).toBeDisabled();

      await extractor.drawBorder({x: 100, y: 100}, {x: 300, y: 260}, PICTURE_SIZE);

      await expect(extractor.borders).toHaveCount(1);
      await expect(extractor.border(1, 1)).toBeFocused();
      await expect(extractor.createButton(1)).toBeEnabled();
    });

    test('renders the message about 24 pixels when the user draws a border smaller than 24 pixels', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(PLAIN_PICTURE);
      await expect(extractor.text('No items found. Draw a border around one item.')).toBeVisible();

      await extractor.drawBorder({x: 100, y: 100}, {x: 115, y: 200}, PICTURE_SIZE);

      await expect(extractor.text('An item is at least 24 pixels wide and tall.')).toBeVisible();
      await expect(extractor.borders).toHaveCount(0);
    });

    test('renders 3 borders when the user draws one border and clicks "Find items of this size"', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(ROW_OF_THREE.file);
      await expect(extractor.text('No items found. Draw a border around one item.')).toBeVisible();
      const tile = ROW_OF_THREE.boxes[1];
      await extractor.drawBorder({x: tile.x + 2, y: tile.y + 1}, {x: tile.x + tile.width - 1, y: tile.y + tile.height + 2}, ROW_OF_THREE.size);
      await expect(extractor.borders).toHaveCount(1);

      await extractor.findOfSizeButton.click();

      await expect(extractor.text('2 more items found')).toBeVisible();
      await expect(extractor.borders).toHaveCount(3);
    });

    test('renders the border gone and "Item 1 of 7" focused when the user presses Delete on border 1', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);

      await extractor.pressOnBorder(extractor.border(1, 8), 'Delete');

      await expect(extractor.borders).toHaveCount(7);
      await expect(extractor.border(1, 7)).toBeFocused();
      await expect(extractor.createButton(7)).toBeVisible();
    });

    test('renders 7 tiles when the user clicks the remove button of tile 8', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.previewTiles).toHaveCount(8);

      await extractor.removeButton(8).click();

      await expect(extractor.previewTiles).toHaveCount(7);
      await expect(extractor.borders).toHaveCount(7);
    });

    test('renders every border 3 pixels wider when the user presses Shift+ArrowRight three times with "Same size for all" on', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);
      await expect(extractor.sameSizeToggle).toHaveAttribute('aria-pressed', 'true');
      const before = await extractor.borderSizes();

      await extractor.pressOnBorder(extractor.border(2, 8), 'Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowRight');

      await expect.poll(() => extractor.borderSizes()).toEqual(before.map(({width, height}) => ({width: width + 3, height})));
    });

    test('renders only border 2 wider when the user turns "Same size for all" off and presses Shift+ArrowRight', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);
      await extractor.sameSizeToggle.click();
      await expect(extractor.sameSizeToggle).toHaveAttribute('aria-pressed', 'false');
      const before = await extractor.borderSizes();

      await extractor.pressOnBorder(extractor.border(2, 8), 'Shift+ArrowRight');

      await expect.poll(() => extractor.borderSizes()).toEqual(before.map(({width, height}, index) => ({width: index === 1 ? width + 1 : width, height})));
    });

    test('renders border 1 one pixel lower when the user presses ArrowDown on it', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);
      const before = await extractor.borderBox(extractor.border(1, 8));

      await extractor.pressOnBorder(extractor.border(1, 8), 'ArrowDown');

      await expect.poll(() => extractor.borderBox(extractor.border(1, 8))).toEqual({...before, y: before.y + 1});
    });

    test('renders the picture with its borders when the user drops a picture on the dialog', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();

      await extractor.dropPicture(GRID_PICTURE);

      await expect(extractor.text('8 items found')).toBeVisible();
    });

    test('renders the picture with its borders when the user pastes a picture in the dialog', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();

      await extractor.pastePicture(GRID_PICTURE);

      await expect(extractor.text('8 items found')).toBeVisible();
    });

    test('renders the message "This file type is not supported." when the user chooses a text file', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();

      await extractor.choosePicture(NOT_A_PICTURE);

      await expect(extractor.alert).toHaveText('notes.txt: This file type is not supported. Use a PNG, JPEG, WebP or GIF image.');
      await expect(extractor.chooseButton).toBeVisible();
    });

    test('writes a new list with 8 items in Unranked and one history entry when the user clicks "Create a list with 8 items"', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);

      await extractor.create(8);

      await expect(tierList.title).toHaveText('Custom Tier List');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(Array.from({length: 8}, (_, index) => `heroes ${index + 1}`));
      await expect.poll(() => tierList.deviceImages.itemShowsUpload('heroes 1'), {message: 'heroes 1 should show its picture from this browser'}).toBe(true);

      await tierList.goBack();
      await expect(tierList.title).toHaveText('Tanks');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('writes the new list to Recently viewed when the user creates a list from a picture', async ({tierList, page}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await extractor.create(8);

      const site = new SitePage(page);
      await site.gotoHome();
      await expect(site.recentLink('Custom Tier List')).toHaveCount(1);
    });

    test('writes square images about as tall as each item when the fit is "Whole item"', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.fitOption('Whole item')).toHaveAttribute('aria-pressed', 'true');

      await extractor.create(8);

      const size = await itemPictureSize(tierList, 'heroes 1');
      expect(size.width).toBe(size.height);
      expect(Math.abs(size.width - EXTRACTOR_GRID.height)).toBeLessThanOrEqual(2);
    });

    test('writes square images about as wide as each item when the user picks "Square cut"', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await extractor.fitOption('Square cut').click();
      await expect(extractor.fitOption('Square cut')).toHaveAttribute('aria-pressed', 'true');

      await extractor.create(8);

      const size = await itemPictureSize(tierList, 'heroes 1');
      expect(size.width).toBe(size.height);
      expect(Math.abs(size.width - EXTRACTOR_GRID.width)).toBeLessThanOrEqual(2);
    });

    test('writes typed, pasted and automatic names to the items when the user names items in step "2 Names"', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await expect(extractor.borders).toHaveCount(8);
      await extractor.openNames();
      await expect(extractor.text('Item 1 of 8')).toBeVisible();
      await expect(extractor.nameField).toHaveAttribute('placeholder', 'heroes 1');

      await extractor.typeName('Ana');
      await expect(extractor.text('Item 2 of 8')).toBeVisible();
      await extractor.typeName('');
      await expect(extractor.text('Item 3 of 8')).toBeVisible();
      await extractor.typeName('', 'Shift+Enter');
      await expect(extractor.text('Item 2 of 8')).toBeVisible();
      await extractor.typeName('');
      await expect(extractor.text('Item 3 of 8')).toBeVisible();
      await extractor.pasteNames('Mercy\nLucio\n\nKiriko');
      await expect(extractor.text('Item 6 of 8')).toBeVisible();
      await expect(extractor.nameStrip.getByRole('button', {name: 'Item 4: Lucio'})).toBeVisible();
      await extractor.typeName('Moira');
      await extractor.typeName('');
      await extractor.typeName('Zen');
      await expect(extractor.createButton(8)).toBeFocused();

      await extractor.create(8);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Ana', 'heroes 2', 'Mercy', 'Lucio', 'Kiriko', 'Moira', 'heroes 7', 'Zen']);
    });

    test('renders the item and the strip of tiles when the user clicks tile 4 of the strip in step "2 Names"', async ({tierList}) => {
      const {extractor} = tierList;
      await extractor.open();
      await extractor.choosePicture(GRID_PICTURE);
      await extractor.openNames();

      await extractor.nameStrip.getByRole('button', {name: 'Item 4', exact: true}).click();

      await expect(extractor.text('Item 4 of 8')).toBeVisible();
      await expect(extractor.nameField).toBeFocused();
      await expect(extractor.nameField).toHaveAttribute('placeholder', 'heroes 4');
    });
  });

  test.describe('model', () => {
    const extractorSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => modelSut<ItemExtractorSnapshot, ItemExtractorEvent>(page, {
      reset: () => tierList.openAfterBlankPage(TANKS, LIST),
      events: {
        OPEN_DIALOG: () => tierList.extractor.open(),
        CANCEL: () => tierList.extractor.close(),
        CHOOSE_GRID: async () => {
          await tierList.extractor.choosePicture(GRID_PICTURE);
          await expect(tierList.extractor.text('8 items found')).toBeVisible();
        },
        CHOOSE_PLAIN: async () => {
          await tierList.extractor.choosePicture(PLAIN_PICTURE);
          await expect(tierList.extractor.text('No items found. Draw a border around one item.')).toBeVisible();
        },
        DROP_PLAIN: async () => {
          await tierList.extractor.dropPicture(PLAIN_PICTURE);
          await expect(tierList.extractor.text('No items found. Draw a border around one item.')).toBeVisible();
        },
        PASTE_GRID: async () => {
          await tierList.extractor.pastePicture(GRID_PICTURE);
          await expect(tierList.extractor.text('8 items found')).toBeVisible();
        },
        REMOVE_BORDER: () => tierList.extractor.pressOnBorder(tierList.extractor.border(1, 8), 'Delete'),
        DRAW_BORDER: () => tierList.extractor.drawBorder({x: 100, y: 100}, {x: 300, y: 260}, PICTURE_SIZE),
        OPEN_NAMES: () => tierList.extractor.openNames(),
        NAME_ITEM: () => tierList.extractor.typeName('Ana'),
        OPEN_ITEMS: () => tierList.extractor.itemsTab.click(),
        CREATE: async () => {
          const count = await tierList.extractor.borders.count() || await tierList.extractor.nameStrip.getByRole('button').count();
          await tierList.extractor.create(count);
        },
        BACK: () => tierList.goBack(),
      },
      states: {
        '*': async (_page, snapshot) => {
          const view = itemExtractorViewOf(snapshot);
          const {extractor} = tierList;
          if (view.dialog === 'closed') {
            await expect(extractor.dialog).toHaveCount(0);
            await expect(tierList.title).toHaveText(view.list);
            if (view.list === 'Tanks') {
              await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
              await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
              return;
            }
            await expect(tierList.itemsIn(tierList.unranked)).toHaveText([...view.items]);
            return;
          }
          await expect(extractor.dialog).toBeVisible();
          if (view.dialog === 'empty') {
            await expect(extractor.chooseButton).toBeVisible();
            await expect(extractor.createButton(0)).toBeDisabled();
            return;
          }
          if (view.dialog === 'items') {
            await expect(extractor.itemsTab).toHaveAttribute('aria-selected', 'true');
            await expect(extractor.text(view.status)).toBeVisible();
            await expect(extractor.borders).toHaveCount(view.borders);
            await expect(extractor.previewTiles).toHaveCount(view.borders);
            const button = extractor.createButton(view.borders);
            if (view.borders === 0) await expect(button).toBeDisabled();
            else await expect(button).toBeEnabled();
            return;
          }
          await expect(extractor.namesTab).toHaveAttribute('aria-selected', 'true');
          await expect(extractor.text(`Item ${view.item} of ${view.total}`)).toBeVisible();
          await expect(extractor.nameField).toBeFocused();
          await expect(extractor.nameField).toHaveValue('');
          await expect(extractor.nameStrip.getByRole('button', {name: /^Item \d+: /})).toHaveCount(view.named.length);
          for (const name of view.named) await expect(extractor.nameStrip.getByRole('button', {name, exact: true})).toBeVisible();
          await expect(extractor.createButton(view.total)).toBeEnabled();
        },
      },
      testInfo,
      step: (name, body) => test.step(name, body),
    });

    test.describe.configure({retries: 0});
    for (const part of walkParts(itemExtractorModel)) {
      test(`renders each step of the item extractor when the user finds, draws, removes, names and creates items (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(itemExtractorModel, extractorSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, itemExtractorModel, coverage, part);
      });
    }
  });

  test.describe('narrow window', () => {
    test.use({viewport: {width: 800, height: 900}});

    test('renders no menu item "Extract items from a picture…" when the window is 800 pixels wide', async ({tierList, page}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.items.openManageItemsMenu();

      await expect(page.getByRole('menuitem', {name: 'From a link'})).toBeVisible();
      await expect(page.getByRole('menuitem', {name: EXTRACTOR_MENU_ITEM})).toHaveCount(0);
    });
  });
});
