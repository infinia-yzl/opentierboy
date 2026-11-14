import fs from 'node:fs/promises';
import {type BrowserContext, expect, type Locator, type Page, type Route} from '@playwright/test';
import {expectSettled} from '../support/settled';
import {escapeRegExp} from '../support/regexp';
import {letToastTimeOut, pageTimePaused, runPageClock, TOAST_UNMOUNT_MS} from '../support/page-clock';
import type {HeldImageSite} from '../support/image-sites';

export type RowCount = 3 | 5 | 7;
export type LabelPosition = 'Left' | 'Right' | 'Top';
/** The choices of the Zen bar's Layout menu. */
export type ZenLayoutName = 'Editor' | '16:9' | '9:16' | 'Overlay · green key';
/** The values of the `layout` address parameter (lib/zen/layouts.ts). */
/** The tile sizes in the Row options menu (the dense editor). */
export type TileSizeName = 'Comfortable' | 'Compact';

/** A box on screen, in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}
/** The capture methods offered under "Options" in the Image tab of the share panel. */
export type CaptureMethod = 'html2canvas-pro' | 'Original html2canvas';
/** The pictures offered under "Frame" in the Image tab of the share panel. */
export type FreezeFrame = 'Whole list' | 'Landscape 1200×675' | 'Square 1080×1080' | 'Portrait 1080×1350';

/** What a test can check about the image that "Capture Preview" made. */
export interface CapturedImage {
  /** Size of the image in pixels. */
  width: number;
  height: number;
  /** Width and height of the page in CSS pixels, and the device pixel ratio. */
  pageWidth: number;
  pageHeight: number;
  devicePixelRatio: number;
  /** Number of different colours in a 64 x 64 copy of the image. A blank image has 1. */
  distinctColors: number;
  /** Brightness (0 to 255) of the top-left corner, where the background shows. */
  cornerBrightness: number;
}

/**
 * Firefox ignores the `clipboardData` that a script puts in a paste event (it makes an empty
 * one), so a test cannot paste files there. Paste tests skip Firefox with this reason.
 */
export const SCRIPTED_PASTE_SKIP = 'Firefox drops the files of a paste event made by a test (ClipboardEvent clipboardData).';
/** WebKit refuses page.goto() of a blob: URL in a new tab, which openImageInNewTab needs. */
export const BLOB_TAB_SKIP = 'WebKit does not let a test open a blob: URL in a new tab.';

/**
 * Page object for the tier list editor at /rank/...
 *
 * Locators follow https://playwright.dev/docs/locators#quick-guide: they use roles and
 * accessible names, the same handles that a screen-reader user relies on.
 *
 * - A tier row is a `group` named after its label. The unnamed last row is "Unranked".
 * - An item is a `button` named after its label (it is the drag handle as well).
 * - The handle that reorders a row is a `button` named "Move tier <label>".
 */
/** Files for the file picker: paths, or files made in the test. */
type DeviceFiles = string[] | {name: string; mimeType: string; buffer: Buffer}[];

/** A request the page sent, as recordRequests() keeps it. */
export interface SentRequest {
  method: string;
  url: string;
  body: Buffer;
}

