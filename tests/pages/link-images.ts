import {expect, type Locator, type Page} from '@playwright/test';
import {changeAndWaitForLink} from './helpers';
import type {TierListPage} from './tier-list-page';

export class LinkImages {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  get linkImageDialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Add an Image from a Link'});
  }

  async openLinkImageDialog() {
    await this.tierList.items.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From a link'}).click();
    await expect(this.linkImageDialog).toBeVisible();
  }

  async submitLinkImage(address: string, name?: string) {
    await this.openLinkImageDialog();
    await this.submitInLinkImageDialog(address, name);
  }

  async submitInLinkImageDialog(address: string, name?: string) {
    const dialog = this.linkImageDialog;
    await dialog.getByLabel('Image address').fill(address);
    if (name !== undefined) await dialog.getByLabel('Name (optional)').fill(name);
    await dialog.getByRole('button', {name: /^Add (Item|Anyway)$/}).click();
  }

  async closeLinkImageDialog() {
    await expect(this.linkImageDialog).toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.linkImageDialog).toBeHidden();
  }

  async addItemFromLink(address: string, name?: string) {
    await this.submitLinkImage(address, name);
    await expect(this.linkImageDialog).toBeHidden();
  }

  async confirmAddAnyway() {
    await this.linkImageDialog.getByRole('button', {name: 'Add Anyway'}).click();
    await expect(this.linkImageDialog).toBeHidden();
  }

  get linkImageMessage(): Locator {
    return this.linkImageDialog.getByRole('alert');
  }

  get imageSitesNotice(): Locator {
    return this.page.getByRole('region', {name: 'Images from other sites'});
  }

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

  async itemImageSite(itemName: string): Promise<string | null> {
    await this.tierList.item(itemName).click({button: 'right'});
    const menu = this.page.getByRole('menu');
    await expect(menu.getByRole('menuitem', {name: 'Delete'})).toBeVisible();
    const lines = await menu.getByText(/^Image from /).allTextContents();
    await this.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return lines[0] ?? null;
  }

  private async textTransfer(data: {uriList?: string; html?: string; plain?: string}) {
    return this.page.evaluateHandle(({uriList, html, plain}) => {
      const transfer = new DataTransfer();
      if (html !== undefined) transfer.setData('text/html', html);
      if (uriList !== undefined) transfer.setData('text/uri-list', uriList);
      if (plain !== undefined) transfer.setData('text/plain', plain);
      return transfer;
    }, data);
  }

  async dropText(data: {uriList?: string; html?: string; plain?: string}) {
    const transfer = await this.textTransfer(data);
    const element = this.tierList.tiers.first();
    await element.dispatchEvent('dragenter', {dataTransfer: transfer});
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
    await element.dispatchEvent('drop', {dataTransfer: transfer});
  }

  async fireCancelledDragStartOn(itemName: string) {
    await this.tierList.item(itemName).evaluate((element) => {
      element.addEventListener('dragstart', (event) => event.preventDefault(), {once: true});
      element.dispatchEvent(new DragEvent('dragstart', {bubbles: true, cancelable: true}));
    });
  }

  async dragLinkOver(address: string) {
    const transfer = await this.textTransfer({uriList: address, plain: address});
    const element = this.tierList.tiers.first();
    await element.dispatchEvent('dragenter', {dataTransfer: transfer});
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
  }

  async dragLinkAway(address: string) {
    const transfer = await this.textTransfer({uriList: address, plain: address});
    await this.tierList.tiers.first().dispatchEvent('dragleave', {dataTransfer: transfer});
  }

  async pasteText(text: string) {
    await this.tierList.main.evaluate((element, pasted) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', pasted);
      element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, text);
  }

  async addItemFromLinkAndWaitForLink(address: string, name: string) {
    await changeAndWaitForLink(this.page, () => this.addItemFromLink(address, name));
  }

  async dropImageAddressAndWaitForItem(address: string, name: string) {
    await changeAndWaitForLink(this.page, async () => {
      const transfer = await this.page.evaluateHandle((uri) => {
        const data = new DataTransfer();
        data.setData('text/uri-list', uri);
        data.setData('text/plain', uri);
        return data;
      }, address);
      const row = this.tierList.tiers.first();
      await row.dispatchEvent('dragenter', {dataTransfer: transfer});
      await row.dispatchEvent('dragover', {dataTransfer: transfer});
      await row.dispatchEvent('drop', {dataTransfer: transfer});
      await expect(this.tierList.itemIn(this.tierList.unranked, name)).toBeVisible();
    });
  }

  get linkDialogAddressField(): Locator {
    return this.linkImageDialog.getByLabel('Image address');
  }

  get linkDialogButton(): Locator {
    return this.linkImageDialog.getByRole('button', {name: /^(Add Item|Add Anyway|Checking the image…)$/});
  }
}
