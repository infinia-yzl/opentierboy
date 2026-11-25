import {expect, type Locator, type Page} from '@playwright/test';
import {expectHydrated} from '../support/hydrated';
import {toasts} from './toasts';
import {UNTIL_STARTED} from './helpers';

export type ThemeMode = 'light' | 'dark' | 'system';
export type FontChoice = 'Modern' | 'Classic';

export class SitePage {
  readonly page: Page;
  readonly navigation: Locator;
  readonly main: Locator;

  constructor(page: Page) {
    this.page = page;
    this.navigation = page.getByRole('banner').getByRole('navigation');
    this.main = page.getByRole('main');
  }

  async gotoHome() {
    await this.goto('/');
  }

  async goto(path: string) {
    await this.page.goto(path, UNTIL_STARTED);
    await this.ready();
  }

  async reload() {
    await this.page.reload(UNTIL_STARTED);
    await this.ready();
  }

  async ready() {
    await expectHydrated(this.page);
  }

  async openFromNavigation(linkName: 'About' | 'Blog') {
    await this.navigation.getByRole('link', {name: linkName}).click();
  }

  heading(name: string): Locator {
    return this.main.getByRole('heading', {name});
  }

  headerButton(name: string): Locator {
    return this.page.getByRole('banner').getByRole('button', {name, exact: true});
  }

  mainLink(name: string | RegExp): Locator {
    return this.main.getByRole('link', {name});
  }

  get pageHeading(): Locator {
    return this.page.getByRole('heading', {level: 1});
  }

  get appearanceButton(): Locator {
    return this.page.getByRole('banner').getByRole('button', {name: 'Appearance'});
  }

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

  async chooseMode(mode: ThemeMode) {
    await this.openAppearance();
    await this.modeOption(mode).click();
    await expect(this.modeOption(mode)).toBeChecked();
    await this.closeAppearance();
  }

  async chooseFont(font: FontChoice) {
    const menu = await this.openAppearance();
    await menu.getByRole('menuitemradio', {name: font}).click();
    await this.closeAppearance();
  }

  async setGameColours(on: boolean) {
    const menu = await this.openAppearance();
    const item = menu.getByRole('menuitemcheckbox', {name: 'Game colours'});
    if ((await item.getAttribute('aria-checked')) !== String(on)) await item.click();
    await expect(item).toHaveAttribute('aria-checked', String(on));
    await this.closeAppearance();
  }

  get body(): Locator {
    return this.page.locator('body');
  }

  modeOption(mode: ThemeMode): Locator {
    return this.page.getByRole('menu').getByRole('menuitemradio', {name: mode[0].toUpperCase() + mode.slice(1)});
  }

  async rememberBeforeLoad(key: string, value: string) {
    await this.page.addInitScript(([storageKey, storedValue]) => {
      if (!sessionStorage.getItem('test-remembered-' + storageKey)) {
        localStorage.setItem(storageKey, storedValue);
        sessionStorage.setItem('test-remembered-' + storageKey, '1');
      }
    }, [key, value]);
  }

  async colorsOf(element: Locator): Promise<{background: string; text: string; pageBackground: string; pageText: string}> {
    return element.evaluate((node) => {
      const own = getComputedStyle(node);
      const body = getComputedStyle(document.body);
      return {background: own.backgroundColor, text: own.color, pageBackground: body.backgroundColor, pageText: body.color};
    });
  }

  card(name: string): Locator {
    return this.main.getByRole('region', {name, exact: true});
  }

  templateButtons(setName: string): Locator {
    return this.card(setName).getByRole('navigation', {name: `${setName} templates`}).getByRole('link');
  }

  templateButton(setName: string, name: string): Locator {
    return this.card(setName).getByRole('navigation', {name: `${setName} templates`}).getByRole('link', {name, exact: true});
  }

