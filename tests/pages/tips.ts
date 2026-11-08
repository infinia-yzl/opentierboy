import {expect, type BrowserContext, type Locator, type Page} from '@playwright/test';

/** What local storage keeps under `otb-tips` (lib/tips/tips.ts). */
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

/**
 * Page object for the one-time tips of the editor (components/EditorTips.tsx): two lines in
 * the page (first drag, a shared list) and two toasts (the link is the save, your own images).
 * Each tip is a `status` region; Close and "Hide tips" are buttons.
 */
export class Tips {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Turns the tips off in a browser context before its pages start, as "Hide tips" would. */
  static async turnOffIn(context: BrowserContext) {
    await context.addInitScript(() => localStorage.setItem('otb-tips', JSON.stringify({seen: [], off: true})));
  }

  /** The first-drag tip, in the Unranked tray's hint line. */
  get firstDrag(): Locator {
    return this.page.getByRole('status').filter({hasText: FIRST_DRAG_MOUSE});
  }

  /** A part of the first-drag tip's words. */
  firstDragWords(words: string): Locator {
    return this.firstDrag.getByText(words);
  }

  /** The shared-list tip, under the title. */
  get sharedList(): Locator {
    return this.page.getByRole('status').filter({hasText: SHARED_LIST_TEXT});
  }

  /** The toast of "the link is the save". */
  get linkSaveToast(): Locator {
    return this.page.getByRole('listitem').filter({hasText: LINK_SAVE_TITLE});
  }

  /** The toast of "your own images". */
  get deviceImagesToast(): Locator {
    return this.page.getByRole('listitem').filter({hasText: DEVICE_IMAGES_TITLE});
  }

  /** Every tip that can be on screen. */
  get all(): Locator {
    return this.firstDrag.or(this.sharedList).or(this.linkSaveToast).or(this.deviceImagesToast);
  }

  /** The close button of the tip in the page (at most one shows). */
  get closeButton(): Locator {
    return this.page.getByRole('button', {name: 'Close tip'});
  }

  /** "Hide tips" of the tip in the page, or of a toast tip. */
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

  /** The toolbar's Share button, as the tips see it. */
  get shareButton(): Locator {
    return this.page.getByRole('group', {name: 'Editor tools'}).getByRole('button', {name: 'Share'});
  }

  /** The outline drawn around an element (Tailwind's ring is a box shadow), or 'none'. */
  async ringOf(element: Locator): Promise<string> {
    return element.evaluate((node) => getComputedStyle(node).boxShadow);
  }

  /** Opens About and presses "Show the tips again". */
  async showTipsAgainOnAbout() {
    await this.page.goto('/about');
    await this.page.getByRole('button', {name: 'Show the tips again'}).click();
    await expect(this.page.getByRole('listitem').filter({hasText: 'The tips will show again'})).toBeVisible();
  }

  /** What local storage keeps under `otb-tips`, or null. */
  async stored(): Promise<StoredTips | null> {
    const raw = await this.page.evaluate(() => localStorage.getItem('otb-tips'));
    return raw === null ? null : JSON.parse(raw) as StoredTips;
  }
}
