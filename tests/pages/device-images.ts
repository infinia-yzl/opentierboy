import {expect, type Locator, type Page} from '@playwright/test';
import {letToastTimeOut} from '../support/page-clock';
import {changeAndWaitForLink, UNTIL_STARTED} from './helpers';
import {letClosedToastLeave} from './toasts';
import type {TierListPage} from './tier-list-page';

export class DeviceImages {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

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

  get uploadDialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Add New Items'});
  }

  async openUploadDialog() {
    await this.tierList.items.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From your device'}).click();
    await expect(this.uploadDialog).toBeVisible();
  }

  async addItemsFromDevice(files: DeviceFiles, {timeout}: {timeout?: number} = {}) {
    const dialog = await this.chooseFilesFromDevice(files);
    await dialog.getByRole('button', {name: /^Add \d+ Items?$/}).click();
    await expect(dialog).toBeHidden({timeout});
  }

  uploadPreview(name: string): Locator {
    return this.uploadDialog.getByRole('img', {name});
  }

  get uploadNoPreview(): Locator {
    return this.uploadDialog.getByText('No preview');
  }

  get uploadAddButton(): Locator {
    return this.uploadDialog.getByRole('button', {name: /^Add \d+ Items?$/});
  }

  get uploadError(): Locator {
    return this.uploadDialog.getByRole('alert');
  }

  async chooseFilesFromDevice(files: DeviceFiles): Promise<Locator> {
    await this.tierList.items.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From your device'}).click();
    const dialog = this.page.getByRole('dialog', {name: 'Add New Items'});
    await dialog.getByLabel('Upload Images').setInputFiles(files);
    return dialog;
  }

  async loadedUploadImageCount(): Promise<number> {
    return this.tierList.main.getByRole('img').evaluateAll((images) => images.filter((image) => (
      image instanceof HTMLImageElement && image.currentSrc.startsWith('blob:') && image.complete && image.naturalWidth > 0
    )).length);
  }

  async itemShowsUpload(name: string): Promise<boolean> {
    const image = this.tierList.item(name).getByRole('img');
    if ((await image.count()) === 0) return false;
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => img.currentSrc.startsWith('blob:') && img.complete && img.naturalWidth > 0);
  }

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

  async keepOldUploads(uploads: {id: string; label: string; png: Buffer}[]) {
    await this.page.goto('/', UNTIL_STARTED);
    const entries = uploads.map(({id, label, png}) => ({i: id, c: label, d: `data:image/png;base64,${png.toString('base64')}`}));
    await this.page.evaluate((value) => localStorage.setItem('customItems', value), JSON.stringify(entries));
  }

  async blockIndexedDb() {
    await this.page.addInitScript(() => Object.defineProperty(window, 'indexedDB', {get: () => {
      throw new DOMException('Blocked', 'SecurityError');
    }}));
  }

  async oldUploadIds(): Promise<string[]> {
    const stored = await this.page.evaluate(() => localStorage.getItem('customItems'));
    return stored === null ? [] : (JSON.parse(stored) as {i: string}[]).map((entry) => entry.i);
  }

  async evictedImageIds(): Promise<string[]> {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem('evictedDeviceImages') ?? '[]') as string[]);
  }

  async pasteImages(files: {name: string; mimeType: string; buffer: Buffer}[], target?: Locator) {
    await (target ?? this.tierList.main).evaluate((element, payload) => {
      const transfer = new DataTransfer();
      for (const file of payload) {
        const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0));
        transfer.items.add(new File([bytes], file.name, {type: file.mimeType}));
      }
      element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, files.map((file) => ({name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')})));
  }

  async pasteImagesAtOnce(groups: {name: string; mimeType: string; buffer: Buffer}[][]) {
    await this.tierList.main.evaluate((element, payload) => {
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

  async addItemsFromDeviceAndWaitForLink(files: DeviceFiles) {
    await changeAndWaitForLink(this.page, () => this.addItemsFromDevice(files));
  }

  async leaveWhilePastesWait(groups: {name: string; mimeType: string; buffer: Buffer}[][]) {
    const hold = await this.holdDeviceStore();
    try {
      await this.pasteImagesAtOnce(groups);
      await this.tierList.leaveForHome();
    } finally {
      await hold.release();
    }
  }

  async holdDeviceStore(): Promise<{release: () => Promise<void>}> {
    await this.page.evaluate(() => new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line no-restricted-globals -- a test holds the store, as a slow disk would
      const opening = indexedDB.open('opentierboy-device-images');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
        const store = transaction.objectStore(db.objectStoreNames[0]);
        const held = window as unknown as {deviceStoreHeld: boolean};
        held.deviceStoreHeld = true;
        const ask = () => {
          if (held.deviceStoreHeld) store.get('held by the test').onsuccess = ask;
        };
        transaction.oncomplete = () => db.close();
        ask();
        resolve();
      };
    }));
    return {
      release: async () => {
        await this.page.evaluate(() => {
          (window as unknown as {deviceStoreHeld: boolean}).deviceStoreHeld = false;
        }).catch(() => undefined);
      },
    };
  }

  get itemsAddedToast(): Locator {
    return this.tierList.toast('Items Added');
  }

  async addItemsFromDeviceAndHoldToast(files: DeviceFiles) {
    await changeAndWaitForLink(this.page, () => this.addItemsFromDevice(files));
    await this.itemsAddedToast.hover();
  }

  async waitOutItemsAddedToast() {
    await letToastTimeOut(this.page, this.itemsAddedToast);
  }

  async undoAddedItemsAndLetToastLeave() {
    const before = this.page.url();
    await this.itemsAddedToast.getByRole('button', {name: 'Undo'}).click();
    await expect(this.page, 'Undo should write a new link').not.toHaveURL(before);
    await letClosedToastLeave(this.page, this.itemsAddedToast);
  }
}

type DeviceFiles = string[] | {name: string; mimeType: string; buffer: Buffer}[];
