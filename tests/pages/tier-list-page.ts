import fs from 'node:fs/promises';
import {expect, type Locator, type Page} from '@playwright/test';
import {escapeRegExp} from '../support/regexp';

export type RowCount = 3 | 5 | 7;
export type LabelPosition = 'Left' | 'Right' | 'Top';
/** The capture methods offered under "Options" in the Image tab of the share panel. */
export type CaptureMethod = 'html2canvas-pro' | 'Original html2canvas';

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
    this.main = page.getByRole('main');
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
    // The editor renders on the client only, so wait until the rows exist.
    await expect(this.tiers.first()).toBeVisible();
  }

  /**
   * Opens a link that might break the page. Unlike goto(), it does not wait for the editor:
   * it waits until the page has loaded and the network is idle, so the page has started in
   * the browser (and would have crashed by then).
   */
  async gotoAndSettle(path: string, state: string) {
    await this.page.goto(`${path}?state=${state}`, {waitUntil: 'networkidle'});
  }

  /** The message Next.js shows instead of the page when the page crashed in the browser. */
  get crashMessage(): Locator {
    return this.page.getByRole('heading', {name: /Application error/});
  }

  /** Reloads the page, and waits until the editor shows the list again. */
  async reload() {
    await this.page.reload();
    await expect(this.tiers.first()).toBeVisible();
  }

  /** Opens a full link, for example one copied from another page. */
  async gotoLink(link: string) {
    await this.page.goto(link);
    await expect(this.tiers.first()).toBeVisible();
  }

  tier(name: string): Locator {
    return this.main.getByRole('group', {name, exact: true});
  }

  get unranked(): Locator {
    return this.tier('Unranked');
  }

  /** All items in a tier, in display order. */
  itemsIn(tier: string | Locator): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name: /^(?!Move tier\b|Add images to\b)/});
  }

  item(name: string): Locator {
    return this.main.getByRole('button', {name, exact: true});
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

  /**
   * Makes the server's answers to page navigations (the React Server Components requests that
   * every new address of the editor makes) arrive `delayMs` later, like a slow connection.
   */
  async simulateSlowServer(delayMs: number) {
    await this.page.route('**/*', async (route) => {
      if (route.request().headers()['rsc'] === '1') {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await route.fallback();
    });
  }

  /** Leaves the editor for the landing page with the site's logo link in the header. */
  async leaveForHome() {
    await this.page.getByRole('banner').getByRole('link', {name: 'OpenTierBoy'}).click();
    await expect(this.page).toHaveURL(/^[^?]*\/$/);
  }

  /** The number of entries in the tab's history (window.history.length). */
  async historyLength(): Promise<number> {
    return this.page.evaluate(() => window.history.length);
  }

  /**
   * Starts counting the history entries this page adds from now on (history.pushState calls, as
   * Next.js makes one per router.push). Browsers keep at most 50 entries, so history.length
   * cannot count more. Returns a function that reads the count.
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
    await this.changeAndWaitForLink(() =>
      // Drop in the free space at the end of the row, left of the row handle.
      this.dragWithMouse(this.item(itemName), this.tier(tierName), (box) => ({
        x: box.x + box.width - 120,
        y: box.y + box.height / 2,
      })),
    );
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
    await expect(async () => {
      await this.item(itemName).focus();
      await keyboard.press('Space');
      await expect(this.dragAnnouncer).toContainText('Picked up', {timeout: 1_000});
    }).toPass();
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
    }
    await keyboard.press('Escape');
    await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    await expect.poll(() => this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toBe(itemName);
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
    await this.changeAndWaitForLink(() =>
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
    await this.changeAndWaitForLink(() =>
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
   * The page auto-scrolls while the pointer is near the top or bottom of the window. The
   * helper keeps moving the pointer to the same page point until the scrolling stops.
   */
  private async dragWithMouse(handle: Locator, target: Locator, pointIn: (box: Box) => Point, {followTarget = false, cancel = false} = {}) {
    await handle.scrollIntoViewIfNeeded();
    const scrollBefore = await this.scrollPosition();
    const onPage = (point: Point, scroll: Point) => ({x: point.x + scroll.x, y: point.y + scroll.y});
    let dropAtOnPage = onPage(pointIn(await boxOf(target)), scrollBefore);
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};

    const from = await centerOf(handle);
    const mouse = this.page.mouse;
    // A press starts no drag while the previous drop still animates (about 300 ms), so the
    // helper presses again until the drag starts.
    await expect(async () => {
      await mouse.move(from.x, from.y);
      await mouse.down();
      // A mouse drag starts only after the pointer moves a few pixels.
      await mouse.move(from.x + 8, from.y + 8, {steps: 4});
      // Once a drag starts, the editor announces the lift, and then every change of the
      // drop position. Only the latest message stays in the live region.
      await expect(this.dragAnnouncer).toHaveText(/^Picked up /, {timeout: 1_000}).catch(async (error) => {
        await mouse.up();
        throw error;
      });
    }, 'the drag should start').toPass();

    await expect(async () => {
      const scroll = await this.scrollPosition();
      if (followTarget) dropAtOnPage = onPage(pointIn(await boxOf(target)), scroll);
      // A drop point outside the window is reached by holding the pointer at the edge,
      // where the page auto-scrolls towards it.
      const x = clamp(dropAtOnPage.x - scroll.x, 1, viewport.width - 2);
      const y = clamp(dropAtOnPage.y - scroll.y, 1, viewport.height - 2);
      await mouse.move(x, y, {steps: 5});
      // The drag library reads the pointer once per animation frame. Waiting a few frames
      // lets it handle the last move, and shows whether the page is still scrolling.
      const scrollAfter = await this.scrollPositionAfterFrames();
      expect(scrollAfter, 'the page should stop auto-scrolling').toEqual(scroll);
      expect({x: x + scroll.x, y: y + scroll.y}, 'the pointer should be on the drop point').toEqual(dropAtOnPage);
      if (followTarget) {
        // Items slide to their new places (an animation): the target must have stopped moving.
        expect(onPage(pointIn(await boxOf(target)), scrollAfter), 'the target should stay put').toEqual(dropAtOnPage);
      }
    }).toPass({timeout: 15_000});
    if (cancel) {
      // Escape ends the drag where it is; the button is released after that.
      await this.page.keyboard.press('Escape');
      await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    }
    await mouse.up();
    await this.dropSettled();
  }

  /**
   * Waits until a drop has finished animating (about 300 ms). Until then the drag library
   * blocks text selection on the whole page (typing into a label right away goes nowhere) and
   * a press starts no new drag.
   */
  private async dropSettled() {
    await expect.poll(() => this.page.evaluate(() => document.getAnimations()
      .filter((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).length), {
      message: 'the drop animation should end',
    }).toBe(0);
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
   * With `waitForLink: false` it returns once the drop is announced, before the link is in
   * the address bar (for quick changes one after another).
   */
  async moveItemWithKeyboard(itemName: string, keys: string[], {waitForLink = true} = {}) {
    const move = () => this.moveWithKeyboard(this.item(itemName), keys, itemName);
    await (waitForLink ? this.changeAndWaitForLink(move) : move());
  }

  /**
   * Moves an item with the keyboard and checks what screen readers hear after each arrow key:
   * returns the announcements, the drop included.
   */
  async moveItemWithKeyboardAndListen(itemName: string, keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    await this.changeAndWaitForLink(() => this.moveWithKeyboard(this.item(itemName), keys, itemName, heard));
    return heard;
  }

  /** Moves a whole row with the keyboard, using its row handle. */
  async moveTierWithKeyboard(tierName: string, keys: string[]) {
    // The labels stay in place, so the moved row's handle has the name of its new position.
    await this.changeAndWaitForLink(() => this.moveWithKeyboard(this.rowHandle(tierName), keys, /^Move tier /));
  }

  private async moveWithKeyboard(handle: Locator, keys: string[], focusAfter: string | RegExp, heard: string[] = []) {
    const keyboard = this.page.keyboard;
    // The editor announces every step to screen readers. Waiting for those announcements
    // keeps the test in step with the app without fixed sleeps.
    await expect(async () => {
      await handle.focus();
      await keyboard.press('Space');
      await expect(this.dragAnnouncer).toContainText('Picked up', {timeout: 1_000});
    }).toPass();
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
  }

  // ---- Touch (Chromium only: touch events through the Chrome DevTools Protocol) --------------

  /**
   * Touches an item, holds it still, then drags it to the end of a tier and lifts the finger.
   * The hold is in the event times (300 ms between touching and moving), so the test does not
   * wait for it. The drag starts after a 250 ms hold (lib/dnd/activation.ts).
   */
  async touchDragItemToTier(itemName: string, tierName: string) {
    await this.changeAndWaitForLink(async () => {
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
      await this.dropSettled();
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
   * With `waitForLink: false` it returns as soon as the new name shows, before the link is in
   * the address bar (for quick changes one after another).
   */
  async renameTier(currentName: string, newName: string, nameAfter = newName, {waitForLink = true} = {}) {
    const rename = async () => {
      const input = await this.typeTierName(currentName, newName);
      await input.press('Enter');
      await expect(this.tier(nameAfter)).toBeVisible();
    };
    await (waitForLink ? this.changeAndWaitForLink(rename) : rename());
  }

  /** Opens the editor of a tier label and types a new name, without confirming it. */
  async typeTierName(currentName: string, newName: string): Promise<Locator> {
    const row = this.tier(currentName);
    await row.getByRole('heading', {name: currentName, exact: true}).click();
    const input = row.getByRole('textbox');
    await input.fill(newName);
    return input;
  }

  async setTitle(newTitle: string) {
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
    await this.changeAndWaitForLink(async () => {
      await this.rowOptionsButton.click();
      await this.removeRowMenuItem.click();
      await this.page.getByRole('menu').getByRole('menuitem', {name: tierName, exact: true}).click();
    });
  }

  /** "Remove a row" in the Row options menu. It shows once the menu is open (openRowOptions). */
  get removeRowMenuItem(): Locator {
    return this.page.getByRole('menuitem', {name: 'Remove a row'});
  }

  /**
   * Opens the Row options menu. Right after a navigation the editor may not have started yet,
   * so a click can go unanswered: it clicks again until the menu shows.
   */
  async openRowOptions() {
    await expect(async () => {
      if (!(await this.removeRowMenuItem.isVisible())) await this.rowOptionsButton.click();
      await expect(this.removeRowMenuItem).toBeVisible({timeout: 1_000});
    }).toPass();
  }

  /** Opens Row options › Remove a row, and returns the rows that submenu lists, as menu items. */
  async openRemoveRowMenu(): Promise<Locator> {
    await this.openRowOptions();
    await this.removeRowMenuItem.click();
    const rows = this.page.getByRole('menu').filter({hasNot: this.removeRowMenuItem}).getByRole('menuitem');
    await expect(rows.first()).toBeVisible();
    return rows;
  }

  /** Closes every open menu with Escape. */
  async closeMenus() {
    const menus = this.page.getByRole('menu');
    await expect(async () => {
      if (await menus.count() > 0) await this.page.keyboard.press('Escape');
      await expect(menus).toHaveCount(0, {timeout: 1_000});
    }).toPass();
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

  /** Opens "From a link", fills in the address (and a name), and presses the add button. Leaves the dialog open. */
  async submitLinkImage(address: string, name?: string) {
    if (!(await this.linkImageDialog.isVisible())) {
      await this.openItemsMenu();
      await this.page.getByRole('menuitem', {name: 'From a link'}).click();
    }
    const dialog = this.linkImageDialog;
    await dialog.getByLabel('Image address').fill(address);
    if (name !== undefined) await dialog.getByLabel('Name (optional)').fill(name);
    await dialog.getByRole('button', {name: /^Add (Item|Anyway)$/}).click();
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
   * Waits until the editor responds to input. The server-rendered rows show before the page has
   * started in the browser; a paste event before that finds no listener. Opening the items menu
   * proves the page has started (and its effects, such as recording Recently viewed, have run).
   */
  async waitUntilInteractive() {
    const menu = this.page.getByRole('menu');
    await expect(async () => {
      if (!(await menu.isVisible())) await this.manageItemsButton.click();
      await expect(menu).toBeVisible({timeout: 1_000});
    }).toPass();
    await this.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }

  /** The text an item's right-click (or long-press) menu shows about the image's site, if any. */
  async itemImageSite(itemName: string): Promise<string | null> {
    await this.item(itemName).click({button: 'right'});
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    const site = menu.getByText(/^Image from /);
    const text = (await site.count()) > 0 ? await site.textContent() : null;
    await this.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return text;
  }

  /**
   * Pastes image files into the editor (or into `target`, for example a text field), as a paste
   * from the clipboard would. The test builds the paste event: browsers do not let tests write
   * images to the real clipboard. Firefox ignores the files in such an event, so paste tests skip
   * Firefox (SCRIPTED_PASTE_SKIP).
   */
  async pasteImages(files: {name: string; mimeType: string; buffer: Buffer}[], target?: Locator) {
    // A target (such as a text field the test typed into) proves the page has started already.
    if (!target) await this.waitUntilInteractive();
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
    await this.waitUntilInteractive();
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
    await this.waitUntilInteractive();
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
    await this.waitUntilInteractive();
    const transfer = await this.textTransfer(data);
    const element = this.tiers.first();
    await element.dispatchEvent('dragenter', {dataTransfer: transfer});
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
    await element.dispatchEvent('drop', {dataTransfer: transfer});
  }

  /**
   * Pastes text into the editor, as pasting a copied image address does. The test builds the
   * paste event; Firefox drops the data of such an event (SCRIPTED_PASTE_SKIP).
   */
  async pasteText(text: string) {
    await this.waitUntilInteractive();
    await this.main.evaluate((element, pasted) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', pasted);
      element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, text);
  }

  // ---- Files: snapshot files and pictures ---------------------------------------------------

  /**
   * Chooses a file with "Open a Freeze Frame…" in the Add images menu, as the file chooser
   * would. Pass `waitForEditor: false` when the test already waited for the editor
   * (waitUntilInteractive), for example to time the opening.
   */
  async openFile(file: {name: string; mimeType: string; buffer: Buffer}, {waitForEditor = true} = {}) {
    if (waitForEditor) await this.waitUntilInteractive();
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
    if (!onto) await this.waitUntilInteractive();
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
    await this.waitUntilInteractive();
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

  async deleteItem(itemName: string) {
    await this.item(itemName).click({button: 'right'});
    await this.page.getByRole('menuitem', {name: 'Delete'}).click();
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

  /** Opens the Image tab of the share panel (Freeze Frame), where a capture stays until the next one. */
  async openImageTab() {
    if (!(await this.sharePanel.isVisible())) await this.openSharePanel();
    await this.sharePanel.getByRole('tab', {name: 'Image'}).click();
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

  async copyMarkdown() {
    await this.openSharePanel();
    await this.sharePanel.getByRole('button', {name: 'Copy Markdown'}).click();
    await expect(this.toast('Markdown copied to clipboard')).toBeVisible();
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

  /**
   * Captures the page as an image from the Image tab of the share panel ("Freeze Frame"),
   * and waits until the app reports the result in a toast. Without a method, the app's
   * default method is used.
   */
  async capturePreview(method?: CaptureMethod) {
    await this.openSharePanel();
    await this.sharePanel.getByRole('tab', {name: 'Image'}).click();
    if (method) {
      await this.sharePanel.getByRole('button', {name: 'Options'}).click();
      const methodSelect = this.sharePanel.getByRole('combobox');
      await methodSelect.click();
      await this.page.getByRole('option', {name: method, exact: true}).click();
      await expect(methodSelect).toHaveText(method);
    }
    await this.sharePanel.getByRole('button', {name: 'Capture Preview'}).click();
    await expect(this.toast(/Image captured successfully|Failed to capture image/)).toBeVisible();
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
    let details: CapturedImage | null = null;
    // The preview can reload while the share panel re-renders, so measure it once it has
    // finished loading.
    await expect(async () => {
      details = await this.capturedImage.evaluate((img: HTMLImageElement) => {
        if (!img.complete || img.naturalWidth === 0) return null;
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
      expect(details, 'the captured image should finish loading').not.toBeNull();
    }).toPass();
    return details!;
  }

  // ---- Zen mode --------------------------------------------------------------------------

  async setZenMode(on: boolean) {
    await this.zenModeToggle.click();
    await expect(this.zenModeToggle).toHaveAttribute('aria-pressed', String(on));
  }

  // ---- Notifications ---------------------------------------------------------------------

  /** A toast notification that contains the given text. */
  toast(text: string | RegExp): Locator {
    return this.page.getByRole('listitem').filter({hasText: text});
  }

  /** The toast with this title whose text also names `detail`, such as a file name. */
  toastAbout(text: string | RegExp, detail: string): Locator {
    return this.toast(text).filter({hasText: detail});
  }

  async undoFromToast(text: string | RegExp, options?: {timeout?: number}) {
    await this.toast(text).getByRole('button', {name: 'Undo'}).click(options);
  }
}

type Box = {x: number; y: number; width: number; height: number};
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

