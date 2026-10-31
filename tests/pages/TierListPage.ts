import {expect, type Locator, type Page} from '@playwright/test';

export type RowCount = 3 | 5 | 7;
export type LabelPosition = 'Left' | 'Right' | 'Top';

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
export class TierListPage {
  readonly page: Page;
  readonly main: Locator;
  readonly title: Locator;
  readonly tiers: Locator;
  readonly rowOptionsButton: Locator;
  readonly manageItemsButton: Locator;
  readonly shareButton: Locator;
  readonly sharePanel: Locator;
  readonly zenModeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.main = page.getByRole('main');
    this.title = this.main.getByRole('heading', {level: 1});
    this.tiers = this.main.getByRole('group');
    this.rowOptionsButton = page.getByRole('button', {name: 'Select rows and label options'});
    this.manageItemsButton = page.getByRole('button', {name: 'Manage items'});
    this.shareButton = page.getByRole('button', {name: 'Share', exact: true});
    this.sharePanel = page.getByRole('dialog').filter({
      has: page.getByRole('heading', {name: 'Share Your Rankings'}),
    });
    this.zenModeToggle = page.getByRole('button', {name: 'Toggle zen mode'});
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
    return row.getByRole('button', {name: /^(?!Move tier\b)/});
  }

  item(name: string): Locator {
    return this.main.getByRole('button', {name, exact: true});
  }

  rowHandle(tierName: string): Locator {
    return this.main.getByRole('button', {name: `Move tier ${tierName}`, exact: true});
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

  /** Drags an item with the mouse and drops it where another item is. */
  async dragItemOnto(itemName: string, targetItemName: string) {
    await this.changeAndWaitForLink(() =>
      this.dragWithMouse(this.item(itemName), this.item(targetItemName), centerOfBox),
    );
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
   * The drag library measures every row and item once, when the drag starts, and works
   * out the drop position from those measurements and the window scroll. The helper does
   * the same: it measures the drop point before the drag starts, in page coordinates.
   * Measuring during the drag goes wrong in two ways:
   * - The library moves rows and items out of the way of the dragged one. A target
   *   measured during the drag has already moved, and following it pulls the dragged
   *   element back, so the target moves back too, and so on.
   * - The page auto-scrolls while the pointer is near the top or bottom of the window.
   *   The helper keeps moving the pointer to the same page point until the scrolling stops.
   */
  private async dragWithMouse(handle: Locator, target: Locator, pointIn: (box: Box) => Point) {
    await handle.scrollIntoViewIfNeeded();
    const scrollBefore = await this.scrollPosition();
    const dropAt = pointIn(await boxOf(target));
    const dropAtOnPage = {x: dropAt.x + scrollBefore.x, y: dropAt.y + scrollBefore.y};
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};

    const from = await centerOf(handle);
    const mouse = this.page.mouse;
    const lastAnnouncement = await this.dragAnnouncer.textContent();
    await mouse.move(from.x, from.y);
    await mouse.down();
    // The drag library starts a drag only after the pointer moves a few pixels.
    await mouse.move(from.x + 8, from.y + 8, {steps: 4});
    // Once a drag starts, the library announces the lift, and then every change of the
    // drop position. Only the latest message stays in the live region.
    await expect(this.dragAnnouncer, 'the drag should start').not.toHaveText(lastAnnouncement ?? '');

    await expect(async () => {
      const scroll = await this.scrollPosition();
      // A drop point outside the window is reached by holding the pointer at the edge,
      // where the page auto-scrolls towards it.
      const x = clamp(dropAtOnPage.x - scroll.x, 1, viewport.width - 2);
      const y = clamp(dropAtOnPage.y - scroll.y, 1, viewport.height - 2);
      await mouse.move(x, y, {steps: 5});
      // The library reads the pointer once per animation frame. Waiting a few frames
      // lets it handle the last move, and shows whether the page is still scrolling.
      const scrollAfter = await this.scrollPositionAfterFrames();
      expect(scrollAfter, 'the page should stop auto-scrolling').toEqual(scroll);
      expect({x: x + scroll.x, y: y + scroll.y}, 'the pointer should be on the drop point').toEqual(dropAtOnPage);
    }).toPass({timeout: 15_000});
    await mouse.up();
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
   */
  async moveItemWithKeyboard(itemName: string, keys: string[]) {
    await this.changeAndWaitForLink(() => this.moveWithKeyboard(this.item(itemName), keys));
  }

  /** Moves a whole row with the keyboard, using its row handle. */
  async moveTierWithKeyboard(tierName: string, keys: string[]) {
    await this.changeAndWaitForLink(() => this.moveWithKeyboard(this.rowHandle(tierName), keys));
  }

  private async moveWithKeyboard(handle: Locator, keys: string[]) {
    const keyboard = this.page.keyboard;
    // The drag library announces every step to screen readers. Waiting for those
    // announcements keeps the test in step with the app without fixed sleeps.
    await expect(async () => {
      await handle.focus();
      await keyboard.press('Space');
      await expect(this.dragAnnouncer).toContainText('You have lifted an item', {timeout: 1_000});
    }).toPass();
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
    }
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('You have dropped the item');
  }

  /** The live region where the drag library announces lifts, moves and drops. */
  get dragAnnouncer(): Locator {
    return this.page.locator('[aria-live="assertive"][id^="rfd-announcement"]');
  }

  // ---- Editing labels --------------------------------------------------------------------

  /**
   * Renames a tier and confirms with Enter. A row with an empty label is named after its
   * position, for example "Tier 2", so pass that as `nameAfter` when clearing a label.
   */
  async renameTier(currentName: string, newName: string, nameAfter = newName) {
    await this.changeAndWaitForLink(async () => {
      const input = await this.typeTierName(currentName, newName);
      await input.press('Enter');
      await expect(this.tier(nameAfter)).toBeVisible();
    });
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
      await this.title.click();
      const input = this.main.getByPlaceholder('Enter title');
      await input.fill(newTitle);
      await input.press('Enter');
      await expect(this.title).toHaveText(newTitle);
    });
  }

  // ---- Row and label settings ------------------------------------------------------------

  async chooseRowCount(count: RowCount) {
    await this.rowOptionsButton.click();
    await this.page.getByRole('menuitemradio', {name: `${count} Rows`}).click();
  }

  async chooseLabelPosition(position: LabelPosition) {
    await this.rowOptionsButton.click();
    await this.page.getByRole('menuitemradio', {name: position, exact: true}).click();
  }

  async setItemLabelsVisible(visible: boolean) {
    await this.rowOptionsButton.click();
    await this.page.getByRole('menuitemradio', {name: visible ? 'Show Labels' : 'Hide Labels'}).click();
  }

  // ---- Managing items --------------------------------------------------------------------

  private async openItemsMenu() {
    await this.manageItemsButton.click();
  }

  /** Adds a set from the built-in templates, for example ('OVERWATCH', 'Tank'). */
  async addItemsFromTemplate(packageName: string, setTitle: string) {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From template'}).click();
    const picker = this.page.getByRole('dialog');
    await picker.getByRole('option', {name: packageName, exact: true}).click();
    await picker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
  }

  /** Uploads images from the device. Item names default to the file names. */
  async addItemsFromDevice(files: string[]) {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From your device'}).click();
    const dialog = this.page.getByRole('dialog', {name: 'Add New Items'});
    await dialog.getByLabel('Upload Images').setInputFiles(files);
    await dialog.getByRole('button', {name: /^Add \d+ Items?$/}).click();
    await expect(dialog).toBeHidden();
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

  /** Copies the Markdown share text. The browser must allow clipboard access. */
  async copyMarkdown() {
    await this.openSharePanel();
    await this.sharePanel.getByRole('button', {name: 'Copy Markdown'}).click();
    await expect(this.toast('Markdown copied to clipboard')).toBeVisible();
  }

  async clipboardText(): Promise<string> {
    return this.page.evaluate(() => navigator.clipboard.readText());
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

  async undoFromToast(text: string | RegExp, options?: {timeout?: number}) {
    await this.toast(text).getByRole('button', {name: 'Undo'}).click(options);
  }
}

type Box = {x: number; y: number; width: number; height: number};
type Point = {x: number; y: number};

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

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
