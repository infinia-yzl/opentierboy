import {expect, type Locator, type Page} from '@playwright/test';
import {type HeldImageSite} from '../support/image-sites';
import {changeAndWaitForLink} from './helpers';
import type {TierListPage} from './tier-list-page';

/**
 * Images from web addresses: the "From a link" dialog, addresses dropped or pasted as text, and the notice that asks before images of other sites load.
 *
 * docs/reference/images.md. Tests play the image sites with tests/support/image-sites.ts.
 *
 * Specs reach it as `tierList.linkImages` (TierListPage.linkImages).
 */
export class LinkImages {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  /** The "From a link" dialog. */
  get linkImageDialog(): Locator {
    return this.page.getByRole('dialog', {name: 'Add an Image from a Link'});
  }

  /** Opens "From a link" in the Add images menu, and waits for its dialog. */
  async openLinkImageDialog() {
    await this.tierList.items.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From a link'}).click();
    await expect(this.linkImageDialog).toBeVisible();
  }

  /** Opens "From a link", fills in the address (and a name), and presses the add button. Leaves the dialog open. */
  async submitLinkImage(address: string, name?: string) {
    await this.openLinkImageDialog();
    await this.submitInLinkImageDialog(address, name);
  }

  /**
   * In the open "From a link" dialog (for example after an address it refused), fills in the
   * address (and a name) and presses the add button. Leaves the dialog open.
   */
  async submitInLinkImageDialog(address: string, name?: string) {
    const dialog = this.linkImageDialog;
    await dialog.getByLabel('Image address').fill(address);
    if (name !== undefined) await dialog.getByLabel('Name (optional)').fill(name);
    await dialog.getByRole('button', {name: /^Add (Item|Anyway)$/}).click();
  }

