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
    const row = rows.and(this.page.getByRole('menuitem', {name: tierName, exact: true}));
    await row.focus();
    await expect(row).toBeFocused();
    await changeAndWaitForLink(this.page, () => this.page.keyboard.press('Enter'));
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
    await this.removeRowMenuItem.focus();
    await this.page.keyboard.press('ArrowRight');
    const submenu = this.page.getByRole('menu').filter({hasNot: this.removeRowMenuItem});
    const rows = submenu.getByRole('menuitem');
    await expect(rows.first()).toBeFocused();
    return rows;
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
    return !!(label && item && label.y + label.height / 2 < item.y);
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
    await this.openRemoveRowMenu();
    await changeAndWaitForLink(this.page, () => this.page.keyboard.press('Enter'));
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
