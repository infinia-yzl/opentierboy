import {expect, type Locator, type Page} from '@playwright/test';
import {letToastTimeOut} from '../support/page-clock';
import {changeAndWaitForLink} from './helpers';
import {letClosedToastLeave} from './toasts';
import type {TierListPage} from './tier-list-page';

/**
 * Pictures from the device, kept in this browser: the "From your device" dialog, pasted pictures,
 * the device image store and old uploads.
 *
 * docs/reference/images.md. Product rule 5: a device image never reaches the server.
 *
 * Specs reach it as `tierList.deviceImages` (TierListPage.deviceImages).
 */
export class DeviceImages {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
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

  /** The "From your device" dialog. */
  get uploadDialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Add New Items'});
  }

  /** Opens "From your device" and leaves its dialog open. */
  async openUploadDialog() {
    await this.tierList.items.openItemsMenu();
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
    await this.tierList.items.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From your device'}).click();
    const dialog = this.page.getByRole('dialog', {name: 'Add New Items'});
    await dialog.getByLabel('Upload Images').setInputFiles(files);
    return dialog;
  }

  /**
   * How many item images show an upload from this browser (a loaded `blob:` image).
   */
  async loadedUploadImageCount(): Promise<number> {
    return this.tierList.main.getByRole('img').evaluateAll((images) => images.filter((image) => (
      image instanceof HTMLImageElement && image.currentSrc.startsWith('blob:') && image.complete && image.naturalWidth > 0
    )).length);
  }

  /**
   * Scrolls an item into view and tells whether its tile shows an upload from this browser (a
   * loaded `blob:` image), rather than a placeholder or its name only. Use it with expect.poll().
   */
  async itemShowsUpload(name: string): Promise<boolean> {
    const image = this.tierList.item(name).getByRole('img');
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

  /**
   * Keeps old uploads in localStorage, as the app kept them before Phase 5c. Writes them on the
   * landing page, which does not open the device image store, so the next editor page moves them.
   */
  async keepOldUploads(uploads: {id: string; label: string; png: Buffer}[]) {
    await this.page.goto('/');
    const entries = uploads.map(({id, label, png}) => ({i: id, c: label, d: `data:image/png;base64,${png.toString('base64')}`}));
    await this.page.evaluate((value) => localStorage.setItem('customItems', value), JSON.stringify(entries));
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

  /**
   * Pastes image files into the editor (or into `target`, for example a text field), as a paste
   * from the clipboard would. The test builds the paste event: browsers do not let tests write
   * images to the real clipboard. Firefox ignores the files in such an event, so paste tests skip
   * Firefox (SCRIPTED_PASTE_SKIP).
   */
  async pasteImages(files: {name: string; mimeType: string; buffer: Buffer}[], target?: Locator) {
    // A target (such as a text field the test typed into) proves the page has started already.
    if (!target) await this.tierList.settled();
    await (target ?? this.tierList.main).evaluate((element, payload) => {
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
    await this.tierList.settled();
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

  /** Uploads pictures from the device, and returns once the link holds them. */
  async addItemsFromDeviceAndWaitForLink(files: DeviceFiles) {
    await changeAndWaitForLink(this.page, () => this.addItemsFromDevice(files));
  }

  /**
   * Pastes groups of pictures at once while the device image store is held (holdDeviceStore), so
   * the first picture is still being stored and the others wait their turn, then leaves for the
   * landing page. The store is let go once the landing page shows.
   */
  async leaveWhilePastesWait(groups: {name: string; mimeType: string; buffer: Buffer}[][]) {
    const hold = await this.holdDeviceStore();
    try {
      await this.pasteImagesAtOnce(groups);
      await this.tierList.leaveForHome();
    } finally {
      await hold.release();
    }
  }

  /**
   * Holds the device image store until `release`, as a slow disk would: a transaction of the
   * test on its IndexedDB database stays open, so the editor's own transactions wait behind it.
   * Call it once the editor has started (it opens the store as it starts).
   */
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
        // A transaction ends once it has no request left: ask again until the test lets go.
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

  /** The toast "Items Added" with its Undo, which every way of adding items shows. */
  get itemsAddedToast(): Locator {
    return this.tierList.toast('Items Added');
  }

  /**
   * Uploads pictures from the device, and returns once the link holds them, with the pointer
   * resting on the toast "Items Added": the toast waits while the pointer is on it, so it stays
   * until the next action, however long the checks take.
   */
  async addItemsFromDeviceAndHoldToast(files: DeviceFiles) {
    await changeAndWaitForLink(this.page, () => this.addItemsFromDevice(files));
    await this.itemsAddedToast.hover();
  }

  /** Lets the toast "Items Added" close by itself (after 4 s, on the page clock: `pageClock`). */
  async waitOutItemsAddedToast() {
    await letToastTimeOut(this.page, this.itemsAddedToast);
  }

  /** Chooses Undo in the toast "Items Added", and returns once the link changed and the toast left (letClosedToastLeave). */
  async undoAddedItemsAndLetToastLeave() {
    const before = this.page.url();
    await this.itemsAddedToast.getByRole('button', {name: 'Undo'}).click();
    await expect(this.page, 'Undo should write a new link').not.toHaveURL(before);
    await letClosedToastLeave(this.page, this.itemsAddedToast);
  }
}

/** Files for the file picker: paths, or files made in the test. */
type DeviceFiles = string[] | {name: string; mimeType: string; buffer: Buffer}[];
