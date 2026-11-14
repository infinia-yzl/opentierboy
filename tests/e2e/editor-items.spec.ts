/** Adding, removing and resetting items in the editor, and items the image sets do not know. */
import path from 'node:path';
import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import {serveImageSite} from '../support/image-sites';
import {FIVE_ROW_TIERS, packageItemId, rankingState, rawState, templateItemCount, v3LinkJson} from '../support/links';
import {
  DELETED_ITEM,
  OPENED_ROWS,
  removeAndUndoModel,
  removeAndUndoViewOf,
  undoChangesList,
  type RemoveAndUndoEvent,
  type RemoveAndUndoSnapshot,
  type RemoveAndUndoView,
} from '../models/remove-and-undo';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {type TierListPage} from '../pages/tier-list-page';
import {
  addFromTemplateModel,
  addFromTemplateViewOf,
  TEMPLATE_SET_KEYS,
  TEMPLATE_SETS,
  type AddFromTemplateEvent,
  type AddFromTemplateSnapshot,
  type AddFromTemplateView,
} from '../models/add-from-template';

const TANKS = '/rank/overwatch/tank';

const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

const IMAGES = path.join(__dirname, '..', 'fixtures', 'images');

test.describe('editor items', () => {
  test.describe('item actions', () => {
    test('renders the images as Unranked items when the user uploads 2 images from the device', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.deviceImages.addItemsFromDevice([path.join(IMAGES, 'red-square.png'), path.join(IMAGES, 'blue-square.png')]);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square', 'blue-square']);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
    });

    test('renders the items from before the add when the user clicks Undo after adding a template set', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.items.addItemsFromTemplate('OVERWATCH', 'Tank');
      // The pointer rests on the toast, so its 4 s timer waits for the Undo.
      await tierList.items.restOnToast('Items Added');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);

      await tierList.undoFromToast('Items Added');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders button "Share" uncovered and clickable when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.items.removeAllItems();
      await tierList.settled();

      // A trial click runs every check of a real click, including that nothing covers the button.
      await tierList.shareButton.click({trial: true});
    });

    test('renders focus on button "Add images" when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.items.removeAllItems();

      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders focus on button "Add images" when the user cancels Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.items.cancelRemoveAllItems();

      await expect(tierList.manageItemsButton).toBeFocused();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });
  });

  // Where people add images (owner decision, 2026-10-31): the drop overlay, an empty list's drop
  // area, the "drop or paste" line of the tray's tile, and the menu's "or drop" and "or paste".
  test.describe('adding images', () => {
    test('renders the template picker with its name, a Back button and a Packages button when the user opens a package', async ({tierList}) => {
      await tierList.goto('/rank');
      await tierList.items.openTemplatePickerFromDropArea();
      await expect(tierList.items.templatePicker).toHaveAccessibleName('Add images from a template');

      await tierList.items.openTemplatePackage('OVERWATCH');
      await tierList.items.templatePickerButton('Back').click();
      await expect(tierList.items.templatePickerPage('Packages')).toBeVisible();

      await tierList.items.openTemplatePackage('OVERWATCH');
      await tierList.items.templatePickerButton('Packages').click();
      await expect(tierList.items.templatePickerPage('Packages')).toBeVisible();
    });

    test('renders the drop overlay with its two lines when the user drags a link over the editor', async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.items.dropOverlay).toHaveCount(0);

      await tierList.linkImages.dragLinkOver('https://i.imgur.com/red.png');

      await expect(tierList.items.dropOverlay).toBeVisible();
      await expect(tierList.items.dropOverlayNote).toBeVisible();
    });

    test('renders no drop overlay when the user drags a link over the editor and away again', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.linkImages.dragLinkOver('https://i.imgur.com/red.png');
      await expect(tierList.items.dropOverlay).toBeVisible();

      await tierList.linkImages.dragLinkAway('https://i.imgur.com/red.png');

      await expect(tierList.items.dropOverlay).toHaveCount(0);
    });

    test('renders the drop area with Template, Upload and Link and no tile or hints when the page opens an empty list', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto('/rank');

      await expect(tierList.items.emptyListDropArea).toBeVisible();
      await expect(tierList.items.emptyListAction('Template')).toBeVisible();
      await expect(tierList.items.emptyListAction('Upload')).toBeVisible();
      await expect(tierList.items.emptyListAction('Link')).toBeVisible();
      await expect(tierList.addImagesTile).toHaveCount(0);
      await expect(tierList.hints).toHaveCount(0);
    });

    test('renders the tile and no drop area when the page opens a list with items', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);

      await expect(tierList.addImagesTile).toBeVisible();
      await expect(tierList.items.emptyListDropArea).toHaveCount(0);
    });

    // Dropping and pasting need a mouse and a keyboard: on touch screens the words about them
    // hide, as "Paste an image to add it as an item." does (the class tooltip-mouse).
    test.describe('mouse wording', () => {
      test.skip(({isMobile}) => isMobile, 'The words about dropping and pasting show with a mouse.');

      test('renders "drop or paste" on the tile when the page opens a list with items', async ({tierList}) => {
        await tierList.goto(TANKS);

        await expect(tierList.items.addImagesTileHint).toBeVisible();
      });

      test('renders the heading "Drop or paste images here" when the page opens an empty list', async ({tierList}) => {
        await tierList.goto('/rank');

        await expect(tierList.items.emptyListDropArea).toHaveText('Drop or paste images here');
      });
    });

    test.describe('touch wording', () => {
      test.skip(({isMobile}) => !isMobile, 'The touch wording shows on touch screens.');

      test('renders no "drop or paste" on the tile when the page opens a list with items', {tag: '@mobile'}, async ({tierList}) => {
        await tierList.goto(TANKS);

        await expect(tierList.addImagesTile).toBeVisible();
        await expect(tierList.items.addImagesTileHint).toBeHidden();
      });

      test('renders the heading "Add images here" with Template, Upload and Link when the page opens an empty list', {tag: '@mobile'}, async ({tierList}) => {
        await tierList.goto('/rank');

        await expect(tierList.items.emptyListDropArea).toHaveText('Add images here');
        await expect(tierList.items.emptyListAction('Template')).toBeVisible();
        await expect(tierList.items.emptyListAction('Upload')).toBeVisible();
        await expect(tierList.items.emptyListAction('Link')).toBeVisible();
      });

      test('renders no hints "or drop" and "or paste" when the user opens the Add images menu', {tag: '@mobile'}, async ({tierList}) => {
        await tierList.goto(TANKS);

        await tierList.items.openManageItemsMenu();

        await expect(tierList.menuItem('From your device')).toBeVisible();
        await expect(tierList.items.menuHint('From your device', 'or drop')).toBeHidden();
        await expect(tierList.items.menuHint('From a link', 'or paste')).toBeHidden();
        await expect(tierList.items.menuHint('Open a Freeze Frame…', 'or drop')).toBeHidden();
      });
    });

    test('renders the dialog "Add New Items" when the user clicks Upload in the drop area of an empty list', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.items.emptyListAction('Upload').click();

      await expect(tierList.deviceImages.uploadDialog).toBeVisible();
    });

    test('renders focus on button "Add images" when the user adds an image with Link in the drop area of an empty list', async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto('/rank');

      await tierList.items.emptyListAction('Link').click();
      await expect(tierList.linkImages.linkImageDialog).toBeVisible();
      await tierList.linkImages.submitInLinkImageDialog('https://i.imgur.com/red.png', 'Red square');
      await expect(tierList.linkImages.linkImageDialog).toBeHidden();

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Red square']);
      // The drop area went away with the add, so focus goes to the toolbar's Add images.
      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders the hints "or drop" and "or paste" on the matching items when the user opens the Add images menu', async ({tierList, isMobile}) => {
      test.skip(isMobile, 'The hints show with a mouse.');
      await tierList.goto(TANKS);

      await tierList.items.openManageItemsMenu();

      await expect(tierList.menuItem('From template')).toHaveText('From template');
      await expect(tierList.menuItem('From your device')).toHaveText('From your device or drop');
      await expect(tierList.menuItem('From a link')).toHaveText('From a link or paste');
      await expect(tierList.menuItem('Open a Freeze Frame…')).toHaveText('Open a Freeze Frame… or drop');
    });
  });

  /** An id that names no image-set item (here one with a dot, like a removed image) keeps its label (A45). */
  test.describe('unknown items in v3 links', () => {
    test('writes an {i, c} item with its label to the link when the user moves an unknown item id from an old link', async ({tierList, openAsVisitor}) => {
      const oldLink = rawState({tiers: FIVE_ROW_TIERS.map((tier) => ({
        i: tier.id,
        n: tier.name,
        t: tier.id === 'uncategorized' ? [{i: 'image-overwatch-gone.webp', c: 'Gone hero'}, {i: packageItemId('image-overwatch', 'Mauga')}] : [],
      }))});
      await tierList.goto(TANKS, oldLink);
      await expect(tierList.item('Gone hero')).toBeVisible();

      await tierList.dragItemToTier('Gone hero', 'S');

      const link = await tierList.shareLink();
      expect(JSON.stringify(v3LinkJson(link))).toContain('{"i":"image-overwatch-gone.webp","c":"Gone hero"}');
      const friend = await openAsVisitor(link);
      await expect(friend.itemsIn('S')).toHaveText(['Gone hero']);
      await expect(friend.itemsIn(friend.unranked)).toHaveText(['Mauga']);
    });

    test('renders the label of an item with an empty id after a reload when the user moves it to row S', async ({tierList}) => {
      // v3 links refuse empty ids, so the app gives the item an id of its own (item~1) when it opens.
      const handMade = rawState({tiers: FIVE_ROW_TIERS.map((tier) => ({
        i: tier.id,
        n: tier.name,
        t: tier.id === 'uncategorized' ? [{i: '', c: 'No id'}, {i: packageItemId('image-overwatch', 'Mauga')}] : [],
      }))});
      await tierList.goto(TANKS, handMade);

      await tierList.dragItemToTier('No id', 'S');
      await tierList.reload();

      await expect(tierList.itemsIn('S')).toHaveText(['No id']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga']);
    });
  });

  // Model-based tests (tests/README.md, "Model-based tests"): tests/machines/add-from-template.ts
  // walked through the Playwright adapter of @xstate/test.
  test.describe('model: templates', () => {
    /** What a state shows: Unranked's images, the drop area or the tile, the picker's page and the toast. */
    const expectView = async (tierList: TierListPage, view: AddFromTemplateView) => {
      await expect(tierList.toast('Items Added')).toHaveCount(view.toast === 'Items Added' ? 1 : 0);
      await expect(tierList.toast('No New Items')).toHaveCount(view.toast === 'No New Items' ? 1 : 0);
      if (view.toast === 'Items Added') await expect(tierList.items.undoButtonIn('Items Added')).toBeVisible();
      if (view.toast === 'No New Items') {
        // Nothing was added, so there is nothing to undo.
        await expect(tierList.toast('No New Items')).toContainText('Every item is already in the list.');
        await expect(tierList.items.undoButtonIn('No New Items')).toHaveCount(0);
      }
      if (view.picker) {
        // The open picker hides the page behind it from the accessibility tree, so only the picker is checked.
        await expect(tierList.items.templatePickerPage(view.picker)).toBeVisible();
        return;
      }
      await expect(tierList.items.templatePicker).toBeHidden();
      const expected = view.sets.reduce((count, set) => count + templateItemCount('image-overwatch', TEMPLATE_SETS[set].tag), 0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(expected);
      for (const set of TEMPLATE_SET_KEYS) {
        await expect(tierList.itemIn(tierList.unranked, TEMPLATE_SETS[set].example)).toHaveCount(view.sets.includes(set) ? 1 : 0);
      }
      if (view.sets.length === 0) {
        await expect(tierList.items.emptyListDropArea).toBeVisible();
        await expect(tierList.addImagesTile).toHaveCount(0);
      } else {
        await expect(tierList.items.emptyListDropArea).toHaveCount(0);
        await expect(tierList.addImagesTile).toBeVisible();
      }
    };

    /**
     * The add-from-template machine's events and checks. Each run starts on a new empty list.
     * Page time stands still (`pageTime: 'paused'`): a toast closes only in TOAST_TIMES_OUT, which
     * checks that it closes after exactly 4 s (letToastTimeOut).
     */
    const addFromTemplateSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => modelSut<AddFromTemplateSnapshot, AddFromTemplateEvent>(page, {
      pageTime: 'paused',
      reset: async () => {
        await tierList.goto('/rank');
        await expect(tierList.items.emptyListAction('Template')).toBeVisible();
      },
      events: {
        OPEN_FROM_MENU: () => tierList.items.openTemplatePicker(),
        OPEN_FROM_DROP_AREA: () => tierList.items.openTemplatePickerFromDropArea(),
        OPEN_OVERWATCH: () => tierList.items.openTemplatePackage('OVERWATCH'),
        CHOOSE_TANK: () => tierList.items.chooseTemplateSetAndHoldToast(TEMPLATE_SETS.tank.title),
        CHOOSE_SUPPORT: () => tierList.items.chooseTemplateSetAndHoldToast(TEMPLATE_SETS.support.title),
        PRESS_ESCAPE: () => tierList.items.pressEscapeForTemplatePicker(),
        UNDO: () => tierList.items.undoTemplateAddAndLetToastLeave(),
        TOAST_TIMES_OUT: () => tierList.items.waitOutTemplateAddToast(),
      },
      states: {
        '*': (_page, snapshot) => expectView(tierList, addFromTemplateViewOf(snapshot)),
      },
      testInfo,
      step: (name, body) => test.step(name, body),
    });

    test.describe.configure({retries: 0});
    for (const part of walkParts(addFromTemplateModel)) {
      test(`renders each state of the add-from-template machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(addFromTemplateModel, addFromTemplateSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, addFromTemplateModel, coverage, part);
      });
    }
  });

  /**
   * The remove-and-undo machine (tests/machines/remove-and-undo.ts): Delete, Reset and Remove
   * All, the toasts' Undo, and Back and Forward after them. Each run makes one removal. Page
   * time stands still (`pageTime: 'paused'`), so the toast stays over Back, Forward and Undo until
   * TOAST_TIMES_OUT moves the pointer off and checks that it closes after exactly 4 s
   * (letToastTimeOut).
   */
  test.describe('model: removing', () => {
    const LIST = rankingState('image-overwatch', {S: [...OPENED_ROWS.S], A: [...OPENED_ROWS.A], '': [...OPENED_ROWS.Unranked]});

    /** The items of each row, in order. */
    const expectRows = async (tierList: TierListPage, {rows}: RemoveAndUndoView) => {
      await expect(tierList.itemsIn('S')).toHaveText([...rows.S]);
      await expect(tierList.itemsIn('A')).toHaveText([...rows.A]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText([...rows.Unranked]);
    };

    /** The remove-and-undo machine's events and checks, run on this test's page (modelSut). */
    const removeAndUndoSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let opened = '';
      /** The history entries when the list opened. */
      let entries = 0;
      // The state on screen, as the last check saw it: Undo waits for a new link only where it changes the list.
      let onScreen: RemoveAndUndoSnapshot | null = null;
      const shown = () => {
        if (!onScreen) throw new Error('No state was checked yet');
        return onScreen;
      };
      return modelSut<RemoveAndUndoSnapshot, RemoveAndUndoEvent>(page, {
        pageTime: 'paused',
        reset: async () => {
          onScreen = null;
          await tierList.openAfterBlankPage(TANKS, LIST);
          await tierList.settled();
          opened = page.url();
          entries = await tierList.historyLength();
        },
        events: {
          DELETE_ITEM: () => tierList.items.deleteItemAndRestOnToast(DELETED_ITEM),
          CHOOSE_RESET: () => tierList.items.resetRankingsAndRestOnToast(),
          OPEN_REMOVE_ALL: () => tierList.items.openRemoveAll(),
          CONFIRM_REMOVE_ALL: () => tierList.items.confirmRemoveAllAndRestOnToast(),
          CANCEL_REMOVE_ALL: () => tierList.items.cancelRemoveAll(),
          CLICK_UNDO: () => tierList.items.undoInToastAndLetItLeave(removeAndUndoViewOf(shown()).toastWithUndo!, {changesList: undoChangesList(shown())}),
          BROWSER_BACK: () => tierList.goBack(),
          BROWSER_FORWARD: () => tierList.goForward(),
          TOAST_TIMES_OUT: () => tierList.items.waitOutToast(removeAndUndoViewOf(shown()).toastWithUndo!),
        },
        // Web-first checks: after Back or Forward the address changes before the list on screen does.
        states: {
          '*': async (_page, snapshot) => {
            onScreen = snapshot;
            const view = removeAndUndoViewOf(snapshot);
            if (view.asOpened) await expect(page).toHaveURL(opened);
            else await expect(page).not.toHaveURL(opened);
            await expect(tierList.items.removeAllDialog).toHaveCount(view.dialog ? 1 : 0);
            // The dialog is modal: the rows behind it leave the accessibility tree until it closes.
            if (!view.dialog) await expectRows(tierList, view);
            if (view.toastWithUndo) await expect(tierList.items.undoButtonIn(view.toastWithUndo)).toBeVisible();
            else if (view.removalToast) await expect(tierList.toast(view.removalToast)).toHaveCount(0);
            // One history entry for the removal, and one more for an Undo that put the list back.
            await expect.poll(() => tierList.historyLength(), {message: `the page should have added ${view.newEntries} history entries`})
              .toBe(entries + view.newEntries);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(removeAndUndoModel)) {
      test(`renders each state of the remove-and-undo machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(removeAndUndoModel, removeAndUndoSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, removeAndUndoModel, coverage, part);
      });
    }
  });
});
