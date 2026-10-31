import {expect, type Locator, type Page} from '@playwright/test';

export type ColorTheme = 'classic' | 'ocean' | 'forest';
export type ThemeMode = 'light' | 'dark';

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

  /** Picks a colour theme and mode in the theme menu of the site header. */
  async chooseTheme(colorTheme: ColorTheme, mode: ThemeMode) {
    await this.page.getByRole('button', {name: 'Select theme'}).click();
    await this.page.getByRole('button', {name: `Set ${colorTheme} ${mode} theme`}).click();
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('menu')).toBeHidden();
    // The site remembers the choice (next-themes keeps it in localStorage).
    const stored = colorTheme === 'classic' ? mode : `${colorTheme}-${mode}`;
    await expect.poll(() => this.page.evaluate(() => localStorage.getItem('theme'))).toBe(stored);
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
