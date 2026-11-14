import {expect, type Locator, type Page, type Route} from '@playwright/test';
import {expectSettled} from '../support/settled';
import {escapeRegExp} from '../support/regexp';
import {runPageClock} from '../support/page-clock';
import {boxOf, centerOf, centerOfBox, changeAndWaitForLink, clamp, rowPhrase, scrollPosition, scrollPositionAfterFrames, startedAndIdle, type Box, type Point} from './helpers';
import {toasts} from './toasts';
import {Rows} from './rows';
import {EditorItems} from './editor-items';
import {SharePanel} from './share-panel';
import {SnapshotFiles} from './snapshot-files';
import {LinkImages} from './link-images';
import {DeviceImages} from './device-images';
import {Zen} from './zen';

/** A box on screen, in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

/**
 * The buttons in a row that are not items: the grip ("Move row S", "Move Row 4"), the stack ("Move
 * the 3 items of row S"; an empty row has none), the tray's "Add images to" tile and the
 * Template, Upload and Link buttons of an empty list's drop area.
 */
const NOT_AN_ITEM = /^(?!Move (?:row |Row \d+$|Tier\b|the \d+ items? of )|Add images\b|(?:Template|Upload|Link)$)/;

/**
 * Firefox ignores the `clipboardData` that a script puts in a paste event (it makes an empty
 * one), so a test cannot paste files there. Paste tests skip Firefox with this reason.
 */
export const SCRIPTED_PASTE_SKIP = 'Firefox drops the files of a paste event made by a test (ClipboardEvent clipboardData).';
/** WebKit refuses page.goto() of a blob: URL in a new tab, which openImageInNewTab needs. */
export const BLOB_TAB_SKIP = 'WebKit does not let a test open a blob: URL in a new tab.';

/** A request the page sent, as recordRequests() keeps it. */
export interface SentRequest {
  method: string;
  url: string;
  body: Buffer;
}

