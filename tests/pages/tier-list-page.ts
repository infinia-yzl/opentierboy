import {expect, type Locator, type Page, type Route} from '@playwright/test';
import {expectSettled} from '../support/settled';
import {escapeRegExp} from '../support/regexp';
import {runPageClock} from '../support/page-clock';
import {boxOf, changeAndWaitForLink, rowPhrase, startedAndIdle} from './helpers';
import {toasts} from './toasts';
import {DragAndDrop} from './drag-and-drop';
import {Rows} from './rows';
import {EditorItems} from './editor-items';
import {SharePanel} from './share-panel';
import {SnapshotFiles} from './snapshot-files';
import {LinkImages} from './link-images';
import {DeviceImages} from './device-images';
import {Zen} from './zen';

/** A box on screen, in CSS pixels. */
export interface Size {
  width: number;
  height: number;
}

/**
 * The buttons in a row that are not items: the grip ("Move row S", "Move Row 4"), the stack ("Move
 * the 3 items of row S"; an empty row has none), the tray's "Add images to" tile and the
 * Template, Upload and Link buttons of an empty list's drop area.
 */
const NOT_AN_ITEM = /^(?!Move (?:row |Row \d+$|Tier\b|the \d+ items? of )|Add images\b|(?:Template|Upload|Link)$)/;

/**
 * Firefox ignores the `clipboardData` that a script puts in a paste event (it makes an empty
 * one), so a test cannot paste files there. Paste tests skip Firefox with this reason.
 */
export const SCRIPTED_PASTE_SKIP = 'Firefox drops the files of a paste event made by a test (ClipboardEvent clipboardData).';
/** WebKit refuses page.goto() of a blob: URL in a new tab, which openImageInNewTab needs. */
export const BLOB_TAB_SKIP = 'WebKit does not let a test open a blob: URL in a new tab.';

/** A request the page sent, as recordRequests() keeps it. */
export interface SentRequest {
  method: string;
  url: string;
  body: Buffer;
}

/**
 * Page object for the tier list editor at /rank/...
 *
 * Locators follow https://playwright.dev/docs/locators#quick-guide: they use roles and
 * accessible names, the same handles that a screen-reader user relies on.
 *
 * - A tier row is a `group` named after its label. The unnamed last row is "Unranked", another
 *   row without a label is "Row <n>", its position.
 * - An item is a `button` named after its label (it is the drag handle as well).
 * - Each ranked row has two handles: its grip, a `button` named "Move row <label>" ("Move Row 4"
 *   for a row without a label), which moves the whole row; and its stack, a `button` named "Move
 *   the 3 items of row <label>", which moves only the items. An empty row has no stack.
 */
export class TierListPage {
  readonly page: Page;
  readonly main: Locator;
  readonly title: Locator;
  /** The pencil after the title (owner decision, 2026-10-31). */
  readonly editTitleButton: Locator;
  /** The text box that replaces the title while it is edited. */
  readonly titleInput: Locator;
  /** The editor's hints, in the Unranked tray. */
  readonly hints: Locator;
  /** The dashed "Add images" tile that ends the Unranked tray. */
  readonly addImagesTile: Locator;
  readonly tiers: Locator;
  /** The title row's tools: Add images, Zen and Share. */
  readonly editorTools: Locator;
  readonly rowOptionsButton: Locator;
  /** "Add row", beside Row options under the rows (#182). */
  readonly addRowButton: Locator;
  readonly manageItemsButton: Locator;
  readonly shareButton: Locator;
  readonly zenModeToggle: Locator;
  /** Zen (zen.ts). */
  readonly zen: Zen;
  /** The share panel (share-panel.ts). */
  readonly share: SharePanel;
  /** Snapshot files (snapshot-files.ts). */
  readonly files: SnapshotFiles;
  /** Adding, removing and resetting items (editor-items.ts). */
  readonly items: EditorItems;
  /** Images from web addresses (link-images.ts). */
  readonly linkImages: LinkImages;
  /** Pictures from the device, kept in this browser (device-images.ts). */
  readonly deviceImages: DeviceImages;
  /** The rows (rows.ts). */
  readonly rows: Rows;
  /** Drag and drop in the editor (drag-and-drop.ts). */
  readonly drag: DragAndDrop;

