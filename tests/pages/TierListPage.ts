import {expect, type Locator, type Page} from '@playwright/test';

export type RowCount = 3 | 5 | 7;
export type LabelPosition = 'Left' | 'Right' | 'Top';
/** The capture methods offered under "Options" in the Image tab of the share panel. */
export type CaptureMethod = 'html2canvas-pro' | 'Original html2canvas';

/** What a test can check about the image that "Capture Preview" made. */
export interface CapturedImage {
  /** Size of the image in pixels. */
  width: number;
  height: number;
  /** Width and height of the page in CSS pixels, and the device pixel ratio. */
  pageWidth: number;
  pageHeight: number;
  devicePixelRatio: number;
  /** Number of different colours in a 64 x 64 copy of the image. A blank image has 1. */
  distinctColors: number;
  /** Brightness (0 to 255) of the top-left corner, where the page background shows. */
  cornerBrightness: number;
}

/**
 * Page object for the tier list editor at /rank/...
 *
 * Locators follow https://playwright.dev/docs/locators#quick-guide: they use roles and
 * accessible names, the same handles that a screen-reader user relies on.
 *
 * - A tier row is a `group` named after its label. The unnamed last row is "Unranked".
 * - An item is a `button` named after its label (it is the drag handle as well).
 * - The handle that reorders a row is a `button` named "Move tier <label>".
 */
