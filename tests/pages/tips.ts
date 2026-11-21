import {expect, type BrowserContext, type Locator, type Page} from '@playwright/test';
import {expectHydrated} from '../support/hydrated';
import {toasts} from './toasts';
import {UNTIL_STARTED} from './helpers';

export interface StoredTips {
  seen: string[];
  off: boolean;
}

export const LINK_SAVE_TITLE = "Your list lives in this page's address";
export const DEVICE_IMAGES_TITLE = 'Your images stay in this browser';
export const SHARED_LIST_TEXT = 'Someone shared this list with you. Your edits stay with you, and their list stays as they made it.';
export const FIRST_DRAG_MOUSE = 'Drag an image into a row to rank it';
export const FIRST_DRAG_TOUCH = 'Hold an image, then drag it into a row';
export const FIRST_DRAG_KEYBOARD = ', or press Space or Enter on an image';

export class Tips {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  static async turnOffIn(context: BrowserContext) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('otb-tips', JSON.stringify({seen: [], off: true}));
      } catch {
      }
    });
  }

  get firstDrag(): Locator {
    return this.page.getByRole('status').filter({hasText: FIRST_DRAG_MOUSE});
  }

  firstDragWords(words: string): Locator {
    return this.firstDrag.getByText(words);
  }

  get sharedList(): Locator {
    return this.page.getByRole('status').filter({hasText: SHARED_LIST_TEXT});
  }

  get linkSaveToast(): Locator {
    return toasts(this.page).filter({hasText: LINK_SAVE_TITLE});
  }

  get deviceImagesToast(): Locator {
    return toasts(this.page).filter({hasText: DEVICE_IMAGES_TITLE});
  }

  get all(): Locator {
    return this.firstDrag.or(this.sharedList).or(this.linkSaveToast).or(this.deviceImagesToast);
  }

  get closeButton(): Locator {
    return this.page.getByRole('button', {name: 'Close tip'});
  }

  hideTipsButton(toast?: Locator): Locator {
    return (toast ?? this.page).getByRole('button', {name: 'Hide tips'});
  }

  async close() {
    await this.closeButton.click();
    await expect(this.closeButton).toBeHidden();
  }

  async hideTips(toast?: Locator) {
    await this.hideTipsButton(toast).click();
    await expect(this.all).toHaveCount(0);
  }

  async closeToast(toast: Locator) {
    await toast.getByRole('button', {name: 'Close toast'}).click();
    await expect(toast).toBeHidden();
  }

  get shareButton(): Locator {
    return this.page.getByRole('group', {name: 'Editor tools'}).getByRole('button', {name: 'Share'});
  }

  async ringOf(element: Locator): Promise<string> {
    return element.evaluate((node) => getComputedStyle(node).boxShadow);
  }

  async showTipsAgainOnAbout() {
    await this.page.goto('/about', UNTIL_STARTED);
    await expectHydrated(this.page);
    await this.page.getByRole('button', {name: 'Show the tips again'}).click();
    await expect(toasts(this.page).filter({hasText: 'The tips will show again'})).toBeVisible();
  }

  async forgetThisBrowser() {
    await this.page.goto('about:blank');
    await this.page.context().setStorageState({cookies: [], origins: []});
  }

  get tipToast(): Locator {
    return this.linkSaveToast.or(this.deviceImagesToast);
  }

  private async shownTipToast(): Promise<Locator> {
    await expect(this.tipToast).toHaveCount(1);
    return await this.linkSaveToast.count() > 0 ? this.linkSaveToast : this.deviceImagesToast;
  }

  async closeTipToast() {
    await this.closeToast(await this.shownTipToast());
  }

  async stored(): Promise<StoredTips | null> {
    const raw = await this.page.evaluate(() => localStorage.getItem('otb-tips'));
    return raw === null ? null : JSON.parse(raw) as StoredTips;
  }
}

