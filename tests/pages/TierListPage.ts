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

  constructor(page: Page) {
    this.page = page;
    this.main = page.getByRole('main');
    this.title = this.main.getByRole('heading', {level: 1});
    this.tiers = this.main.getByRole('group');
    this.rowOptionsButton = page.getByRole('button', {name: 'Select rows and label options'});
    this.manageItemsButton = page.getByRole('button', {name: 'Manage items'});
    this.shareButton = page.getByRole('button', {name: 'Share', exact: true});
  }

  /** Opens a tier list. `state` is the raw value of the `state` query parameter. */
  async goto(path: string, state?: string) {
    await this.page.goto(state ? `${path}?state=${state}` : path);
    // The editor renders on the client only, so wait until the rows exist.
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
    await this.changeAndWaitForLink(() => this.dragItemToTierNow(itemName, tierName));
  }

  private async dragItemToTierNow(itemName: string, tierName: string) {
    const item = this.item(itemName);
    const target = this.tier(tierName);
    await item.scrollIntoViewIfNeeded();
    const from = await centerOf(item);
    const mouse = this.page.mouse;
    await mouse.move(from.x, from.y);
    await mouse.down();
    // The drag library starts a drag only after the pointer moves a few pixels.
    await mouse.move(from.x + 12, from.y + 12, {steps: 5});
    // Drop in the free space at the end of the row, left of the row handle.
    await this.holdPointerOver(target, (box) => ({x: box.x + box.width - 120, y: box.y + box.height / 2}));
    await mouse.up();
  }

  /** Drags a whole row by its handle and drops it on the position of another row. */
  async dragTierOnto(tierName: string, targetTierName: string) {
    await this.changeAndWaitForLink(() => this.dragTierOntoNow(tierName, targetTierName));
  }

  private async dragTierOntoNow(tierName: string, targetTierName: string) {
    const handle = this.rowHandle(tierName);
    const from = await centerOf(handle);
    const mouse = this.page.mouse;
    await mouse.move(from.x, from.y);
    await mouse.down();
    await mouse.move(from.x, from.y + 12, {steps: 5});
    await this.holdPointerOver(this.rowHandle(targetTierName), (box) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    }));
    await mouse.up();
  }

  /**
   * Moves the pointer over a drop target and keeps it there until the target stops moving.
   * During a drag the page auto-scrolls near the window edges, which shifts the target
   * under the pointer. Dropping before the scroll settles would land in the wrong row.
   */
  private async holdPointerOver(target: Locator, pointIn: (box: Box) => {x: number; y: number}) {
    await expect(async () => {
      const before = await boxOf(target);
      const point = pointIn(before);
      await this.page.mouse.move(point.x, point.y, {steps: 10});
      const after = await boxOf(target);
      expect(Math.abs(after.y - before.y), 'drop target is still moving').toBeLessThan(1);
    }).toPass({intervals: [100, 250, 500], timeout: 5_000});
  }

  /**
   * Moves an item with the keyboard, as a keyboard or screen-reader user would:
   * focus the item, Space to lift, arrow keys to move, Space to drop.
   */
  async moveItemWithKeyboard(itemName: string, keys: string[]) {
    await this.changeAndWaitForLink(() => this.moveItemWithKeyboardNow(itemName, keys));
  }

  private async moveItemWithKeyboardNow(itemName: string, keys: string[]) {
    const item = this.item(itemName);
    const keyboard = this.page.keyboard;
    // The drag library announces every step to screen readers. Waiting for those
    // announcements keeps the test in step with the app without fixed sleeps.
    await expect(async () => {
      await item.focus();
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

  async renameTier(currentName: string, newName: string) {
    await this.changeAndWaitForLink(async () => {
      const row = this.tier(currentName);
      await row.getByRole('heading', {name: currentName, exact: true}).click();
      const input = row.getByRole('textbox');
      await input.fill(newName);
      await input.press('Enter');
      await expect(this.tier(newName)).toBeVisible();
    });
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
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Reset'}).click();
  }

  async removeAllItems() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
    const confirm = this.page.getByRole('alertdialog');
    await confirm.getByRole('button', {name: 'Remove All Items'}).click();
  }

  // ---- Notifications ---------------------------------------------------------------------

  /** A toast notification that contains the given text. */
  toast(text: string | RegExp): Locator {
    return this.page.getByRole('listitem').filter({hasText: text});
  }

  async undoFromToast(text: string | RegExp) {
    await this.toast(text).getByRole('button', {name: 'Undo'}).click();
  }
}

type Box = {x: number; y: number; width: number; height: number};

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element is not visible: ${locator}`);
  return box;
}

async function centerOf(locator: Locator) {
  const box = await boxOf(locator);
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
