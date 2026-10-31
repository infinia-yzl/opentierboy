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
    this.navigation = page.getByRole('navigation');
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
    const menu = await this.openAppearance();
    await menu.getByRole('menuitemradio', {name: mode[0].toUpperCase() + mode.slice(1)}).click();
    await this.closeAppearance();
    // The site remembers the choice (next-themes keeps it in localStorage).
    await expect.poll(() => this.page.evaluate(() => localStorage.getItem('theme'))).toBe(mode);
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

  /** The font family the page body uses, as the browser computes it. */
  async bodyFont(): Promise<string> {
    return this.page.evaluate(() => getComputedStyle(document.body).fontFamily);
  }

  /** The value of a colour token on <html> (for example `--primary`). */
  async token(name: string): Promise<string> {
    return this.page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);
  }

  /** True while <html> carries a class (the mode, the font and the game colours setting live there). */
  async pageHasClass(name: string): Promise<boolean> {
    return this.page.evaluate((className) => document.documentElement.classList.contains(className), name);
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

  /** The site footer. */
  get footer(): Locator {
    return this.page.getByRole('contentinfo');
  }

  /** The background and text colours of an element and of the page, as the browser computes them. */
  async colorsOf(element: Locator): Promise<{background: string; text: string; pageBackground: string; pageText: string}> {
    return element.evaluate((node) => {
      const own = getComputedStyle(node);
      const body = getComputedStyle(document.body);
      return {background: own.backgroundColor, text: own.color, pageBackground: body.backgroundColor, pageText: body.color};
    });
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
