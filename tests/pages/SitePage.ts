import {type Locator, type Page} from '@playwright/test';

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
}
