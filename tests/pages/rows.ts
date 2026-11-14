import {expect, type Locator, type Page} from '@playwright/test';
import {boxOf, changeAndWaitForLink} from './helpers';
import type {TierListPage} from './tier-list-page';

/**
 * The rows: their names, the Row options menu (row count, label position and visibility, tile
 * size), and adding and removing rows.
 *
 * The label settings travel in the link in place of the current history entry (owner decision A3),
 * so their helpers wait until the address holds them. Tile size is a view setting with no link of its own.
 *
 * Specs reach it as `tierList.rows` (TierListPage.rows).
 */
export class Rows {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  /** The text box that edits a tier's label, while it is open. */
  tierNameInput(tierName: string): Locator {
    return this.tierList.tier(tierName).getByRole('textbox');
  }

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
      await expect(this.tierList.tier(nameAfter)).toBeVisible();
    };
    if (!waitForLink) {
      await rename();
      return;
    }
    // From a page that has finished the last step (a drop): text typed while the
    // drag library still blocks text selection could land beside the old name (WebKit).
    await this.tierList.settled();
    await changeAndWaitForLink(this.page, rename);
  }

  /** Opens the editor of a tier label and types a new name, without confirming it. */
  async typeTierName(currentName: string, newName: string): Promise<Locator> {
    const row = this.tierList.tier(currentName);
    await row.getByRole('heading', {name: currentName, exact: true}).click();
    const input = row.getByRole('textbox');
    await input.fill(newName);
    await expect(input, 'the text box should hold the typed name').toHaveValue(newName);
    return input;
  }

  /** Switches the row template. A new history entry, like any change to the list. */
  /** Adds an empty row above Unranked with "Add row" (#182). */
  async addTierRow() {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.addRowButton.click();
    });
  }

  /** Removes a ranked row from the row options menu (#182). Its items go to Unranked. */
  async removeTierRow(tierName: string) {
    const rows = await this.openRemoveRowMenu();
    await changeAndWaitForLink(this.page, () => rows.and(this.page.getByRole('menuitem', {name: tierName, exact: true})).click());
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
    await this.tierList.settled();
    await expect(this.tierList.openMenus, 'no menu should be open before Row options opens').toHaveCount(0);
    await this.tierList.rowOptionsButton.click();
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
    const y = from.y + from.height / 2;
    // The submenu shows off screen until the menu has placed it: wait until it sits beside its item.
    let into = await boxOf(submenu);
    await expect.poll(async () => {
      into = await boxOf(submenu);
      return into.y < y && y < into.y + into.height;
    }, {message: 'the submenu should open beside its item'}).toBe(true);
    const edge = side === 'left' ? from.x + 2 : from.x + from.width - 2;
    const inside = side === 'left' ? into.x + into.width - 8 : into.x + 8;
    await this.page.mouse.move(from.x + from.width / 2, y);
    await this.page.mouse.move(edge, y, {steps: 4});
    await this.page.mouse.move(inside, y, {steps: 2});
    await expect(submenu, 'the submenu should stay open once the pointer is inside it').toBeVisible();
    await expect(submenu.getByRole('menuitem').first()).toBeVisible();
  }

  async chooseRowCount(count: RowCount) {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: `${count} Rows`}).click();
    });
  }

  /**
   * Moves the tier labels. The setting travels in the link, in place of the current history
   * entry (A3), so this waits until the address holds it.
   */
  async chooseLabelPosition(position: LabelPosition) {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: position, exact: true}).click();
    });
  }

  /** Shows or hides item labels. Like chooseLabelPosition, it waits until the address holds it. */
  async setItemLabelsVisible(visible: boolean) {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: visible ? 'Show Labels' : 'Hide Labels'}).click();
    });
  }

  /** A choice in the Row options menu (row count, label position, label visibility). Open the menu first (openRowOptions). */
  rowOption(name: string): Locator {
    return this.page.getByRole('menu').getByRole('menuitemradio', {name, exact: true});
  }

  /** True when the label of a tier sits above the given item, as with labels on Top. */
  async tierLabelIsAbove(tierName: string, itemName: string): Promise<boolean> {
    const label = await this.tierList.tier(tierName).getByRole('heading', {name: tierName}).boundingBox();
    const item = await this.tierList.item(itemName).boundingBox();
    return !!(label && item && label.y + label.height <= item.y);
  }

  /**
   * Chooses a tile size in the Row options menu. A view setting: it writes no link of its own.
   * Choosing Compact with Show Labels on also turns Show Labels off, which rewrites the link in
   * place; the page is busy until that link is written, so this returns once it has settled.
   */
  async chooseTileSize(name: TileSizeName) {
    await this.openRowOptions();
    await this.rowOption(name).click();
    await expect(this.tierList.openMenus).toHaveCount(0);
    await this.tierList.settled();
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
    await changeAndWaitForLink(this.page, () => this.chooseOpenRowOption(option));
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
    await this.tierList.settled();
  }

  /** Chooses an option of the open Row options menu with the keyboard, and waits until the menu closes. */
  private async chooseOpenRowOption(option: Locator) {
    await option.focus();
    await expect(option).toBeFocused();
    await this.page.keyboard.press('Enter');
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  /** Removes the top row with Row options › Remove a row, and returns once its link is written. */
  async removeFirstTierRow() {
    const before = this.page.url();
    const rows = await this.openRemoveRowMenu();
    await rows.first().click();
    await expect(this.page, 'the shareable link should update').not.toHaveURL(before);
  }

  /**
   * Chooses a row count in Row options, and returns once the page has settled. The count the list
   * has already changes nothing when the rows are the template's, so this waits for no new link.
   */
  async chooseRowCountAndSettle(count: RowCount) {
    await this.openRowOptions();
    await this.rowOption(`${count} Rows`).click();
    await expect(this.tierList.openMenus).toHaveCount(0);
    await this.tierList.settled();
  }
}

export type RowCount = 3 | 5 | 7;

export type LabelPosition = 'Left' | 'Right' | 'Top';

/** The tile sizes in the Row options menu (the dense editor). */
export type TileSizeName = 'Comfortable' | 'Compact';