  async imageHasLoaded(image: Locator): Promise<boolean> {
    return image.evaluate((node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0);
  }

  async hoverCard(name: string) {
    await this.card(name).getByRole('heading', {level: 3}).hover();
    await expect.poll(async () => (await this.cardLayers(name)).background?.opacity).toBe('1');
  }

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

  get ownListCard(): Locator {
    return this.card('Your own list');
  }

  get dropArea(): Locator {
    return this.ownListCard.getByText('Drop images or a Freeze Frame here');
  }

  get openListDialog(): Locator {
    return this.page.getByRole('alertdialog', {name: 'Open the list in this file?'});
  }

  async openFreezeFrame(file: {name: string; mimeType: string; buffer: Buffer}) {
    const chooser = this.page.waitForEvent('filechooser');
    await this.ownListCard.getByRole('button', {name: 'Open a Freeze Frame'}).click();
    await (await chooser).setFiles(file);
  }

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

  async confirmOpenList() {
    await this.openListDialog.getByRole('button', {name: 'Open list'}).click();
    await expect(this.page).toHaveURL(/\/rank\b.*\?state=/);
  }

  get cardTitles(): Locator {
    return this.main.getByRole('heading', {level: 3});
  }

  get recentlyViewed(): Locator {
    return this.main.getByRole('region', {name: 'Recently viewed'});
  }

  get recentLinks(): Locator {
    return this.recentlyViewed.getByRole('link');
  }

  recentLink(name: string): Locator {
    return this.recentlyViewed.getByRole('link', {name, exact: true});
  }

  async openRecentLink(name: string) {
    await this.gotoHome();
    await this.recentLink(name).click();
    await expect(this.main.getByRole('heading', {level: 1, name, exact: true})).toBeVisible();
  }

  recentPinButton(name: string): Locator {
    return this.recentlyViewed.getByRole('button', {name: `Pin ${name}`, exact: true});
  }

  async removeRecentLink(name: string) {
    await this.recentlyViewed.getByRole('button', {name: `Remove ${name}`, exact: true}).click();
  }

  async linkTargets(): Promise<string[]> {
    const links = await this.main.getByRole('link').all();
    return Promise.all(links.map(async (link) => (await link.getAttribute('href')) ?? ''));
  }

  async appearanceMenuReady() {
    await expect(this.appearanceButton).toHaveAttribute('aria-haspopup', 'menu');
  }

  async storedValue(key: string): Promise<string | null> {
    return this.page.evaluate((storageKey) => localStorage.getItem(storageKey), key);
  }

  async visitAboutAndGoBack() {
    const before = this.page.url();
    await this.openFromNavigation('About');
    await expect(this.page).toHaveURL(/\/about$/);
    await expect(this.pageHeading).toBeVisible();
    await this.page.goBack(UNTIL_STARTED);
    await expect(this.page).toHaveURL(before);
    await this.ready();
    await this.appearanceMenuReady();
  }

  async seedRecentLinks(stored: string) {
    await this.gotoHome();
    await this.page.evaluate((value) => {
      localStorage.clear();
      localStorage.setItem('otb-recent-links', value);
    }, stored);
    await this.reload();
    await expect(this.recentlyViewed).toBeVisible();
  }

  async recentOpenedAt(title: string): Promise<number> {
    return this.page.evaluate((name) => {
      try {
        const stored = JSON.parse(localStorage.getItem('otb-recent-links') ?? 'null') as {links?: {title?: string; openedAt?: number}[]} | null;
        return stored?.links?.find((link) => link.title === name)?.openedAt ?? 0;
      } catch {
        return 0;
      }
    }, title);
  }

  private async waitUntilRecorded(title: string, before: number) {
    await expect(this.main.getByRole('heading', {level: 1, name: title, exact: true})).toBeVisible();
    await expect.poll(() => this.recentOpenedAt(title), {
      message: `Recently viewed records ${title}`,
    }).toBeGreaterThan(before);
  }

  private async returnHome() {
    await this.gotoHome();
    await expect(this.recentlyViewed).toBeVisible();
  }

  async openListAndReturnHome(href: string, title: string) {
    const before = await this.recentOpenedAt(title);
    await this.page.goto(href, UNTIL_STARTED);
    await this.waitUntilRecorded(title, before);
    await this.returnHome();
  }

  async reopenRecentLinkAndReturnHome(title: string) {
    const before = await this.recentOpenedAt(title);
    await this.recentLink(title).click();
    await this.waitUntilRecorded(title, before);
    await this.returnHome();
  }

  recentToast(text: string): Locator {
    return toasts(this.page).filter({hasText: text});
  }

  get pressedRecentPinButtons(): Locator {
    return this.recentlyViewed.getByRole('button', {name: /^Pin /, pressed: true});
  }

  async pinRecentLink(name: string, refusal: string) {
    await this.recentPinButton(name).click();
    const pinned = this.recentlyViewed.getByRole('button', {name: `Pin ${name}`, exact: true, pressed: true});
    await expect(pinned.or(this.recentToast(refusal))).toBeVisible();
    await this.page.mouse.move(0, 0);
  }

  async unpinRecentLink(name: string) {
    await this.recentPinButton(name).click();
    await expect(this.recentPinButton(name)).toHaveAttribute('aria-pressed', 'false');
  }

  async removeRecentLinkAndWait(name: string) {
    await this.removeRecentLink(name);
    await expect(this.recentLink(name)).toHaveCount(0);
  }

  get openFreezeFrameButton(): Locator {
    return this.ownListCard.getByRole('button', {name: 'Open a Freeze Frame'});
  }

  async openFreezeFrameAndWaitForDialog(file: {name: string; mimeType: string; buffer: Buffer}) {
    await this.openFreezeFrame(file);
    await expect(this.openListDialog).toBeVisible();
  }
}

