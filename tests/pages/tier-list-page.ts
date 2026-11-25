import {expect, type Locator, type Page, type Route} from '@playwright/test';
import {expectHydrated} from '../support/hydrated';
import {escapeRegExp} from '../support/regexp';
import {boxOf, changeAndWaitForLink, rowPhrase, UNTIL_STARTED} from './helpers';
import {toasts} from './toasts';
import {Rows} from './rows';
import {EditorItems} from './editor-items';
import {DragAndDrop} from './drag-and-drop';
import {LinkImages} from './link-images';
import {CommunityTemplates} from './community-templates';
import {DeviceImages} from './device-images';
import {SnapshotFiles} from './snapshot-files';
import {SharePanel} from './share-panel';
import {Zen} from './zen';

export interface Size {
  width: number;
  height: number;
}

const NOT_AN_ITEM = /^(?!Move (?:row |Row \d+$|Tier\b|the \d+ items? of )|Add images\b|(?:Template|Upload|Link|Hide tips|Close tip)$)/;

export const SCRIPTED_PASTE_SKIP = 'Firefox drops the files of a paste event made by a test (ClipboardEvent clipboardData).';
export const BLOB_TAB_SKIP = 'WebKit does not let a test open a blob: URL in a new tab.';

export interface SentRequest {
  method: string;
  url: string;
  body: Buffer;
}

export class TierListPage {
  readonly page: Page;
  readonly main: Locator;
  readonly title: Locator;
  readonly editTitleButton: Locator;
  readonly titleInput: Locator;
  readonly hints: Locator;
  readonly addImagesTile: Locator;
  readonly tiers: Locator;
  readonly editorTools: Locator;
  readonly rowOptionsButton: Locator;
  readonly addRowButton: Locator;
  readonly manageItemsButton: Locator;
  readonly shareButton: Locator;
  readonly zenModeToggle: Locator;
  readonly rows: Rows;
  readonly items: EditorItems;
  readonly drag: DragAndDrop;
  readonly linkImages: LinkImages;
  readonly templates: CommunityTemplates;
  readonly deviceImages: DeviceImages;
  readonly files: SnapshotFiles;
  readonly share: SharePanel;
  readonly zen: Zen;

  constructor(page: Page) {
    this.page = page;
    this.main = page.getByRole('main', {includeHidden: true});
    this.title = this.main.getByRole('heading', {level: 1});
    this.editTitleButton = this.main.getByRole('button', {name: 'Edit title'});
    this.titleInput = this.main.getByRole('textbox', {name: 'Title'});
    this.hints = this.main.getByText('Drag to reorder.');
    this.addImagesTile = this.main.getByRole('button', {name: 'Add images, drop or paste, to Unranked'});
    this.tiers = this.main.getByRole('group').filter({has: page.getByRole('heading', {level: 2})});
    this.editorTools = page.getByRole('group', {name: 'Editor tools'});
    this.rowOptionsButton = page.getByRole('button', {name: 'Row options'});
    this.addRowButton = page.getByRole('button', {name: 'Add row', exact: true});
    this.manageItemsButton = page.getByRole('button', {name: 'Add images', exact: true});
    this.shareButton = page.getByRole('button', {name: 'Share', exact: true});
    this.zenModeToggle = page.getByRole('button', {name: 'Zen', exact: true});
    this.rows = new Rows(this);
    this.items = new EditorItems(this);
    this.drag = new DragAndDrop(this);
    this.linkImages = new LinkImages(this);
    this.templates = new CommunityTemplates(this);
    this.deviceImages = new DeviceImages(this);
    this.files = new SnapshotFiles(this);
    this.share = new SharePanel(this);
    this.zen = new Zen(this);
  }

  async goto(path: string, state?: string) {
    await this.page.goto(state ? `${path}?state=${state}` : path, UNTIL_STARTED);
    await this.ready();
  }

  async gotoLink(link: string) {
    await this.page.goto(link, UNTIL_STARTED);
    await this.ready();
  }

  async gotoPageThatMayCrash(path: string, state: string) {
    await this.page.goto(`${path}?state=${state}`, UNTIL_STARTED);
    await expect.poll(async () => await this.crashMessage.isVisible() || await this.isReady(), {
      message: 'the page should crash, or show the editor ready to drag',
    }).toBe(true);
  }