export class TierListPage {
  readonly page: Page;
  readonly main: Locator;
  readonly title: Locator;
  /** The pencil after the title (owner decision, 2026-10-31). */
  readonly editTitleButton: Locator;
  /** The text box that replaces the title while it is edited. */
  readonly titleInput: Locator;
  /** The editor's hints, in the Unranked tray. */
  readonly hints: Locator;
  /** The dashed "Add images" tile that ends the Unranked tray. */
  readonly addImagesTile: Locator;
  readonly tiers: Locator;
  /** The title row's tools: Add images, Zen and Share. */
  readonly editorTools: Locator;
  readonly rowOptionsButton: Locator;
  /** "Add row", beside Row options under the rows (#182). */
  readonly addRowButton: Locator;
  readonly manageItemsButton: Locator;
  readonly shareButton: Locator;
  readonly sharePanel: Locator;
  /** "Open the list in this file?", after opening a snapshot file. */
  readonly openListDialog: Locator;
  readonly zenModeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    // An open dialog or menu hides <main> from assistive technology, but <main> still says
    // aria-busy and still takes events, so it is found also while hidden. What it holds is
    // looked up by role as usual, so a hidden title or row is still not found.
    this.main = page.getByRole('main', {includeHidden: true});
    this.title = this.main.getByRole('heading', {level: 1});
    this.editTitleButton = this.main.getByRole('button', {name: 'Edit title'});
    this.titleInput = this.main.getByRole('textbox', {name: 'Title'});
    this.hints = this.main.getByText('Drag to reorder.');
    this.addImagesTile = this.main.getByRole('button', {name: 'Add images to Unranked'});
    // Rows are the groups with a row handle; the title row's "Editor tools" is a group too.
    // Rows are the groups with a tier heading: the ranked rows and the Unranked tray (which has
    // no handle). The title row's "Editor tools" group has none.
    this.tiers = this.main.getByRole('group').filter({has: page.getByRole('heading', {level: 2})});
    this.editorTools = page.getByRole('group', {name: 'Editor tools'});
    this.rowOptionsButton = page.getByRole('button', {name: 'Row options'});
    this.addRowButton = page.getByRole('button', {name: 'Add row', exact: true});
    this.manageItemsButton = page.getByRole('button', {name: 'Add images', exact: true});
    this.shareButton = page.getByRole('button', {name: 'Share', exact: true});
    this.sharePanel = page.getByRole('dialog').filter({
      has: page.getByRole('heading', {name: 'Share Your Rankings'}),
    });
    this.zenModeToggle = page.getByRole('button', {name: 'Zen', exact: true});
    this.openListDialog = page.getByRole('alertdialog', {name: 'Open the list in this file?'});
  }

  /** Opens a tier list. `state` is the raw value of the `state` query parameter. */
  async goto(path: string, state?: string) {
    await this.page.goto(state ? `${path}?state=${state}` : path);
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  /**
   * Opens a link that might crash the page in the browser. Unlike goto(), it does not wait for
   * the editor: it returns once Next.js shows its crash message, or once the page has started
   * and settled (a crash while it starts comes before that).
   */
  async gotoPageThatMayCrash(path: string, state: string) {
    await this.page.goto(`${path}?state=${state}`);
    await expect.poll(async () => await this.crashMessage.isVisible() || await this.startedAndIdle(), {
      message: 'the page should crash, or start and settle',
    }).toBe(true);
  }

  /**
   * True when the page has a <main> that is not busy (lib/busy.ts), read once, without waiting
   * for a <main> to show (a crashed page has none).
   */
  private async startedAndIdle(): Promise<boolean> {
    return this.main.evaluateAll((mains) => mains.length > 0 && mains.every((main) => main.getAttribute('aria-busy') !== 'true'));
  }

  /** The message Next.js shows instead of the page when the page crashed in the browser. */
  get crashMessage(): Locator {
    return this.page.getByRole('heading', {name: /Application error/});
  }

  /** Reloads the page, and waits until the editor shows the list again. */
  async reload() {
    await this.page.reload();
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  /**
   * Reloads the page and returns once it has loaded, without waiting for the editor: for a
   * speed budget that times what the page shows after the reload.
   */
  async reloadNow() {
    await this.page.reload();
  }

  /** Opens a full link, for example one copied from another page. */
  async gotoLink(link: string) {
    await this.page.goto(link);
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  tier(name: string): Locator {
    return this.main.getByRole('group', {name, exact: true});
  }

  get unranked(): Locator {
    return this.tier('Unranked');
  }

  /**
   * All items in a tier, in display order. Not items: the row handle, the tray's "Add images to
   * Unranked" tile, and the Template, Upload and Link buttons of an empty list's drop area.
   */
  itemsIn(tier: string | Locator): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name: /^(?!Move tier\b|Add images to\b|(?:Template|Upload|Link)$)/});
  }

  item(name: string): Locator {
    return this.main.getByRole('button', {name, exact: true});
  }

  /**
   * Every item tile in the rows and the Unranked tray (in Zen, the item up next). The queue
   * after the item up next is a list of pictures, not items to drag.
   */
  get allItems(): Locator {
    return this.itemsIn(this.tiers);
  }

  /**
   * Checks that every item tile can start a drag. A tile has the role description "draggable"
   * only while the drag library has its draggable (lib/dnd/react.tsx, DraggableTierItem), so
   * a tile that would take no drag, where a press starts the browser's own image drag, has
   * none. The drop helpers call this after every drop, so any test that drops something
   * fails on such a tile.
   */
  async expectEveryItemDraggable() {
    await expect.poll(() => this.allItems.evaluateAll((items) => items
      .filter((item) => item.getAttribute('aria-roledescription') !== 'draggable')
      .map((item) => item.getAttribute('aria-label'))), {
      message: 'every item tile should take a drag (role description "draggable")',
    }).toEqual([]);
  }

  /** An item's image. An item without an image (a label tile) has none. */
  itemImage(name: string): Locator {
    return this.item(name).getByRole('img');
  }

  /** An item, by its label, in a tier. */
  itemIn(tier: string | Locator, name: string): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name, exact: true});
  }

  /** A tier's label: the row's h2 heading. */
  tierLabel(tierName: string): Locator {
    return this.tier(tierName).getByRole('heading', {level: 2});
  }

  /** The text box that edits a tier's label, while it is open. */
  tierNameInput(tierName: string): Locator {
    return this.tier(tierName).getByRole('textbox');
  }

  /** Every open text box in the editor (title and labels). */
  get openTextBoxes(): Locator {
    return this.main.getByRole('textbox');
  }

  /** The h1 headings of the page. The list title is the only one. */
  get pageHeadings(): Locator {
    return this.page.getByRole('heading', {level: 1});
  }

  /** The buttons in the title row's tools, in order. */
  get editorToolButtons(): Locator {
    return this.editorTools.getByRole('button');
  }

  /** One button in Editor tools, by its name. */
  editorToolButton(name: string): Locator {
    return this.editorTools.getByRole('button', {name, exact: true});
  }

  /** A menu item in the open menu, by its name (the item menu, Add images, Row options). */
  menuItem(name: string): Locator {
    return this.page.getByRole('menuitem', {name});
  }

  /** The font size of an element in pixels, as the browser computes it. */
  async fontSize(element: Locator): Promise<number> {
    return element.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  }

  /** The content of a meta tag in the page head, such as og:title. Meta tags have no role, so this is the one CSS selector. */
  metaTag(property: string): Locator {
    return this.page.locator(`meta[property="${property}"]`);
  }

  /**
   * Scrolls an item into view (tile images load lazily) and tells whether its image has
   * loaded. Use it with expect.poll().
   */
  async itemImageHasLoaded(name: string): Promise<boolean> {
    const image = this.itemImage(name);
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  }

  /**
   * The colour at the centre of an item's image as red, green and blue (0 to 255), or null
   * while the image has not loaded. Scrolls the item into view first (images load lazily).
   */
  async itemImageCenterColor(name: string): Promise<[number, number, number] | null> {
    const image = this.item(name).getByRole('img');
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => {
      if (!img.complete || img.naturalWidth === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(img, 0, 0);
      const [red, green, blue] = context.getImageData(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1).data;
      return [red, green, blue] as [number, number, number];
    });
  }

  /**
   * Opens an image's blob: URL in a new tab, as the browser's "Open image in new tab" does.
   * Returns the type of the document the tab shows (image/png for a picture, text/html for a
   * page) and the localStorage item `pwned`, which a script in a disguised page would set.
   */
  async openImageInNewTab(image: Locator): Promise<{contentType: string; pwned: string | null}> {
    const src = await image.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
    expect(src).toMatch(/^blob:/);
    const tab = await this.page.context().newPage();
    try {
      await tab.goto(src);
      return await tab.evaluate(() => ({contentType: document.contentType, pwned: localStorage.getItem('pwned')}));
    } finally {
      await tab.close();
    }
  }

  rowHandle(tierName: string): Locator {
    return this.main.getByRole('button', {name: `Move tier ${tierName}`, exact: true});
  }

  /** Leaves the editor for the landing page with the site's logo link in the header. */
  async leaveForHome() {
    await this.homeLink.click();
    await expect(this.page).toHaveURL(/^[^?]*\/$/);
  }

  /** The logo link to Home in the page's banner. */
  get homeLink(): Locator {
    return this.page.getByRole('banner').getByRole('link', {name: 'OpenTierBoy'});
  }

  /**
   * Holds the server's answers for Home (its prefetch too) until `release`, so a test can act
   * while the visitor's trip home still loads. Call it before the editor opens: the editor
   * prefetches Home as soon as the logo shows.
   */
  async holdTripHome(): Promise<{release: () => Promise<void>}> {
    let open!: () => void;
    const released = new Promise<void>((resolve) => {
      open = resolve;
    });
    const handled: Promise<void>[] = [];
    const handler = (route: Route) => {
      const request = route.request();
      const headers = request.headers();
      const tripHome = headers['rsc'] === '1' && new URL(request.url()).pathname === '/';
      if (!tripHome) return route.fallback();
      const done = released.then(() => route.fallback().catch(() => undefined));
      handled.push(done);
      return done;
    };
    await this.page.route('**/*', handler);
    return {
      release: async () => {
        open();
        await Promise.all(handled);
        await this.page.unroute('**/*', handler);
      },
    };
  }

  /** Pastes a file where the focus is, the way a browser does, without waiting for anything. */
  async pasteFileNow(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.page.evaluate(({name, mimeType, base64}) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
  }

  /** The number of entries in the tab's history (window.history.length). */
  async historyLength(): Promise<number> {
    return this.page.evaluate(() => window.history.length);
  }

  /**
   * Starts counting the history entries this page adds from now on (history.pushState calls: the
   * editor makes one per change, and Next.js one per router.push). Browsers keep at most 50
   * entries, so history.length cannot count more. Returns a function that reads the count.
   */
  async countNewHistoryEntries(): Promise<() => Promise<number>> {
    await this.page.evaluate(() => {
      const counted = window as unknown as {newHistoryEntries: number};
      counted.newHistoryEntries = 0;
      const push = window.history.pushState.bind(window.history);
      window.history.pushState = (...args: Parameters<History['pushState']>) => {
        counted.newHistoryEntries += 1;
        push(...args);
      };
    });
    return () => this.page.evaluate(() => (window as unknown as {newHistoryEntries: number}).newHistoryEntries);
  }

  /** The link a visitor would share. The app keeps it in the address bar. */
  async shareLink(): Promise<string> {
    await expect(this.page).toHaveURL(/[?&]state=/);
    return this.page.url();
  }

  /**
   * Runs an action that changes the ranking, and waits until the app has written the
   * change into the address bar. Only then is the link ready to share.
   */
  private async changeAndWaitForLink(action: () => Promise<void>) {
    const before = this.page.url();
    await action();
    await expect(this.page, 'the shareable link should update').not.toHaveURL(before);
  }

  /**
   * Runs a drop that changes the list, waits for the new link, and checks again that every
   * item tile can start a drag: the list on screen has its final tiles once the link is written.
   */
  private async dropAndWaitForLink(drop: () => Promise<void>) {
    await this.changeAndWaitForLink(drop);
    await this.expectEveryItemDraggable();
  }

  // ---- Ranking -----------------------------------------------------------------------------

  /**
   * The lines of a row's items, top to bottom, each a list of item names, read from where the
   * items are on screen. A row wraps onto a new line when its items do not fit.
   */
  async itemLines(tierName: string): Promise<string[][]> {
    const items = this.itemsIn(tierName);
    const boxes = await Promise.all((await items.all()).map(async (item) => ({
      name: (await item.getAttribute('aria-label')) ?? '',
      top: Math.round((await item.boundingBox())!.y),
    })));
    const tops = [...new Set(boxes.map((box) => box.top))].sort((a, b) => a - b);
    return tops.map((top) => boxes.filter((box) => box.top === top).map((box) => box.name));
  }

  /** Drags an item with the mouse and drops it at the end of a tier. */
  async dragItemToTier(itemName: string, tierName: string) {
    await this.dropAndWaitForLink(() =>
      // Drop in the free space at the end of the row, left of the row handle.
      this.dragWithMouse(this.item(itemName), this.tier(tierName), (box) => ({
        x: box.x + box.width - 120,
        y: box.y + box.height / 2,
      })),
    );
  }

  /**
   * Drags an item with the mouse in one straight sweep, in small steps, from Unranked to the
   * left part of a row: the press, a small move down and right that starts the drag, then the
   * sweep. On the way up the editor shows the item in each row the pointer crosses. Returns
   * once the link is in the address bar.
   */
  async dragItemToTierStartInOneSweep(itemName: string, tierName: string) {
    await this.dropEnded();
    await this.changeAndWaitForLink(async () => {
      const item = this.item(itemName);
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const row = await boxOf(this.tier(tierName));
      const mouse = this.page.mouse;
      await mouse.move(from.x, from.y);
      await mouse.down();
      await mouse.move(from.x + 10, from.y + 10, {steps: 4});
      await expect(this.dragAnnouncer).toHaveText(/^Picked up /);
      await mouse.move(row.x + 150, row.y + row.height / 2, {steps: 16});
      // The drop target follows the pointer within a few frames. A wrong row stays wrong.
      await expect(this.dragAnnouncer).toHaveText(/ moves to tier /);
      await this.scrollPositionAfterFrames();
      await mouse.up();
      await this.dropEnded();
    });
    await this.expectEveryItemDraggable();
  }

  /**
   * Drags an item with the mouse to the end of a tier and, right after the release (while the
   * drop still animates), presses another item and moves the mouse a little, as someone ranking
   * fast does, then releases it there. A press during the drop animation starts no drag of the
   * editor (tests/README.md, "Drag and drop"). Returns once the drop animation has ended.
   */
  async dragItemToTierThenPressItem(itemName: string, tierName: string, pressedName: string) {
    const pressed = this.item(pressedName);
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.item(itemName), this.tier(tierName), (box) => ({
        x: box.x + box.width - 120,
        y: box.y + box.height / 2,
      }), {
        afterRelease: async () => {
          const from = await centerOf(pressed);
          const mouse = this.page.mouse;
          await mouse.move(from.x, from.y);
          await mouse.down();
          // Past the 5 px that start a mouse drag, and still on the pressed item.
          await mouse.move(from.x + 12, from.y + 6, {steps: 4});
          await mouse.up();
        },
      }),
    );
  }

  /**
   * Starts counting the drags the browser itself starts from now on: dragstart events that no
   * handler cancelled (a native drag, for example of an image). Returns a function that reads
   * the count. The listener sits on the window, so it reads each event after the page's own
   * handlers.
   */
  async countNativeDrags(): Promise<() => Promise<number>> {
    await this.page.evaluate(() => {
      const counted = window as unknown as {nativeDrags: number};
      counted.nativeDrags = 0;
      window.addEventListener('dragstart', (event) => {
        if (!event.defaultPrevented) counted.nativeDrags += 1;
      });
    });
    return () => this.page.evaluate(() => (window as unknown as {nativeDrags: number}).nativeDrags);
  }

  /**
   * Sends a dragstart event from an item's image, as the browser does when a native drag of
   * the picture begins. Returns true when the page cancelled it (no native drag).
   */
  async dragStartFromItemImageIsCancelled(itemName: string): Promise<boolean> {
    return this.itemImage(itemName).evaluate((image) => {
      const event = new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: new DataTransfer()});
      image.dispatchEvent(event);
      return event.defaultPrevented;
    });
  }

  /** The images of every tile in the rows and the Unranked tray, the item up next and the queue included. */
  get allItemImages(): Locator {
    return this.tiers.getByRole('img');
  }

  /**
   * Drags an item with the mouse over a tier, then presses Escape before releasing the button,
   * so the drag is cancelled. Returns once the cancel is announced and the drop animation ended.
   */
  async dragItemToTierThenCancel(itemName: string, tierName: string) {
    await this.dragWithMouse(this.item(itemName), this.tier(tierName), (box) => ({
      x: box.x + box.width - 120,
      y: box.y + box.height / 2,
    }), {cancel: true});
  }

  /**
   * Lifts an item with the keyboard (Space), moves it with the given keys, then presses Escape.
   * Returns once the cancel is announced and focus is back on the item.
   */
  async moveItemWithKeyboardThenCancel(itemName: string, keys: string[]) {
    const keyboard = this.page.keyboard;
    await this.dropEnded();
    await this.item(itemName).focus();
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('Picked up');
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
    }
    await keyboard.press('Escape');
    await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    await expect.poll(() => this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toBe(itemName);
    await this.expectEveryItemDraggable();
  }

  /**
   * Drags an item with the mouse onto another item and drops it there: it takes that item's
   * place. Coming from before it (in reading order) it lands just after it, otherwise just
   * before it.
   */
  async dragItemOnto(itemName: string, targetItemName: string) {
    const [from, to] = await Promise.all([boxOf(this.item(itemName)), boxOf(this.item(targetItemName))]);
    const comesFromBefore = from.y + from.height <= to.y || (from.y < to.y + to.height && from.x < to.x);
    await this.dragItemNextTo(itemName, targetItemName, comesFromBefore ? 'after' : 'before');
  }

  /**
   * Drags an item with the mouse onto the left or right half of another item, and drops it just
   * before or just after that item. Items move out of the way during the drag, so the helper
   * follows the target item until it stays put.
   */
  async dragItemNextTo(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.item(itemName), this.item(targetItemName), (box) => ({
        x: box.x + box.width * (side === 'before' ? 0.25 : 0.75),
        y: box.y + box.height / 2,
      }), {followTarget: true}),
    );
  }

  /** Drags an item with the mouse a little and drops it back where it started. The list stays as it was. */
  async dragItemAndDropInPlace(itemName: string) {
    await this.dragWithMouse(this.item(itemName), this.item(itemName), centerOfBox);
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\. It stays in `));
  }

  /** Drags a whole row by its handle and drops it on the position of another row. */
  async dragTierOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.rowHandle(tierName), this.rowHandle(targetTierName), centerOfBox),
    );
  }

  /**
   * Presses the mouse on a drag handle, moves it to a point on the drop target, and
   * releases it there.
   *
   * During a drag the editor shows the list as it would be after the drop: rows and items
   * move out of the way of the dragged one. By default the helper measures the drop point
   * once, before the drag starts, in page coordinates, for drops on a row (its free space, or
   * the place of another row): a row target measured during the drag has already moved, and
   * following it pulls the dragged row back, so the target moves back too, and so on.
   * With `followTarget` it aims at the target where it is during the drag, until the target
   * stays put. That suits drops before or after an item: they depend only on the half of the
   * item under the pointer, so following the item settles.
   *
   * Before the drag, the helper scrolls the window so that the handle and the drop point both
   * show, as a person does, when the window is tall enough for both. Otherwise the page
   * auto-scrolls while the pointer is near the top or bottom of the window, and the helper keeps
   * moving the pointer to the same page point until the scrolling stops. Auto-scroll runs on
   * page time, so a test with page time paused needs both points on screen.
   */
  private async dragWithMouse(handle: Locator, target: Locator, pointIn: (box: Box) => Point, {followTarget = false, cancel = false, afterRelease}: {followTarget?: boolean; cancel?: boolean; afterRelease?: () => Promise<void>} = {}) {
    await handle.scrollIntoViewIfNeeded();
    await this.scrollToShow(handle, pointIn(await boxOf(target)));
    const scrollBefore = await this.scrollPosition();
    const onPage = (point: Point, scroll: Point) => ({x: point.x + scroll.x, y: point.y + scroll.y});
    const dropAtOnPage = onPage(pointIn(await boxOf(target)), scrollBefore);
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};

    const mouse = this.page.mouse;
    // A press starts no drag until the last drop has ended.
    await this.dropEnded();
    const from = await centerOf(handle);
    await mouse.move(from.x, from.y);
    await mouse.down();
    // A mouse drag starts only after the pointer moves a few pixels.
    await mouse.move(from.x + 8, from.y + 8, {steps: 4});
    // Once a drag starts, the editor announces the lift, and then every change of the
    // drop position. Only the latest message stays in the live region.
    await expect(this.dragAnnouncer, 'the drag should start').toHaveText(/^Picked up /);

    // Each try moves the pointer and waits a few frames; auto-scroll and items that slide out of
    // the way settle within a number of tries, not a time. The last failed check says what did not.
    let lastProblem: unknown = null;
    for (let tryNumber = 1; tryNumber <= DROP_POINT_TRIES; tryNumber++) {
      try {
        await this.moveToDropPoint(target, pointIn, {followTarget, dropAtOnPage, onPage, viewport});
        lastProblem = null;
        break;
      } catch (error) {
        lastProblem = error;
      }
    }
    if (lastProblem !== null) {
      const check = lastProblem instanceof Error ? lastProblem.message.split('\n').slice(0, 3).join(' ') : String(lastProblem);
      throw new Error(`The drag did not settle on its drop point in ${DROP_POINT_TRIES} tries. Last check: ${check}`, {cause: lastProblem});
    }
    if (cancel) {
      // Escape ends the drag where it is; the button is released after that.
      await this.page.keyboard.press('Escape');
      await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    }
    await mouse.up();
    await afterRelease?.();
    await this.dropEnded();
    await this.expectEveryItemDraggable();
  }

  /** One try of dragWithMouse to put the pointer on the drop point; throws until all is still. */
  private async moveToDropPoint(target: Locator, pointIn: (box: Box) => Point, {followTarget, dropAtOnPage: measured, onPage, viewport}: {
    followTarget: boolean;
    dropAtOnPage: Point;
    onPage: (point: Point, scroll: Point) => Point;
    viewport: {width: number; height: number};
  }) {
    const scroll = await this.scrollPosition();
    const dropAtOnPage = followTarget ? onPage(pointIn(await boxOf(target)), scroll) : measured;
    // A drop point outside the window is reached by holding the pointer at the edge,
    // where the page auto-scrolls towards it.
    const x = clamp(dropAtOnPage.x - scroll.x, 1, viewport.width - 2);
    const y = clamp(dropAtOnPage.y - scroll.y, 1, viewport.height - 2);
    await this.page.mouse.move(x, y, {steps: 5});
    // The drag library reads the pointer once per animation frame. Waiting a few frames
    // lets it handle the last move, and shows whether the page is still scrolling.
    const scrollAfter = await this.scrollPositionAfterFrames();
    expect(scrollAfter, 'the page should stop auto-scrolling').toEqual(scroll);
    expect({x: x + scroll.x, y: y + scroll.y}, 'the pointer should be on the drop point').toEqual(dropAtOnPage);
    if (followTarget) {
      // Items slide to their new places (an animation): the target must have stopped moving.
      expect(onPage(pointIn(await boxOf(target)), scrollAfter), 'the target should stay put').toEqual(dropAtOnPage);
    }
  }

  /**
   * Waits until no drag or drop is in progress, a drop animation included: the rows carry
   * `data-dragging` until then (components/DragDropTierList.tsx, RowList), and the page is busy
   * (lib/dnd/react.tsx). Until then the drag library blocks text selection on the whole page
   * (typing into a label right away goes nowhere) and a press starts no new drag. Other work,
   * such as a link on its way to the address, may go on: a quick test does not wait for it.
   */
  private async dropEnded() {
    await expect.poll(() => this.page.evaluate(() => document.querySelector('[data-dragging]') === null), {
      message: 'the last drop should have ended',
    }).toBe(true);
  }

  /**
   * Scrolls the window so that the handle and the drop point (in window coordinates) both show,
   * when they fit in the window together and do not show already.
   */
  private async scrollToShow(handle: Locator, dropAt: Point) {
    const margin = 16;
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};
    const scroll = await this.scrollPosition();
    const from = await boxOf(handle);
    const top = Math.min(from.y, dropAt.y) + scroll.y;
    const bottom = Math.max(from.y + from.height, dropAt.y) + scroll.y;
    const shows = top >= scroll.y + margin && bottom <= scroll.y + viewport.height - margin;
    if (shows || bottom - top > viewport.height - 2 * margin) return;
    const y = Math.max(0, Math.round((top + bottom - viewport.height) / 2));
    await this.page.evaluate((toY) => window.scrollTo({top: toY, behavior: 'instant'}), y);
    // The window may stop short of the point (the end of the page): wait until it holds still.
    let last = await this.scrollPositionAfterFrames(2);
    await expect.poll(async () => {
      const now = await this.scrollPositionAfterFrames(2);
      const still = now.x === last.x && now.y === last.y;
      last = now;
      return still;
    }, {message: 'the window should stop scrolling'}).toBe(true);
  }

  private async scrollPosition(): Promise<Point> {
    return this.page.evaluate(() => ({x: window.scrollX, y: window.scrollY}));
  }

  private async scrollPositionAfterFrames(frames = 5): Promise<Point> {
    return this.page.evaluate(async (count) => {
      for (let frame = 0; frame < count; frame++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return {x: window.scrollX, y: window.scrollY};
    }, frames);
  }

  /**
   * Moves an item with the keyboard, as a keyboard or screen-reader user would:
   * focus the item, Space to lift, arrow keys to move, Space to drop.
   * With `waitForLink: false` it returns once the drop is announced, without checking the
   * address bar or the tiles (for quick changes one after another).
   */
  async moveItemWithKeyboard(itemName: string, keys: string[], {waitForLink = true} = {}) {
    const move = () => this.moveWithKeyboard(this.item(itemName), keys, itemName);
    await (waitForLink ? this.dropAndWaitForLink(move) : move());
  }

  /**
   * Moves an item with the keyboard and checks what screen readers hear after each arrow key:
   * returns the announcements, the drop included.
   */
  async moveItemWithKeyboardAndListen(itemName: string, keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.item(itemName), keys, itemName, heard));
    return heard;
  }

  /** Moves a whole row with the keyboard, using its row handle. */
  async moveTierWithKeyboard(tierName: string, keys: string[]) {
    // The labels stay in place, so the moved row's handle has the name of its new position.
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.rowHandle(tierName), keys, /^Move tier /));
  }

  private async moveWithKeyboard(handle: Locator, keys: string[], focusAfter: string | RegExp, heard: string[] = []) {
    const keyboard = this.page.keyboard;
    // The editor announces every step to screen readers. Waiting for those announcements
    // keeps the test in step with the app without fixed sleeps.
    await this.dropEnded();
    await handle.focus();
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('Picked up');
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
      heard.push(await this.dragAnnouncer.textContent() ?? '');
    }
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('Dropped');
    heard.push(await this.dragAnnouncer.textContent() ?? '');
    // Then focus goes back to the item or handle (in the next frame), and the next action can start.
    await expect.poll(() => this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), {
      message: 'focus should come back to what was moved',
    }).toMatch(typeof focusAfter === 'string' ? new RegExp(`^${escapeRegExp(focusAfter)}$`) : focusAfter);
    await this.expectEveryItemDraggable();
  }

  // ---- Touch (Chromium only: touch events through the Chrome DevTools Protocol) --------------

  /**
   * Touches an item, holds it still, then drags it to the end of a tier and lifts the finger.
   * The hold is in the event times (300 ms between touching and moving), so the test does not
   * wait for it. The drag starts after a 250 ms hold (lib/dnd/activation.ts).
   */
  async touchDragItemToTier(itemName: string, tierName: string) {
    await this.dropAndWaitForLink(async () => {
      const touch = await this.touchscreen();
      const item = this.item(itemName);
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const start = Date.now() / 1000;
      await touch('touchStart', from, start);
      // Still after the hold, then a few pixels: the drag starts.
      await touch('touchMove', {x: from.x, y: from.y + 1}, start + 0.3);
      await touch('touchMove', {x: from.x, y: from.y - 10}, start + 0.32);
      await expect(this.dragAnnouncer, 'the drag should start').toHaveText(new RegExp(`^Picked up ${escapeRegExp(itemName)},`));
      const box = await boxOf(this.tier(tierName));
      const to = {x: box.x + box.width - 80, y: box.y + box.height / 2};
      for (let step = 1; step <= 10; step++) {
        await touch('touchMove', {x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10}, start + 0.32 + step * 0.03);
        await this.scrollPositionAfterFrames(2);
      }
      await expect(this.dragAnnouncer).toHaveText(new RegExp(`moves to ${escapeRegExp(tierName === 'Unranked' ? tierName : `tier ${tierName}`)},`));
      await touch('touchEnd', null, start + 0.7);
      await this.dropEnded();
      await this.expectEveryItemDraggable();
    });
  }

  /**
   * Touches an item and holds the finger still until its menu opens (a long press), then lifts
   * the finger. Returns the menu.
   */
  async longPressItem(itemName: string): Promise<Locator> {
    const touch = await this.touchscreen();
    const item = this.item(itemName);
    await item.scrollIntoViewIfNeeded();
    await touch('touchStart', await centerOf(item));
    const menu = this.page.getByRole('menu');
    await expect(menu.getByRole('menuitem', {name: 'Delete'})).toBeVisible();
    await touch('touchEnd', null);
    return menu;
  }

  /**
   * A quick swipe up that starts on an item, as when scrolling the page: the finger moves at
   * once, before any hold. Returns how far the page scrolled.
   */
  async swipeUpFromItem(itemName: string, distance: number): Promise<number> {
    const touch = await this.touchscreen();
    const item = this.item(itemName);
    await item.scrollIntoViewIfNeeded();
    const scrollBefore = await this.scrollPosition();
    const from = await centerOf(item);
    const start = Date.now() / 1000;
    await touch('touchStart', from, start);
    for (let step = 1; step <= 10; step++) {
      await touch('touchMove', {x: from.x, y: from.y - distance * step / 10}, start + step * 0.01);
    }
    await touch('touchEnd', null, start + 0.12);
    let scrolled = 0;
    await expect.poll(async () => {
      scrolled = (await this.scrollPosition()).y - scrollBefore.y;
      return scrolled;
    }, {message: 'the page should scroll'}).toBeGreaterThan(distance / 2);
    return scrolled;
  }

  /** Sends touch events to the page (one finger), with optional event times in seconds. */
  private async touchscreen() {
    const cdp = await this.page.context().newCDPSession(this.page);
    return async (type: 'touchStart' | 'touchMove' | 'touchEnd', point: Point | null, timestamp?: number) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: point ? [{x: point.x, y: point.y}] : [],
        ...(timestamp !== undefined && {timestamp}),
      });
    };
  }

  /**
   * The live region where the editor announces lifts, moves and drops (dnd-kit's Accessibility
   * plugin). It is a `status` with no name, like the toasts, so its id tells it apart: this and
   * metaTag() are the only CSS selectors in the tests.
   */
  get dragAnnouncer(): Locator {
    return this.page.locator('[role="status"][aria-live][id^="dnd-kit-announcement"]');
  }

  // ---- Editing labels --------------------------------------------------------------------

  /**
   * Renames a tier and confirms with Enter. A row with an empty label is named after its
   * position, for example "Tier 2", so pass that as `nameAfter` when clearing a label.
   * With `waitForLink: false` it returns as soon as the new name shows, without checking the
   * address bar (for quick changes one after another).
   */
  async renameTier(currentName: string, newName: string, nameAfter = newName, {waitForLink = true} = {}) {
    const rename = async () => {
      const input = await this.typeTierName(currentName, newName);
      await input.press('Enter');
      await expect(this.tier(nameAfter)).toBeVisible();
    };
    if (!waitForLink) {
      await rename();
      return;
    }
    // From a page that has finished the last step (a drop): text typed while the
    // drag library still blocks text selection could land beside the old name (WebKit).
    await this.settled();
    await this.changeAndWaitForLink(rename);
  }

  /** Opens the editor of a tier label and types a new name, without confirming it. */
  async typeTierName(currentName: string, newName: string): Promise<Locator> {
    const row = this.tier(currentName);
    await row.getByRole('heading', {name: currentName, exact: true}).click();
    const input = row.getByRole('textbox');
    await input.fill(newName);
    await expect(input, 'the text box should hold the typed name').toHaveValue(newName);
    return input;
  }

  async setTitle(newTitle: string) {
    await this.settled();
    await this.changeAndWaitForLink(async () => {
      const input = await this.typeTitle(newTitle);
      await input.press('Enter');
      await expect(this.title).toHaveText(newTitle);
    });
  }

  /** Opens the title editor and types a new title, without confirming it. */
  async typeTitle(newTitle: string): Promise<Locator> {
    await this.title.click();
    const input = this.main.getByPlaceholder('Enter title');
    await input.fill(newTitle);
    await expect(input, 'the text box should hold the typed title').toHaveValue(newTitle);
    return input;
  }

  // ---- Row and label settings ------------------------------------------------------------

  /** Switches the row template. A new history entry, like any change to the list. */
  /** Adds an empty row above Unranked with "Add row" (#182). */
  async addTierRow() {
    await this.changeAndWaitForLink(async () => {
      await this.addRowButton.click();
    });
  }

  /** Removes a ranked row from the row options menu (#182). Its items go to Unranked. */
  async removeTierRow(tierName: string) {
    const rows = await this.openRemoveRowMenu();
    await this.changeAndWaitForLink(() => rows.and(this.page.getByRole('menuitem', {name: tierName, exact: true})).click());
  }

  /** "Remove a row" in the Row options menu. It shows once the menu is open (openRowOptions). */
  get removeRowMenuItem(): Locator {
    return this.page.getByRole('menuitem', {name: 'Remove a row'});
  }

  /**
   * Opens the Row options menu, once the page has settled (a test may come from Back) and no
   * menu is open: a click on Row options with its menu open would close it.
   */
  async openRowOptions() {
    await this.settled();
    await expect(this.openMenus, 'no menu should be open before Row options opens').toHaveCount(0);
    await this.rowOptionsButton.click();
    await expect(this.removeRowMenuItem).toBeVisible();
  }

  /**
   * Opens Row options › Remove a row, and returns the rows that submenu lists, as menu items.
   * The pointer then rests inside the submenu, so a click on a row stays inside it.
   */
  async openRemoveRowMenu(): Promise<Locator> {
    await this.openRowOptions();
    await this.removeRowMenuItem.click();
    const submenu = this.page.getByRole('menu').filter({hasNot: this.removeRowMenuItem});
    const rows = submenu.getByRole('menuitem');
    await expect(rows.first()).toBeVisible();
    await this.movePointerIntoSubmenu(this.removeRowMenuItem, submenu);
    return rows;
  }

  /**
   * Moves the pointer from a submenu's item into the open submenu as a person does: sideways
   * along the item, toward the side where the submenu opened, then across into it. The menu
   * keeps a submenu open only for a pointer that heads its way; a pointer that jumps straight
   * to an item further down leaves the item in the wrong direction, and the submenu closes
   * (the Row options menu sits at the right edge, so its submenu opens on the left).
   */
  private async movePointerIntoSubmenu(trigger: Locator, submenu: Locator) {
    await expect(submenu).toHaveAttribute('data-side', /^(left|right)$/);
    const side = await submenu.getAttribute('data-side');
    const from = await boxOf(trigger);
    const into = await boxOf(submenu);
    const y = from.y + from.height / 2;
    expect(y, 'the submenu should open beside its item').toBeGreaterThan(into.y);
    expect(y, 'the submenu should open beside its item').toBeLessThan(into.y + into.height);
    const edge = side === 'left' ? from.x + 2 : from.x + from.width - 2;
    const inside = side === 'left' ? into.x + into.width - 8 : into.x + 8;
    await this.page.mouse.move(from.x + from.width / 2, y);
    await this.page.mouse.move(edge, y, {steps: 4});
    await this.page.mouse.move(inside, y, {steps: 2});
    await expect(submenu, 'the submenu should stay open once the pointer is inside it').toBeVisible();
    await expect(submenu.getByRole('menuitem').first()).toBeVisible();
  }

  /**
   * Closes the open menu, and its open submenu, with Escape: the first Escape closes them all.
   * A menu must be open.
   */
  async closeMenus() {
    await expect(this.openMenus.first(), 'a menu should be open to close').toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.openMenus).toHaveCount(0);
  }

  async chooseRowCount(count: RowCount) {
    await this.changeAndWaitForLink(async () => {
      await this.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: `${count} Rows`}).click();
    });
  }

  /**
   * Moves the tier labels. The setting travels in the link, in place of the current history
   * entry (A3), so this waits until the address holds it.
   */
  async chooseLabelPosition(position: LabelPosition) {
    await this.changeAndWaitForLink(async () => {
      await this.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: position, exact: true}).click();
    });
  }

  /** Shows or hides item labels. Like chooseLabelPosition, it waits until the address holds it. */
  async setItemLabelsVisible(visible: boolean) {
    await this.changeAndWaitForLink(async () => {
      await this.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: visible ? 'Show Labels' : 'Hide Labels'}).click();
    });
  }

  /** A choice in the Row options menu (row count, label position, label visibility). Open the menu first (openRowOptions). */
  rowOption(name: string): Locator {
    return this.page.getByRole('menu').getByRole('menuitemradio', {name, exact: true});
  }

  /** True when the label of a tier sits above the given item, as with labels on Top. */
  async tierLabelIsAbove(tierName: string, itemName: string): Promise<boolean> {
    const label = await this.tier(tierName).getByRole('heading', {name: tierName}).boundingBox();
    const item = await this.item(itemName).boundingBox();
    return !!(label && item && label.y + label.height <= item.y);
  }

  // ---- Managing items --------------------------------------------------------------------

  private async openItemsMenu() {
    await this.manageItemsButton.click();
  }

  /** Opens the Add images menu and leaves it open. */
  async openManageItemsMenu() {
    await this.openItemsMenu();
    await expect(this.page.getByRole('menu')).toBeVisible();
  }

  /** The template picker ("From template"): a searchable list of image sets and their tags. */
  get templatePicker(): Locator {
    return this.page.getByRole('dialog');
  }

  /** The options of the open template picker (image sets, then tags). */
  templateOption(name?: string | RegExp): Locator {
    return name === undefined ? this.templatePicker.getByRole('option') : this.templatePicker.getByRole('option', {name});
  }

  /** Opens the template picker. Its first page lists the image sets as options. */
  async openTemplatePicker() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From template'}).click();
    await expect(this.templatePicker.getByRole('combobox')).toBeVisible();
  }

  /** Types into the search box of the open template picker. Matching sets and tags appear as options. */
  async searchTemplates(text: string) {
    await this.templatePicker.getByRole('combobox').fill(text);
  }

  /** Adds a set from the built-in templates, for example ('OVERWATCH', 'Tank'). */
  async addItemsFromTemplate(packageName: string, setTitle: string) {
    await this.openTemplatePicker();
    const picker = this.templatePicker;
    await picker.getByRole('option', {name: packageName, exact: true}).click();
    await picker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
  }

  /** The "From your device" dialog. */
  get uploadDialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Add New Items'});
  }

  /** Opens "From your device" and leaves its dialog open. */
  async openUploadDialog() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From your device'}).click();
    await expect(this.uploadDialog).toBeVisible();
  }

  /**
   * Uploads images from the device: file paths, or files made in the test. Item names default to
   * the file names. `timeout`: how long adding may take (hundreds of files take a while).
   */
  async addItemsFromDevice(files: DeviceFiles, {timeout}: {timeout?: number} = {}) {
    const dialog = await this.chooseFilesFromDevice(files);
    await dialog.getByRole('button', {name: /^Add \d+ Items?$/}).click();
    await expect(dialog).toBeHidden({timeout});
  }

  /** The image previews in the "From your device" dialog. */
  uploadPreview(name: string): Locator {
    return this.uploadDialog.getByRole('img', {name});
  }

  /** The text that stands for a file the dialog cannot preview. */
  get uploadNoPreview(): Locator {
    return this.uploadDialog.getByText('No preview');
  }

  /** The dialog's add button ("Add 1 Item", "Add 2 Items"...). */
  get uploadAddButton(): Locator {
    return this.uploadDialog.getByRole('button', {name: /^Add \d+ Items?$/});
  }

  /** The dialog's error message. */
  get uploadError(): Locator {
    return this.uploadDialog.getByRole('alert');
  }

  /** Opens "From your device" and chooses files. Returns the dialog, still open. */
  async chooseFilesFromDevice(files: DeviceFiles): Promise<Locator> {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From your device'}).click();
    const dialog = this.page.getByRole('dialog', {name: 'Add New Items'});
    await dialog.getByLabel('Upload Images').setInputFiles(files);
    return dialog;
  }

  /**
   * How many item images show an upload from this browser (a loaded `blob:` image).
   */
  async loadedUploadImageCount(): Promise<number> {
    return this.main.getByRole('img').evaluateAll((images) => images.filter((image) => (
      image instanceof HTMLImageElement && image.currentSrc.startsWith('blob:') && image.complete && image.naturalWidth > 0
    )).length);
  }

  /**
   * Scrolls an item into view and tells whether its tile shows an upload from this browser (a
   * loaded `blob:` image), rather than a placeholder or its name only. Use it with expect.poll().
   */
  async itemShowsUpload(name: string): Promise<boolean> {
    const image = this.item(name).getByRole('img');
    if ((await image.count()) === 0) return false;
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => img.currentSrc.startsWith('blob:') && img.complete && img.naturalWidth > 0);
  }

  /**
   * Makes one later URL.createObjectURL() call throw, as a browser that cannot make an object URL
   * would: the call after `skip` calls that still work. Calls after it work again.
   */
  async failObjectUrl({skip = 0}: {skip?: number} = {}) {
    await this.page.evaluate((callsBefore) => {
      const original = URL.createObjectURL;
      let left = callsBefore;
      URL.createObjectURL = (object: Blob | MediaSource) => {
        if (left-- > 0) return original(object);
        URL.createObjectURL = original;
        throw new Error('This browser could not make an object URL.');
      };
    }, skip);
  }

  // ---- Data kept in this browser -------------------------------------------------------------

  /**
   * Keeps old uploads in localStorage, as the app kept them before Phase 5c. Writes them on the
   * landing page, which does not open the device image store, so the next editor page moves them.
   */
  async keepOldUploads(uploads: {id: string; label: string; png: Buffer}[]) {
    await this.page.goto('/');
    const entries = uploads.map(({id, label, png}) => ({i: id, c: label, d: `data:image/png;base64,${png.toString('base64')}`}));
    await this.page.evaluate((value) => localStorage.setItem('customItems', value), JSON.stringify(entries));
  }

  /**
   * Stores a localStorage value before the next page load, once, as an earlier visit would have.
   * Later loads in the same tab find what the app made of it.
   */
  async storeBeforeLoad(key: string, value: string) {
    await this.page.addInitScript(([storageKey, storedValue]) => {
      if (!sessionStorage.getItem('test-stored-' + storageKey)) {
        localStorage.setItem(storageKey, storedValue);
        sessionStorage.setItem('test-stored-' + storageKey, '1');
      }
    }, [key, value]);
  }

  /** A localStorage value of this site, or null. */
  async localStorageItem(key: string): Promise<string | null> {
    return this.page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
  }

  /** Makes window.indexedDB throw on every page load, as browsers that block storage do. */
  async blockIndexedDb() {
    await this.page.addInitScript(() => Object.defineProperty(window, 'indexedDB', {get: () => {
      throw new DOMException('Blocked', 'SecurityError');
    }}));
  }

  /** The ids of old uploads still waiting in localStorage to move into the image store. */
  async oldUploadIds(): Promise<string[]> {
    const stored = await this.page.evaluate(() => localStorage.getItem('customItems'));
    return stored === null ? [] : (JSON.parse(stored) as {i: string}[]).map((entry) => entry.i);
  }

  /** The ids of images the image store removed to make room, as the editor records them. */
  async evictedImageIds(): Promise<string[]> {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem('evictedDeviceImages') ?? '[]') as string[]);
  }

  /** The "From a link" dialog. */
  get linkImageDialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Add an Image from a Link'});
  }

  /** Opens "From a link" in the Add images menu, and waits for its dialog. */
  async openLinkImageDialog() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From a link'}).click();
    await expect(this.linkImageDialog).toBeVisible();
  }

  /** Opens "From a link", fills in the address (and a name), and presses the add button. Leaves the dialog open. */
  async submitLinkImage(address: string, name?: string) {
    await this.openLinkImageDialog();
    await this.submitInLinkImageDialog(address, name);
  }

  /**
   * In the open "From a link" dialog (for example after an address it refused), fills in the
   * address (and a name) and presses the add button. Leaves the dialog open.
   */
  async submitInLinkImageDialog(address: string, name?: string) {
    const dialog = this.linkImageDialog;
    await dialog.getByLabel('Image address').fill(address);
    if (name !== undefined) await dialog.getByLabel('Name (optional)').fill(name);
    await dialog.getByRole('button', {name: /^Add (Item|Anyway)$/}).click();
  }

  /** Closes the open "From a link" dialog with Escape. */
  async closeLinkImageDialog() {
    await expect(this.linkImageDialog).toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.linkImageDialog).toBeHidden();
  }

  /** Adds an image from a link and waits until the dialog has closed. */
  async addItemFromLink(address: string, name?: string) {
    await this.submitLinkImage(address, name);
    await expect(this.linkImageDialog).toBeHidden();
  }

  /** After an image failed its check: adds it anyway, as a label tile. */
  async confirmAddAnyway() {
    await this.linkImageDialog.getByRole('button', {name: 'Add Anyway'}).click();
    await expect(this.linkImageDialog).toBeHidden();
  }

  /** The message the "From a link" dialog shows about the address or the image. */
  get linkImageMessage(): Locator {
    return this.linkImageDialog.getByRole('alert');
  }

  /** The notice about images from sites that are not trusted, with [Load] and [Always allow these sites]. */
  get imageSitesNotice(): Locator {
    return this.page.getByRole('region', {name: 'Images from other sites'});
  }

  /** The sites the notice lists. */
  get imageSitesNoticeHosts(): Locator {
    return this.imageSitesNotice.getByRole('listitem');
  }

  async loadImagesFromOtherSites() {
    await this.imageSitesNotice.getByRole('button', {name: 'Load', exact: true}).click();
    await expect(this.imageSitesNotice).toBeHidden();
  }

  async alwaysAllowImageSites() {
    await this.imageSitesNotice.getByRole('button', {name: 'Always allow these sites'}).click();
    await expect(this.imageSitesNotice).toBeHidden();
  }

  /**
   * Waits until the page has finished what the last step started: <main> no longer says
   * `aria-busy` (lib/busy.ts). The page is busy until the editor has started in the browser,
   * while a link is written, during a drag, and while files or pictures are added or captured.
   */
  async settled() {
    await expectSettled(this.page);
  }

  /**
   * The text an item's right-click (or long-press) menu shows about the image's site, if any.
   * The menu renders whole: once its last item, Delete, shows, the site line is there or not.
   */
  async itemImageSite(itemName: string): Promise<string | null> {
    await this.settled();
    await this.item(itemName).click({button: 'right'});
    const menu = this.page.getByRole('menu');
    await expect(menu.getByRole('menuitem', {name: 'Delete'})).toBeVisible();
    const lines = await menu.getByText(/^Image from /).allTextContents();
    await this.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return lines[0] ?? null;
  }

  /**
   * Pastes image files into the editor (or into `target`, for example a text field), as a paste
   * from the clipboard would. The test builds the paste event: browsers do not let tests write
   * images to the real clipboard. Firefox ignores the files in such an event, so paste tests skip
   * Firefox (SCRIPTED_PASTE_SKIP).
   */
  async pasteImages(files: {name: string; mimeType: string; buffer: Buffer}[], target?: Locator) {
    // A target (such as a text field the test typed into) proves the page has started already.
    if (!target) await this.settled();
    await (target ?? this.main).evaluate((element, payload) => {
      const transfer = new DataTransfer();
      for (const file of payload) {
        const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
        transfer.items.add(new File([bytes], file.name, {type: file.mimeType}));
      }
      element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, files.map((file) => ({name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')})));
  }

  /**
   * Pastes several groups of images at once, one paste event per group, as quick pastes do: the
   * editor handles them while the earlier ones are still being added.
   */
  async pasteImagesAtOnce(groups: {name: string; mimeType: string; buffer: Buffer}[][]) {
    await this.settled();
    await this.main.evaluate((element, payload) => {
      for (const group of payload) {
        const transfer = new DataTransfer();
        for (const file of group) {
          const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
          transfer.items.add(new File([bytes], file.name, {type: file.mimeType}));
        }
        element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
      }
    }, groups.map((group) => group.map((file) => ({name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')}))));
  }

  // ---- Safety checks ------------------------------------------------------------------------

  /**
   * Records every request the page sends from now on, with its body. Returns a function that
   * gives the requests so far. Product rule 5: a device image never reaches the server.
   */
  /** The text the user has selected on the page. */
  async selectedText(): Promise<string> {
    return this.page.evaluate(() => String(window.getSelection()));
  }

  /**
   * The computed user-select and -webkit-touch-callout of an element. A browser that does not
   * know the callout (all but Safari) returns ''; WebKit names user-select with its prefix.
   */
  async textSelectionStyle(element: Locator): Promise<{userSelect: string; callout: string}> {
    return element.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        userSelect: computed.userSelect || computed.getPropertyValue('-webkit-user-select'),
        callout: computed.getPropertyValue('-webkit-touch-callout'),
      };
    });
  }

  recordRequests(): () => SentRequest[] {
    const sent: SentRequest[] = [];
    this.page.on('request', (request) => {
      sent.push({method: request.method(), url: request.url(), body: request.postDataBuffer() ?? Buffer.alloc(0)});
    });
    return () => sent.slice();
  }

  /**
   * Whether markup in user text ran as code. Safety tests put `<img onerror>` and `<script>` text
   * that sets `window.__otbInjected` into titles, row names and labels.
   */
  async injectedMarkupRan(): Promise<boolean> {
    // An <img onerror> runs once its image fails, so wait until every eager image has loaded or
    // failed. Lazy images (link images) may wait for a scroll; markup put in the page has none.
    await expect.poll(() => this.page.evaluate(() => [...document.images].filter((image) => image.loading !== 'lazy').every((image) => image.complete))).toBe(true);
    return this.page.evaluate(() => (window as unknown as {__otbInjected?: unknown}).__otbInjected !== undefined);
  }

  /**
   * Sends several paste and drop events at once, in order, each with one file: as when a
   * visitor pastes and drops quickly, before the editor has handled the first one. Firefox
   * drops the files of a scripted paste (SCRIPTED_PASTE_SKIP).
   */
  async sendFileEventsAtOnce(events: {event: 'paste' | 'drop'; file: {name: string; mimeType: string; buffer: Buffer}}[]) {
    await this.settled();
    await this.main.evaluate((_main, payload) => {
      for (const {event, name, mimeType, base64} of payload) {
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
        const init = {bubbles: true, cancelable: true};
        document.body.dispatchEvent(event === 'paste'
          ? new ClipboardEvent('paste', {...init, clipboardData: data})
          : new DragEvent('drop', {...init, dataTransfer: data}));
      }
    }, events.map(({event, file}) => ({event, name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')})));
  }

  // ---- Image addresses: dropped or pasted text (#107) ------------------------------------------

  /**
   * What a drag from another page carries, as text: `uriList` (a dragged link), `html` (an image
   * dragged from a page holds an `<img>`), `plain` (text). The test builds the drag events, as
   * for dropped files.
   */
  private async textTransfer(data: {uriList?: string; html?: string; plain?: string}) {
    return this.page.evaluateHandle(({uriList, html, plain}) => {
      const transfer = new DataTransfer();
      if (html !== undefined) transfer.setData('text/html', html);
      if (uriList !== undefined) transfer.setData('text/uri-list', uriList);
      if (plain !== undefined) transfer.setData('text/plain', plain);
      return transfer;
    }, data);
  }

  /** Drops links or text from another page onto the editor's first row. */
  async dropText(data: {uriList?: string; html?: string; plain?: string}) {
    await this.settled();
    const transfer = await this.textTransfer(data);
    const element = this.tiers.first();
    await element.dispatchEvent('dragenter', {dataTransfer: transfer});
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
    await element.dispatchEvent('drop', {dataTransfer: transfer});
  }

  /**
   * Fires a dragstart on an item that a handler on the item cancels, as a tile does for the
   * browser's own drag of its picture. No drag starts, so no dragend follows.
   */
  async fireCancelledDragStartOn(itemName: string) {
    await this.settled();
    await this.item(itemName).evaluate((element) => {
      element.addEventListener('dragstart', (event) => event.preventDefault(), {once: true});
      element.dispatchEvent(new DragEvent('dragstart', {bubbles: true, cancelable: true}));
    });
  }

  /** Drags a link from another page over the editor and keeps it there (no drop yet). */
  async dragLinkOver(address: string) {
    await this.settled();
    const transfer = await this.textTransfer({uriList: address, plain: address});
    const element = this.tiers.first();
    await element.dispatchEvent('dragenter', {dataTransfer: transfer});
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
  }

  /** Moves the dragged link off the page again, as dragging it out of the window does. */
  async dragLinkAway(address: string) {
    const transfer = await this.textTransfer({uriList: address, plain: address});
    await this.tiers.first().dispatchEvent('dragleave', {dataTransfer: transfer});
  }

  /**
   * Pastes text into the editor, as pasting a copied image address does. The test builds the
   * paste event; Firefox drops the data of such an event (SCRIPTED_PASTE_SKIP).
   */
  async pasteText(text: string) {
    await this.settled();
    await this.main.evaluate((element, pasted) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', pasted);
      element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, text);
  }

  /** The overlay that shows while files or links are dragged over the editor. */
  get dropOverlay(): Locator {
    return this.page.getByText('Drop images or image links to add them');
  }

  /** The overlay's second line, about Freeze Frame pictures. */
  get dropOverlayNote(): Locator {
    return this.page.getByText('Saved Freeze Frame pictures reopen as editable lists.');
  }

  /**
   * An empty list's drop area, in the Unranked tray, by its heading on screen: "Drop or paste
   * images here" with a mouse, "Add images here" on a touch screen.
   */
  get emptyListDropArea(): Locator {
    return this.unranked.getByText(/^(?:Drop or paste images here|Add images here)$/).filter({visible: true});
  }

  /** The line "drop or paste" on the tray's "Add images to Unranked" tile (mouse only). */
  get addImagesTileHint(): Locator {
    return this.addImagesTile.getByText('drop or paste', {exact: true});
  }

  /** The hint after a menu item of the Add images menu: "or drop" or "or paste" (mouse only). */
  menuHint(item: string, hint: 'or drop' | 'or paste'): Locator {
    return this.menuItem(item).getByText(hint, {exact: true});
  }

  /** A button of an empty list's drop area: Template, Upload or Link. */
  emptyListAction(name: 'Template' | 'Upload' | 'Link'): Locator {
    return this.unranked.getByRole('button', {name, exact: true});
  }

  // ---- Files: snapshot files and pictures ---------------------------------------------------

  /**
   * Chooses a file with "Open a Freeze Frame…" in the Add images menu, as the file chooser
   * would. Pass `waitForEditor: false` when the test already waited for the editor
   * (settled), for example to time the opening.
   */
  async openFile(file: {name: string; mimeType: string; buffer: Buffer}, {waitForEditor = true} = {}) {
    if (waitForEditor) await this.settled();
    const chooser = this.page.waitForEvent('filechooser');
    await this.manageItemsButton.click();
    await this.page.getByRole('menuitem', {name: 'Open a Freeze Frame…'}).click();
    await (await chooser).setFiles(file);
  }

  /**
   * Drops a file onto the editor's first row, as dragging it from the desktop would. With
   * `onto`, it drops onto that element instead (for example an open menu or dialog), without
   * waiting for the editor first.
   */
  async dropFile(file: {name: string; mimeType: string; buffer: Buffer}, {onto}: {onto?: Locator} = {}) {
    if (!onto) await this.settled();
    const transfer = await this.page.evaluateHandle(({name, mimeType, base64}) => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      return data;
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
    const element = onto ?? this.tiers.first();
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
    await element.dispatchEvent('drop', {dataTransfer: transfer});
  }

  /** The open menu (the Add images menu, an item menu, Row options). */
  get openMenu(): Locator {
    return this.page.getByRole('menu');
  }

  /**
   * Confirms "Open the list in this file?" and waits until the list's link is in the address bar:
   * the dialog says "Opening the list…" until then. With `newAddress: false` (the address already
   * shows that list), it waits until the opening has finished instead.
   */
  async confirmOpenList({newAddress = true} = {}) {
    const before = this.page.url();
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect(this.openListDialog).toBeHidden();
    if (newAddress) await expect(this.page, 'the list of the file should open').not.toHaveURL(before);
    await expect(this.tiers.first()).toBeVisible();
  }

  /** Clicks Open list and leaves the dialog to open the list (it says "Opening the list…"). */
  async startOpeningList() {
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect(this.openListDialog).toContainText('Opening the list…');
  }

  /**
   * Chooses a file with "Open a Freeze Frame…" and returns how long the page took, measured in the page,
   * from receiving the file until a toast with `text` appeared (milliseconds). Playwright's own
   * waiting is not part of the time.
   */
  async timeToOpenFile(file: {name: string; mimeType: string; buffer: Buffer}, text: string): Promise<number> {
    await this.settled();
    await this.page.evaluate((expected) => {
      const timing: {start?: number; end?: number} = {};
      (window as unknown as {__openFileTiming: typeof timing}).__openFileTiming = timing;
      document.addEventListener('change', () => {
        timing.start ??= performance.now();
      }, {capture: true, once: true});
      const observer = new MutationObserver(() => {
        if (timing.start !== undefined && document.body.textContent?.includes(expected)) {
          timing.end = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, {childList: true, subtree: true, characterData: true});
    }, text);
    await this.openFile(file, {waitForEditor: false});
    await expect(this.toast(text)).toBeVisible();
    return this.page.evaluate(() => {
      const timing = (window as unknown as {__openFileTiming: {start?: number; end?: number}}).__openFileTiming;
      return (timing.end ?? Number.NaN) - (timing.start ?? Number.NaN);
    });
  }

  /**
   * The number of images in this browser's device image store. It reads the store's IndexedDB
   * database in the page directly: only the test looks, the app itself goes through
   * lib/images/deviceStore.ts.
   */
  async deviceImageCount(): Promise<number> {
    return this.page.evaluate(() => new Promise<number>((resolve, reject) => {
      // eslint-disable-next-line no-restricted-globals -- a test reads the store to count its images
      const opening = indexedDB.open('opentierboy-device-images');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const count = db.transaction('images').objectStore('images').count();
        count.onsuccess = () => {
          db.close();
          resolve(count.result);
        };
        count.onerror = () => reject(count.error);
      };
    }));
  }

  async cancelOpenList() {
    await this.openListDialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(this.openListDialog).toBeHidden();
  }

  /**
   * Freeze Frame's Download, after Capture Preview: returns the downloaded file. When the list
   * does not fit into the picture, the app offers the picture without it in a toast instead.
   */
  async downloadCapturedImage(): Promise<{name: string; buffer: Buffer}> {
    const button = this.sharePanel.getByRole('button', {name: 'Download', exact: true});
    await expect(button).toBeEnabled();
    const download = this.page.waitForEvent('download');
    await button.click();
    const file = await download;
    return {name: file.suggestedFilename(), buffer: await fs.readFile(await file.path())};
  }

  /**
   * Freeze Frame's Download when the list does not fit into the picture: checks the message that
   * says so, takes its "Download picture" and returns that file.
   */
  async downloadCapturedImageWithoutList(): Promise<{name: string; buffer: Buffer}> {
    const button = this.sharePanel.getByRole('button', {name: 'Download', exact: true});
    await expect(button).toBeEnabled();
    await button.click();
    const offer = this.toast('This list is too large to keep in the picture');
    await expect(offer).toContainText('Download the picture without the list?');
    const download = this.page.waitForEvent('download');
    await offer.getByRole('button', {name: 'Download picture'}).click();
    const file = await download;
    return {name: file.suggestedFilename(), buffer: await fs.readFile(await file.path())};
  }

  /** Deletes an item with its right-click menu, and returns once the new link is in the address bar. */
  async deleteItem(itemName: string) {
    await this.changeAndWaitForLink(async () => {
      await this.item(itemName).click({button: 'right'});
      await this.page.getByRole('menuitem', {name: 'Delete'}).click();
    });
  }

  async resetRankings() {
    await this.changeAndWaitForLink(async () => {
      await this.openItemsMenu();
      await this.page.getByRole('menuitem', {name: 'Reset'}).click();
    });
  }

  /** Opens Remove All and cancels the confirmation. */
  async cancelRemoveAllItems() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
    const confirm = this.page.getByRole('alertdialog');
    await confirm.getByRole('button', {name: 'Cancel'}).click();
    await expect(confirm).toBeHidden();
  }

  async removeAllItems() {
    await this.changeAndWaitForLink(async () => {
      await this.openItemsMenu();
      await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
      const confirm = this.page.getByRole('alertdialog');
      await confirm.getByRole('button', {name: 'Remove All Items'}).click();
    });
  }

  // ---- Sharing -------------------------------------------------------------------------

  async openSharePanel() {
    await this.shareButton.click();
    await expect(this.sharePanel).toBeVisible();
  }

  /**
   * Opens the Image tab of the share panel (Freeze Frame), where a capture stays until the next
   * one, opening the panel first when it is closed. The panel opens and closes in the event that
   * asks for it, so once the page has settled one look tells whether it is open.
   */
  async openImageTab() {
    await this.settled();
    if (!(await this.sharePanel.isVisible())) await this.openSharePanel();
    await this.chooseShareTab('Image');
  }

  /** Copies the Markdown share text. The browser must allow clipboard access. */
  /** A share button in the URL tab of the share panel, by its accessible name. */
  socialShareButton(name: string | RegExp): Locator {
    return this.sharePanel.getByRole('button', {name});
  }

  /** A tab of the share panel ("URL" or "Image"). */
  shareTab(name: 'URL' | 'Image'): Locator {
    return this.sharePanel.getByRole('tab', {name});
  }

  /** The Copy Markdown button of the share panel. */
  get copyMarkdownButton(): Locator {
    return this.sharePanel.getByRole('button', {name: 'Copy Markdown'});
  }

  /** Opens the share panel and clicks Copy Markdown (see copyMarkdownInOpenPanel). */
  async copyMarkdown() {
    await this.openSharePanel();
    await this.copyMarkdownInOpenPanel();
  }

  /**
   * Lets the test read the text the app copies. Call it before goto(). Chromium grants read
   * access to the real clipboard. Firefox and WebKit refuse a test that access, so there the
   * page's navigator.clipboard.writeText keeps the text in the page instead, and resolves as
   * the real one does. Either way the test reads what the app handed out.
   */
  async readCopiedText() {
    const context = this.page.context();
    if (context.browser()?.browserType().name() === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      return;
    }
    await this.page.addInitScript(() => {
      const copied = window as unknown as {__otbCopiedText?: string};
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          ...navigator.clipboard,
          writeText: async (text: string) => {
            copied.__otbCopiedText = text;
          },
        },
      });
    });
  }

  /** The text the app copied last (see readCopiedText). */
  async clipboardText(): Promise<string> {
    return this.page.evaluate(async () => {
      const copied = (window as unknown as {__otbCopiedText?: string}).__otbCopiedText;
      return copied ?? navigator.clipboard.readText();
    });
  }

  /** The preview that "Capture Preview" (Freeze Frame) shows in the share panel. */
  get capturedImage(): Locator {
    return this.sharePanel.getByRole('img', {name: 'Captured tier list'});
  }

  /** The "Frame" choice in the Image tab of the share panel. Open the tab first (openImageTab). */
  get frameSelect(): Locator {
    return this.sharePanel.getByRole('combobox', {name: 'Frame'});
  }

  /** The notes in the share panel that say which images the link carries. */
  get linkImageNotes(): Locator {
    return this.sharePanel.getByRole('note');
  }

  /**
   * Captures the page as an image from the Image tab of the share panel ("Freeze Frame"),
   * and waits until the app reports the result in a toast. Without a method or a frame, the
   * app's defaults are used.
   */
  async capturePreview(method?: CaptureMethod, frame?: FreezeFrame) {
    await this.openSharePanel();
    await this.sharePanel.getByRole('tab', {name: 'Image'}).click();
    if (frame) {
      await this.frameSelect.click();
      await this.page.getByRole('option', {name: frame, exact: true}).click();
      await expect(this.frameSelect).toHaveText(frame);
    }
    if (method) {
      await this.sharePanel.getByRole('button', {name: 'Options'}).click();
      const methodSelect = this.sharePanel.getByRole('combobox', {name: 'Capture method'});
      await methodSelect.click();
      await this.page.getByRole('option', {name: method, exact: true}).click();
      await expect(methodSelect).toHaveText(method);
    }
    await this.captureAndExpectSuccess();
  }

  /**
   * Clicks Capture Preview in the open Image tab, and waits until this capture has shown the
   * toast "Image captured successfully" and no other toast (a failed capture shows "Failed to
   * capture image" instead, and then this fails).
   */
  private async captureAndExpectSuccess() {
    await this.expectOnlyNewToast(() => this.sharePanel.getByRole('button', {name: 'Capture Preview'}).click(), 'Image captured successfully');
  }

  /**
   * Runs an action, and waits until the toasts it showed are exactly one toast that contains
   * `text`. The toasts already on screen are marked first, so an older toast with the same text
   * does not count, and a toast of another outcome (an error) fails the wait. It waits for the
   * toast, not for the page to settle: the page may be busy on purpose, for example while list
   * writes wait for a held server answer.
   */
  private async expectOnlyNewToast(action: () => Promise<void>, text: string) {
    const marker = 'data-shown-before-step';
    await toasts(this.page).evaluateAll((items, name) => items.forEach((item) => item.setAttribute(name, '')), marker);
    await action();
    await expect.poll(() => toasts(this.page).evaluateAll((items, name) => items
      .filter((item) => !item.hasAttribute(name))
      .map((item) => item.textContent ?? ''), marker), {message: `the toasts this step showed should be one "${text}"`})
      .toEqual([expect.stringContaining(text)]);
  }

  /**
   * Counts the colours in an item's tile as the page shows it now, from a screenshot of the
   * tile. Returns the tile's box in page coordinates as well, to find the tile in a capture.
   */
  async tileColorsOnScreen(itemName: string): Promise<{box: Box; colors: number}> {
    const tile = this.item(itemName);
    await tile.scrollIntoViewIfNeeded();
    await expect.poll(() => tile.getByRole('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      {message: `the image of "${itemName}" should load`}).toBe(true);
    const box = await boxOf(tile);
    const scroll = await this.scrollPosition();
    const png = await this.page.screenshot({clip: box, animations: 'disabled'});
    const colors = await this.page.evaluate(countColors, {src: `data:image/png;base64,${png.toString('base64')}`});
    return {box: {...box, x: box.x + scroll.x, y: box.y + scroll.y}, colors};
  }

  /**
   * Finds the most colourful spot in the first tile column of the captured list card, and
   * counts its colours. Freeze Frame draws the list card (components/ListCard.tsx): 1200 CSS
   * pixels wide, 36 px of space on each side, 120 px tier labels and 92 px tiles for a short
   * list. The picture may hold more pixels than CSS pixels; its width tells how many.
   */
  async capturedCardTileColors(): Promise<number> {
    const src = await this.capturedImage.evaluate((img: HTMLImageElement) => img.currentSrc);
    return this.page.evaluate(countColors, {src, column: {x: 36 + 120, y: 0, width: 92, height: 92}, cardWidth: CARD_WIDTH});
  }

  /** Waits for the captured preview image to load, then measures it. */
  async capturedImageDetails(): Promise<CapturedImage> {
    await expect(this.capturedImage).toBeVisible();
    // The capture is done once the page is no longer busy; decode() waits until the picture
    // has loaded.
    await this.settled();
    const details = await this.capturedImage.evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const size = 64;
      const small = document.createElement('canvas');
      small.width = size;
      small.height = size;
      const smallContext = small.getContext('2d')!;
      smallContext.drawImage(img, 0, 0, size, size);
      const pixels = smallContext.getImageData(0, 0, size, size).data;
      const colors = new Set<string>();
      for (let index = 0; index < pixels.length; index += 4) {
        colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
      }
      const full = document.createElement('canvas');
      full.width = img.naturalWidth;
      full.height = img.naturalHeight;
      const fullContext = full.getContext('2d')!;
      fullContext.drawImage(img, 0, 0);
      const [red, green, blue] = Array.from(fullContext.getImageData(2, 2, 1, 1).data);
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        pageWidth: document.documentElement.clientWidth,
        pageHeight: document.documentElement.scrollHeight,
        devicePixelRatio: window.devicePixelRatio,
        distinctColors: colors.size,
        cornerBrightness: Math.round(0.299 * red + 0.587 * green + 0.114 * blue),
      };
    });
    return details;
  }

  // ---- Zen mode --------------------------------------------------------------------------

  /** The Zen bar at the top centre: Back, the step count, Forward, Ranking order, Exit Zen. */
  get zenBar(): Locator {
    return this.page.getByRole('toolbar', {name: 'Zen'});
  }

  /** Every button of the Zen bar, in order. */
  get zenBarButtons(): Locator {
    return this.zenBar.getByRole('button');
  }

  /** The site header (its banner), which Zen hides. */
  get siteHeader(): Locator {
    return this.page.getByRole('banner');
  }

  /** A choice of the open menu that is a radio item, such as a ranking order or a layout. */
  menuItemRadio(name: string): Locator {
    return this.page.getByRole('menuitemradio', {name, exact: true});
  }

  /** A choice of the open menu that is a check box, such as "Hide the queue". */
  menuItemCheckbox(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox', {name, exact: true});
  }

  /** Moves the mouse to a point of the window and leaves it there. */
  async restMouseAt(x: number, y: number) {
    await this.page.mouse.move(x, y);
  }

  zenBarButton(name: 'Back' | 'Forward' | 'Exit Zen'): Locator {
    return this.zenBar.getByRole('button', {name, exact: true});
  }

  /** The Zen bar's step count, such as "7 / 13". */
  get zenStepCount(): Locator {
    return this.zenBar.getByRole('status');
  }

  /** The Zen bar's button that opens the Ranking order menu; its name says the order. */
  get rankingOrderButton(): Locator {
    return this.zenBar.getByRole('button', {name: /^Ranking order: /});
  }

  /** The OpenTierBoy wordmark that Zen shows in place of the editor tools. */
  get zenWordmark(): Locator {
    return this.main.getByRole('img', {name: 'OpenTierBoy'});
  }

  /** In Zen with In order or Shuffle: the item up next, the one item of the Unranked tray to drag. */
  get upNextItem(): Locator {
    return this.unranked.getByRole('button');
  }

  /** In Zen with In order or Shuffle: the queue after the item up next ("Queue" or "Queue (hidden)"). */
  queue(name: 'Queue' | 'Queue (hidden)' = 'Queue'): Locator {
    return this.unranked.getByRole('list', {name, exact: true});
  }

  /** The items in the queue, in order, each named after its item. */
  get queueItems(): Locator {
    return this.queue().getByRole('listitem');
  }

  /**
   * Turns Zen on with the Zen toggle in the title row, or off with the Zen bar's "Exit Zen"
   * (the toggle hides in Zen, with the other tools).
   */
  async setZenMode(on: boolean) {
    if (on) {
      await this.zenModeToggle.click();
      await expect(this.zenBar).toBeVisible();
    } else {
      await this.zenBarButton('Exit Zen').click();
      await expect(this.zenBar).toHaveCount(0);
      await expect(this.zenModeToggle).toHaveAttribute('aria-pressed', 'false');
    }
  }

  /**
   * The parts of the list that the Zen bar's box overlaps: the title ("title"), the rows and the
   * Unranked tray (by their heading) and the items (by their label). Empty when the bar covers
   * nothing of the list.
   */
  async listPartsUnderZenBar(): Promise<string[]> {
    const bar = await this.zenBar.boundingBox();
    if (!bar) throw new Error('The Zen bar is not on the page');
    const title = (await this.title.count()) > 0 ? this.title : this.titleInput;
    const parts: {name: string; locator: Locator}[] = [{name: 'title', locator: title}];
    for (const row of await this.tiers.all()) {
      parts.push({name: `row ${await row.getByRole('heading', {level: 2}).innerText()}`, locator: row});
    }
    for (const item of await this.allItems.all()) {
      parts.push({name: `item ${await item.getAttribute('aria-label')}`, locator: item});
    }
    const covered: string[] = [];
    for (const {name, locator} of parts) {
      const box = await locator.boundingBox();
      if (box && boxesOverlap(bar, box)) covered.push(name);
    }
    return covered;
  }

  /** Moves the page clock on by `ms` (`pageClock`), and lets the page handle what those timers started. */
  async letTimePass(ms: number) {
    await runPageClock(this.page, ms);
  }

  /** Presses a key, such as Tab or Shift+Tab, wherever the focus is. */
  async pressKey(key: string) {
    await this.page.keyboard.press(key);
  }

  /**
   * Presses Escape with the focus on the list. After a menu choice the focus is on the menu's
   * button, whose tooltip would take the first Escape (zen-layouts.spec.ts), so the focus leaves
   * the button first, and the tooltip closes.
   */
  async pressEscapeOnList() {
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(this.page.getByRole('tooltip')).toHaveCount(0);
    await this.page.keyboard.press('Escape');
  }

  /** Steps Back or Forward with the Zen bar, and waits until the address has changed. */
  async stepInZenBar(name: 'Back' | 'Forward') {
    await this.changeAndWaitForLink(() => this.zenBarButton(name).click());
  }

  /** Chooses a ranking order in the Zen bar's menu. It writes no history entry. */
  async chooseRankingOrder(order: 'Pick freely' | 'In order' | 'Shuffle') {
    await this.rankingOrderButton.click();
    await this.page.getByRole('menuitemradio', {name: order, exact: true}).click();
    await expect(this.rankingOrderButton).toHaveAccessibleName(`Ranking order: ${order}`);
  }

  /** Turns "Hide the queue" on or off in the Zen bar's menu. */
  async setHideQueue(on: boolean) {
    await this.rankingOrderButton.click();
    const item = this.page.getByRole('menuitemcheckbox', {name: 'Hide the queue'});
    await expect(item).toHaveAttribute('aria-checked', String(!on));
    await item.click();
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  /** Opens the Zen bar's Ranking order menu, and returns it. */
  async openRankingOrderMenu(): Promise<Locator> {
    await this.rankingOrderButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  // ---- Zen layouts (16:9, 9:16, stream overlay) -----------------------------------------

  /** The Zen bar's button that opens the Layout menu; its name says the layout. */
  get layoutButton(): Locator {
    return this.zenBar.getByRole('button', {name: /^Layout: /});
  }

  /** Opens a list, turns Zen on and chooses a layout in the Zen bar's Layout menu. */
  async gotoInLayout(path: string, state: string | undefined, layout: ZenLayoutName) {
    await this.goto(path, state);
    await this.setZenMode(true);
    if (layout !== 'Editor') await this.chooseLayout(layout);
  }

  /** Opens a page by its address as typed, for example with parameters the app does not read. */
  async gotoAddress(address: string) {
    await this.page.goto(address);
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  /** Chooses a layout in the Zen bar's Layout menu. It writes no history entry. */
  async chooseLayout(name: ZenLayoutName) {
    await this.layoutButton.click();
    await this.page.getByRole('menuitemradio', {name, exact: true}).click();
    await expect(this.layoutButton).toHaveAccessibleName(`Layout: ${name}`);
  }

  /** Opens the Zen bar's Layout menu, and returns it. */
  async openLayoutMenu(): Promise<Locator> {
    await this.layoutButton.click();
    return this.page.getByRole('menu');
  }

  /**
   * Every open menu. An open menu hides the rest of the page from assistive technology, also
   * another open menu, so this counts the hidden ones too.
   */
  get openMenus(): Locator {
    return this.page.getByRole('menu', {includeHidden: true});
  }

  /**
   * Clicks a menu button of the Zen bar while one of its menus is open, as a person can: the
   * open menu hides the bar from assistive technology, but the bar still takes clicks.
   */
  async clickZenBarMenuButtonOverOpenMenu(menu: 'Ranking order' | 'Layout') {
    const bar = this.page.getByRole('toolbar', {name: 'Zen', includeHidden: true});
    await bar.getByRole('button', {name: new RegExp(`^${menu}: `), includeHidden: true}).click();
  }

  /** The name of the item up next (In order or Shuffle). */
  async upNextItemName(): Promise<string> {
    await expect(this.upNextItem).toHaveCount(1);
    return (await this.upNextItem.getAttribute('aria-label')) ?? '';
  }

  /**
   * Drags an item to the end of a tier with the mouse, as a person does: one press on the item,
   * one movement to the row in small steps, one release. Unlike dragItemToTier it never presses
   * twice: a press that starts no drag of the item (the browser's own drag of its image, for
   * example) fails. Returns once the link is in the address bar.
   */
  async dragItemToTierByHand(itemName: string, tierName: string) {
    // A press starts a drag only once the previous drop has landed.
    await this.dropEnded();
    await this.changeAndWaitForLink(async () => {
      const item = this.item(itemName);
      // In a creator layout the rows and the tray scroll on their own, inside a frame that stays
      // still: the row first, then the item.
      await this.tier(tierName).scrollIntoViewIfNeeded();
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const row = await boxOf(this.tier(tierName));
      const mouse = this.page.mouse;
      await mouse.move(from.x, from.y);
      await mouse.down();
      const to = {x: row.x + row.width - 120, y: row.y + row.height / 2};
      await mouse.move(to.x, to.y, {steps: 20});
      // A hand never holds perfectly still: the pointer moves by a pixel and back, as a person's
      // does (still the one press). The drag library checks where the pointer is when it moves,
      // after the rows have made room for the item, so the drop point is read again.
      await this.scrollPositionAfterFrames();
      await mouse.move(to.x + 1, to.y);
      await this.scrollPositionAfterFrames();
      await mouse.move(to.x, to.y);
      const atRow = new RegExp(`^${escapeRegExp(itemName)} moves to tier ${escapeRegExp(tierName)},`);
      await expect(this.dragAnnouncer, 'the press should drag the item to the row').toHaveText(atRow);
      await mouse.up();
      await this.dropEnded();
    });
  }

  /** The items of an open menu, whatever their kind (radio, check box or plain item), in order. */
  menuItems(menu: Locator): Locator {
    return menu.getByRole('menuitemradio').or(menu.getByRole('menuitemcheckbox')).or(menu.getByRole('menuitem'));
  }

  /** The frame of a creator layout: "Frame 16:9" (16:9 and the overlays) or "Frame 9:16". */
  get zenFrame(): Locator {
    return this.page.getByRole('region', {name: /^Frame /});
  }

  /** The size of an element on screen, in CSS pixels, rounded. */
  async sizeOf(locator: Locator): Promise<Size> {
    const box = await locator.boundingBox();
    if (!box) throw new Error('The element is not on screen');
    return {width: Math.round(box.width), height: Math.round(box.height)};
  }

  /**
   * Clicks the frame's top left corner: the green key in the overlay, away from the list's panel.
   * Waits until no tooltip is left: a closing tooltip still takes the next Escape.
   */
  async clickFrameCorner() {
    const frame = await boxOf(this.zenFrame);
    await this.page.mouse.click(frame.x + 10, frame.y + 10);
    await expect(this.page.getByRole('tooltip')).toHaveCount(0);
  }

  /** The colour of the cover behind a creator layout's frame, as a computed CSS colour. */
  async frameCoverColour(): Promise<string> {
    return this.zenFrame.evaluate((frame) => getComputedStyle(frame.parentElement as Element).backgroundColor);
  }

  /**
   * The Unranked tray scrolls (a long list in a creator layout): true when its items, or Up next
   * and the queue, are taller than the box that scrolls them.
   */
  async unrankedItemsScroll(): Promise<boolean> {
    return scrollsInside(this.unranked.getByRole('button').first());
  }

  /** The rows scroll (more rows than a creator layout's frame holds): true when they are taller than their box. */
  async rowsScroll(): Promise<boolean> {
    return scrollsInside(this.tiers.first());
  }

  /**
   * True when the content of a creator layout's frame, or of the cover around it, is taller than
   * its box: then the frame or the cover would scroll. A creator layout keeps both still (owner
   * decision, 2026-11-01).
   */
  async frameOverflows(): Promise<boolean> {
    return this.zenFrame.evaluate((frame) => [frame, frame.parentElement as HTMLElement]
      .some((box) => box.scrollHeight > box.clientHeight + 1 || box.scrollTop > 0));
  }

  /** The name a Compact tile shows under itself, with Show Labels on. */
  itemCaption(name: string): Locator {
    return this.item(name).getByText(name, {exact: true});
  }

  // ---- Tile size (the dense editor) ------------------------------------------------------

  /**
   * Chooses a tile size in the Row options menu. A view setting: it writes no link of its own.
   * Choosing Compact with Show Labels on also turns Show Labels off, which rewrites the link in
   * place; the page is busy until that link is written, so this returns once it has settled.
   */
  async chooseTileSize(name: TileSizeName) {
    await this.openRowOptions();
    await this.rowOption(name).click();
    await expect(this.openMenus).toHaveCount(0);
    await this.settled();
  }

  /** The name tag that a Compact tile shows under itself on hover or keyboard focus. */
  itemNameTag(name: string): Locator {
    return this.item(name).getByRole('tooltip');
  }

  /** Moves the mouse over an item. */
  async hoverItem(name: string) {
    await this.item(name).hover();
  }

  // ---- Notifications ---------------------------------------------------------------------

  /** A toast notification that contains the given text, in Sonner's region "Notifications". */
  toast(text: string | RegExp): Locator {
    return toasts(this.page).filter({hasText: text});
  }

  /** The toast with this title whose text also names `detail`, such as a file name. */
  toastAbout(text: string | RegExp, detail: string): Locator {
    return this.toast(text).filter({hasText: detail});
  }

  async undoFromToast(text: string | RegExp) {
    await this.toast(text).getByRole('button', {name: 'Undo'}).click();
  }

  // ---- History machine (tests/machines/history.ts) -----------------------------------------

  /**
   * Opens a list as a new history entry after a blank page, so no history entry follows it.
   * Opening the address already on screen would replace its entry and keep the entries after it,
   * from an earlier visit; the blank page in between drops them.
   */
  async openAfterBlankPage(path: string, state: string) {
    await this.page.goto('about:blank');
    await this.goto(path, state);
  }

  /** Drags the first item of the Unranked tray to the end of a tier: one change to the list. */
  async rankFirstUnrankedItem(tierName: string) {
    const name = await this.itemsIn(this.unranked).first().getAttribute('aria-label');
    if (!name) throw new Error('The Unranked tray has no item to rank');
    await this.dragItemToTier(name, tierName);
  }

  /**
   * The browser's Back button. Returns once the address of the entry before is in the address bar
   * and the page has settled: Back to another version of the list keeps the page busy until the
   * router shows it (components/NavigationBusy.tsx), Back to another page until it has started.
   */
  async goBack() {
    await this.changeAndWaitForLink(async () => {
      await this.page.goBack();
    });
    await this.settled();
  }

  /**
   * The browser's Forward button. Returns once the page has settled. With an entry after this
   * one, the address is the entry's then (see goBack); with none, the browser stays where it is,
   * and so do the address and the page.
   */
  async goForward() {
    await this.page.goForward();
    await this.settled();
  }

  /**
   * Back with the browser while the page may be busy on purpose, for example right after a change
   * or while files wait: it returns once Back has been sent, without waiting for anything.
   */
  async goBackNow() {
    await this.page.goBack();
  }

  /**
   * Chooses a label position in Row options with the keyboard: the menu opens, the focus moves to
   * the choice, and Enter chooses it. The menu is taller than half of a 720 px window, and Radix
   * locks the page's scroll while it is open, so with the button in the middle of the window
   * its lower choices can sit below the window, out of reach of the mouse.
   */
  async chooseLabelPositionWithKeyboard(position: LabelPosition) {
    await this.chooseRowOptionWithKeyboard(this.page.getByRole('menuitemradio', {name: position, exact: true}));
  }

  /** Shows or hides item labels in Row options with the keyboard (see chooseLabelPositionWithKeyboard). */
  async setItemLabelsVisibleWithKeyboard(visible: boolean) {
    await this.chooseRowOptionWithKeyboard(this.page.getByRole('menuitemradio', {name: visible ? 'Show Labels' : 'Hide Labels'}));
  }

  private async chooseRowOptionWithKeyboard(option: Locator) {
    await this.openRowOptions();
    await this.changeAndWaitForLink(() => this.chooseOpenRowOption(option));
  }

  // ---- Leaving machine (tests/machines/leaving.ts) ------------------------------------------

  /**
   * Moves the first item of the Unranked tray up into the last row with the keyboard: one change
   * to the list. Returns once the drop is announced, the focus is back and the address has
   * changed, also while the page is busy on purpose (the trip home waits).
   */
  async moveFirstUnrankedItemUpWithKeyboard() {
    const name = await this.itemsIn(this.unranked).first().getAttribute('aria-label');
    if (!name) throw new Error('The Unranked tray has no item to move');
    await this.changeAndWaitForLink(() => this.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false}));
  }

  // ---- Tips machines (tests/machines/tips.ts, tests/machines/tips-shared-list.ts) ----------

  /** Drags the first item of Unranked to the end of a row. Returns once the link is written. */
  async dragFirstUnrankedItemToTier(tierName: string) {
    // Item tiles only: the first-drag tip puts its "Hide tips" and "Close tip" buttons in the tray.
    // Right after a page load, the tiles take a drag only once the page is ready, so this waits.
    let name: string | null = null;
    await expect.poll(async () => {
      [name = null] = await this.itemsIn(this.unranked).evaluateAll((items) => items
        .filter((item) => item.getAttribute('aria-roledescription') === 'draggable')
        .map((item) => item.getAttribute('aria-label')));
      return name;
    }, {message: 'Unranked should hold an item that takes a drag'}).not.toBeNull();
    await this.dragItemToTier(name!, tierName);
  }

  /** Uploads pictures from the device, and returns once the link holds them. */
  async addItemsFromDeviceAndWaitForLink(files: DeviceFiles) {
    await this.changeAndWaitForLink(() => this.addItemsFromDevice(files));
  }

  // ---- Link images machine (tests/machines/link-images.ts) ----------------------------------

  /**
   * Opens a list as a new browser would: this site's local storage (the always-allowed image
   * sites among it) is cleared on a blank page first. Context-wide init scripts run again.
   */
  async openAsNewBrowser(path: string, state: string) {
    await this.page.goto('about:blank');
    await this.page.context().setStorageState({cookies: [], origins: []});
    await this.goto(path, state);
  }

  /** Adds an image with "From a link", and returns once the link holds it. */
  async addItemFromLinkAndWaitForLink(address: string, name: string) {
    await this.changeAndWaitForLink(() => this.addItemFromLink(address, name));
  }

  /**
   * Reloads the page while an image site holds its answers (ImageSite.hold). Returns once the
   * editor shows the list and the page has settled or waits for the site, which keeps it busy.
   */
  async reloadWhileImageSiteHeld(site: HeldImageSite) {
    // Firefox fires the load event only once every picture on screen has loaded, and the site
    // holds the picture: the reload waits for the new page to start, not for its load event.
    await this.page.reload({waitUntil: 'commit'});
    await this.untilSettledOrWaitingFor(site);
  }

  /** Opens a tier list while an image site holds its answers (see reloadWhileImageSiteHeld). */
  async gotoWhileImageSiteHeld(path: string, state: string, site: HeldImageSite) {
    await this.page.goto(`${path}?state=${state}`, {waitUntil: 'commit'});
    await this.untilSettledOrWaitingFor(site);
  }

  private async untilSettledOrWaitingFor(site: HeldImageSite) {
    await expect(this.tiers.first()).toBeVisible();
    await expect.poll(async () => site.isHolding() || (await this.main.getAttribute('aria-busy')) !== 'true', {
      message: 'the page should settle or wait for the image site',
    }).toBe(true);
  }

  // ---- Appearance machine (tests/machines/appearance.ts) ---------------------------------------

  /** The picture of an item's tile: 80 px wide with Comfortable tiles, 48 px with Compact. */
  itemPicture(name: string): Locator {
    return this.item(name).getByRole('img');
  }

  /**
   * Chooses a tile size in Row options with the keyboard (see chooseLabelPositionWithKeyboard:
   * Tile Size is the menu's last group). Choosing Compact with Show Labels on also turns Show
   * Labels off, which rewrites the link in place: the page is busy until that link is written,
   * so this returns once it has settled.
   */
  async chooseTileSizeWithKeyboard(name: TileSizeName) {
    await this.openRowOptions();
    await this.chooseOpenRowOption(this.rowOption(name));
    await this.settled();
  }

  /** Chooses an option of the open Row options menu with the keyboard, and waits until the menu closes. */
  private async chooseOpenRowOption(option: Locator) {
    await option.focus();
    await expect(option).toBeFocused();
    await this.page.keyboard.press('Enter');
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  // ---- Share panel machine (tests/machines/share-panel.ts) ----------------------------------

  /** The Image tab's line before the first capture. */
  get captureHint(): Locator {
    return this.sharePanel.getByText('Capture an image to get started.');
  }

  /** Freeze Frame's Download button, shown after Capture Preview. */
  get downloadButton(): Locator {
    return this.sharePanel.getByRole('button', {name: 'Download', exact: true});
  }

  /** Writes an empty text to the clipboard (see readCopiedText), so a run starts with nothing copied. */
  async emptyClipboard() {
    await this.page.evaluate(() => navigator.clipboard.writeText(''));
  }

  /** Closes the open share panel with the Share button. */
  async closeSharePanelWithShareButton() {
    await this.shareButton.click();
    await expect(this.sharePanel).toBeHidden();
  }

  /** Closes the open share panel with a click on the Unranked tray's heading, outside the panel. */
  async clickOutsideSharePanel() {
    await this.unranked.getByRole('heading', {level: 2}).click();
    await expect(this.sharePanel).toBeHidden();
  }

  /** Chooses a tab of the open share panel. */
  async chooseShareTab(name: 'URL' | 'Image') {
    await this.shareTab(name).click();
    await expect(this.shareTab(name)).toHaveAttribute('aria-selected', 'true');
  }

  /** Clicks Copy Markdown in the open share panel, and checks that this click showed the toast "Markdown copied to clipboard". */
  async copyMarkdownInOpenPanel() {
    await this.expectOnlyNewToast(() => this.copyMarkdownButton.click(), 'Markdown copied to clipboard');
  }

  /**
   * Clicks Capture Preview in the open Image tab, and waits until the capture has ended: the
   * button reads "Capture Preview" again (it reads "Capturing..." meanwhile), with the picture,
   * and this capture showed the toast "Image captured successfully" and no error toast.
   */
  async captureInOpenPanel() {
    await this.captureAndExpectSuccess();
    await this.settled();
    await expect(this.sharePanel.getByRole('button', {name: 'Capture Preview'})).toBeEnabled();
    await expect(this.capturedImage).toBeVisible();
  }

  // ---- Keyboard drag machine (tests/machines/keyboard-drag.ts) --------------------------------

  /**
   * Focuses an item, as a keyboard user who tabbed to it, once it takes a drag: right after a page
   * load a tile takes a drag only when the page is ready (its role description "draggable").
   */
  async focusItemReadyToDrag(name: string) {
    const item = this.item(name);
    await expect(item).toHaveAttribute('aria-roledescription', 'draggable');
    await item.focus();
    await expect(item).toBeFocused();
  }

  // ---- Snapshot files machine (tests/machines/snapshot-files.ts) ----------------------------

  /**
   * Holds the server's answers to navigations to /rank pages (the request a router.push to an
   * editor address of another page makes; prefetches pass), as on a very slow connection, until
   * `release`. `isHolding` turns true once a navigation is held. A change to the list makes no
   * request: the editor writes the address itself.
   */
  async holdRankPages(): Promise<HeldRankPages> {
    let open!: () => void;
    const released = new Promise<void>((resolve) => {
      open = resolve;
    });
    let holding = false;
    const handled: Promise<void>[] = [];
    const hold = async (route: Route) => {
      const request = route.request();
      const headers = request.headers();
      const navigation = headers['rsc'] === '1' && !headers['next-router-prefetch'] && !headers['next-router-segment-prefetch']
        && new URL(request.url()).pathname.startsWith('/rank');
      if (!navigation) return route.fallback();
      holding = true;
      await released;
      // The page may have dropped the request meanwhile (the visitor left): nothing to answer then.
      await route.fallback().catch(() => undefined);
    };
    const handler = (route: Route) => {
      const done = hold(route);
      handled.push(done);
      return done;
    };
    await this.page.route('**/*', handler);
    return {
      isHolding: () => holding,
      release: async () => {
        open();
        await Promise.all(handled);
        await this.page.unroute('**/*', handler);
      },
    };
  }

  /** Waits until the dialog "Open the list in this file?" has closed or says "Opening the list…". */
  private async untilOpenListDialogClosesOrOpens() {
    await expect(this.openListDialog.filter({hasNotText: 'Opening the list…'}), 'the dialog should close or say "Opening the list…"')
      .toHaveCount(0);
  }

  /**
   * Chooses Cancel in "Open the list in this file?" with the keyboard (Playwright does not click
   * a button that says aria-disabled, as Cancel does while the list opens; a person still can).
   * Returns once the dialog closed, or once it says "Opening the list…".
   */
  async chooseCancelInOpenListDialog() {
    const cancel = this.openListDialog.getByRole('button', {name: 'Cancel'});
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await this.page.keyboard.press('Enter');
    await this.untilOpenListDialogClosesOrOpens();
  }

  /** Presses Escape in "Open the list in this file?". Returns once it closed, or once it says "Opening the list…". */
  async pressEscapeInOpenListDialog() {
    await this.page.keyboard.press('Escape');
    await this.untilOpenListDialogClosesOrOpens();
  }

  /**
   * Clicks Open list with the server's answers held (holdRankPages), for a list file of another
   * template path: the list opens on another page. Returns the hold once the navigation is held
   * and the dialog says "Opening the list…", or null once the dialog closed (the list opened
   * without a request).
   */
  async clickOpenListWithServerHeld(): Promise<HeldRankPages | null> {
    const hold = await this.holdRankPages();
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect.poll(async () => hold.isHolding() || !(await this.openListDialog.isVisible()), {
      message: 'the navigation should reach the server, or the dialog close',
    }).toBe(true);
    if (hold.isHolding()) {
      await expect(this.openListDialog).toContainText('Opening the list…');
      return hold;
    }
    await hold.release();
    return null;
  }

  /** Lets the server answer the held navigation of an opening list, and waits until the list is in the address. */
  async answerHeldRankPage(hold: HeldRankPages) {
    const before = this.page.url();
    await hold.release();
    await expect(this.openListDialog).toBeHidden();
    await expect(this.page, 'the list of the file should open').not.toHaveURL(before);
  }

  /**
   * Returns once the address changed (a picture was added) or a dialog shows, where a paste or a
   * drop changes nothing.
   */
  private async untilAddressChangesOrDialogShows(before: string) {
    await expect.poll(async () => this.page.url() !== before || await this.openListDialog.isVisible(), {
      message: 'the link should change, unless a dialog shows',
    }).toBe(true);
  }

  /**
   * Pastes a file where the focus is, as Ctrl+V does: into the editor, or into the dialog when one
   * shows. Returns once the link changed, or at once while a dialog shows. Firefox drops the files
   * of a scripted paste (SCRIPTED_PASTE_SKIP).
   */
  async pasteFileWhereFocused(file: {name: string; mimeType: string; buffer: Buffer}) {
    const before = this.page.url();
    await this.page.evaluate(({name, mimeType, base64}) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
    await this.untilAddressChangesOrDialogShows(before);
  }

  /**
   * Drops a file where the pointer is: on the editor's first row, or on the dialog when one shows
   * (it covers the page). Returns once the link changed, or at once while a dialog shows.
   */
  async dropFileWherePointed(file: {name: string; mimeType: string; buffer: Buffer}) {
    const before = this.page.url();
    // The dialog shows once a dropped list file has been read, which keeps the page busy, and it
    // stays until the visitor answers it: once it shows or the page has settled, one look tells.
    await expect.poll(async () => await this.openListDialog.isVisible() || await this.startedAndIdle(), {
      message: 'the dialog should show, or the page settle',
    }).toBe(true);
    if (await this.openListDialog.isVisible()) await this.dropFile(file, {onto: this.openListDialog});
    else await this.dropFile(file);
    await this.untilAddressChangesOrDialogShows(before);
  }

  /** Chooses a picture with "Open a Freeze Frame…" and returns once the link holds it. */
  async openFileAndWaitForLink(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.changeAndWaitForLink(() => this.openFile(file));
  }

  /**
   * Pastes groups of pictures at once while the device image store is held (holdDeviceStore), so
   * the first picture is still being stored and the others wait their turn, then leaves for the
   * landing page. The store is let go once the landing page shows.
   */
  async leaveWhilePastesWait(groups: {name: string; mimeType: string; buffer: Buffer}[][]) {
    const hold = await this.holdDeviceStore();
    try {
      await this.pasteImagesAtOnce(groups);
      await this.leaveForHome();
    } finally {
      await hold.release();
    }
  }

  /**
   * Holds the device image store until `release`, as a slow disk would: a transaction of the
   * test on its IndexedDB database stays open, so the editor's own transactions wait behind it.
   * Call it once the editor has started (it opens the store as it starts).
   */
  async holdDeviceStore(): Promise<{release: () => Promise<void>}> {
    await this.page.evaluate(() => new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line no-restricted-globals -- a test holds the store, as a slow disk would
      const opening = indexedDB.open('opentierboy-device-images');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
        const store = transaction.objectStore(db.objectStoreNames[0]);
        const held = window as unknown as {deviceStoreHeld: boolean};
        held.deviceStoreHeld = true;
        // A transaction ends once it has no request left: ask again until the test lets go.
        const ask = () => {
          if (held.deviceStoreHeld) store.get('held by the test').onsuccess = ask;
        };
        transaction.oncomplete = () => db.close();
        ask();
        resolve();
      };
    }));
    return {
      release: async () => {
        await this.page.evaluate(() => {
          (window as unknown as {deviceStoreHeld: boolean}).deviceStoreHeld = false;
        }).catch(() => undefined);
      },
    };
  }

  /**
   * Rests the pointer on a message (a toast) once it shows, and waits until the toasts have
   * expanded under it: Sonner holds every toast's 4 s timer while they are expanded, so the
   * message stays until the pointer moves. A paste or a drop that a test sends leaves the pointer
   * where it is. Not over a dialog: the dialog makes the page ignore the pointer.
   */
  async restOnMessage(message: Locator) {
    await expect(message).toBeVisible();
    await message.hover();
    await expect(message).toHaveAttribute('data-expanded', 'true');
  }

  // ---- Shared link machine (tests/machines/shared-link.ts) ----------------------------------

  /**
   * The names of a row's items, in order: their accessible names, so a label tile counts by its
   * label without the site name it also shows.
   */
  async itemNamesIn(tierName: string): Promise<string[]> {
    return this.itemsIn(tierName).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''));
  }

  /**
   * Scrolls an item into view and tells whether its tile shows the loaded placeholder image (an
   * unknown item, or a device image this browser does not have). Use it with expect.poll().
   */
  async itemShowsPlaceholder(name: string): Promise<boolean> {
    const image = this.itemImage(name);
    if ((await image.count()) === 0) return false;
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => (
      img.complete && img.naturalWidth > 0 && decodeURIComponent(img.currentSrc).includes('/placeholder-image.png')
    ));
  }

  /**
   * Drags an item to the end of a row once its tile takes a drag (right after a page load the
   * tiles take one only once the page has started). Returns once the link is written.
   */
  async dragItemToTierWhenReady(itemName: string, tierName: string) {
    await expect(this.item(itemName), `${itemName} should take a drag`).toHaveAttribute('aria-roledescription', 'draggable');
    await this.dragItemToTier(itemName, tierName);
  }

  // ---- Mouse drag machine (tests/machines/mouse-drag.ts) ----------------------------------

  /**
   * Drags an item with the mouse onto the free space at the end of a row, as dragItemToTier does,
   * and returns once the drop is announced and has settled. It does not wait for a new link: on
   * the free space of its own row the item stays where it is, and the link stays as it was.
   */
  async dragItemToFreeSpaceOf(itemName: string, tierName: string) {
    await this.dragWithMouse(this.item(itemName), this.tier(tierName), (box) => ({
      x: box.x + box.width - 120,
      y: box.y + box.height / 2,
    }));
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  /**
   * Drags an item with the mouse onto the left or right half of another item, as dragItemNextTo
   * does, and returns once the drop is announced and has settled, without waiting for a new link:
   * an item already on that side stays where it is.
   */
  async dragItemBeside(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dragWithMouse(this.item(itemName), this.item(targetItemName), (box) => ({
      x: box.x + box.width * (side === 'before' ? 0.25 : 0.75),
      y: box.y + box.height / 2,
    }), {followTarget: true});
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  /** The site footer under the editor: nothing in it takes a drop. */
  get siteFooter(): Locator {
    return this.page.getByRole('contentinfo');
  }

  /**
   * Drags an item with the mouse out of the rows, over the site footer, and releases it there.
   * The drag ends without a drop. Returns once the cancel is announced and the item is back.
   */
  async dragItemOutOfTheRows(itemName: string) {
    await this.dragWithMouse(this.item(itemName), this.siteFooter, centerOfBox);
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Move cancelled\\. ${escapeRegExp(itemName)} is back in `));
  }

  // ---- Device images machine (tests/machines/device-images.ts) ------------------------------

  /** The toast "Items Added" with its Undo, which every way of adding items shows. */
  get itemsAddedToast(): Locator {
    return this.toast('Items Added');
  }

  /**
   * Uploads pictures from the device, and returns once the link holds them, with the pointer
   * resting on the toast "Items Added": the toast waits while the pointer is on it, so it stays
   * until the next action, however long the checks take.
   */
  async addItemsFromDeviceAndHoldToast(files: DeviceFiles) {
    await this.changeAndWaitForLink(() => this.addItemsFromDevice(files));
    await this.itemsAddedToast.hover();
  }

  /** Chooses Undo in the toast "Items Added", and returns once the link changed and the toast closed. */
  async undoAddedItems() {
    await this.changeAndWaitForLink(() => this.itemsAddedToast.getByRole('button', {name: 'Undo'}).click());
    await expect(this.itemsAddedToast).toHaveCount(0);
  }

  /** Lets the toast "Items Added" close by itself (after 4 s, on the page clock: `pageClock`). */
  async waitOutItemsAddedToast() {
    await letToastTimeOut(this.page, this.itemsAddedToast);
  }

  /** Closes this page's browser context, as closing a browser window does. */
  async closeBrowser() {
    await this.page.context().close();
  }

  // ---- Freeze Frame load machine (tests/machines/freeze-frame-load.ts) ----------------------

  /** Closes the open share panel with Escape, pressed with the focus on the list, and waits until it is hidden. */
  async closeSharePanelWithEscape() {
    await this.pressEscapeOnList();
    await expect(this.sharePanel).toBeHidden();
  }

  /** Chooses a file with "Open a Freeze Frame…", and returns once the dialog "Open the list in this file?" shows. */
  async openFileAndWaitForDialog(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.openFile(file);
    await expect(this.openListDialog).toBeVisible();
  }
  // ---- Remove and undo machine (tests/machines/remove-and-undo.ts) ----------------------------

  /** The dialog "Are you sure?" that Remove All opens. */
  get removeAllDialog(): Locator {
    return this.page.getByRole('alertdialog', {name: 'Are you sure?'});
  }

  /** The button Undo in the toast `title`. */
  undoButtonIn(title: string | RegExp): Locator {
    return this.toast(title).getByRole('button', {name: 'Undo'});
  }

  /**
   * Rests the pointer on a toast with an Undo. Sonner, the toast library, pauses the toasts' 4 s
   * timers while the pointer is over them, as when a person reads one, so the toast stays while
   * the test goes on with Back, Forward and Undo, which do not move the pointer. Call it right
   * after the action that shows the toast.
   */
  async restOnToast(title: string | RegExp) {
    await expect(this.undoButtonIn(title)).toBeVisible();
    await this.restOnMessage(this.toast(title));
  }

  /** Deletes an item with its right-click menu, waits for the new link, and rests on the toast "Item deleted". */
  async deleteItemAndRestOnToast(itemName: string) {
    await this.deleteItem(itemName);
    await this.restOnToast('Item deleted');
  }

  /** Chooses Reset in the Add images menu, waits for the new link, and rests on the toast "Items Reset". */
  async resetRankingsAndRestOnToast() {
    await this.resetRankings();
    await this.restOnToast('Items Reset');
  }

  /** Chooses Remove All in the Add images menu, and waits for its dialog. */
  async openRemoveAll() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
    await expect(this.removeAllDialog).toBeVisible();
  }

  /** Confirms the open Remove All dialog, waits for the new link, and rests on the toast "All Items Deleted". */
  async confirmRemoveAllAndRestOnToast() {
    await this.changeAndWaitForLink(() => this.removeAllDialog.getByRole('button', {name: 'Remove All Items'}).click());
    await expect(this.removeAllDialog).toBeHidden();
    await this.restOnToast('All Items Deleted');
  }

  /** Cancels the open Remove All dialog. */
  async cancelRemoveAll() {
    await this.removeAllDialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(this.removeAllDialog).toBeHidden();
  }

  /**
   * Clicks Undo in the toast `title`, and waits until the toast has closed. With `changesList`,
   * also waits for the new link, so a Back after it starts from the new history entry. The Undo
   * of "Item deleted" also shows the toast "Item restored", whether or not the list changed.
   */
  async undoInToast(title: string, {changesList}: {changesList: boolean}) {
    const before = this.page.url();
    await this.undoButtonIn(title).click();
    await expect(this.toast(title)).toHaveCount(0);
    if (title === 'Item deleted') await expect(this.toast('Item restored')).toBeVisible();
    if (changesList) await expect(this.page, 'Undo should write a new link').not.toHaveURL(before);
  }

  /** Lets the toast `title` close by itself (after 4 s, on the page clock: `pageClock`). */
  async waitOutToast(title: string) {
    await letToastTimeOut(this.page, this.toast(title));
  }

  // ---- Add from template machine (tests/machines/add-from-template.ts) ----------------------

  /** A page of the open template picker, by the heading of its options: "Packages" or a package's name. */
  templatePickerPage(name: string): Locator {
    return this.templatePicker.getByRole('group', {name, exact: true});
  }

  /** A button in the template picker's top bar: Back, or a page of the breadcrumb such as "Packages". */
  templatePickerButton(name: string): Locator {
    return this.templatePicker.getByRole('button', {name, exact: true});
  }

  /** Opens the template picker with the empty list's Template, and waits for its search box. */
  async openTemplatePickerFromDropArea() {
    await this.emptyListAction('Template').click();
    await expect(this.templatePicker.getByRole('combobox')).toBeVisible();
  }

  /** Opens a package's page in the template picker, from Packages, and waits until it lists the package's sets. */
  async openTemplatePackage(name: string) {
    await this.templatePicker.getByRole('option', {name, exact: true}).click();
    await expect(this.templatePickerPage(name)).toBeVisible();
  }

  /** Presses Escape. With the template picker open, waits until it closes. */
  async pressEscapeForTemplatePicker() {
    await this.page.keyboard.press('Escape');
    await expect(this.templatePicker).toBeHidden();
  }

  /**
   * Chooses a set on the open package page of the template picker, such as 'Tank', and waits for
   * the picker to close and the toast "Items Added" or "No New Items" to show. Then it rests the pointer on the
   * toast: Sonner keeps a toast while the pointer is on it, so the toast waits for Undo however
   * slow the next steps are.
   */
  async chooseTemplateSetAndHoldToast(setTitle: string) {
    await this.templatePicker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
    await expect(this.templatePicker).toBeHidden();
    const toast = this.toast('Items Added').or(this.toast('No New Items'));
    await expect(toast).toBeVisible();
    await toast.hover();
  }

  /** Clicks Undo in the toast "Items Added" of a template add, and waits until the toast is gone (the link may stay). */
  async undoTemplateAdd() {
    await this.undoFromToast('Items Added');
    await expect(this.toast('Items Added')).toHaveCount(0);
  }

  /** Lets the toast of a template add end by itself (after 4 s, on the page clock: `pageClock`). */
  async waitOutTemplateAddToast() {
    await letToastTimeOut(this.page, this.toast('Items Added').or(this.toast('No New Items')));
  }
}