export class TierListPage {
  readonly page: Page;
  readonly main: Locator;
  readonly title: Locator;
  readonly tiers: Locator;
  readonly rowOptionsButton: Locator;
  readonly manageItemsButton: Locator;
  readonly shareButton: Locator;
  readonly sharePanel: Locator;
  readonly zenModeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.main = page.getByRole('main');
    this.title = this.main.getByRole('heading', {level: 1});
    this.tiers = this.main.getByRole('group');
    this.rowOptionsButton = page.getByRole('button', {name: 'Select rows and label options'});
    this.manageItemsButton = page.getByRole('button', {name: 'Manage items'});
    this.shareButton = page.getByRole('button', {name: 'Share', exact: true});
    this.sharePanel = page.getByRole('dialog').filter({
      has: page.getByRole('heading', {name: 'Share Your Rankings'}),
    });
    this.zenModeToggle = page.getByRole('button', {name: 'Toggle zen mode'});
  }

  /** Opens a tier list. `state` is the raw value of the `state` query parameter. */
  async goto(path: string, state?: string) {
    await this.page.goto(state ? `${path}?state=${state}` : path);
    // The editor renders on the client only, so wait until the rows exist.
    await expect(this.tiers.first()).toBeVisible();
  }

  /**
   * Opens a link that might break the page. Unlike goto(), it does not wait for the editor:
   * it waits until the page has loaded and the network is idle, so the page has started in
   * the browser (and would have crashed by then).
   */
  async gotoAndSettle(path: string, state: string) {
    await this.page.goto(`${path}?state=${state}`, {waitUntil: 'networkidle'});
  }

  /** The message Next.js shows instead of the page when the page crashed in the browser. */
  get crashMessage(): Locator {
    return this.page.getByRole('heading', {name: /Application error/});
  }

  /** Opens a full link, for example one copied from another page. */
  async gotoLink(link: string) {
    await this.page.goto(link);
    await expect(this.tiers.first()).toBeVisible();
  }

  tier(name: string): Locator {
    return this.main.getByRole('group', {name, exact: true});
  }

  get unranked(): Locator {
    return this.tier('Unranked');
  }

  /** All items in a tier, in display order. */
  itemsIn(tier: string | Locator): Locator {
    const row = typeof tier === 'string' ? this.tier(tier) : tier;
    return row.getByRole('button', {name: /^(?!Move tier\b)/});
  }

  item(name: string): Locator {
    return this.main.getByRole('button', {name, exact: true});
  }

  /**
   * Scrolls an item into view (tile images load lazily) and tells whether its image has
   * loaded. Use it with expect.poll().
   */
  async itemImageHasLoaded(name: string): Promise<boolean> {
    const image = this.item(name).getByRole('img');
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

  rowHandle(tierName: string): Locator {
    return this.main.getByRole('button', {name: `Move tier ${tierName}`, exact: true});
  }

  /**
   * Makes the server's answers to page navigations (the React Server Components requests that
   * every new address of the editor makes) arrive `delayMs` later, like a slow connection.
   */
  async simulateSlowServer(delayMs: number) {
    await this.page.route('**/*', async (route) => {
      if (route.request().headers()['rsc'] === '1') {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await route.fallback();
    });
  }

  /** The number of entries in the tab's history (window.history.length). */
  async historyLength(): Promise<number> {
    return this.page.evaluate(() => window.history.length);
  }

  /** The link a visitor would share. The app keeps it in the address bar. */
  async shareLink(): Promise<string> {
    await expect(this.page).toHaveURL(/[?&]state=/);
    return this.page.url();
  }

  /**
   * Runs an action that changes the ranking, and waits until the app has written the
   * change into the address bar. Only then is the link ready to share.
   */
  private async changeAndWaitForLink(action: () => Promise<void>) {
    const before = this.page.url();
    await action();
    await expect(this.page, 'the shareable link should update').not.toHaveURL(before);
  }

  // ---- Ranking -----------------------------------------------------------------------------

  /** Drags an item with the mouse and drops it at the end of a tier. */
  async dragItemToTier(itemName: string, tierName: string) {
    await this.changeAndWaitForLink(() =>
      // Drop in the free space at the end of the row, left of the row handle.
      this.dragWithMouse(this.item(itemName), this.tier(tierName), (box) => ({
        x: box.x + box.width - 120,
        y: box.y + box.height / 2,
      })),
    );
  }

  /** Drags an item with the mouse and drops it where another item is. */
  async dragItemOnto(itemName: string, targetItemName: string) {
    await this.changeAndWaitForLink(() =>
      this.dragWithMouse(this.item(itemName), this.item(targetItemName), centerOfBox),
    );
  }

  /** Drags a whole row by its handle and drops it on the position of another row. */
  async dragTierOnto(tierName: string, targetTierName: string) {
    await this.changeAndWaitForLink(() =>
      this.dragWithMouse(this.rowHandle(tierName), this.rowHandle(targetTierName), centerOfBox),
    );
  }

  /**
   * Presses the mouse on a drag handle, moves it to a point on the drop target, and
   * releases it there.
   *
   * The drag library measures every row and item once, when the drag starts, and works
   * out the drop position from those measurements and the window scroll. The helper does
   * the same: it measures the drop point before the drag starts, in page coordinates.
   * Measuring during the drag goes wrong in two ways:
   * - The library moves rows and items out of the way of the dragged one. A target
   *   measured during the drag has already moved, and following it pulls the dragged
   *   element back, so the target moves back too, and so on.
   * - The page auto-scrolls while the pointer is near the top or bottom of the window.
   *   The helper keeps moving the pointer to the same page point until the scrolling stops.
   */
  private async dragWithMouse(handle: Locator, target: Locator, pointIn: (box: Box) => Point) {
    await handle.scrollIntoViewIfNeeded();
    const scrollBefore = await this.scrollPosition();
    const dropAt = pointIn(await boxOf(target));
    const dropAtOnPage = {x: dropAt.x + scrollBefore.x, y: dropAt.y + scrollBefore.y};
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};

    const from = await centerOf(handle);
    const mouse = this.page.mouse;
    const lastAnnouncement = await this.dragAnnouncer.textContent();
    await mouse.move(from.x, from.y);
    await mouse.down();
    // The drag library starts a drag only after the pointer moves a few pixels.
    await mouse.move(from.x + 8, from.y + 8, {steps: 4});
    // Once a drag starts, the library announces the lift, and then every change of the
    // drop position. Only the latest message stays in the live region.
    await expect(this.dragAnnouncer, 'the drag should start').not.toHaveText(lastAnnouncement ?? '');

    await expect(async () => {
      const scroll = await this.scrollPosition();
      // A drop point outside the window is reached by holding the pointer at the edge,
      // where the page auto-scrolls towards it.
      const x = clamp(dropAtOnPage.x - scroll.x, 1, viewport.width - 2);
      const y = clamp(dropAtOnPage.y - scroll.y, 1, viewport.height - 2);
      await mouse.move(x, y, {steps: 5});
      // The library reads the pointer once per animation frame. Waiting a few frames
      // lets it handle the last move, and shows whether the page is still scrolling.
      const scrollAfter = await this.scrollPositionAfterFrames();
      expect(scrollAfter, 'the page should stop auto-scrolling').toEqual(scroll);
      expect({x: x + scroll.x, y: y + scroll.y}, 'the pointer should be on the drop point').toEqual(dropAtOnPage);
    }).toPass({timeout: 15_000});
    await mouse.up();
  }

  private async scrollPosition(): Promise<Point> {
    return this.page.evaluate(() => ({x: window.scrollX, y: window.scrollY}));
  }

  private async scrollPositionAfterFrames(frames = 5): Promise<Point> {
    return this.page.evaluate(async (count) => {
      for (let frame = 0; frame < count; frame++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return {x: window.scrollX, y: window.scrollY};
    }, frames);
  }

  /**
   * Moves an item with the keyboard, as a keyboard or screen-reader user would:
   * focus the item, Space to lift, arrow keys to move, Space to drop.
   * With `waitForLink: false` it returns once the drop is announced, before the link is in
   * the address bar (for quick changes one after another).
   */
  async moveItemWithKeyboard(itemName: string, keys: string[], {waitForLink = true} = {}) {
    const move = () => this.moveWithKeyboard(this.item(itemName), keys);
    await (waitForLink ? this.changeAndWaitForLink(move) : move());
  }

  /** Moves a whole row with the keyboard, using its row handle. */
  async moveTierWithKeyboard(tierName: string, keys: string[]) {
    await this.changeAndWaitForLink(() => this.moveWithKeyboard(this.rowHandle(tierName), keys));
  }

  private async moveWithKeyboard(handle: Locator, keys: string[]) {
    const keyboard = this.page.keyboard;
    // The drag library announces every step to screen readers. Waiting for those
    // announcements keeps the test in step with the app without fixed sleeps.
    await expect(async () => {
      await handle.focus();
      await keyboard.press('Space');
      await expect(this.dragAnnouncer).toContainText('You have lifted an item', {timeout: 1_000});
    }).toPass();
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
    }
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('You have dropped the item');
  }

  /** The live region where the drag library announces lifts, moves and drops. */
  get dragAnnouncer(): Locator {
    return this.page.locator('[aria-live="assertive"][id^="rfd-announcement"]');
  }

  // ---- Editing labels --------------------------------------------------------------------

  /**
   * Renames a tier and confirms with Enter. A row with an empty label is named after its
   * position, for example "Tier 2", so pass that as `nameAfter` when clearing a label.
   * With `waitForLink: false` it returns as soon as the new name shows, before the link is in
   * the address bar (for quick changes one after another).
   */
  async renameTier(currentName: string, newName: string, nameAfter = newName, {waitForLink = true} = {}) {
    const rename = async () => {
      const input = await this.typeTierName(currentName, newName);
      await input.press('Enter');
      await expect(this.tier(nameAfter)).toBeVisible();
    };
    await (waitForLink ? this.changeAndWaitForLink(rename) : rename());
  }

  /** Opens the editor of a tier label and types a new name, without confirming it. */
  async typeTierName(currentName: string, newName: string): Promise<Locator> {
    const row = this.tier(currentName);
    await row.getByRole('heading', {name: currentName, exact: true}).click();
    const input = row.getByRole('textbox');
    await input.fill(newName);
    return input;
  }

  async setTitle(newTitle: string) {
    await this.changeAndWaitForLink(async () => {
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
    return input;
  }

  // ---- Row and label settings ------------------------------------------------------------

  async chooseRowCount(count: RowCount) {
    await this.rowOptionsButton.click();
    await this.page.getByRole('menuitemradio', {name: `${count} Rows`}).click();
  }

  async chooseLabelPosition(position: LabelPosition) {
    await this.rowOptionsButton.click();
    await this.page.getByRole('menuitemradio', {name: position, exact: true}).click();
  }

  async setItemLabelsVisible(visible: boolean) {
    await this.rowOptionsButton.click();
    await this.page.getByRole('menuitemradio', {name: visible ? 'Show Labels' : 'Hide Labels'}).click();
  }

  // ---- Managing items --------------------------------------------------------------------

  private async openItemsMenu() {
    await this.manageItemsButton.click();
  }

  /** The template picker ("From template"): a searchable list of image sets and their tags. */
  get templatePicker(): Locator {
    return this.page.getByRole('dialog');
  }

  /** Opens the template picker. Its first page lists the image sets as options. */
  async openTemplatePicker() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From template'}).click();
    await expect(this.templatePicker.getByRole('combobox')).toBeVisible();
  }

  /** Types into the search box of the open template picker. Matching sets and tags appear as options. */
  async searchTemplates(text: string) {
    await this.templatePicker.getByRole('combobox').fill(text);
  }

  /** Adds a set from the built-in templates, for example ('OVERWATCH', 'Tank'). */
  async addItemsFromTemplate(packageName: string, setTitle: string) {
    await this.openTemplatePicker();
    const picker = this.templatePicker;
    await picker.getByRole('option', {name: packageName, exact: true}).click();
    await picker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
  }

  /** Uploads images from the device. Item names default to the file names. */
  async addItemsFromDevice(files: string[]) {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From your device'}).click();
    const dialog = this.page.getByRole('dialog', {name: 'Add New Items'});
    await dialog.getByLabel('Upload Images').setInputFiles(files);
    await dialog.getByRole('button', {name: /^Add \d+ Items?$/}).click();
    await expect(dialog).toBeHidden();
  }

  async deleteItem(itemName: string) {
    await this.item(itemName).click({button: 'right'});
    await this.page.getByRole('menuitem', {name: 'Delete'}).click();
  }

  async resetRankings() {
    await this.changeAndWaitForLink(async () => {
      await this.openItemsMenu();
      await this.page.getByRole('menuitem', {name: 'Reset'}).click();
    });
  }

  /** Opens Remove All and cancels the confirmation. */
  async cancelRemoveAllItems() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
    const confirm = this.page.getByRole('alertdialog');
    await confirm.getByRole('button', {name: 'Cancel'}).click();
    await expect(confirm).toBeHidden();
  }

  async removeAllItems() {
    await this.changeAndWaitForLink(async () => {
      await this.openItemsMenu();
      await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
      const confirm = this.page.getByRole('alertdialog');
      await confirm.getByRole('button', {name: 'Remove All Items'}).click();
    });
  }

  // ---- Sharing -------------------------------------------------------------------------

  async openSharePanel() {
    await this.shareButton.click();
    await expect(this.sharePanel).toBeVisible();
  }

  /** Copies the Markdown share text. The browser must allow clipboard access. */
  async copyMarkdown() {
    await this.openSharePanel();
    await this.sharePanel.getByRole('button', {name: 'Copy Markdown'}).click();
    await expect(this.toast('Markdown copied to clipboard')).toBeVisible();
  }

  async clipboardText(): Promise<string> {
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  /** The preview that "Capture Preview" (Freeze Frame) shows in the share panel. */
  get capturedImage(): Locator {
    return this.sharePanel.getByRole('img', {name: 'Captured tier list'});
  }

  /**
   * Captures the page as an image from the Image tab of the share panel ("Freeze Frame"),
   * and waits until the app reports the result in a toast. Without a method, the app's
   * default method is used.
   */
  async capturePreview(method?: CaptureMethod) {
    await this.openSharePanel();
    await this.sharePanel.getByRole('tab', {name: 'Image'}).click();
    if (method) {
      await this.sharePanel.getByRole('button', {name: 'Options'}).click();
      const methodSelect = this.sharePanel.getByRole('combobox');
      await methodSelect.click();
      await this.page.getByRole('option', {name: method, exact: true}).click();
      await expect(methodSelect).toHaveText(method);
    }
    await this.sharePanel.getByRole('button', {name: 'Capture Preview'}).click();
    await expect(this.toast(/Image captured successfully|Failed to capture image/)).toBeVisible();
  }

  /**
   * Counts the colours in an item's tile as the page shows it now, from a screenshot of the
   * tile. Returns the tile's box in page coordinates as well, to find the tile in a capture.
   */
  async tileColorsOnScreen(itemName: string): Promise<{box: Box; colors: number}> {
    const tile = this.item(itemName);
    await tile.scrollIntoViewIfNeeded();
    await expect.poll(() => tile.getByRole('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      {message: `the image of "${itemName}" should load`}).toBe(true);
    const box = await boxOf(tile);
    const scroll = await this.scrollPosition();
    const png = await this.page.screenshot({clip: box, animations: 'disabled'});
    const colors = await this.page.evaluate(countColors, {src: `data:image/png;base64,${png.toString('base64')}`});
    return {box: {...box, x: box.x + scroll.x, y: box.y + scroll.y}, colors};
  }

  /**
   * Finds the most colourful spot of a tile's size in the captured preview image, in the
   * tile's column, and counts its colours. The capture leaves out the header and the toolbar
   * (data-html2canvas-ignore), so the tiles sit higher in it than on the page; their
   * horizontal position is the same.
   */
  async capturedColorsInColumn(box: Box): Promise<number> {
    const src = await this.capturedImage.evaluate((img: HTMLImageElement) => img.currentSrc);
    return this.page.evaluate(countColors, {src, column: box});
  }

  /** Waits for the captured preview image to load, then measures it. */
  async capturedImageDetails(): Promise<CapturedImage> {
    await expect(this.capturedImage).toBeVisible();
    let details: CapturedImage | null = null;
    // The preview can reload while the share panel re-renders, so measure it once it has
    // finished loading.
    await expect(async () => {
      details = await this.capturedImage.evaluate((img: HTMLImageElement) => {
        if (!img.complete || img.naturalWidth === 0) return null;
        const size = 64;
        const small = document.createElement('canvas');
        small.width = size;
        small.height = size;
        const smallContext = small.getContext('2d')!;
        smallContext.drawImage(img, 0, 0, size, size);
        const pixels = smallContext.getImageData(0, 0, size, size).data;
        const colors = new Set<string>();
        for (let index = 0; index < pixels.length; index += 4) {
          colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
        }
        const full = document.createElement('canvas');
        full.width = img.naturalWidth;
        full.height = img.naturalHeight;
        const fullContext = full.getContext('2d')!;
        fullContext.drawImage(img, 0, 0);
        const [red, green, blue] = Array.from(fullContext.getImageData(2, 2, 1, 1).data);
        return {
          width: img.naturalWidth,
          height: img.naturalHeight,
          pageWidth: document.documentElement.clientWidth,
          pageHeight: document.documentElement.scrollHeight,
          devicePixelRatio: window.devicePixelRatio,
          distinctColors: colors.size,
          cornerBrightness: Math.round(0.299 * red + 0.587 * green + 0.114 * blue),
        };
      });
      expect(details, 'the captured image should finish loading').not.toBeNull();
    }).toPass();
    return details!;
  }

  // ---- Zen mode --------------------------------------------------------------------------

  async setZenMode(on: boolean) {
    await this.zenModeToggle.click();
    await expect(this.zenModeToggle).toHaveAttribute('aria-pressed', String(on));
  }

  // ---- Notifications ---------------------------------------------------------------------

  /** A toast notification that contains the given text. */
  toast(text: string | RegExp): Locator {
    return this.page.getByRole('listitem').filter({hasText: text});
  }

  async undoFromToast(text: string | RegExp, options?: {timeout?: number}) {
    await this.toast(text).getByRole('button', {name: 'Undo'}).click(options);
  }
}

type Box = {x: number; y: number; width: number; height: number};
type Point = {x: number; y: number};

/**
 * Runs in the browser: loads an image and counts its different colours (5 bits per channel).
 * With `column` (a box in CSS pixels), it slides a box of that size down that column of the
 * image (scaled by the device pixel ratio) and returns the highest count.
 */
async function countColors({src, column}: {src: string; column?: Box}): Promise<number> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const count = (x: number, y: number, width: number, height: number) => {
    const pixels = context.getImageData(x, y, width, height).data;
    const colors = new Set<number>();
    for (let index = 0; index < pixels.length; index += 4) {
      colors.add(((pixels[index] >> 3) << 10) | ((pixels[index + 1] >> 3) << 5) | (pixels[index + 2] >> 3));
    }
    return colors.size;
  };
  if (!column) return count(0, 0, canvas.width, canvas.height);
  const scale = window.devicePixelRatio;
  const x = Math.round(column.x * scale);
  const width = Math.max(1, Math.round(column.width * scale));
  const height = Math.max(1, Math.round(column.height * scale));
  const step = Math.max(1, Math.round(height / 8));
  let best = 0;
  for (let y = 0; y + height <= canvas.height; y += step) {
    best = Math.max(best, count(x, y, width, height));
  }
  return best;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element is not visible: ${locator}`);
  return box;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function centerOfBox(box: Box): Point {
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function centerOf(locator: Locator): Promise<Point> {
  return centerOfBox(await boxOf(locator));
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
