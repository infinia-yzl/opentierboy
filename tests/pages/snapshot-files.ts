import {expect, type Locator, type Page, type Route} from '@playwright/test';
import {changeAndWaitForLink, startedAndIdle} from './helpers';
import {toasts} from './toasts';
import type {TierListPage} from './tier-list-page';

/**
 * Snapshot files: opening a file (the menu item, a dropped or pasted file), the dialog "Open the
 * list in this file?", and the server's held answers while a list opens.
 *
 * docs/reference/snapshot-files.md. Freeze Frame, which makes the files, is in share-panel.ts.
 *
 * Specs reach it as `tierList.files` (TierListPage.files).
 */
export class SnapshotFiles {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  /** "Open the list in this file?", after opening a snapshot file. */
  get openListDialog(): Locator {
    return this.page.getByRole('alertdialog', {name: 'Open the list in this file?'});
  }

  /** Pastes a file where the focus is, the way a browser does, without waiting for anything. */
  async pasteFileNow(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.page.evaluate(({name, mimeType, base64}) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
  }

  /**
   * Sends several paste and drop events at once, in order, each with one file: as when a
   * visitor pastes and drops quickly, before the editor has handled the first one. Firefox
   * drops the files of a scripted paste (SCRIPTED_PASTE_SKIP).
   */
  async sendFileEventsAtOnce(events: {event: 'paste' | 'drop'; file: {name: string; mimeType: string; buffer: Buffer}}[]) {
    await this.tierList.settled();
    await this.tierList.main.evaluate((_main, payload) => {
      for (const {event, name, mimeType, base64} of payload) {
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
        const init = {bubbles: true, cancelable: true};
        document.body.dispatchEvent(event === 'paste'
          ? new ClipboardEvent('paste', {...init, clipboardData: data})
          : new DragEvent('drop', {...init, dataTransfer: data}));
      }
    }, events.map(({event, file}) => ({event, name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')})));
  }

  /**
   * Chooses a file with "Open a Freeze Frame…" in the Add images menu, as the file chooser
   * would. Pass `waitForEditor: false` when the test already waited for the editor
   * (settled), for example to time the opening.
   */
  async openFile(file: {name: string; mimeType: string; buffer: Buffer}, {waitForEditor = true} = {}) {
    if (waitForEditor) await this.tierList.settled();
    const chooser = this.page.waitForEvent('filechooser');
    await this.tierList.manageItemsButton.click();
    await this.page.getByRole('menuitem', {name: 'Open a Freeze Frame…'}).click();
    await (await chooser).setFiles(file);
  }

  /**
   * Drops a file onto the editor's first row, as dragging it from the desktop would. With
   * `onto`, it drops onto that element instead (for example an open menu or dialog), without
   * waiting for the editor first.
   */
  async dropFile(file: {name: string; mimeType: string; buffer: Buffer}, {onto}: {onto?: Locator} = {}) {
    if (!onto) await this.tierList.settled();
    const transfer = await this.page.evaluateHandle(({name, mimeType, base64}) => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      return data;
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
    const element = onto ?? this.tierList.tiers.first();
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
    await element.dispatchEvent('drop', {dataTransfer: transfer});
  }

  /**
   * Confirms "Open the list in this file?" and waits until the list's link is in the address bar:
   * the dialog says "Opening the list…" until then. With `newAddress: false` (the address already
   * shows that list), it waits until the opening has finished instead.
   */
  async confirmOpenList({newAddress = true} = {}) {
    const before = this.page.url();
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect(this.openListDialog).toBeHidden();
    if (newAddress) await expect(this.page, 'the list of the file should open').not.toHaveURL(before);
    await expect(this.tierList.tiers.first()).toBeVisible();
  }

  /** Clicks Open list and leaves the dialog to open the list (it says "Opening the list…"). */
  async startOpeningList() {
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect(this.openListDialog).toContainText('Opening the list…');
  }

  /**
   * Chooses a file with "Open a Freeze Frame…" and returns how long the page took, measured in the page,
   * from receiving the file until a toast with `text` appeared (milliseconds). Playwright's own
   * waiting is not part of the time.
   */
  async timeToOpenFile(file: {name: string; mimeType: string; buffer: Buffer}, text: string): Promise<number> {
    await this.tierList.settled();
    await this.page.evaluate((expected) => {
      const timing: {start?: number; end?: number} = {};
      (window as unknown as {__openFileTiming: typeof timing}).__openFileTiming = timing;
      document.addEventListener('change', () => {
        timing.start ??= performance.now();
      }, {capture: true, once: true});
      const observer = new MutationObserver(() => {
        if (timing.start !== undefined && document.body.textContent?.includes(expected)) {
          timing.end = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, {childList: true, subtree: true, characterData: true});
    }, text);
    await this.openFile(file, {waitForEditor: false});
    await expect(this.tierList.toast(text)).toBeVisible();
    return this.page.evaluate(() => {
      const timing = (window as unknown as {__openFileTiming: {start?: number; end?: number}}).__openFileTiming;
      return (timing.end ?? Number.NaN) - (timing.start ?? Number.NaN);
    });
  }

  async cancelOpenList() {
    await this.openListDialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(this.openListDialog).toBeHidden();
  }

  /**
   * Holds the server's answers to navigations to /rank pages (the request a router.push to an
   * editor address of another page makes; prefetches pass), as on a very slow connection, until
   * `release`. `isHolding` turns true once a navigation is held. A change to the list makes no
   * request: the editor writes the address itself.
   */
  async holdRankPages(): Promise<HeldRankPages> {
    let open!: () => void;
    const released = new Promise<void>((resolve) => {
      open = resolve;
    });
    let holding = false;
    const handled: Promise<void>[] = [];
    const hold = async (route: Route) => {
      const request = route.request();
      const headers = request.headers();
      const navigation = headers['rsc'] === '1' && !headers['next-router-prefetch'] && !headers['next-router-segment-prefetch']
        && new URL(request.url()).pathname.startsWith('/rank');
      if (!navigation) return route.fallback();
      holding = true;
      await released;
      // The page may have dropped the request meanwhile (the visitor left): nothing to answer then.
      await route.fallback().catch(() => undefined);
    };
    const handler = (route: Route) => {
      const done = hold(route);
      handled.push(done);
      return done;
    };
    await this.page.route('**/*', handler);
    return {
      isHolding: () => holding,
      release: async () => {
        open();
        await Promise.all(handled);
        await this.page.unroute('**/*', handler);
      },
    };
  }

  /** Waits until the dialog "Open the list in this file?" has closed or says "Opening the list…". */
  private async untilOpenListDialogClosesOrOpens() {
    await expect(this.openListDialog.filter({hasNotText: 'Opening the list…'}), 'the dialog should close or say "Opening the list…"')
      .toHaveCount(0);
  }

  /**
   * Chooses Cancel in "Open the list in this file?" with the keyboard (Playwright does not click
   * a button that says aria-disabled, as Cancel does while the list opens; a person still can).
   * Returns once the dialog closed, or once it says "Opening the list…".
   */
  async chooseCancelInOpenListDialog() {
    const cancel = this.openListDialog.getByRole('button', {name: 'Cancel'});
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await this.page.keyboard.press('Enter');
    await this.untilOpenListDialogClosesOrOpens();
  }

  /** Presses Escape in "Open the list in this file?". Returns once it closed, or once it says "Opening the list…". */
  async pressEscapeInOpenListDialog() {
    await this.page.keyboard.press('Escape');
    await this.untilOpenListDialogClosesOrOpens();
  }

  /**
   * Clicks Open list with the server's answers held (holdRankPages), for a list file of another
   * template path: the list opens on another page. Returns the hold once the navigation is held
   * and the dialog says "Opening the list…", or null once the dialog closed (the list opened
   * without a request).
   */
  async clickOpenListWithServerHeld(): Promise<HeldRankPages | null> {
    const hold = await this.holdRankPages();
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect.poll(async () => hold.isHolding() || !(await this.openListDialog.isVisible()), {
      message: 'the navigation should reach the server, or the dialog close',
    }).toBe(true);
    if (hold.isHolding()) {
      await expect(this.openListDialog).toContainText('Opening the list…');
      return hold;
    }
    await hold.release();
    return null;
  }

  /** Lets the server answer the held navigation of an opening list, and waits until the list is in the address. */
  async answerHeldRankPage(hold: HeldRankPages) {
    const before = this.page.url();
    await hold.release();
    await expect(this.openListDialog).toBeHidden();
    await expect(this.page, 'the list of the file should open').not.toHaveURL(before);
  }

  /**
   * Returns once the address changed (a picture was added) or a dialog shows, where a paste or a
   * drop changes nothing.
   */
  private async untilAddressChangesOrDialogShows(before: string) {
    await expect.poll(async () => this.page.url() !== before || await this.openListDialog.isVisible(), {
      message: 'the link should change, unless a dialog shows',
    }).toBe(true);
  }

  /**
   * Pastes a file where the focus is, as Ctrl+V does: into the editor, or into the dialog when one
   * shows. Returns once the link changed, or at once while a dialog shows. Firefox drops the files
   * of a scripted paste (SCRIPTED_PASTE_SKIP).
   */
  async pasteFileWhereFocused(file: {name: string; mimeType: string; buffer: Buffer}) {
    const before = this.page.url();
    await this.page.evaluate(({name, mimeType, base64}) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
    await this.untilAddressChangesOrDialogShows(before);
  }

  /**
   * Drops a file where the pointer is: on the editor's first row, or on the dialog when one shows
   * (it covers the page). Returns once the link changed, or at once while a dialog shows.
   */
  async dropFileWherePointed(file: {name: string; mimeType: string; buffer: Buffer}) {
    const before = this.page.url();
    // The dialog shows once a dropped list file has been read, which keeps the page busy, and it
    // stays until the visitor answers it: once it shows or the page has settled, one look tells.
    await expect.poll(async () => await this.openListDialog.isVisible() || await startedAndIdle(this.tierList.main), {
      message: 'the dialog should show, or the page settle',
    }).toBe(true);
    if (await this.openListDialog.isVisible()) await this.dropFile(file, {onto: this.openListDialog});
    else await this.dropFile(file);
    await this.untilAddressChangesOrDialogShows(before);
  }

  /** Chooses a picture with "Open a Freeze Frame…" and returns once the link holds it. */
  async openFileAndWaitForLink(file: {name: string; mimeType: string; buffer: Buffer}) {
    await changeAndWaitForLink(this.page, () => this.openFile(file));
  }

  /** Chooses a file with "Open a Freeze Frame…", and returns once the dialog "Open the list in this file?" shows. */
  async openFileAndWaitForDialog(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.openFile(file);
    await expect(this.openListDialog).toBeVisible();
  }

  /** The toasts on screen other than "Items Added", which each picture that is added shows: the messages. */
  get messageToasts(): Locator {
    return toasts(this.page).filter({hasNotText: 'Items Added'});
  }
}

/** The server's answers to navigations to /rank pages, held by TierListPage.holdRankPages. */
export interface HeldRankPages {
  /** True once a navigation is held. */
  readonly isHolding: () => boolean;
  /** Lets the server answer every held navigation, and stops holding. */
  readonly release: () => Promise<void>;
}