  get crashMessage(): Locator {
    return this.page.getByRole('heading', {name: /Application error/});
  }

  async reload() {
    await this.page.reload(UNTIL_STARTED);
    await this.ready();
  }

  async reloadNow() {
    await this.page.reload();
  }

  async openAfterBlankPage(path: string, state: string, {onBlankPage}: {onBlankPage?: () => Promise<void>} = {}) {
    await this.page.goto('about:blank');
    await onBlankPage?.();
    await this.goto(path, state);
  }

  async openAsNewBrowser(path: string, state: string) {
    await this.page.goto('about:blank');
    await this.page.context().setStorageState({cookies: [], origins: []});
    await this.goto(path, state);
  }

  async ready() {
    await expectHydrated(this.page);
    await expect.poll(() => this.notReadyToDrag(), {
      message: 'every row grip and item tile should take a drag (role description "draggable")',
    }).toEqual([]);
  }

  async isReady(): Promise<boolean> {
    const hydrated = await this.page.locator('html').getAttribute('data-hydrated');
    return hydrated === 'true' && (await this.notReadyToDrag()).length === 0;
  }

  private async notReadyToDrag(): Promise<string[]> {
    const grips = this.main.getByRole('button', {name: /^Move (?!the \d+ items? of )/, includeHidden: true});
    if ((await grips.count()) === 0) return ['no row grip yet'];
    const rows = this.main.getByRole('group', {includeHidden: true}).filter({has: this.page.getByRole('heading', {level: 2, includeHidden: true})});
    const items = rows.getByRole('button', {name: NOT_AN_ITEM, includeHidden: true});
    return grips.or(items).evaluateAll((handles) => handles
      .filter((handle) => handle.getAttribute('aria-roledescription') !== 'draggable')
      .map((handle) => handle.getAttribute('aria-label') ?? ''));
  }

  async goBack() {
    await changeAndWaitForLink(this.page, async () => {
      await this.page.goBack(UNTIL_STARTED);
    });
    await this.readyWhereverItLands();
  }

  async goForward() {
    await this.page.goForward(UNTIL_STARTED);
    await this.readyWhereverItLands();
  }

  private async readyWhereverItLands() {
    await expectHydrated(this.page);
    if (new URL(this.page.url()).pathname.startsWith('/rank')) await this.ready();
  }

  async goBackNow() {
    await this.page.goBack({waitUntil: 'commit'});
  }

  async historyLength(): Promise<number> {
    return this.page.evaluate(() => window.history.length);
  }

  async countNewHistoryEntries(): Promise<() => Promise<number>> {
    const before = await this.historyLength();
    return async () => await this.historyLength() - before;
  }

  async shareLink(): Promise<string> {
    await expect(this.page).toHaveURL(/[?&]state=/);
    return this.page.url();
  }

  get homeLink(): Locator {
    return this.page.getByRole('banner').getByRole('link', {name: 'OpenTierBoy'});
  }

  async leaveForHome() {
    await this.homeLink.click();
    await expect(this.page).toHaveURL(/^[^?]*\/$/);
  }

  async clickHomeNow() {
    await this.homeLink.click();
  }

  async holdTripHome(): Promise<{release: () => Promise<void>}> {
    let open!: () => void;
    const released = new Promise<void>((resolve) => {
      open = resolve;
    });
    const handled: Promise<void>[] = [];
    const handler = (route: Route) => {
      const request = route.request();
      const headers = request.headers();
      const tripHome = headers['rsc'] === '1' && new URL(request.url()).pathname === '/';
      if (!tripHome) return route.fallback();
      const done = released.then(() => route.fallback().catch(() => undefined));
      handled.push(done);
      return done;
    };
    await this.page.route('**/*', handler);
    return {
      release: async () => {
        open();
        await Promise.all(handled);
        if (!this.page.isClosed()) await this.page.unroute('**/*', handler);
      },
    };
  }

  async closeBrowser() {
    await this.page.context().close();
  }

  tier(name: string): Locator {
    return this.main.getByRole('group', {name, exact: true});
  }

  get unranked(): Locator {
    return this.tier('Unranked');
  }