/** The server's answers to navigations to /rank pages, held by TierListPage.holdRankPages. */
export interface HeldRankPages {
  /** True once a navigation is held. */
  readonly isHolding: () => boolean;
  /** Lets the server answer every held navigation, and stops holding. */
  readonly release: () => Promise<void>;
}

type Box = {x: number; y: number; width: number; height: number};

/**
 * Every toast on the page. Sonner puts them in a list in a region named "Notifications" with
 * its keyboard shortcut ("Notifications alt+T"). The region says aria-live, so an open dialog
 * does not hide it.
 */
export function toasts(page: Page): Locator {
  return page.getByRole('region', {name: /^Notifications\b/}).getByRole('listitem');
}

/**
 * How many times dragWithMouse moves the pointer to its drop point before it gives up. Each try
 * waits five frames, so 100 tries let the page auto-scroll for about 500 frames.
 */
const DROP_POINT_TRIES = 100;

/**
 * True when the nearest box around an element that scrolls (overflow auto or scroll) has more
 * content than room. False when no box around it scrolls.
 */
async function scrollsInside(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    let box: HTMLElement | null = element.parentElement;
    while (box && box !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(box).overflowY)) return box.scrollHeight > box.clientHeight + 1;
      box = box.parentElement;
    }
    return false;
  });
}