/**
 * Page object for the tier list editor at /rank/...
 *
 * Locators follow https://playwright.dev/docs/locators#quick-guide: they use roles and
 * accessible names, the same handles that a screen-reader user relies on.
 *
 * - A tier row is a `group` named after its label. The unnamed last row is "Unranked", another
 *   row without a label is "Row <n>", its position.
 * - An item is a `button` named after its label (it is the drag handle as well).
 * - Each ranked row has two handles: its grip, a `button` named "Move row <label>" ("Move Row 4"
 *   for a row without a label), which moves the whole row; and its stack, a `button` named "Move
 *   the 3 items of row <label>", which moves only the items. An empty row has no stack.
 */
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
  readonly zenModeToggle: Locator;
  /** Zen (zen.ts). */
  readonly zen: Zen;
  /** The share panel (share-panel.ts). */
  readonly share: SharePanel;
  /** Snapshot files (snapshot-files.ts). */
  readonly files: SnapshotFiles;
  /** Adding, removing and resetting items (editor-items.ts). */
  readonly items: EditorItems;
  /** Images from web addresses (link-images.ts). */
  readonly linkImages: LinkImages;
  /** Pictures from the device, kept in this browser (device-images.ts). */
  readonly deviceImages: DeviceImages;
  /** The rows (rows.ts). */
  readonly rows: Rows;

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
    this.addImagesTile = this.main.getByRole('button', {name: 'Add images, drop or paste, to Unranked'});
    // Rows are the groups with a row handle; the title row's "Editor tools" is a group too.
    // Rows are the groups with a tier heading: the ranked rows and the Unranked tray (which has
    // no handle). The title row's "Editor tools" group has none.
    this.tiers = this.main.getByRole('group').filter({has: page.getByRole('heading', {level: 2})});
    this.editorTools = page.getByRole('group', {name: 'Editor tools'});
    this.rowOptionsButton = page.getByRole('button', {name: 'Row options'});
    this.addRowButton = page.getByRole('button', {name: 'Add row', exact: true});
    this.manageItemsButton = page.getByRole('button', {name: 'Add images', exact: true});
    this.shareButton = page.getByRole('button', {name: 'Share', exact: true});
    this.zenModeToggle = page.getByRole('button', {name: 'Zen', exact: true});
    this.zen = new Zen(this);
    this.share = new SharePanel(this);
    this.files = new SnapshotFiles(this);
    this.items = new EditorItems(this);
    this.linkImages = new LinkImages(this);
    this.deviceImages = new DeviceImages(this);
    this.rows = new Rows(this);
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
    await expect.poll(async () => await this.crashMessage.isVisible() || await startedAndIdle(this.main), {
      message: 'the page should crash, or start and settle',
    }).toBe(true);
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
   * All items in a tier, in display order. Not items: the row's grip and stack, the tray's "Add
   * images to Unranked" tile, and the Template, Upload and Link buttons of an empty list's drop area.
   */
  itemsIn(tier: string | Locator): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name: NOT_AN_ITEM});
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

  /** A row's grip, beside the row: it moves the whole row, its name included. */
  rowGrip(tierName: string): Locator {
    return this.main.getByRole('button', {name: `Move ${rowPhrase(tierName)}`, exact: true});
  }

  /**
   * A row's stack, at the row's end: it moves only the row's items; the names stay in place. An
   * empty row has nothing to move, so its stack is hidden: this finds nothing then.
   */
  rowStack(tierName: string): Locator {
    const phrase = escapeRegExp(rowPhrase(tierName));
    return this.main.getByRole('button', {name: new RegExp(`^Move the \\d+ items? of ${phrase}$`)});
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
   * Runs a drop that changes the list, waits for the new link, and checks again that every
   * item tile can start a drag: the list on screen has its final tiles once the link is written.
   */
  private async dropAndWaitForLink(drop: () => Promise<void>) {
    await changeAndWaitForLink(this.page, drop);
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
    await changeAndWaitForLink(this.page, async () => {
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
      await expect(this.dragAnnouncer).toHaveText(/ moves to row /);
      await scrollPositionAfterFrames(this.page);
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

  /**
   * Drags a whole row by its grip and drops it on the place of another row: the row moves with
   * its name and items, and the rows between make room.
   */
  async dragRowOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.rowGrip(tierName), this.tier(targetTierName), centerOfBox),
    );
  }

  /**
   * Drags the items of a row by its stack and drops them on the place of another row: the items
   * move and the labels stay S, A, B... from top to bottom (product rule 6).
   */
  async dragRowItemsOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.rowStack(tierName), this.tier(targetTierName), centerOfBox),
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
    const scrollBefore = await scrollPosition(this.page);
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
    const scroll = await scrollPosition(this.page);
    const dropAtOnPage = followTarget ? onPage(pointIn(await boxOf(target)), scroll) : measured;
    // A drop point outside the window is reached by holding the pointer at the edge,
    // where the page auto-scrolls towards it.
    const x = clamp(dropAtOnPage.x - scroll.x, 1, viewport.width - 2);
    const y = clamp(dropAtOnPage.y - scroll.y, 1, viewport.height - 2);
    await this.page.mouse.move(x, y, {steps: 5});
    // The drag library reads the pointer once per animation frame. Waiting a few frames
    // lets it handle the last move, and shows whether the page is still scrolling.
    const scrollAfter = await scrollPositionAfterFrames(this.page);
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
    const scroll = await scrollPosition(this.page);
    const from = await boxOf(handle);
    const top = Math.min(from.y, dropAt.y) + scroll.y;
    const bottom = Math.max(from.y + from.height, dropAt.y) + scroll.y;
    const shows = top >= scroll.y + margin && bottom <= scroll.y + viewport.height - margin;
    if (shows || bottom - top > viewport.height - 2 * margin) return;
    const y = Math.max(0, Math.round((top + bottom - viewport.height) / 2));
    await this.page.evaluate((toY) => window.scrollTo({top: toY, behavior: 'instant'}), y);
    // The window may stop short of the point (the end of the page): wait until it holds still.
    let last = await scrollPositionAfterFrames(this.page, 2);
    await expect.poll(async () => {
      const now = await scrollPositionAfterFrames(this.page, 2);
      const still = now.x === last.x && now.y === last.y;
      last = now;
      return still;
    }, {message: 'the window should stop scrolling'}).toBe(true);
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

  /** Moves a whole row with the keyboard, using its grip. Focus comes back to the grip. */
  async moveRowWithKeyboard(tierName: string, keys: string[]) {
    // The name moves with the row, but a row without a name is named by its new position.
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.rowGrip(tierName), keys, /^Move (?:row |Row \d+$)/));
  }

  /**
   * Moves the items of a row with the keyboard, using its stack. Focus comes back to the stack,
   * which the labels in place name after its new position.
   */
  async moveRowItemsWithKeyboard(tierName: string, keys: string[]) {
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.rowStack(tierName), keys, /^Move the \d+ items? of /));
  }

  /**
   * Lifts a whole row by its grip with the keyboard (Space), moves it with the given keys, then
   * presses Escape. Returns once the cancel is announced and focus is back on the grip.
   */
  async moveRowWithKeyboardThenCancel(tierName: string, keys: string[]) {
    const keyboard = this.page.keyboard;
    await this.dropEnded();
    await this.rowGrip(tierName).focus();
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('Picked up');
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
    }
    await keyboard.press('Escape');
    await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    await expect.poll(() => this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toBe(`Move ${rowPhrase(tierName)}`);
    await this.expectEveryItemDraggable();
  }

  /**
   * The names of what Tab reaches inside a row, in order: from the element before the row, Tab
   * until the focus leaves the row.
   */
  async tabOrderIn(tierName: string): Promise<string[]> {
    const row = this.tier(tierName);
    await this.settled();
    const first = row.getByRole('button').first();
    await first.focus();
    await this.page.keyboard.press('Shift+Tab');
    const names: string[] = [];
    for (;;) {
      await this.page.keyboard.press('Tab');
      const inRow = await row.evaluate((element) => element.contains(document.activeElement));
      if (!inRow) return names;
      names.push(await this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''));
    }
  }

  /**
   * Gives an element focus as the keyboard does, so it shows its focus ring (:focus-visible):
   * focus the element before it, then Tab.
   */
  async focusWithKeyboard(element: Locator) {
    await element.focus();
    await this.page.keyboard.press('Shift+Tab');
    await this.page.keyboard.press('Tab');
    await expect(element).toBeFocused();
  }

  /** The colour of each ranked row from top to bottom (its gradient), as computed CSS. */
  async rowColours(): Promise<string[]> {
    const rows = await this.tiers.all();
    const colours = await Promise.all(rows.slice(0, -1).map((row) => row.evaluate((element) => getComputedStyle(element).backgroundImage)));
    return colours;
  }

  /**
   * Moves a whole row or its items with the keyboard and returns what screen readers hear after
   * each arrow key and the drop.
   */
  async moveRowWithKeyboardAndListen(tierName: string, handle: 'grip' | 'stack', keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    const [locator, focusAfter] = handle === 'grip'
      ? [this.rowGrip(tierName), /^Move (?:row |Row \d+$)/]
      : [this.rowStack(tierName), /^Move the \d+ items? of /];
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(locator, keys, focusAfter, heard));
    return heard;
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
        await scrollPositionAfterFrames(this.page, 2);
      }
      await expect(this.dragAnnouncer).toHaveText(new RegExp(`moves to ${escapeRegExp(tierName === 'Unranked' ? tierName : rowPhrase(tierName))},`));
      await touch('touchEnd', null, start + 0.7);
      await this.dropEnded();
      await this.expectEveryItemDraggable();
    });
  }

  /**
   * Touches a row's grip, holds it still, then drags the row onto the place of another row and
   * lifts the finger. The hold is in the event times (300 ms between touching and moving): the
   * grip drags after a 250 ms hold (lib/dnd/activation.ts), so the test does not wait for it.
   */
  async touchDragRowOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(async () => {
      const touch = await this.touchscreen();
      const grip = this.rowGrip(tierName);
      await grip.scrollIntoViewIfNeeded();
      const from = await centerOf(grip);
      const box = await boxOf(this.tier(targetTierName));
      const to = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      const start = Date.now() / 1000;
      await touch('touchStart', from, start);
      await touch('touchMove', {x: from.x, y: from.y + 1}, start + 0.3);
      await expect(this.dragAnnouncer, 'the drag should start').toHaveText(new RegExp(`^Picked up ${escapeRegExp(rowPhrase(tierName))}, `));
      for (let step = 1; step <= 10; step++) {
        await touch('touchMove', {x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10}, start + 0.3 + step * 0.03);
        await scrollPositionAfterFrames(this.page, 2);
      }
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
    const scrollBefore = await scrollPosition(this.page);
    const from = await centerOf(item);
    const start = Date.now() / 1000;
    await touch('touchStart', from, start);
    for (let step = 1; step <= 10; step++) {
      await touch('touchMove', {x: from.x, y: from.y - distance * step / 10}, start + step * 0.01);
    }
    await touch('touchEnd', null, start + 0.12);
    let scrolled = 0;
    await expect.poll(async () => {
      scrolled = (await scrollPosition(this.page)).y - scrollBefore.y;
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

  async setTitle(newTitle: string) {
    await this.settled();
    await changeAndWaitForLink(this.page, async () => {
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

  /**
   * Closes the open menu, and its open submenu, with Escape: the first Escape closes them all.
   * A menu must be open.
   */
  async closeMenus() {
    await expect(this.openMenus.first(), 'a menu should be open to close').toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.openMenus).toHaveCount(0);
  }

  // ---- Managing items --------------------------------------------------------------------

  // ---- Data kept in this browser -------------------------------------------------------------

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

  /**
   * Waits until the page has finished what the last step started: <main> no longer says
   * `aria-busy` (lib/busy.ts). The page is busy until the editor has started in the browser,
   * while a link is written, during a drag, and while files or pictures are added or captured.
   */
  async settled() {
    await expectSettled(this.page);
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

  // ---- Image addresses: dropped or pasted text (#107) ------------------------------------------

  // ---- Files: snapshot files and pictures ---------------------------------------------------

  /** The open menu (the Add images menu, an item menu, Row options). */
  get openMenu(): Locator {
    return this.page.getByRole('menu');
  }

  // ---- Sharing -------------------------------------------------------------------------

  // ---- Zen mode --------------------------------------------------------------------------

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

  // ---- Zen layouts (16:9, 9:16, stream overlay) -----------------------------------------

  /** Opens a page by its address as typed, for example with parameters the app does not read. */
  async gotoAddress(address: string) {
    await this.page.goto(address);
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  /** Every open menu, also one that another open menu hides from assistive technology. */
  get openMenus(): Locator {
    return this.page.getByRole('menu', {includeHidden: true});
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
    await changeAndWaitForLink(this.page, async () => {
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
      await scrollPositionAfterFrames(this.page);
      await mouse.move(to.x + 1, to.y);
      await scrollPositionAfterFrames(this.page);
      await mouse.move(to.x, to.y);
      const atRow = new RegExp(`^${escapeRegExp(itemName)} moves to ${escapeRegExp(rowPhrase(tierName))},`);
      await expect(this.dragAnnouncer, 'the press should drag the item to the row').toHaveText(atRow);
      await mouse.up();
      await this.dropEnded();
    });
  }

  /** The items of an open menu, whatever their kind (radio, check box or plain item), in order. */
  menuItems(menu: Locator): Locator {
    return menu.getByRole('menuitemradio').or(menu.getByRole('menuitemcheckbox')).or(menu.getByRole('menuitem'));
  }

  /** True when the box of `inner` lies within the box of `outer` on screen (to the nearest pixel). */
  async isInside(inner: Locator, outer: Locator): Promise<boolean> {
    const [a, b] = await Promise.all([boxOf(inner), boxOf(outer)]);
    return Math.round(a.x) >= Math.round(b.x) && Math.round(a.y) >= Math.round(b.y)
      && Math.round(a.x + a.width) <= Math.round(b.x + b.width) && Math.round(a.y + a.height) <= Math.round(b.y + b.height);
  }

  /** The size of an element on screen, in CSS pixels, rounded. */
  async sizeOf(locator: Locator): Promise<Size> {
    const box = await locator.boundingBox();
    if (!box) throw new Error('The element is not on screen');
    return {width: Math.round(box.width), height: Math.round(box.height)};
  }

  /** The name a Compact tile shows under itself, with Show Labels on. */
  itemCaption(name: string): Locator {
    return this.item(name).getByText(name, {exact: true});
  }

  // ---- Tile size (the dense editor) ------------------------------------------------------

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
    await changeAndWaitForLink(this.page, async () => {
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

  // ---- Leaving machine (tests/machines/leaving.ts) ------------------------------------------

  /**
   * Moves the first item of the Unranked tray up into the last row with the keyboard: one change
   * to the list. Returns once the drop is announced, the focus is back and the address has
   * changed, also while the page is busy on purpose (the trip home waits).
   */
  async moveFirstUnrankedItemUpWithKeyboard() {
    const name = await this.itemsIn(this.unranked).first().getAttribute('aria-label');
    if (!name) throw new Error('The Unranked tray has no item to move');
    await changeAndWaitForLink(this.page, () => this.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false}));
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

  // ---- Appearance machine (tests/machines/appearance.ts) ---------------------------------------

  /** The picture of an item's tile: 80 px wide with Comfortable tiles, 48 px with Compact. */
  itemPicture(name: string): Locator {
    return this.item(name).getByRole('img');
  }

  // ---- Share panel machine (tests/machines/share-panel.ts) ----------------------------------

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

  /** Closes this page's browser context, as closing a browser window does. */
  async closeBrowser() {
    await this.page.context().close();
  }

  // ---- Freeze Frame load machine (tests/machines/freeze-frame-load.ts) ----------------------

  // ---- Remove and undo machine (tests/machines/remove-and-undo.ts) ----------------------------

  // ---- Add from template machine (tests/machines/add-from-template.ts) ----------------------
}

/**
 * How many times dragWithMouse moves the pointer to its drop point before it gives up. Each try
 * waits five frames, so 100 tries let the page auto-scroll for about 500 frames.
 */
const DROP_POINT_TRIES = 100;

// ---- Model helpers: editor rows, Zen steps, leaving, label writes, "From a link" ------------
// Plain functions over TierListPage, for the models in tests/models/editor-rows.ts,
// zen-steps.ts, leaving-writes.ts, label-writes.ts and link-dialog.ts.

/**
 * Clicks the logo link to Home while the trip home may wait for a held server answer
 * (holdTripHome). Returns once the click is made, without waiting for Home.
 */
export async function clickHomeNow(tierList: TierListPage) {
  await tierList.homeLink.click();
}

// ---- Model campaigns: toasts while page time stands still (`pageTime: 'paused'`) ------------