  constructor(page: Page) {
    this.page = page;
    // An open dialog or menu hides <main> from assistive technology, but <main> still says
    // aria-busy and still takes events, so it is found also while hidden. What it holds is
    // looked up by role as usual, so a hidden title or row is still not found.
    this.main = page.getByRole('main', {includeHidden: true});
    this.title = this.main.getByRole('heading', {level: 1});
    this.editTitleButton = this.main.getByRole('button', {name: 'Edit title'});
    this.titleInput = this.main.getByRole('textbox', {name: 'Title'});
    this.hints = this.main.getByText('Drag to reorder.');
    this.addImagesTile = this.main.getByRole('button', {name: 'Add images, drop or paste, to Unranked'});
    // Rows are the groups with a row handle; the title row's "Editor tools" is a group too.
    // Rows are the groups with a tier heading: the ranked rows and the Unranked tray (which has
    // no handle). The title row's "Editor tools" group has none.
    this.tiers = this.main.getByRole('group').filter({has: page.getByRole('heading', {level: 2})});
    this.editorTools = page.getByRole('group', {name: 'Editor tools'});
    this.rowOptionsButton = page.getByRole('button', {name: 'Row options'});
    this.addRowButton = page.getByRole('button', {name: 'Add row', exact: true});
    this.manageItemsButton = page.getByRole('button', {name: 'Add images', exact: true});
    this.shareButton = page.getByRole('button', {name: 'Share', exact: true});
    this.zenModeToggle = page.getByRole('button', {name: 'Zen', exact: true});
    this.zen = new Zen(this);
    this.share = new SharePanel(this);
    this.files = new SnapshotFiles(this);
    this.items = new EditorItems(this);
    this.linkImages = new LinkImages(this);
    this.deviceImages = new DeviceImages(this);
    this.rows = new Rows(this);
    this.drag = new DragAndDrop(this);
  }

  /** Opens a tier list. `state` is the raw value of the `state` query parameter. */
  async goto(path: string, state?: string) {
    await this.page.goto(state ? `${path}?state=${state}` : path);
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  /**
   * Opens a link that might crash the page in the browser. Unlike goto(), it does not wait for
   * the editor: it returns once Next.js shows its crash message, or once the page has started
   * and settled (a crash while it starts comes before that).
   */
  async gotoPageThatMayCrash(path: string, state: string) {
    await this.page.goto(`${path}?state=${state}`);
    await expect.poll(async () => await this.crashMessage.isVisible() || await startedAndIdle(this.main), {
      message: 'the page should crash, or start and settle',
    }).toBe(true);
  }

  /** The message Next.js shows instead of the page when the page crashed in the browser. */
  get crashMessage(): Locator {
    return this.page.getByRole('heading', {name: /Application error/});
  }

  /** Reloads the page, and waits until the editor shows the list again. */
  async reload() {
    await this.page.reload();
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  /**
   * Reloads the page and returns once it has loaded, without waiting for the editor: for a
   * speed budget that times what the page shows after the reload.
   */
  async reloadNow() {
    await this.page.reload();
  }

  /** Opens a full link, for example one copied from another page. */
  async gotoLink(link: string) {
    await this.page.goto(link);
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  tier(name: string): Locator {
    return this.main.getByRole('group', {name, exact: true});
  }

  get unranked(): Locator {
    return this.tier('Unranked');
  }

  /**
   * All items in a tier, in display order. Not items: the row's grip and stack, the tray's "Add
   * images to Unranked" tile, and the Template, Upload and Link buttons of an empty list's drop area.
   */
  itemsIn(tier: string | Locator): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name: NOT_AN_ITEM});
  }

  item(name: string): Locator {
    return this.main.getByRole('button', {name, exact: true});
  }