  /** Closes the open "From a link" dialog with Escape. */
  async closeLinkImageDialog() {
    await expect(this.linkImageDialog).toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.linkImageDialog).toBeHidden();
  }

  /** Adds an image from a link and waits until the dialog has closed. */
  async addItemFromLink(address: string, name?: string) {
    await this.submitLinkImage(address, name);
    await expect(this.linkImageDialog).toBeHidden();
  }

  /** After an image failed its check: adds it anyway, as a label tile. */
  async confirmAddAnyway() {
    await this.linkImageDialog.getByRole('button', {name: 'Add Anyway'}).click();
    await expect(this.linkImageDialog).toBeHidden();
  }

  /** The message the "From a link" dialog shows about the address or the image. */
  get linkImageMessage(): Locator {
    return this.linkImageDialog.getByRole('alert');
  }

  /** The notice about images from sites that are not trusted, with [Load] and [Always allow these sites]. */
  get imageSitesNotice(): Locator {
    return this.page.getByRole('region', {name: 'Images from other sites'});
  }

  /** The sites the notice lists. */
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

  /**
   * The text an item's right-click (or long-press) menu shows about the image's site, if any.
   * The menu renders whole: once its last item, Delete, shows, the site line is there or not.
   */
  async itemImageSite(itemName: string): Promise<string | null> {
    await this.tierList.settled();
    await this.tierList.item(itemName).click({button: 'right'});
    const menu = this.page.getByRole('menu');
    await expect(menu.getByRole('menuitem', {name: 'Delete'})).toBeVisible();
    const lines = await menu.getByText(/^Image from /).allTextContents();
    await this.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return lines[0] ?? null;
  }

  /**
   * What a drag from another page carries, as text: `uriList` (a dragged link), `html` (an image
   * dragged from a page holds an `<img>`), `plain` (text). The test builds the drag events, as
   * for dropped files.
   */
  private async textTransfer(data: {uriList?: string; html?: string; plain?: string}) {
    return this.page.evaluateHandle(({uriList, html, plain}) => {
      const transfer = new DataTransfer();
      if (html !== undefined) transfer.setData('text/html', html);
      if (uriList !== undefined) transfer.setData('text/uri-list', uriList);
      if (plain !== undefined) transfer.setData('text/plain', plain);
      return transfer;
    }, data);
  }

  /** Drops links or text from another page onto the editor's first row. */
  async dropText(data: {uriList?: string; html?: string; plain?: string}) {
    await this.tierList.settled();
    const transfer = await this.textTransfer(data);
    const element = this.tierList.tiers.first();
    await element.dispatchEvent('dragenter', {dataTransfer: transfer});
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
    await element.dispatchEvent('drop', {dataTransfer: transfer});
  }

  /**
   * Fires a dragstart on an item that a handler on the item cancels, as a tile does for the
   * browser's own drag of its picture. No drag starts, so no dragend follows.
   */
  async fireCancelledDragStartOn(itemName: string) {
    await this.tierList.settled();
    await this.tierList.item(itemName).evaluate((element) => {
      element.addEventListener('dragstart', (event) => event.preventDefault(), {once: true});
      element.dispatchEvent(new DragEvent('dragstart', {bubbles: true, cancelable: true}));
    });
  }

  /** Drags a link from another page over the editor and keeps it there (no drop yet). */
  async dragLinkOver(address: string) {
    await this.tierList.settled();
    const transfer = await this.textTransfer({uriList: address, plain: address});
    const element = this.tierList.tiers.first();
    await element.dispatchEvent('dragenter', {dataTransfer: transfer});
    await element.dispatchEvent('dragover', {dataTransfer: transfer});
  }

  /** Moves the dragged link off the page again, as dragging it out of the window does. */
  async dragLinkAway(address: string) {
    const transfer = await this.textTransfer({uriList: address, plain: address});
    await this.tierList.tiers.first().dispatchEvent('dragleave', {dataTransfer: transfer});
  }

  /**
   * Pastes text into the editor, as pasting a copied image address does. The test builds the
   * paste event; Firefox drops the data of such an event (SCRIPTED_PASTE_SKIP).
   */
  async pasteText(text: string) {
    await this.tierList.settled();
    await this.tierList.main.evaluate((element, pasted) => {
      const transfer = new DataTransfer();
      transfer.setData('text/plain', pasted);
      element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, text);
  }

  /** Adds an image with "From a link", and returns once the link holds it. */
  async addItemFromLinkAndWaitForLink(address: string, name: string) {
    await changeAndWaitForLink(this.page, () => this.addItemFromLink(address, name));
  }

  /**
   * Reloads the page while an image site holds its answers (ImageSite.hold). Returns once the
   * editor shows the list and the page has settled or waits for the site, which keeps it busy.
   */
  async reloadWhileImageSiteHeld(site: HeldImageSite) {
    // Firefox fires the load event only once every picture on screen has loaded, and the site
    // holds the picture: the reload waits for the new page to start, not for its load event.
    await this.page.reload({waitUntil: 'commit'});
    await this.untilSettledOrWaitingFor(site);
  }

  /** Opens a tier list while an image site holds its answers (see reloadWhileImageSiteHeld). */
  async gotoWhileImageSiteHeld(path: string, state: string, site: HeldImageSite) {
    await this.page.goto(`${path}?state=${state}`, {waitUntil: 'commit'});
    await this.untilSettledOrWaitingFor(site);
  }

  private async untilSettledOrWaitingFor(site: HeldImageSite) {
    await expect(this.tierList.tiers.first()).toBeVisible();
    await expect.poll(async () => site.isHolding() || (await this.tierList.main.getAttribute('aria-busy')) !== 'true', {
      message: 'the page should settle or wait for the image site',
    }).toBe(true);
  }

  /**
   * Drops an image address on the first row, as a link dragged from another page, while the page
   * may be busy on purpose (dropText waits until it is not). Returns once the drop is sent: the
   * page takes it in the drop event. A drop is neither a click nor a key.
   */
  async dropImageAddressNow(address: string) {
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
  }

  /** The "Image address" field of the open "From a link" dialog. */
  get linkDialogAddressField(): Locator {
    return this.linkImageDialog.getByLabel('Image address');
  }

  /** The dialog's one button: "Add Item", "Checking the image…" or "Add Anyway". */
  get linkDialogButton(): Locator {
    return this.linkImageDialog.getByRole('button', {name: /^(Add Item|Add Anyway|Checking the image…)$/});
  }
}