  tierLabel(tierName: string): Locator {
    return this.tier(tierName).getByRole('heading', {level: 2});
  }

  rowGrip(tierName: string): Locator {
    return this.main.getByRole('button', {name: `Move ${rowPhrase(tierName)}`, exact: true});
  }

  rowStack(tierName: string): Locator {
    const phrase = escapeRegExp(rowPhrase(tierName));
    return this.main.getByRole('button', {name: new RegExp(`^Move the \\d+ items? of ${phrase}$`)});
  }

  itemsIn(tier: string | Locator): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name: NOT_AN_ITEM});
  }

  item(name: string): Locator {
    return this.main.getByRole('button', {name, exact: true});
  }

  itemIn(tier: string | Locator, name: string): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name, exact: true});
  }

  get allItems(): Locator {
    return this.itemsIn(this.tiers);
  }

  async rowsReport(): Promise<string> {
    const rows = await this.tiers.all();
    const contents = await Promise.all(rows.map(async (row) => [
      await row.getAttribute('aria-label'),
      await this.itemsIn(row).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? '')),
    ]));
    return JSON.stringify({url: this.page.url(), rows: contents});
  }

  async itemNamesIn(tierName: string): Promise<string[]> {
    return this.itemsIn(tierName).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''));
  }

  async itemLines(tierName: string): Promise<string[][]> {
    const items = this.itemsIn(tierName);
    const boxes = await Promise.all((await items.all()).map(async (item) => ({
      name: (await item.getAttribute('aria-label')) ?? '',
      top: Math.round((await item.boundingBox())!.y),
    })));
    const tops = [...new Set(boxes.map((box) => box.top))].sort((a, b) => a - b);
    return tops.map((top) => boxes.filter((box) => box.top === top).map((box) => box.name));
  }

  async rowColours(): Promise<string[]> {
    const rows = await this.tiers.all();
    const colours = await Promise.all(rows.slice(0, -1).map((row) => row.evaluate((element) => getComputedStyle(element).backgroundImage)));
    return colours;
  }

  async tabOrderIn(tierName: string): Promise<string[]> {
    const row = this.tier(tierName);
    const first = row.getByRole('button').first();
    await first.focus();
    await this.page.keyboard.press('Shift+Tab');
    const names: string[] = [];
    for (;;) {
      await this.page.keyboard.press('Tab');
      const inRow = await row.evaluate((element) => element.contains(document.activeElement));
      if (!inRow) return names;
      names.push(await this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''));
    }
  }

  itemImage(name: string): Locator {
    return this.item(name).getByRole('img');
  }

  get allItemImages(): Locator {
    return this.tiers.getByRole('img');
  }

  itemCaption(name: string): Locator {
    return this.item(name).getByText(name, {exact: true});
  }

  itemNameTag(name: string): Locator {
    return this.item(name).getByRole('tooltip');
  }

  async hoverItem(name: string) {
    await this.item(name).hover();
  }

  async itemImageHasLoaded(name: string): Promise<boolean> {
    const image = this.itemImage(name);
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  }

  async itemImageCenterColor(name: string): Promise<[number, number, number] | null> {
    const image = this.item(name).getByRole('img');
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => {
      if (!img.complete || img.naturalWidth === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(img, 0, 0);
      const [red, green, blue] = context.getImageData(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1).data;
      return [red, green, blue] as [number, number, number];
    });
  }

  async itemShowsPlaceholder(name: string): Promise<boolean> {
    const image = this.itemImage(name);
    if ((await image.count()) === 0) return false;
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => (
      img.complete && img.naturalWidth > 0 && decodeURIComponent(img.currentSrc).includes('/placeholder-image.png')
    ));
  }

  async setTitle(newTitle: string) {
    await changeAndWaitForLink(this.page, async () => {
      const input = await this.typeTitle(newTitle);
      await input.press('Enter');
      await expect(this.title).toHaveText(newTitle);
    });
  }

  async typeTitle(newTitle: string): Promise<Locator> {
    await this.title.click();
    const input = this.main.getByPlaceholder('Enter title');
    await input.fill(newTitle);
    await expect(input, 'the text box should hold the typed title').toHaveValue(newTitle);
    return input;
  }

  get openTextBoxes(): Locator {
    return this.main.getByRole('textbox');
  }

  get pageHeadings(): Locator {
    return this.page.getByRole('heading', {level: 1});
  }

  get editorToolButtons(): Locator {
    return this.editorTools.getByRole('button');
  }

  editorToolButton(name: string): Locator {
    return this.editorTools.getByRole('button', {name, exact: true});
  }

  menuItem(name: string): Locator {
    return this.page.getByRole('menuitem', {name});
  }

  menuItemRadio(name: string): Locator {
    return this.page.getByRole('menuitemradio', {name, exact: true});
  }

  menuItemCheckbox(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox', {name, exact: true});
  }

  menuItems(menu: Locator): Locator {
    return menu.getByRole('menuitemradio').or(menu.getByRole('menuitemcheckbox')).or(menu.getByRole('menuitem'));
  }

  get openMenu(): Locator {
    return this.page.getByRole('menu');
  }

  get openMenus(): Locator {
    return this.page.getByRole('menu', {includeHidden: true});
  }

  async closeMenus() {
    await expect(this.openMenus.first(), 'a menu should be open to close').toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.openMenus).toHaveCount(0);
  }

  toast(text: string | RegExp): Locator {
    return toasts(this.page).filter({hasText: text});
  }

  toastAbout(text: string | RegExp, detail: string): Locator {
    return this.toast(text).filter({hasText: detail});
  }

  async undoFromToast(text: string | RegExp) {
    await this.toast(text).getByRole('button', {name: 'Undo'}).click();
  }

  async pressKey(key: string) {
    await this.page.keyboard.press(key);
  }

  async pressEscapeOnList() {
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(this.page.getByRole('tooltip')).toHaveCount(0);
    await this.page.keyboard.press('Escape');
  }

  async focusWithKeyboard(element: Locator) {
    await element.focus();
    await this.page.keyboard.press('Shift+Tab');
    await this.page.keyboard.press('Tab');
    await expect(element).toBeFocused();
  }

  async fontSize(element: Locator): Promise<number> {
    return element.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  }

  metaTag(property: string): Locator {
    return this.page.locator(`meta[property="${property}"]`);
  }

  async sizeOf(locator: Locator): Promise<Size> {
    const box = await locator.boundingBox();
    if (!box) throw new Error('The element is not on screen');
    return {width: Math.round(box.width), height: Math.round(box.height)};
  }

  async isInside(inner: Locator, outer: Locator): Promise<boolean> {
    const [a, b] = await Promise.all([boxOf(inner), boxOf(outer)]);
    return Math.round(a.x) >= Math.round(b.x) && Math.round(a.y) >= Math.round(b.y)
      && Math.round(a.x + a.width) <= Math.round(b.x + b.width) && Math.round(a.y + a.height) <= Math.round(b.y + b.height);
  }

  async selectedText(): Promise<string> {
    return this.page.evaluate(() => String(window.getSelection()));
  }

  async textSelectionStyle(element: Locator): Promise<{userSelect: string; callout: string}> {
    return element.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        userSelect: computed.userSelect || computed.getPropertyValue('-webkit-user-select'),
        callout: computed.getPropertyValue('-webkit-touch-callout'),
      };
    });
  }

  async storeBeforeLoad(key: string, value: string) {
    await this.page.addInitScript(([storageKey, storedValue]) => {
      if (!sessionStorage.getItem('test-stored-' + storageKey)) {
        localStorage.setItem(storageKey, storedValue);
        sessionStorage.setItem('test-stored-' + storageKey, '1');
      }
    }, [key, value]);
  }

  async localStorageItem(key: string): Promise<string | null> {
    return this.page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
  }

  recordRequests(): () => SentRequest[] {
    const sent: SentRequest[] = [];
    this.page.on('request', (request) => {
      sent.push({method: request.method(), url: request.url(), body: request.postDataBuffer() ?? Buffer.alloc(0)});
    });
    return () => sent.slice();
  }

  async injectedMarkupRan(): Promise<boolean> {
    await expect.poll(() => this.page.evaluate(() => [...document.images].filter((image) => image.loading !== 'lazy').every((image) => image.complete))).toBe(true);
    return this.page.evaluate(() => (window as unknown as {__otbInjected?: unknown}).__otbInjected !== undefined);
  }
}