/** True when two boxes share some area (boxes that only touch at an edge do not). */
function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
type Point = {x: number; y: number};

/**
 * Runs in the browser: loads an image and counts its different colours (5 bits per channel).
 * With `column` (a box in CSS pixels), it slides a box of that size down that column of the
 * image (scaled by the device pixel ratio) and returns the highest count.
 */
/** Width of the list card that Freeze Frame draws, in CSS pixels (lib/listCard/model.ts). */
const CARD_WIDTH = 1200;

async function countColors({src, column, cardWidth}: {src: string; column?: Box; cardWidth?: number}): Promise<number> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const count = (x: number, y: number, width: number, height: number) => {
    const pixels = context.getImageData(x, y, width, height).data;
    const colors = new Set<number>();
    for (let index = 0; index < pixels.length; index += 4) {
      colors.add(((pixels[index] >> 3) << 10) | ((pixels[index + 1] >> 3) << 5) | (pixels[index + 2] >> 3));
    }
    return colors.size;
  };
  if (!column) return count(0, 0, canvas.width, canvas.height);
  const scale = cardWidth ? image.naturalWidth / cardWidth : window.devicePixelRatio;
  const x = Math.round(column.x * scale);
  const width = Math.max(1, Math.round(column.width * scale));
  const height = Math.max(1, Math.round(column.height * scale));
  const step = Math.max(1, Math.round(height / 8));
  let best = 0;
  for (let y = 0; y + height <= canvas.height; y += step) {
    best = Math.max(best, count(x, y, width, height));
  }
  return best;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element is not visible: ${locator}`);
  return box;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function centerOfBox(box: Box): Point {
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function centerOf(locator: Locator): Promise<Point> {
  return centerOfBox(await boxOf(locator));
}


// ---- Model helpers: editor rows, Zen steps, leaving, label writes, "From a link" ------------
// Plain functions over TierListPage, for the models in tests/models/editor-rows.ts,
// zen-steps.ts, leaving-writes.ts, label-writes.ts and link-dialog.ts.

/** Removes the top row with Row options › Remove a row, and returns once its link is written. */
export async function removeFirstTierRow(tierList: TierListPage) {
  const before = tierList.page.url();
  const rows = await tierList.openRemoveRowMenu();
  await rows.first().click();
  await expect(tierList.page, 'the shareable link should update').not.toHaveURL(before);
}

/**
 * Chooses a row count in Row options, and returns once the page has settled. The count the list
 * has already changes nothing when the rows are the template's, so this waits for no new link.
 */
export async function chooseRowCountAndSettle(tierList: TierListPage, count: RowCount) {
  await tierList.openRowOptions();
  await tierList.rowOption(`${count} Rows`).click();
  await expect(tierList.openMenus).toHaveCount(0);
  await tierList.settled();
}


/**
 * Clicks the logo link to Home while the trip home may wait for a held server answer
 * (holdTripHome). Returns once the click is made, without waiting for Home.
 */
export async function clickHomeNow(tierList: TierListPage) {
  await tierList.homeLink.click();
}

/**
 * Drops an image address on the first row, as a link dragged from another page, while the page
 * may be busy on purpose (dropText waits until it is not). Returns once the drop is sent: the
 * page takes it in the drop event. A drop is neither a click nor a key.
 */
export async function dropImageAddressNow(tierList: TierListPage, address: string) {
  const transfer = await tierList.page.evaluateHandle((uri) => {
    const data = new DataTransfer();
    data.setData('text/uri-list', uri);
    data.setData('text/plain', uri);
    return data;
  }, address);
  const row = tierList.tiers.first();
  await row.dispatchEvent('dragenter', {dataTransfer: transfer});
  await row.dispatchEvent('dragover', {dataTransfer: transfer});
  await row.dispatchEvent('drop', {dataTransfer: transfer});
}

/** The "Image address" field of the open "From a link" dialog. */
export function linkDialogAddressField(tierList: TierListPage): Locator {
  return tierList.linkImageDialog.getByLabel('Image address');
}

/** The dialog's one button: "Add Item", "Checking the image…" or "Add Anyway". */
export function linkDialogButton(tierList: TierListPage): Locator {
  return tierList.linkImageDialog.getByRole('button', {name: /^(Add Item|Add Anyway|Checking the image…)$/});
}

// ---- Model campaigns: Zen ranking order (tests/machines/zen-order.ts) ----------------------

/**
 * Presses "Hide the queue" in the Zen bar's Ranking order menu while it is unavailable (Pick
 * freely). Checks that the box says so and holds `checked`, that the press changes nothing and
 * leaves the menu open, then closes the menu with Escape, which the menu takes: Zen stays on.
 */
export async function pressUnavailableHideQueue(tierList: TierListPage, checked: boolean) {
  const menu = await tierList.openRankingOrderMenu();
  const box = tierList.menuItemCheckbox('Hide the queue');
  await expect(box).toHaveAttribute('aria-disabled', 'true');
  await expect(box).toHaveAttribute('aria-checked', String(checked));
  // A person can still click it; Playwright waits for an enabled element unless forced. Forced, it
  // skips its other checks too, so the test waits until the menu has placed the box on screen.
  await expect(box).toBeInViewport();
  await box.click({force: true});
  await expect(menu).toBeVisible();
  await expect(box).toHaveAttribute('aria-checked', String(checked));
  await tierList.closeMenus();
}

// ---- Model campaigns: toasts while page time stands still (`pageTime: 'paused'`) ------------

/**
 * Waits until a toast that a click closed has left the page. Sonner keeps a closed toast for its
 * exit (TOAST_UNMOUNT_MS, `data-removed="true"`) on a timer, so while page time stands still
 * (pausePageTime) the page clock runs that long. The pointer is still on the toasts then, which
 * holds the timers of the toasts that stay (letToastTimeOut checks them later to the ms).
 */
export async function letClosedToastLeave(page: Page, toast: Locator) {
  if (pageTimePaused(page)) {
    await expect(toast).toHaveAttribute('data-removed', 'true');
    await runPageClock(page, TOAST_UNMOUNT_MS);
  }
  await expect(toast).toHaveCount(0);
}

/** Chooses Undo in the toast "Items Added", and returns once the link changed and the toast left (letClosedToastLeave). */
export async function undoAddedItemsAndLetToastLeave(tierList: TierListPage) {
  const before = tierList.page.url();
  await tierList.itemsAddedToast.getByRole('button', {name: 'Undo'}).click();
  await expect(tierList.page, 'Undo should write a new link').not.toHaveURL(before);
  await letClosedToastLeave(tierList.page, tierList.itemsAddedToast);
}

/** Clicks Undo in the toast "Items Added" of a template add, and returns once the toast left (the link may stay). */
export async function undoTemplateAddAndLetToastLeave(tierList: TierListPage) {
  await tierList.undoButtonIn('Items Added').click();
  await letClosedToastLeave(tierList.page, tierList.toast('Items Added'));
}

/**
 * Clicks Undo in the toast `title`, as TierListPage.undoInToast does, and returns once the toast
 * left (letClosedToastLeave). The Undo of "Item deleted" also shows the toast "Item restored".
 */
export async function undoInToastAndLetItLeave(tierList: TierListPage, title: string, {changesList}: {changesList: boolean}) {
  const before = tierList.page.url();
  await tierList.undoButtonIn(title).click();
  if (title === 'Item deleted') await expect(tierList.toast('Item restored')).toBeVisible();
  if (changesList) await expect(tierList.page, 'Undo should write a new link').not.toHaveURL(before);
  await letClosedToastLeave(tierList.page, tierList.toast(title));
}

// ---- Model campaigns: snapshot files (tests/machines/snapshot-files.ts) ---------------------

/** The toasts on screen other than "Items Added", which each picture that is added shows: the messages. */
export function messageToasts(page: Page): Locator {
  return toasts(page).filter({hasNotText: 'Items Added'});
}