  /**
   * Every item tile in the rows and the Unranked tray (in Zen, the item up next). The queue
   * after the item up next is a list of pictures, not items to drag.
   */
  get allItems(): Locator {
    return this.itemsIn(this.tiers);
  }

  /** An item's image. An item without an image (a label tile) has none. */
  itemImage(name: string): Locator {
    return this.item(name).getByRole('img');
  }

  /** An item, by its label, in a tier. */
  itemIn(tier: string | Locator, name: string): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name, exact: true});
  }

  /** A tier's label: the row's h2 heading. */
  tierLabel(tierName: string): Locator {
    return this.tier(tierName).getByRole('heading', {level: 2});
  }

  /** Every open text box in the editor (title and labels). */
  get openTextBoxes(): Locator {
    return this.main.getByRole('textbox');
  }

  /** The h1 headings of the page. The list title is the only one. */
  get pageHeadings(): Locator {
    return this.page.getByRole('heading', {level: 1});
  }

  /** The buttons in the title row's tools, in order. */
  get editorToolButtons(): Locator {
    return this.editorTools.getByRole('button');
  }

  /** One button in Editor tools, by its name. */
  editorToolButton(name: string): Locator {
    return this.editorTools.getByRole('button', {name, exact: true});
  }

  /** A menu item in the open menu, by its name (the item menu, Add images, Row options). */
  menuItem(name: string): Locator {
    return this.page.getByRole('menuitem', {name});
  }

  /** The font size of an element in pixels, as the browser computes it. */
  async fontSize(element: Locator): Promise<number> {
    return element.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  }

  /** The content of a meta tag in the page head, such as og:title. Meta tags have no role, so this is the one CSS selector. */
  metaTag(property: string): Locator {
    return this.page.locator(`meta[property="${property}"]`);
  }

  /**
   * Scrolls an item into view (tile images load lazily) and tells whether its image has
   * loaded. Use it with expect.poll().
   */
  async itemImageHasLoaded(name: string): Promise<boolean> {
    const image = this.itemImage(name);
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  }

  /**
   * The colour at the centre of an item's image as red, green and blue (0 to 255), or null
   * while the image has not loaded. Scrolls the item into view first (images load lazily).
   */
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

  /** A row's grip, beside the row: it moves the whole row, its name included. */
  rowGrip(tierName: string): Locator {
    return this.main.getByRole('button', {name: `Move ${rowPhrase(tierName)}`, exact: true});
  }

  /**
   * A row's stack, at the row's end: it moves only the row's items; the names stay in place. An
   * empty row has nothing to move, so its stack is hidden: this finds nothing then.
   */
  rowStack(tierName: string): Locator {
    const phrase = escapeRegExp(rowPhrase(tierName));
    return this.main.getByRole('button', {name: new RegExp(`^Move the \\d+ items? of ${phrase}$`)});
  }

  /** Leaves the editor for the landing page with the site's logo link in the header. */
  async leaveForHome() {
    await this.homeLink.click();
    await expect(this.page).toHaveURL(/^[^?]*\/$/);
  }

  /** The logo link to Home in the page's banner. */
  get homeLink(): Locator {
    return this.page.getByRole('banner').getByRole('link', {name: 'OpenTierBoy'});
  }

  /**
   * Holds the server's answers for Home (its prefetch too) until `release`, so a test can act
   * while the visitor's trip home still loads. Call it before the editor opens: the editor
   * prefetches Home as soon as the logo shows.
   */
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
        await this.page.unroute('**/*', handler);
      },
    };
  }

  /** The number of entries in the tab's history (window.history.length). */
  async historyLength(): Promise<number> {
    return this.page.evaluate(() => window.history.length);
  }

  /**
   * Starts counting the history entries this page adds from now on (history.pushState calls: the
   * editor makes one per change, and Next.js one per router.push). Browsers keep at most 50
   * entries, so history.length cannot count more. Returns a function that reads the count.
   */
  async countNewHistoryEntries(): Promise<() => Promise<number>> {
    await this.page.evaluate(() => {
      const counted = window as unknown as {newHistoryEntries: number};
      counted.newHistoryEntries = 0;
      const push = window.history.pushState.bind(window.history);
      window.history.pushState = (...args: Parameters<History['pushState']>) => {
        counted.newHistoryEntries += 1;
        push(...args);
      };
    });
    return () => this.page.evaluate(() => (window as unknown as {newHistoryEntries: number}).newHistoryEntries);
  }

  /** The link a visitor would share. The app keeps it in the address bar. */
  async shareLink(): Promise<string> {
    await expect(this.page).toHaveURL(/[?&]state=/);
    return this.page.url();
  }

  // ---- Ranking -----------------------------------------------------------------------------

  /**
   * The lines of a row's items, top to bottom, each a list of item names, read from where the
   * items are on screen. A row wraps onto a new line when its items do not fit.
   */
  async itemLines(tierName: string): Promise<string[][]> {
    const items = this.itemsIn(tierName);
    const boxes = await Promise.all((await items.all()).map(async (item) => ({
      name: (await item.getAttribute('aria-label')) ?? '',
      top: Math.round((await item.boundingBox())!.y),
    })));
    const tops = [...new Set(boxes.map((box) => box.top))].sort((a, b) => a - b);
    return tops.map((top) => boxes.filter((box) => box.top === top).map((box) => box.name));
  }

  /** The images of every tile in the rows and the Unranked tray, the item up next and the queue included. */
  get allItemImages(): Locator {
    return this.tiers.getByRole('img');
  }

  /**
   * The names of what Tab reaches inside a row, in order: from the element before the row, Tab
   * until the focus leaves the row.
   */
  async tabOrderIn(tierName: string): Promise<string[]> {
    const row = this.tier(tierName);
    await this.settled();
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

  /**
   * Gives an element focus as the keyboard does, so it shows its focus ring (:focus-visible):
   * focus the element before it, then Tab.
   */
  async focusWithKeyboard(element: Locator) {
    await element.focus();
    await this.page.keyboard.press('Shift+Tab');
    await this.page.keyboard.press('Tab');
    await expect(element).toBeFocused();
  }

  /** The colour of each ranked row from top to bottom (its gradient), as computed CSS. */
  async rowColours(): Promise<string[]> {
    const rows = await this.tiers.all();
    const colours = await Promise.all(rows.slice(0, -1).map((row) => row.evaluate((element) => getComputedStyle(element).backgroundImage)));
    return colours;
  }

  // ---- Touch (Chromium only: touch events through the Chrome DevTools Protocol) --------------

  // ---- Editing labels --------------------------------------------------------------------

  async setTitle(newTitle: string) {
    await this.settled();
    await changeAndWaitForLink(this.page, async () => {
      const input = await this.typeTitle(newTitle);
      await input.press('Enter');
      await expect(this.title).toHaveText(newTitle);
    });
  }

  /** Opens the title editor and types a new title, without confirming it. */
  async typeTitle(newTitle: string): Promise<Locator> {
    await this.title.click();
    const input = this.main.getByPlaceholder('Enter title');
    await input.fill(newTitle);
    await expect(input, 'the text box should hold the typed title').toHaveValue(newTitle);
    return input;
  }

  // ---- Row and label settings ------------------------------------------------------------

  /**
   * Closes the open menu, and its open submenu, with Escape: the first Escape closes them all.
   * A menu must be open.
   */
  async closeMenus() {
    await expect(this.openMenus.first(), 'a menu should be open to close').toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.openMenus).toHaveCount(0);
  }

  // ---- Managing items --------------------------------------------------------------------

  // ---- Data kept in this browser -------------------------------------------------------------

  /**
   * Stores a localStorage value before the next page load, once, as an earlier visit would have.
   * Later loads in the same tab find what the app made of it.
   */
  async storeBeforeLoad(key: string, value: string) {
    await this.page.addInitScript(([storageKey, storedValue]) => {
      if (!sessionStorage.getItem('test-stored-' + storageKey)) {
        localStorage.setItem(storageKey, storedValue);
        sessionStorage.setItem('test-stored-' + storageKey, '1');
      }
    }, [key, value]);
  }

  /** A localStorage value of this site, or null. */
  async localStorageItem(key: string): Promise<string | null> {
    return this.page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
  }

  /**
   * Waits until the page has finished what the last step started: <main> no longer says
   * `aria-busy` (lib/busy.ts). The page is busy until the editor has started in the browser,
   * while a link is written, during a drag, and while files or pictures are added or captured.
   */
  async settled() {
    await expectSettled(this.page);
  }

  // ---- Safety checks ------------------------------------------------------------------------

  /**
   * Records every request the page sends from now on, with its body. Returns a function that
   * gives the requests so far. Product rule 5: a device image never reaches the server.
   */
  /** The text the user has selected on the page. */
  async selectedText(): Promise<string> {
    return this.page.evaluate(() => String(window.getSelection()));
  }

  /**
   * The computed user-select and -webkit-touch-callout of an element. A browser that does not
   * know the callout (all but Safari) returns ''; WebKit names user-select with its prefix.
   */
  async textSelectionStyle(element: Locator): Promise<{userSelect: string; callout: string}> {
    return element.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        userSelect: computed.userSelect || computed.getPropertyValue('-webkit-user-select'),
        callout: computed.getPropertyValue('-webkit-touch-callout'),
      };
    });
  }

  recordRequests(): () => SentRequest[] {
    const sent: SentRequest[] = [];
    this.page.on('request', (request) => {
      sent.push({method: request.method(), url: request.url(), body: request.postDataBuffer() ?? Buffer.alloc(0)});
    });
    return () => sent.slice();
  }

  /**
   * Whether markup in user text ran as code. Safety tests put `<img onerror>` and `<script>` text
   * that sets `window.__otbInjected` into titles, row names and labels.
   */
  async injectedMarkupRan(): Promise<boolean> {
    // An <img onerror> runs once its image fails, so wait until every eager image has loaded or
    // failed. Lazy images (link images) may wait for a scroll; markup put in the page has none.
    await expect.poll(() => this.page.evaluate(() => [...document.images].filter((image) => image.loading !== 'lazy').every((image) => image.complete))).toBe(true);
    return this.page.evaluate(() => (window as unknown as {__otbInjected?: unknown}).__otbInjected !== undefined);
  }

  // ---- Image addresses: dropped or pasted text (#107) ------------------------------------------

  // ---- Files: snapshot files and pictures ---------------------------------------------------

  /** The open menu (the Add images menu, an item menu, Row options). */
  get openMenu(): Locator {
    return this.page.getByRole('menu');
  }

  // ---- Sharing -------------------------------------------------------------------------

  // ---- Zen mode --------------------------------------------------------------------------

  /** A choice of the open menu that is a radio item, such as a ranking order or a layout. */
  menuItemRadio(name: string): Locator {
    return this.page.getByRole('menuitemradio', {name, exact: true});
  }

  /** A choice of the open menu that is a check box, such as "Hide the queue". */
  menuItemCheckbox(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox', {name, exact: true});
  }

  /** Moves the mouse to a point of the window and leaves it there. */
  async restMouseAt(x: number, y: number) {
    await this.page.mouse.move(x, y);
  }

  /** Moves the page clock on by `ms` (`pageClock`), and lets the page handle what those timers started. */
  async letTimePass(ms: number) {
    await runPageClock(this.page, ms);
  }

  /** Presses a key, such as Tab or Shift+Tab, wherever the focus is. */
  async pressKey(key: string) {
    await this.page.keyboard.press(key);
  }

  /**
   * Presses Escape with the focus on the list. After a menu choice the focus is on the menu's
   * button, whose tooltip would take the first Escape (zen-layouts.spec.ts), so the focus leaves
   * the button first, and the tooltip closes.
   */
  async pressEscapeOnList() {
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(this.page.getByRole('tooltip')).toHaveCount(0);
    await this.page.keyboard.press('Escape');
  }

  // ---- Zen layouts (16:9, 9:16, stream overlay) -----------------------------------------

  /** Opens a page by its address as typed, for example with parameters the app does not read. */
  async gotoAddress(address: string) {
    await this.page.goto(address);
    await expect(this.tiers.first()).toBeVisible();
    await this.settled();
  }

  /** Every open menu, also one that another open menu hides from assistive technology. */
  get openMenus(): Locator {
    return this.page.getByRole('menu', {includeHidden: true});
  }

  /** The items of an open menu, whatever their kind (radio, check box or plain item), in order. */
  menuItems(menu: Locator): Locator {
    return menu.getByRole('menuitemradio').or(menu.getByRole('menuitemcheckbox')).or(menu.getByRole('menuitem'));
  }

  /** True when the box of `inner` lies within the box of `outer` on screen (to the nearest pixel). */
  async isInside(inner: Locator, outer: Locator): Promise<boolean> {
    const [a, b] = await Promise.all([boxOf(inner), boxOf(outer)]);
    return Math.round(a.x) >= Math.round(b.x) && Math.round(a.y) >= Math.round(b.y)
      && Math.round(a.x + a.width) <= Math.round(b.x + b.width) && Math.round(a.y + a.height) <= Math.round(b.y + b.height);
  }

  /** The size of an element on screen, in CSS pixels, rounded. */
  async sizeOf(locator: Locator): Promise<Size> {
    const box = await locator.boundingBox();
    if (!box) throw new Error('The element is not on screen');
    return {width: Math.round(box.width), height: Math.round(box.height)};
  }

  /** The name a Compact tile shows under itself, with Show Labels on. */
  itemCaption(name: string): Locator {
    return this.item(name).getByText(name, {exact: true});
  }

  // ---- Tile size (the dense editor) ------------------------------------------------------

  /** The name tag that a Compact tile shows under itself on hover or keyboard focus. */
  itemNameTag(name: string): Locator {
    return this.item(name).getByRole('tooltip');
  }

  /** Moves the mouse over an item. */
  async hoverItem(name: string) {
    await this.item(name).hover();
  }

  // ---- Notifications ---------------------------------------------------------------------

  /** A toast notification that contains the given text, in Sonner's region "Notifications". */
  toast(text: string | RegExp): Locator {
    return toasts(this.page).filter({hasText: text});
  }

  /** The toast with this title whose text also names `detail`, such as a file name. */
  toastAbout(text: string | RegExp, detail: string): Locator {
    return this.toast(text).filter({hasText: detail});
  }

  async undoFromToast(text: string | RegExp) {
    await this.toast(text).getByRole('button', {name: 'Undo'}).click();
  }

  // ---- History machine (tests/machines/history.ts) -----------------------------------------

  /**
   * Opens a list as a new history entry after a blank page, so no history entry follows it.
   * Opening the address already on screen would replace its entry and keep the entries after it,
   * from an earlier visit; the blank page in between drops them.
   */
  async openAfterBlankPage(path: string, state: string) {
    await this.page.goto('about:blank');
    await this.goto(path, state);
  }

  /**
   * The browser's Back button. Returns once the address of the entry before is in the address bar
   * and the page has settled: Back to another version of the list keeps the page busy until the
   * router shows it (components/NavigationBusy.tsx), Back to another page until it has started.
   */
  async goBack() {
    await changeAndWaitForLink(this.page, async () => {
      await this.page.goBack();
    });
    await this.settled();
  }

  /**
   * The browser's Forward button. Returns once the page has settled. With an entry after this
   * one, the address is the entry's then (see goBack); with none, the browser stays where it is,
   * and so do the address and the page.
   */
  async goForward() {
    await this.page.goForward();
    await this.settled();
  }

  /**
   * Back with the browser while the page may be busy on purpose, for example right after a change
   * or while files wait: it returns once Back has been sent, without waiting for anything.
   */
  async goBackNow() {
    await this.page.goBack();
  }

  // ---- Leaving machine (tests/machines/leaving.ts) ------------------------------------------

  // ---- Tips machines (tests/machines/tips.ts, tests/machines/tips-shared-list.ts) ----------

  // ---- Link images machine (tests/machines/link-images.ts) ----------------------------------

  /**
   * Opens a list as a new browser would: this site's local storage (the always-allowed image
   * sites among it) is cleared on a blank page first. Context-wide init scripts run again.
   */
  async openAsNewBrowser(path: string, state: string) {
    await this.page.goto('about:blank');
    await this.page.context().setStorageState({cookies: [], origins: []});
    await this.goto(path, state);
  }

  // ---- Appearance machine (tests/machines/appearance.ts) ---------------------------------------

  /** The picture of an item's tile: 80 px wide with Comfortable tiles, 48 px with Compact. */
  itemPicture(name: string): Locator {
    return this.item(name).getByRole('img');
  }

  // ---- Share panel machine (tests/machines/share-panel.ts) ----------------------------------

  // ---- Keyboard drag machine (tests/machines/keyboard-drag.ts) --------------------------------

  // ---- Snapshot files machine (tests/machines/snapshot-files.ts) ----------------------------

  /**
   * Rests the pointer on a message (a toast) once it shows, and waits until the toasts have
   * expanded under it: Sonner holds every toast's 4 s timer while they are expanded, so the
   * message stays until the pointer moves. A paste or a drop that a test sends leaves the pointer
   * where it is. Not over a dialog: the dialog makes the page ignore the pointer.
   */
  async restOnMessage(message: Locator) {
    await expect(message).toBeVisible();
    await message.hover();
    await expect(message).toHaveAttribute('data-expanded', 'true');
  }

  // ---- Shared link machine (tests/machines/shared-link.ts) ----------------------------------

  /**
   * The names of a row's items, in order: their accessible names, so a label tile counts by its
   * label without the site name it also shows.
   */
  async itemNamesIn(tierName: string): Promise<string[]> {
    return this.itemsIn(tierName).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''));
  }

  /**
   * Scrolls an item into view and tells whether its tile shows the loaded placeholder image (an
   * unknown item, or a device image this browser does not have). Use it with expect.poll().
   */
  async itemShowsPlaceholder(name: string): Promise<boolean> {
    const image = this.itemImage(name);
    if ((await image.count()) === 0) return false;
    await image.scrollIntoViewIfNeeded();
    return image.evaluate((img: HTMLImageElement) => (
      img.complete && img.naturalWidth > 0 && decodeURIComponent(img.currentSrc).includes('/placeholder-image.png')
    ));
  }

  // ---- Mouse drag machine (tests/machines/mouse-drag.ts) ----------------------------------

  // ---- Device images machine (tests/machines/device-images.ts) ------------------------------

  /** Closes this page's browser context, as closing a browser window does. */
  async closeBrowser() {
    await this.page.context().close();
  }

  // ---- Freeze Frame load machine (tests/machines/freeze-frame-load.ts) ----------------------

  // ---- Remove and undo machine (tests/machines/remove-and-undo.ts) ----------------------------

  // ---- Add from template machine (tests/machines/add-from-template.ts) ----------------------
}

// ---- Model helpers: editor rows, Zen steps, leaving, label writes, "From a link" ------------
// Plain functions over TierListPage, for the models in tests/models/editor-rows.ts,
// zen-steps.ts, leaving-writes.ts, label-writes.ts and link-dialog.ts.

/**
 * Clicks the logo link to Home while the trip home may wait for a held server answer
 * (holdTripHome). Returns once the click is made, without waiting for Home.
 */
export async function clickHomeNow(tierList: TierListPage) {
  await tierList.homeLink.click();
}

// ---- Model campaigns: toasts while page time stands still (`pageTime: 'paused'`) ------------

