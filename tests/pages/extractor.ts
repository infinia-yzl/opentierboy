import {expect, type Locator, type Page} from '@playwright/test';
import {escapeRegExp} from '../support/regexp';
import type {TierListPage} from './tier-list-page';

export interface PictureFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

export interface PicturePoint {
  readonly x: number;
  readonly y: number;
}

export const EXTRACTOR_MENU_ITEM = 'Extract items from a picture…';

export class Extractor {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  get dialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Extract items from a picture'});
  }

  get menuItem(): Locator {
    return this.page.getByRole('menuitem', {name: EXTRACTOR_MENU_ITEM});
  }

  async open() {
    await this.tierList.items.openManageItemsMenu();
    await this.menuItem.click();
    await expect(this.dialog).toBeVisible();
  }

  async close() {
    await this.page.keyboard.press('Escape');
    await expect(this.dialog).toBeHidden();
  }

  get chooseButton(): Locator {
    return this.dialog.getByRole('button', {name: 'Choose a picture'});
  }

  async choosePicture(file: PictureFile) {
    const chooser = this.page.waitForEvent('filechooser');
    await this.chooseButton.click();
    await (await chooser).setFiles({name: file.name, mimeType: file.mimeType, buffer: file.buffer});
  }

  private async transfer(file: PictureFile) {
    return this.page.evaluateHandle(({name, mimeType, base64}) => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      return data;
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
  }

  async dropPicture(file: PictureFile) {
    const transfer = await this.transfer(file);
    await this.dialog.dispatchEvent('dragover', {dataTransfer: transfer});
    await this.dialog.dispatchEvent('drop', {dataTransfer: transfer});
  }

  async pastePicture(file: PictureFile) {
    await this.dialog.evaluate((dialog, {name, mimeType, base64}) => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      dialog.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
  }

  text(text: string | RegExp): Locator {
    return this.dialog.getByText(typeof text === 'string' ? new RegExp(`^${escapeRegExp(text)}$`) : text);
  }

  get alert(): Locator {
    return this.dialog.getByRole('alert');
  }

  get borderLayer(): Locator {
    return this.dialog.getByRole('group', {name: 'Item borders'});
  }

  get borders(): Locator {
    return this.borderLayer.getByRole('button', {name: /^Item \d+ of \d+$/});
  }

  border(number: number, total: number): Locator {
    return this.borderLayer.getByRole('button', {name: `Item ${number} of ${total}`, exact: true});
  }

  async borderBox(border: Locator): Promise<{x: number; y: number; width: number; height: number}> {
    const read = async (name: string) => Number(await border.getAttribute(name));
    return {x: await read('x'), y: await read('y'), width: await read('width'), height: await read('height')};
  }

  async borderSizes(): Promise<{width: number; height: number}[]> {
    const boxes = await Promise.all((await this.borders.all()).map((border) => this.borderBox(border)));
    return boxes.map(({width, height}) => ({width, height}));
  }

  get previewTiles(): Locator {
    return this.dialog.getByRole('button', {name: /^Select item \d+$/});
  }

  removeButton(number: number): Locator {
    return this.dialog.getByRole('button', {name: `Remove item ${number}`, exact: true});
  }

  get findOfSizeButton(): Locator {
    return this.dialog.getByRole('button', {name: 'Find items of this size'});
  }

  get sameSizeToggle(): Locator {
    return this.dialog.getByRole('button', {name: 'Same size for all'});
  }

  fitOption(name: 'Whole item' | 'Square cut'): Locator {
    return this.dialog.getByRole('group', {name: 'Fit'}).getByRole('button', {name});
  }

  async pressOnBorder(border: Locator, ...keys: string[]) {
    await border.focus();
    for (const key of keys) await this.page.keyboard.press(key);
  }

  async drawBorder(from: PicturePoint, to: PicturePoint, picture: {width: number; height: number}) {
    const box = await this.borderLayer.boundingBox();
    if (!box) throw new Error('The border layer is not on screen.');
    const at = (point: PicturePoint) => ({x: box.x + (point.x * box.width) / picture.width, y: box.y + (point.y * box.height) / picture.height});
    const start = at(from);
    const end = at(to);
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
    await this.page.mouse.move(end.x, end.y);
    await this.page.mouse.up();
  }

  get itemsTab(): Locator {
    return this.dialog.getByRole('tab', {name: '1 Items'});
  }

  get namesTab(): Locator {
    return this.dialog.getByRole('tab', {name: '2 Names'});
  }

  async openNames() {
    await this.namesTab.click();
    await expect(this.nameField).toBeFocused();
  }

  get nameField(): Locator {
    return this.dialog.getByRole('textbox', {name: 'Name'});
  }

  get nameStrip(): Locator {
    return this.dialog.getByRole('list', {name: 'Items'});
  }

  async typeName(name: string, key: 'Enter' | 'Shift+Enter' = 'Enter') {
    await expect(this.nameField).toBeFocused();
    await this.nameField.fill(name);
    await this.page.keyboard.press(key);
  }

  async pasteNames(text: string) {
    await expect(this.nameField).toBeFocused();
    await this.nameField.evaluate((field, pasted) => {
      const data = new DataTransfer();
      data.setData('text/plain', pasted);
      field.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
    }, text);
  }

  createButton(count?: number): Locator {
    const name = count === undefined ? /^Create a list with \d+ items?$/ : count === 1 ? 'Create a list with 1 item' : `Create a list with ${count} items`;
    return this.dialog.getByRole('button', {name});
  }

  async create(count: number) {
    const before = this.page.url();
    await this.createButton(count).click();
    await expect(this.dialog).toBeHidden();
    await expect(this.page, 'the new list should open in the address').not.toHaveURL(before);
    await this.tierList.ready();
  }
}
