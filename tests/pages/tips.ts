import {expect, type BrowserContext, type Locator, type Page} from '@playwright/test';
import {expectSettled} from '../support/settled';
import {letToastTimeOut} from '../support/page-clock';
import {letClosedToastLeave, toasts} from './tier-list-page';

/** How long a tip's toast shows (components/EditorTips.tsx, TIP_TOAST_MS). */
const TIP_TOAST_MS = 10_000;

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

  /**
   * Turns the tips off in a browser context before its pages start, as "Hide tips" would. The
   * script runs in every frame, also in the copy of the page that Freeze Frame draws in a frame
   * without storage, where localStorage throws: those frames show no tips anyway.
   */
  static async turnOffIn(context: BrowserContext) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('otb-tips', JSON.stringify({seen: [], off: true}));
      } catch {
        // A frame without storage.
      }
    });
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
    return toasts(this.page).filter({hasText: LINK_SAVE_TITLE});
  }

  /** The toast of "your own images". */
  get deviceImagesToast(): Locator {
    return toasts(this.page).filter({hasText: DEVICE_IMAGES_TITLE});
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
    await expectSettled(this.page);
    await this.page.getByRole('button', {name: 'Show the tips again'}).click();
    await expect(toasts(this.page).filter({hasText: 'The tips will show again'})).toBeVisible();
  }

  // ---- Tips machines (tests/machines/tips.ts, tests/machines/tips-shared-list.ts) ----------

  /**
   * Leaves the site and empties this browser's storage (local storage, IndexedDB, cookies), so
   * the next page opens as in a browser that never visited OpenTierBoy. The tab and its page
   * clock stay.
   */
  async forgetThisBrowser() {
    await this.page.goto('about:blank');
    await this.page.context().setStorageState({cookies: [], origins: []});
  }

  /** The toast of the tip on screen (at most one shows). */
  get tipToast(): Locator {
    return this.linkSaveToast.or(this.deviceImagesToast);
  }

  /**
   * The toast of the tip on screen, by its title: the next tip's toast may take its place, and
   * an action waits for this one only.
   */
  private async shownTipToast(): Promise<Locator> {
    await expect(this.tipToast).toHaveCount(1);
    return await this.linkSaveToast.count() > 0 ? this.linkSaveToast : this.deviceImagesToast;
  }

  /** Closes the tip's toast with its close button. */
  async closeTipToast() {
    await this.closeToast(await this.shownTipToast());
  }

  /** Lets the tip's toast time out after 10 s (EditorTips.tsx, TIP_TOAST_MS), on the page clock (`pageClock`). */
  async waitOutTipToast() {
    await letToastTimeOut(this.page, await this.shownTipToast(), TIP_TOAST_MS);
  }

  /** What local storage keeps under `otb-tips`, or null. */
  async stored(): Promise<StoredTips | null> {
    const raw = await this.page.evaluate(() => localStorage.getItem('otb-tips'));
    return raw === null ? null : JSON.parse(raw) as StoredTips;
  }
}

// ---- Tips machine while page time stands still (`pageTime: 'paused'`) ----------------------

/** Closes the tip's toast with its close button, and returns once it left (letClosedToastLeave). */
export async function closeTipToastAndLetItLeave(tips: Tips) {
  await expect(tips.tipToast).toHaveCount(1);
  const toast = await tips.linkSaveToast.count() > 0 ? tips.linkSaveToast : tips.deviceImagesToast;
  await toast.getByRole('button', {name: 'Close toast'}).click();
  await letClosedToastLeave(tips.page, toast);
}

/** Presses "Hide tips" of the tip on screen, and returns once no tip shows: a toast tip has left (letClosedToastLeave). */
export async function hideTipsAndLetToastLeave(tips: Tips) {
  const toast = await tips.linkSaveToast.count() > 0 ? tips.linkSaveToast : tips.deviceImagesToast;
  const inToast = await toast.count() > 0;
  await tips.hideTipsButton().click();
  if (inToast) await letClosedToastLeave(tips.page, toast);
  await expect(tips.all).toHaveCount(0);
}
