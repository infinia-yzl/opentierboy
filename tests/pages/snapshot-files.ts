import {expect, type Locator, type Page, type Route} from '@playwright/test';
import {changeAndWaitForLink} from './helpers';
import {toasts} from './toasts';
import type {TierListPage} from './tier-list-page';

export class SnapshotFiles {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  get openListDialog(): Locator {
    return this.page.getByRole('alertdialog', {name: 'Open the list in this file?'});
  }

  async pasteFileNow(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.page.evaluate(({name, mimeType, base64}) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
  }

  async sendFileEventsAtOnce(events: {event: 'paste' | 'drop'; file: {name: string; mimeType: string; buffer: Buffer}}[]) {
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

  async openFile(file: {name: string; mimeType: string; buffer: Buffer}) {
    const chooser = this.page.waitForEvent('filechooser');
    await this.tierList.manageItemsButton.click();
    await this.page.getByRole('menuitem', {name: 'Open a Freeze Frame…'}).click();
    await (await chooser).setFiles(file);
  }

  async dropFile(file: {name: string; mimeType: string; buffer: Buffer}, {onto}: {onto?: Locator} = {}) {
    const transfer = await this.page.evaluateHandle(({name, mimeType, base64}) => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      return data;
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
    const element = onto ?? this.tierList.tiers.first();
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
    await element.dispatchEvent('drop', {dataTransfer: transfer});
  }

  async confirmOpenList({newAddress = true} = {}) {
    const before = this.page.url();
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect(this.openListDialog).toBeHidden();
    if (newAddress) await expect(this.page, 'the list of the file should open').not.toHaveURL(before);
    await expect(this.tierList.tiers.first()).toBeVisible();
  }

  async timeToOpenFile(file: {name: string; mimeType: string; buffer: Buffer}, text: string): Promise<number> {
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
    await this.openFile(file);
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
        if (!this.page.isClosed()) await this.page.unroute('**/*', handler);
      },
    };
  }

  private async untilOpenListDialogClosesOrOpens() {
    await expect(this.openListDialog.filter({hasNotText: 'Opening the list…'}), 'the dialog should close or say "Opening the list…"')
      .toHaveCount(0);
  }

  async chooseCancelInOpenListDialog() {
    const cancel = this.openListDialog.getByRole('button', {name: 'Cancel'});
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await this.page.keyboard.press('Enter');
    await this.untilOpenListDialogClosesOrOpens();
  }

  async pressEscapeInOpenListDialog() {
    await this.page.keyboard.press('Escape');
    await this.untilOpenListDialogClosesOrOpens();
  }

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

  private async untilAddressChangesOrDialogShows(before: string) {
    await expect.poll(async () => this.page.url() !== before || await this.openListDialog.isVisible(), {
      message: 'the link should change, unless a dialog shows',
    }).toBe(true);
  }

  async pasteFileWhereFocused(file: {name: string; mimeType: string; buffer: Buffer}) {
    const before = this.page.url();
    await this.page.evaluate(({name, mimeType, base64}) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
    await this.untilAddressChangesOrDialogShows(before);
  }

  async dropFileWherePointed(file: {name: string; mimeType: string; buffer: Buffer}) {
    const before = this.page.url();
    if (await this.openListDialog.isVisible()) await this.dropFile(file, {onto: this.openListDialog});
    else await this.dropFile(file);
    await this.untilAddressChangesOrDialogShows(before);
  }

  async openFileAndWaitForLink(file: {name: string; mimeType: string; buffer: Buffer}) {
    await changeAndWaitForLink(this.page, () => this.openFile(file));
  }

  async openFileAndWaitForDialog(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.openFile(file);
    await expect(this.openListDialog).toBeVisible();
  }

  get messageToasts(): Locator {
    return toasts(this.page).filter({hasNotText: 'Items Added'});
  }
}

export interface HeldRankPages {
  readonly isHolding: () => boolean;
  readonly release: () => Promise<void>;
}
