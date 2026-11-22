import {expect, type Locator, type Page} from '@playwright/test';
import type {TierListPage} from './tier-list-page';

export class CommunityTemplates {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  get dialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Community templates'});
  }

  get addressField(): Locator {
    return this.dialog.getByRole('textbox', {name: 'Index address'});
  }

  get checkButton(): Locator {
    return this.dialog.getByRole('button', {name: 'Check index'});
  }

  get indexToAdd(): Locator {
    return this.dialog.getByRole('group', {name: 'Index to add'});
  }

  get yourIndices(): Locator {
    return this.dialog.getByRole('region', {name: 'Your indices'});
  }

  get alerts(): Locator {
    return this.dialog.getByRole('alert');
  }

  get listedTemplates(): Locator {
    return this.dialog.getByRole('region', {name: /^Templates listed by /}).getByRole('listitem').getByRole('button');
  }

  listedBy(source: string): Locator {
    return this.dialog.getByRole('region', {name: `Templates listed by ${source}`});
  }

  template(title: string): Locator {
    return this.dialog.getByRole('region', {name: /^Templates listed by /}).getByRole('button', {name: title, exact: true});
  }

  get gettingStatus(): Locator {
    return this.dialog.getByRole('status').filter({hasText: 'Getting'});
  }

  async open() {
    await this.tierList.items.openTemplatePicker();
    await this.tierList.items.templatePicker.getByRole('button', {name: 'Community templates'}).click();
    await expect(this.dialog).toBeVisible();
  }

  focusIsInDialog(): Promise<boolean> {
    return this.dialog.evaluate((dialog) => dialog.contains(document.activeElement));
  }

  async cancelGetting() {
    await this.gettingStatus.getByRole('button', {name: 'Cancel'}).click();
  }

  async checkIndex(address: string) {
    await this.addressField.fill(address);
    await this.checkButton.click();
  }

  async addIndex(address: string) {
    await this.checkIndex(address);
    await this.indexToAdd.getByRole('button', {name: 'Add index'}).click();
    await expect(this.indexToAdd).toBeHidden();
  }

  async removeIndex(source: string) {
    await this.yourIndices.getByRole('button', {name: `Remove the index ${source}`}).click();
  }

  async search(text: string) {
    await this.dialog.getByRole('searchbox', {name: 'Search templates'}).fill(text);
  }

  async refresh() {
    await this.dialog.getByRole('button', {name: 'Refresh'}).click();
  }

  async close() {
    await this.page.keyboard.press('Escape');
    await expect(this.dialog).toBeHidden();
  }

  storedIndices(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('otb-template-indices'));
  }

  injectedMarkupRan(): Promise<boolean> {
    return this.page.evaluate(() => '__otbInjected' in window);
  }

  connectTo(address: string): Promise<'answered' | 'refused'> {
    return this.page.evaluate(async (url) => {
      try {
        await fetch(url, {mode: 'no-cors'});
        return 'answered';
      } catch {
        return 'refused';
      }
    }, address);
  }
}
