import fs from 'node:fs/promises';
import {expect, type Locator, type Page} from '@playwright/test';
import {boxOf, scrollPosition, type Box} from './helpers';
import {expectOneNewToast} from './toasts';
import type {TierListPage} from './tier-list-page';

export class SharePanel {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  get sharePanel(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', {name: 'Share Your Rankings'}),
    });
  }

  async downloadCapturedImage(): Promise<{name: string; buffer: Buffer}> {
    const button = this.sharePanel.getByRole('button', {name: 'Download', exact: true});
    await expect(button).toBeEnabled();
    const download = this.page.waitForEvent('download');
    await button.click();
    const file = await download;
    return {name: file.suggestedFilename(), buffer: await fs.readFile(await file.path())};
  }

  async downloadCapturedImageWithoutList(): Promise<{name: string; buffer: Buffer}> {
    const button = this.sharePanel.getByRole('button', {name: 'Download', exact: true});
    await expect(button).toBeEnabled();
    await button.click();
    const offer = this.tierList.toast('This list is too large to keep in the picture');
    await expect(offer).toContainText('Download the picture without the list?');
    const download = this.page.waitForEvent('download');
    await offer.getByRole('button', {name: 'Download picture'}).click();
    const file = await download;
    return {name: file.suggestedFilename(), buffer: await fs.readFile(await file.path())};
  }

  async openSharePanel() {
    await this.tierList.shareButton.click();
    await expect(this.sharePanel).toBeVisible();
  }

  async openImageTab() {
    if (!(await this.sharePanel.isVisible())) await this.openSharePanel();
    await this.chooseShareTab('Image');
  }

  socialShareButton(name: string | RegExp): Locator {
    return this.sharePanel.getByRole('button', {name});
  }

  shareTab(name: 'URL' | 'Image'): Locator {
    return this.sharePanel.getByRole('tab', {name});
  }

  get copyMarkdownButton(): Locator {
    return this.sharePanel.getByRole('button', {name: 'Copy Markdown'});
  }

  async copyMarkdown() {
    await this.openSharePanel();
    await this.copyMarkdownInOpenPanel();
  }

  async readCopiedText() {
    const context = this.page.context();
    if (context.browser()?.browserType().name() === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      return;
    }
    await this.page.addInitScript(() => {
      const copied = window as unknown as {__otbCopiedText?: string};
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          ...navigator.clipboard,
          writeText: async (text: string) => {
            copied.__otbCopiedText = text;
          },
        },
      });
    });
  }

  async clipboardText(): Promise<string> {
    return this.page.evaluate(async () => {
      const copied = (window as unknown as {__otbCopiedText?: string}).__otbCopiedText;
      return copied ?? navigator.clipboard.readText();
    });
  }

  get capturedImage(): Locator {
    return this.sharePanel.getByRole('img', {name: 'Captured tier list'});
  }

  get frameSelect(): Locator {
    return this.sharePanel.getByRole('combobox', {name: 'Frame'});
  }

  get linkImageNotes(): Locator {
    return this.sharePanel.getByRole('note');
  }

  async capturePreview(method?: CaptureMethod, frame?: FreezeFrame) {
    await this.openSharePanel();
    await this.sharePanel.getByRole('tab', {name: 'Image'}).click();
    if (frame) {
      await this.frameSelect.click();
      await this.page.getByRole('option', {name: frame, exact: true}).click();
      await expect(this.frameSelect).toHaveText(frame);
    }
    if (method) {
      await this.sharePanel.getByRole('button', {name: 'Options'}).click();
      const methodSelect = this.sharePanel.getByRole('combobox', {name: 'Capture method'});
      await methodSelect.click();
      await this.page.getByRole('option', {name: method, exact: true}).click();
      await expect(methodSelect).toHaveText(method);
    }
    await this.captureAndExpectSuccess();
  }

  private async captureAndExpectSuccess() {
    await expectOneNewToast(this.page, () => this.sharePanel.getByRole('button', {name: 'Capture Preview'}).click(), 'Image captured successfully');
  }

  async tileColorsOnScreen(itemName: string): Promise<{box: Box; colors: number}> {
    const tile = this.tierList.item(itemName);
    await tile.scrollIntoViewIfNeeded();
    await expect.poll(() => tile.getByRole('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      {message: `the image of "${itemName}" should load`}).toBe(true);
    const box = await boxOf(tile);
    const scroll = await scrollPosition(this.page);
    const png = await this.page.screenshot({clip: box, animations: 'disabled'});
    const colors = await this.page.evaluate(countColors, {src: `data:image/png;base64,${png.toString('base64')}`});
    return {box: {...box, x: box.x + scroll.x, y: box.y + scroll.y}, colors};
  }

  async capturedCardTileColors(): Promise<number> {
    const src = await this.capturedImage.evaluate((img: HTMLImageElement) => img.currentSrc);
    return this.page.evaluate(countColors, {src, column: {x: 36 + 120, y: 0, width: 92, height: 92}, cardWidth: CARD_WIDTH});
  }

  async capturedImageDetails(): Promise<CapturedImage> {
    await expect(this.sharePanel.getByRole('button', {name: 'Capture Preview'})).toBeEnabled();
    await expect(this.capturedImage).toBeVisible();
    const details = await this.capturedImage.evaluate(async (img: HTMLImageElement) => {
      await img.decode();
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
      const digest = await crypto.subtle.digest('SHA-256', fullContext.getImageData(0, 0, full.width, full.height).data);
      const pixelDigest = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        pageWidth: document.documentElement.clientWidth,
        pageHeight: document.documentElement.scrollHeight,
        devicePixelRatio: window.devicePixelRatio,
        distinctColors: colors.size,
        pixelDigest,
        cornerBrightness: Math.round(0.299 * red + 0.587 * green + 0.114 * blue),
      };
    });
    return details;
  }

  get captureHint(): Locator {
    return this.sharePanel.getByText('Capture an image to get started.');
  }

  get downloadButton(): Locator {
    return this.sharePanel.getByRole('button', {name: 'Download', exact: true});
  }

  async emptyClipboard() {
    await this.page.evaluate(() => navigator.clipboard.writeText(''));
  }

  async closeSharePanelWithShareButton() {
    await this.tierList.shareButton.click();
    await expect(this.sharePanel).toBeHidden();
  }

  async clickOutsideSharePanel() {
    await this.tierList.unranked.getByRole('heading', {level: 2}).click();
    await expect(this.sharePanel).toBeHidden();
  }

  async chooseShareTab(name: 'URL' | 'Image') {
    await this.shareTab(name).click();
    await expect(this.shareTab(name)).toHaveAttribute('aria-selected', 'true');
  }

  async copyMarkdownInOpenPanel() {
    await expectOneNewToast(this.page, () => this.copyMarkdownButton.click(), 'Markdown copied to clipboard');
  }

  async captureInOpenPanel() {
    await this.captureAndExpectSuccess();
    await expect(this.sharePanel.getByRole('button', {name: 'Capture Preview'})).toBeEnabled();
    await expect(this.capturedImage).toBeVisible();
  }

  async closeSharePanelWithEscape() {
    await this.tierList.pressEscapeOnList();
    await expect(this.sharePanel).toBeHidden();
  }
}

export type CaptureMethod = 'html2canvas-pro' | 'Original html2canvas';

export type FreezeFrame = 'Whole list' | 'Landscape 1200×675' | 'Square 1080×1080' | 'Portrait 1080×1350';

export interface CapturedImage {
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  devicePixelRatio: number;
  distinctColors: number;
  pixelDigest: string;
  cornerBrightness: number;
}

const CARD_WIDTH = 1200;

async function countColors({src, column, cardWidth}: {src: string; column?: Box; cardWidth?: number}): Promise<number> {
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
  const scale = cardWidth ? image.naturalWidth / cardWidth : window.devicePixelRatio;
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
