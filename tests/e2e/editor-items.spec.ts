/** Adding, removing and resetting items in the editor, and items the image sets do not know. */
import path from 'node:path';
import type {Page, TestInfo} from '@playwright/test';
import {createPlaywrightSut} from '@xstate/test/playwright';
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
import {attachAndAssertCoverage, walkModel, MODEL_CAMPAIGN_TIMEOUT} from '../support/machines';
import type {TierListPage} from '../pages/tier-list-page';
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
    test('renders the restored item at its old position when the user clicks Undo after a delete', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

      await tierList.deleteItem('Mauga');
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
      await tierList.undoFromToast('Item deleted');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
    });

    test('renders the item again in row S when the user deletes it and clicks Undo in the toast "Item deleted"', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

      await tierList.deleteItem('Mauga');
      await expect(tierList.toast('Item deleted')).toBeVisible();
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);

      await tierList.undoFromToast('Item deleted');
      await expect(tierList.itemsIn('S')).toContainText(['Mauga']);
    });

    test('renders the Tank set items, then none after Undo, when the user adds the set to an empty list', async ({tierList}) => {
      await tierList.goto('/rank');
      await expect(tierList.title).toHaveText('Custom Tier List');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);

      await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);

      await tierList.undoFromToast('Items Added');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders each item once when the user adds the template set the list already has', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');

      // Wait for the add to happen: the count is already right before it does.
      await expect(tierList.toast('Items Added')).toBeVisible();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
    });

    test('renders the images as Unranked items when the user uploads 2 images from the device', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.addItemsFromDevice([path.join(IMAGES, 'red-square.png'), path.join(IMAGES, 'blue-square.png')]);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square', 'blue-square']);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
    });

    test('renders every item in Unranked and the toast "Items Reset" when the user chooses Reset', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));

      await tierList.resetRankings();

      await expect(tierList.toast('Items Reset')).toBeVisible();
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Sigma', 'Winston']);
    });

    test('renders no items and the toast "All Items Deleted" when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Sigma']}));

      await tierList.removeAllItems();

      await expect(tierList.toast('All Items Deleted')).toBeVisible();
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders the previous ranking when the user clicks Undo after Reset', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
      await tierList.resetRankings();

      await tierList.undoFromToast('Items Reset');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
    });

    test('renders the items from before the add when the user clicks Undo after adding a template set', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);

      await tierList.undoFromToast('Items Added');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders each item once when the user goes Back after a delete and clicks Undo in the toast', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));
      const opened = page.url();
      await tierList.deleteItem('Mauga');
      await expect(page).not.toHaveURL(opened);

      await page.goBack();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
      await tierList.undoFromToast('Item deleted');

      await expect(tierList.toast('Item restored')).toBeVisible();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
    });

    test('renders the items again when the user clicks Undo after Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.removeAllItems();

      await tierList.undoFromToast('All Items Deleted');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('renders button "Share" uncovered and clickable when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.removeAllItems();

      // A trial click runs every check of a real click, including that nothing covers the button.
      await tierList.shareButton.click({trial: true, timeout: 3_000});
    });

    test('renders focus on button "Add images" when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.removeAllItems();

      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders focus on button "Add images" when the user cancels Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.cancelRemoveAllItems();

      await expect(tierList.manageItemsButton).toBeFocused();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });
  });

  // Where people add images (owner decision, 2026-10-31): the drop overlay, an empty list's drop
  // area, the "drop or paste" line of the tray's tile, and the menu's "or drop" and "or paste".
  test.describe('adding images', () => {
    test('renders the drop overlay with its two lines when the user drags a link over the editor', async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.dropOverlay).toHaveCount(0);

      await tierList.dragLinkOver('https://i.imgur.com/red.png');

      await expect(tierList.dropOverlay).toBeVisible();
      await expect(tierList.dropOverlayNote).toBeVisible();
    });

    test('renders no drop overlay when the user drags a link over the editor and away again', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.dragLinkOver('https://i.imgur.com/red.png');
      await expect(tierList.dropOverlay).toBeVisible();

      await tierList.dragLinkAway('https://i.imgur.com/red.png');

      await expect(tierList.dropOverlay).toHaveCount(0);
    });

    test('renders the drop area with Template, Upload and Link and no tile or hints when the page opens an empty list', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto('/rank');

      await expect(tierList.emptyListDropArea).toBeVisible();
      await expect(tierList.emptyListAction('Template')).toBeVisible();
      await expect(tierList.emptyListAction('Upload')).toBeVisible();
      await expect(tierList.emptyListAction('Link')).toBeVisible();
      await expect(tierList.addImagesTile).toHaveCount(0);
      await expect(tierList.hints).toHaveCount(0);
    });

    test('renders the tile and no drop area when the page opens a list with items', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);

      await expect(tierList.addImagesTile).toBeVisible();
      await expect(tierList.emptyListDropArea).toHaveCount(0);
    });

    // Dropping and pasting need a mouse and a keyboard: on touch screens the words about them
    // hide, as "Paste an image to add it as an item." does (the class tooltip-mouse).
    test.describe('mouse wording', () => {
      test.skip(({isMobile}) => isMobile, 'The words about dropping and pasting show with a mouse.');

      test('renders "drop or paste" on the tile when the page opens a list with items', async ({tierList}) => {
        await tierList.goto(TANKS);

        await expect(tierList.addImagesTileHint).toBeVisible();
      });

      test('renders the heading "Drop or paste images here" when the page opens an empty list', async ({tierList}) => {
        await tierList.goto('/rank');

        await expect(tierList.emptyListDropArea).toHaveText('Drop or paste images here');
      });
    });

    test.describe('touch wording', () => {
      test.skip(({isMobile}) => !isMobile, 'The touch wording shows on touch screens.');

      test('renders no "drop or paste" on the tile when the page opens a list with items', {tag: '@mobile'}, async ({tierList}) => {
        await tierList.goto(TANKS);

        await expect(tierList.addImagesTile).toBeVisible();
        await expect(tierList.addImagesTileHint).toBeHidden();
      });

      test('renders the heading "Add images here" with Template, Upload and Link when the page opens an empty list', {tag: '@mobile'}, async ({tierList}) => {
        await tierList.goto('/rank');

        await expect(tierList.emptyListDropArea).toHaveText('Add images here');
        await expect(tierList.emptyListAction('Template')).toBeVisible();
        await expect(tierList.emptyListAction('Upload')).toBeVisible();
        await expect(tierList.emptyListAction('Link')).toBeVisible();
      });

      test('renders no hints "or drop" and "or paste" when the user opens the Add images menu', {tag: '@mobile'}, async ({tierList}) => {
        await tierList.goto(TANKS);

        await tierList.openManageItemsMenu();

        await expect(tierList.menuItem('From your device')).toBeVisible();
        await expect(tierList.menuHint('From your device', 'or drop')).toBeHidden();
        await expect(tierList.menuHint('From a link', 'or paste')).toBeHidden();
        await expect(tierList.menuHint('Open a Freeze Frame…', 'or drop')).toBeHidden();
      });
    });

    test('renders the dialog "Add New Items" when the user clicks Upload in the drop area of an empty list', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.emptyListAction('Upload').click();

      await expect(tierList.uploadDialog).toBeVisible();
    });

    test('renders focus on button "Add images" when the user adds an image with Link in the drop area of an empty list', async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto('/rank');

      await tierList.emptyListAction('Link').click();
      await expect(tierList.linkImageDialog).toBeVisible();
      await tierList.addItemFromLink('https://i.imgur.com/red.png', 'Red square');

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Red square']);
      // The drop area went away with the add, so focus goes to the toolbar's Add images.
      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders the hints "or drop" and "or paste" on the matching items when the user opens the Add images menu', async ({tierList, isMobile}) => {
      test.skip(isMobile, 'The hints show with a mouse.');
      await tierList.goto(TANKS);

      await tierList.openManageItemsMenu();

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
      await expect(tierList.toast('Items Added')).toHaveCount(view.toast ? 1 : 0);
      if (view.picker) {
        // The open picker hides the page behind it from the accessibility tree, so only the picker is checked.
        await expect(tierList.templatePickerPage(view.picker)).toBeVisible();
        return;
      }
      await expect(tierList.templatePicker).toBeHidden();
      const expected = view.sets.reduce((count, set) => count + templateItemCount('image-overwatch', TEMPLATE_SETS[set].tag), 0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(expected);
      for (const set of TEMPLATE_SET_KEYS) {
        await expect(tierList.itemIn(tierList.unranked, TEMPLATE_SETS[set].example)).toHaveCount(view.sets.includes(set) ? 1 : 0);
      }
      if (view.sets.length === 0) {
        await expect(tierList.emptyListDropArea).toBeVisible();
        await expect(tierList.addImagesTile).toHaveCount(0);
      } else {
        await expect(tierList.emptyListDropArea).toHaveCount(0);
        await expect(tierList.addImagesTile).toBeVisible();
      }
    };

    /** The add-from-template machine's events and checks. Each run starts on a new empty list. */
    const addFromTemplateSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => createPlaywrightSut<Page, AddFromTemplateSnapshot, AddFromTemplateEvent>(page, {
      reset: async () => {
        await tierList.goto('/rank');
        await expect(tierList.emptyListAction('Template')).toBeVisible();
      },
      events: {
        OPEN_FROM_MENU: () => tierList.openTemplatePicker(),
        OPEN_FROM_DROP_AREA: () => tierList.openTemplatePickerFromDropArea(),
        OPEN_OVERWATCH: () => tierList.openTemplatePackage('OVERWATCH'),
        CHOOSE_TANK: () => tierList.chooseTemplateSetAndHoldToast(TEMPLATE_SETS.tank.title),
        CHOOSE_SUPPORT: () => tierList.chooseTemplateSetAndHoldToast(TEMPLATE_SETS.support.title),
        PRESS_ESCAPE: () => tierList.pressEscapeForTemplatePicker(),
        UNDO: () => tierList.undoTemplateAdd(),
        TOAST_TIMES_OUT: () => tierList.waitOutTemplateAddToast(),
      },
      states: {
        '*': (_page, snapshot) => expectView(tierList, addFromTemplateViewOf(snapshot)),
      },
      testInfo,
      step: (name, body) => test.step(name, body),
    });

    test('renders each state of the add-from-template machine when the user walks every transition', async ({tierList, page}, testInfo) => {
      test.setTimeout(MODEL_CAMPAIGN_TIMEOUT);
      const coverage = await walkModel(addFromTemplateModel, addFromTemplateSut(tierList, page, testInfo));
      await attachAndAssertCoverage(testInfo, addFromTemplateModel, coverage);
    });
  });

  /**
   * The remove-and-undo machine (tests/machines/remove-and-undo.ts): Delete, Reset and Remove
   * All, the toasts' Undo, and Back and Forward after them. Each run makes one removal. The
   * pointer rests on the toast after each removal, which pauses its 4 s timer.
   */
  test.describe('model: removing', () => {
    const LIST = rankingState('image-overwatch', {S: [...OPENED_ROWS.S], A: [...OPENED_ROWS.A], '': [...OPENED_ROWS.Unranked]});

    /** The items of each row, in order. */
    const expectRows = async (tierList: TierListPage, {rows}: RemoveAndUndoView) => {
      await expect(tierList.itemsIn('S')).toHaveText([...rows.S]);
      await expect(tierList.itemsIn('A')).toHaveText([...rows.A]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText([...rows.Unranked]);
    };

    /** The remove-and-undo machine's events and checks, run on this test's page (createPlaywrightSut). */
    const removeAndUndoSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let opened = '';
      // The state on screen, as the last check saw it: Undo waits for a new link only where it changes the list.
      let onScreen: RemoveAndUndoSnapshot | null = null;
      const shown = () => {
        if (!onScreen) throw new Error('No state was checked yet');
        return onScreen;
      };
      return createPlaywrightSut<Page, RemoveAndUndoSnapshot, RemoveAndUndoEvent>(page, {
        reset: async () => {
          onScreen = null;
          await tierList.openAfterBlankPage(TANKS, LIST);
          await tierList.waitUntilInteractive();
          opened = page.url();
        },
        events: {
          DELETE_ITEM: () => tierList.deleteItemAndRestOnToast(DELETED_ITEM),
          CHOOSE_RESET: () => tierList.resetRankingsAndRestOnToast(),
          OPEN_REMOVE_ALL: () => tierList.openRemoveAll(),
          CONFIRM_REMOVE_ALL: () => tierList.confirmRemoveAllAndRestOnToast(),
          CANCEL_REMOVE_ALL: () => tierList.cancelRemoveAll(),
          CLICK_UNDO: () => tierList.undoInToast(removeAndUndoViewOf(shown()).toastWithUndo!, {changesList: undoChangesList(shown())}),
          BROWSER_BACK: () => tierList.goBack(),
          BROWSER_FORWARD: () => tierList.goForward(),
        },
        // Web-first checks: after Back or Forward the address changes before the list on screen does.
        states: {
          '*': async (_page, snapshot) => {
            onScreen = snapshot;
            const view = removeAndUndoViewOf(snapshot);
            if (view.asOpened) await expect(page).toHaveURL(opened);
            else await expect(page).not.toHaveURL(opened);
            await expect(tierList.removeAllDialog).toHaveCount(view.dialog ? 1 : 0);
            // The dialog is modal: the rows behind it leave the accessibility tree until it closes.
            if (!view.dialog) await expectRows(tierList, view);
            if (view.toastWithUndo) await expect(tierList.undoButtonIn(view.toastWithUndo)).toBeVisible();
            else if (view.removalToast) await expect(tierList.toast(view.removalToast)).toHaveCount(0);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test('renders each state of the remove-and-undo machine when the user walks every transition', async ({tierList, page}, testInfo) => {
      test.setTimeout(MODEL_CAMPAIGN_TIMEOUT);
      const coverage = await walkModel(removeAndUndoModel, removeAndUndoSut(tierList, page, testInfo));
      await attachAndAssertCoverage(testInfo, removeAndUndoModel, coverage);
    });
  });
});
