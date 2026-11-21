import {expect, type Locator, type Page} from '@playwright/test';
import {boxOf, changeAndWaitForLink} from './helpers';
import type {TierListPage} from './tier-list-page';

export class Rows {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  tierNameInput(tierName: string): Locator {
    return this.tierList.tier(tierName).getByRole('textbox');
  }

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
    await changeAndWaitForLink(this.page, rename);
  }

  async typeTierName(currentName: string, newName: string): Promise<Locator> {
    const row = this.tierList.tier(currentName);
    await row.getByRole('heading', {name: currentName, exact: true}).click();
    const input = row.getByRole('textbox');
    await input.fill(newName);
    await expect(input, 'the text box should hold the typed name').toHaveValue(newName);
    return input;
  }

  async addTierRow() {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.addRowButton.click();
    });
  }

  async addTierRowAndGoBackInTheSameTask() {
    await this.tierList.addRowButton.evaluate((button: HTMLButtonElement) => {
      button.click();
      window.history.back();
    });
  }

  async removeTierRow(tierName: string) {
    const rows = await this.openRemoveRowMenu();
    await changeAndWaitForLink(this.page, () => rows.and(this.page.getByRole('menuitem', {name: tierName, exact: true})).click());
  }

  get removeRowMenuItem(): Locator {
    return this.page.getByRole('menuitem', {name: 'Remove a row'});
  }

  async openRowOptions() {
    await expect(this.tierList.openMenus, 'no menu should be open before Row options opens').toHaveCount(0);
    await this.tierList.rowOptionsButton.click();
    await expect(this.removeRowMenuItem).toBeVisible();
  }

  async openRemoveRowMenu(): Promise<Locator> {
    await this.openRowOptions();
    await this.removeRowMenuItem.click();
    const submenu = this.page.getByRole('menu').filter({hasNot: this.removeRowMenuItem});
    const rows = submenu.getByRole('menuitem');
    await expect(rows.first()).toBeVisible();
    await this.movePointerIntoSubmenu(this.removeRowMenuItem, submenu);
    return rows;
  }

  private async movePointerIntoSubmenu(trigger: Locator, submenu: Locator) {
    await expect(submenu).toHaveAttribute('data-side', /^(left|right)$/);
    const side = await submenu.getAttribute('data-side');
    const from = await boxOf(trigger);
    const y = from.y + from.height / 2;
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

  async chooseLabelPosition(position: LabelPosition) {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: position, exact: true}).click();
    });
  }

  async setItemLabelsVisible(visible: boolean) {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.rowOptionsButton.click();
      await this.page.getByRole('menuitemradio', {name: visible ? 'Show Labels' : 'Hide Labels'}).click();
    });
  }

  rowOption(name: string): Locator {
    return this.page.getByRole('menu').getByRole('menuitemradio', {name, exact: true});
  }

  async tierLabelIsAbove(tierName: string, itemName: string): Promise<boolean> {
    const label = await this.tierList.tier(tierName).getByRole('heading', {name: tierName}).boundingBox();
    const item = await this.tierList.item(itemName).boundingBox();
    return !!(label && item && label.y + label.height <= item.y + 0.5);
  }

  async chooseTileSize(name: TileSizeName) {
    await this.openRowOptions();
    await this.chooseTileSizeInOpenMenu(name, () => this.rowOption(name).click());
  }

  private async chooseTileSizeInOpenMenu(name: TileSizeName, choose: () => Promise<void>) {
    const turnsLabelsOff = name === 'Compact' && (await this.rowOption('Show Labels').getAttribute('aria-checked')) === 'true';
    const before = this.page.url();
    await choose();
    await expect(this.tierList.openMenus).toHaveCount(0);
    if (turnsLabelsOff) await expect(this.page, 'Compact should turn Show Labels off in the link').not.toHaveURL(before);
  }

  async chooseLabelPositionWithKeyboard(position: LabelPosition) {
    await this.chooseRowOptionWithKeyboard(this.page.getByRole('menuitemradio', {name: position, exact: true}));
  }

  async setItemLabelsVisibleWithKeyboard(visible: boolean) {
    await this.chooseRowOptionWithKeyboard(this.page.getByRole('menuitemradio', {name: visible ? 'Show Labels' : 'Hide Labels'}));
  }

  private async chooseRowOptionWithKeyboard(option: Locator) {
    await this.openRowOptions();
    await changeAndWaitForLink(this.page, () => this.chooseOpenRowOption(option));
  }

  async chooseTileSizeWithKeyboard(name: TileSizeName) {
    await this.openRowOptions();
    await this.chooseTileSizeInOpenMenu(name, () => this.chooseOpenRowOption(this.rowOption(name)));
  }

  private async chooseOpenRowOption(option: Locator) {
    await option.focus();
    await expect(option).toBeFocused();
    await this.page.keyboard.press('Enter');
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  async removeFirstTierRow() {
    const before = this.page.url();
    const rows = await this.openRemoveRowMenu();
    await rows.first().click();
    await expect(this.page, 'the shareable link should update').not.toHaveURL(before);
  }

  async chooseRowCountAndWaitForRows(count: RowCount) {
    await this.openRowOptions();
    await this.rowOption(`${count} Rows`).click();
    await expect(this.tierList.openMenus).toHaveCount(0);
    await expect(this.tierList.tiers).toHaveCount(count + 1);
  }
}

export type RowCount = 3 | 5 | 7;

export type LabelPosition = 'Left' | 'Right' | 'Top';

export type TileSizeName = 'Comfortable' | 'Compact';
