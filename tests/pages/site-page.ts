import {expect, type Locator, type Page} from '@playwright/test';

export type ThemeMode = 'light' | 'dark' | 'system';
export type FontChoice = 'Modern' | 'Classic';

/** Page object for the content pages that share the site navigation. */
export class SitePage {
  readonly page: Page;
  readonly navigation: Locator;
  readonly main: Locator;

  constructor(page: Page) {
    this.page = page;
    // The site navigation in the header (the landing page's cards have navigations of their own).
    this.navigation = page.getByRole('banner').getByRole('navigation');
    this.main = page.getByRole('main');
  }

  async gotoHome() {
    await this.page.goto('/');
  }

  async openFromNavigation(linkName: 'About' | 'Blog') {
    await this.navigation.getByRole('link', {name: linkName}).click();
  }

  heading(name: string): Locator {
    return this.main.getByRole('heading', {name});
  }

  /** A button in the site header. */
  headerButton(name: string): Locator {
    return this.page.getByRole('banner').getByRole('button', {name, exact: true});
  }

  /** A link in the page's main content. */
  mainLink(name: string | RegExp): Locator {
    return this.main.getByRole('link', {name});
  }

  /** The h1 heading of the page. */
  get pageHeading(): Locator {
    return this.page.getByRole('heading', {level: 1});
  }

  /** The Appearance menu button in the site header. */
  get appearanceButton(): Locator {
    return this.page.getByRole('banner').getByRole('button', {name: 'Appearance'});
  }

  /** Opens the Appearance menu. It stays open after a choice; Escape closes it. */
  async openAppearance(): Promise<Locator> {
    await this.appearanceButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async closeAppearance() {
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('menu')).toBeHidden();
  }

  /** Picks Light, Dark or System in the Appearance menu. */
  async chooseMode(mode: ThemeMode) {
    await this.openAppearance();
    await this.modeOption(mode).click();
    await expect(this.modeOption(mode)).toBeChecked();
    await this.closeAppearance();
  }

  /** Picks the Modern or Classic font in the Appearance menu. */
  async chooseFont(font: FontChoice) {
    const menu = await this.openAppearance();
    await menu.getByRole('menuitemradio', {name: font}).click();
    await this.closeAppearance();
  }

  /** Turns Game colours on or off in the Appearance menu. */
  async setGameColours(on: boolean) {
    const menu = await this.openAppearance();
    const item = menu.getByRole('menuitemcheckbox', {name: 'Game colours'});
    if ((await item.getAttribute('aria-checked')) !== String(on)) await item.click();
    await expect(item).toHaveAttribute('aria-checked', String(on));
    await this.closeAppearance();
  }

  /**
   * The page body, for its computed font and background colour. The body has no role, so this
   * is a CSS selector.
   */
  get body(): Locator {
    return this.page.locator('body');
  }

  /** A Mode option (Light, Dark or System) in the Appearance menu. Open the menu first (openAppearance). */
  modeOption(mode: ThemeMode): Locator {
    return this.page.getByRole('menu').getByRole('menuitemradio', {name: mode[0].toUpperCase() + mode.slice(1)});
  }

  /** Stores an appearance value before the next page load, as an earlier visit would have. */
  async rememberBeforeLoad(key: string, value: string) {
    await this.page.addInitScript(([storageKey, storedValue]) => {
      if (!sessionStorage.getItem('test-remembered-' + storageKey)) {
        localStorage.setItem(storageKey, storedValue);
        sessionStorage.setItem('test-remembered-' + storageKey, '1');
      }
    }, [key, value]);
  }

  /** The background and text colours of an element and of the page, as the browser computes them. */
  async colorsOf(element: Locator): Promise<{background: string; text: string; pageBackground: string; pageText: string}> {
    return element.evaluate((node) => {
      const own = getComputedStyle(node);
      const body = getComputedStyle(document.body);
      return {background: own.backgroundColor, text: own.color, pageBackground: body.backgroundColor, pageText: body.color};
    });
  }

  // ---- Landing page: "Create a New Tier List" ------------------------------------------------

  /** A card under "Create a New Tier List": THE FINALS, OVERWATCH or Your own list. */
  card(name: string): Locator {
    return this.main.getByRole('region', {name, exact: true});
  }

  /** The template buttons (links) of an image-set card, in order. */
  templateButtons(setName: string): Locator {
    return this.card(setName).getByRole('navigation', {name: `${setName} templates`}).getByRole('link');
  }

  /** A template button by its accessible name, for example "Tank, about 10 items". */
  templateButton(setName: string, name: string): Locator {
    return this.card(setName).getByRole('navigation', {name: `${setName} templates`}).getByRole('link', {name, exact: true});
  }

  /** True once the picture has loaded (the browser decoded it). */
  async imageHasLoaded(image: Locator): Promise<boolean> {
    return image.evaluate((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0);
  }

  /** Moves the mouse over a card, and waits until its hover background has faded in. */
  async hoverCard(name: string) {
    await this.card(name).getByRole('heading', {level: 3}).hover();
    await expect.poll(async () => (await this.cardLayers(name)).background?.opacity).toBe('1');
  }

  /**
   * The two layers of an image-set card that draw the set's background image: the background
   * that fades in on hover, and the underline under the title. Both are decorative and have no
   * role, so they are found by their computed background image, inside the card.
   */
  async cardLayers(name: string): Promise<{
    background: {opacity: string; backgroundImage: string} | null;
    underline: {backgroundImage: string; height: number} | null;
  }> {
    return this.card(name).evaluate((card) => {
      const layers = Array.from(card.querySelectorAll('*')).filter((node) => getComputedStyle(node).backgroundImage.startsWith('url('));
      const layer = (node: Element | undefined) => (node ? getComputedStyle(node) : null);
      const background = layer(layers.find((node) => node.getBoundingClientRect().height > 2));
      const underlineNode = layers.find((node) => node.getBoundingClientRect().height <= 2);
      return {
        background: background ? {opacity: background.opacity, backgroundImage: background.backgroundImage} : null,
        underline: underlineNode
          ? {backgroundImage: getComputedStyle(underlineNode).backgroundImage, height: underlineNode.getBoundingClientRect().height}
          : null,
      };
    });
  }

  /**
   * The colour of a template button's item count as [red, green, blue, alpha], each 0-255.
   * Browsers write computed colours in different notations (rgba, oklab), so the page draws the
   * colour on a canvas and reads the pixel back.
   */
  async templateCountColour(setName: string, name: string): Promise<number[]> {
    return this.templateButton(setName, name).getByText(/^\d+\+?$/).evaluate((node) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) return [];
      context.fillStyle = getComputedStyle(node).color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    });
  }

  /** The "Your own list" card. */
  get ownListCard(): Locator {
    return this.card('Your own list');
  }

  /** The drop area of "Your own list", found by its text (it has no role). */
  get dropArea(): Locator {
    return this.ownListCard.getByText('Drop images or a Freeze Frame here');
  }

  /** "Open the list in this file?", the dialog a Freeze Frame file opens. */
  get openListDialog(): Locator {
    return this.page.getByRole('alertdialog', {name: 'Open the list in this file?'});
  }

  /** Chooses a file with "Open a Freeze Frame" in "Your own list", as the file chooser would. */
  async openFreezeFrame(file: {name: string; mimeType: string; buffer: Buffer}) {
    const chooser = this.page.waitForEvent('filechooser');
    await this.ownListCard.getByRole('button', {name: 'Open a Freeze Frame'}).click();
    await (await chooser).setFiles(file);
  }

  /** Drops a file onto the drop area of "Your own list", as dragging it from the desktop would. */
  async dropOnDropArea(file: {name: string; mimeType: string; buffer: Buffer}) {
    const transfer = await this.page.evaluateHandle(({name, mimeType, base64}) => {
      const data = new DataTransfer();
      data.items.add(new File([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], name, {type: mimeType}));
      return data;
    }, {name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64')});
    await this.dropArea.dispatchEvent('dragenter', {dataTransfer: transfer});
    await this.dropArea.dispatchEvent('dragover', {dataTransfer: transfer});
    await this.dropArea.dispatchEvent('drop', {dataTransfer: transfer});
  }

  /** Confirms "Open the list in this file?" and waits until the editor's address replaced the landing page. */
  async confirmOpenList() {
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect(this.page).toHaveURL(/\/rank\b.*\?state=/);
  }

  /** The titles of the cards under "Create a New Tier List" on the landing page. */
  get cardTitles(): Locator {
    return this.main.getByRole('heading', {level: 3});
  }

  /** The "Recently viewed" section of the landing page. */
  get recentlyViewed(): Locator {
    return this.main.getByRole('region', {name: 'Recently viewed'});
  }

  /** The links in "Recently viewed", in order. */
  get recentLinks(): Locator {
    return this.recentlyViewed.getByRole('link');
  }

  /** The link of one recently viewed list, by its name. */
  recentLink(name: string): Locator {
    return this.recentlyViewed.getByRole('link', {name, exact: true});
  }

  /** The pin toggle of a recently viewed list (pressed when pinned). */
  recentPinButton(name: string): Locator {
    return this.recentlyViewed.getByRole('button', {name: `Pin ${name}`, exact: true});
  }

  async removeRecentLink(name: string) {
    await this.recentlyViewed.getByRole('button', {name: `Remove ${name}`, exact: true}).click();
  }

  /** The address of every link in the main content. */
  async linkTargets(): Promise<string[]> {
    const links = await this.main.getByRole('link').all();
    return Promise.all(links.map(async (link) => (await link.getAttribute('href')) ?? ''));
  }
}
