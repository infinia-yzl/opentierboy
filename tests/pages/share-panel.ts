import fs from 'node:fs/promises';
import {expect, type Locator, type Page, type Route} from '@playwright/test';
import {boxOf, scrollPosition, type Box} from './helpers';
import {LIST_CARD} from '@/lib/listCard/model';
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

  get captureButton(): Locator {
    return this.sharePanel.getByRole('button', {name: /^(Capture Preview|Capturing\.\.\.)$/});
  }

  private captureState(): Promise<CaptureState> {
    return this.captureButton.or(this.capturedImage).evaluateAll((elements) => ({
      button: elements.find((element) => element instanceof HTMLButtonElement)?.textContent ?? null,
      picture: elements.find((element) => element instanceof HTMLImageElement)?.getAttribute('src') ?? null,
    }));
  }

  private async captureAndExpectSuccess() {
    const before = await this.captureState();
    await this.startCapture();
    let last: CaptureState | null = null;
    try {
      await expect.poll(async () => {
        last = await this.captureState();
        return last.picture;
      }, {message: 'the capture should end with a new picture'}).not.toBe(before.picture);
    } catch (error) {
      const state = last as CaptureState | null;
      const seen = state === null
        ? 'The page answered no read before the wait ended.'
        : `The last read of the page before the wait ended: capture button "${state.button ?? 'absent'}", ${state.picture === null ? 'no picture' : 'the earlier picture'} in the Image tab.`;
      throw new Error(`${(error as Error).message}\n${seen}`);
    }
    await expect(this.captureButton, 'the capture should be over once its picture is on screen').toHaveText('Capture Preview');
    await expect(this.captureButton).toBeEnabled();
  }

  private async holdRequests(urls: RegExp): Promise<HeldRequests> {
    let open!: () => void;
    const released = new Promise<void>((resolve) => {
      open = resolve;
    });
    let held = 0;
    const handled: Promise<void>[] = [];
    const handler = (route: Route) => {
      held += 1;
      const done = released.then(() => route.fallback()).catch(() => undefined);
      handled.push(done);
      return done;
    };
    await this.page.route(urls, handler);
    return {
      held: () => held,
      release: async () => {
        open();
        await Promise.all(handled);
        if (!this.page.isClosed()) await this.page.unroute(urls, handler);
      },
    };
  }

  holdListCardFonts(): Promise<HeldRequests> {
    return this.holdRequests(LIST_CARD_FONTS);
  }

  holdListCardWordmark(): Promise<HeldRequests> {
    return this.holdRequests(LIST_CARD_WORDMARK);
  }

  async failListCardFonts() {
    await this.page.route(LIST_CARD_FONTS, (route) => route.abort());
  }

  async failListCardWordmark() {
    await this.page.route(LIST_CARD_WORDMARK, (route) => route.abort());
  }

  async startCapture() {
    await this.sharePanel.getByRole('button', {name: 'Capture Preview'}).click();
  }

  async holdPictureEncoder() {
    await this.page.addInitScript(() => {
      const gate = window as unknown as {__otbHeldPictures?: Array<() => void>};
      gate.__otbHeldPictures = [];
      const encode = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, ...args: Parameters<typeof encode>) {
        gate.__otbHeldPictures?.push(() => encode.apply(this, args));
      };
    });
  }

  async startCaptureUntilEncoderAsked() {
    await this.startCapture();
    await expect.poll(() => this.page.evaluate(() => (window as unknown as {__otbHeldPictures?: unknown[]}).__otbHeldPictures?.length ?? 0),
      {message: 'the capture should ask the encoder for its picture'}).toBe(1);
  }

  async releasePictureEncoder() {
    await this.page.evaluate(() => {
      const gate = window as unknown as {__otbHeldPictures?: Array<() => void>};
      gate.__otbHeldPictures?.splice(0).forEach((encode) => encode());
    });
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
    const {padding, labelWidth, tileMax, width} = LIST_CARD;
    return this.page.evaluate(countColors, {src, column: {x: padding.x + labelWidth, y: 0, width: tileMax, height: tileMax}, cardWidth: width});
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
    return details;
  }

  async capturedPicture(): Promise<string> {
    const {buffer} = await this.downloadCapturedImage();
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  async capturedPictureDifference(otherPicture: string): Promise<PictureDifference> {
    const picture = await this.capturedPicture();
    return this.page.evaluate(differenceBetween, {first: picture, second: otherPicture});
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

const LIST_CARD_FONTS = /\/_next\/static\/media\/[^/]+\.woff2$/;
const LIST_CARD_WORDMARK = /\/brand\/otb-logo-wide\.png$/;

export interface HeldRequests {
  held: () => number;
  release: () => Promise<void>;
}

interface CaptureState {
  button: string | null;
  picture: string | null;
}

export type CaptureMethod = 'html2canvas-pro' | 'Original html2canvas';

export type FreezeFrame = 'Whole list' | 'Landscape 1200×675' | 'Square 1080×1080' | 'Portrait 1080×1350';

export interface PictureDifference {
  sizes: string;
  differentPixels: number;
  largestChange: number;
  where: Box | null;
}

async function differenceBetween({first, second}: {first: string; second: string}): Promise<PictureDifference> {
  const pixelsOf = async (src: string) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', {willReadFrequently: true})!;
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  };
  const [a, b] = await Promise.all([pixelsOf(first), pixelsOf(second)]);
  const sizes = `${a.width}x${a.height} and ${b.width}x${b.height}`;
  if (a.width !== b.width || a.height !== b.height) return {sizes, differentPixels: -1, largestChange: -1, where: null};
  let differentPixels = 0;
  let largestChange = 0;
  let left = a.width;
  let top = a.height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < a.data.length; index += 4) {
    let change = 0;
    for (let channel = 0; channel < 4; channel++) change = Math.max(change, Math.abs(a.data[index + channel] - b.data[index + channel]));
    if (change === 0) continue;
    differentPixels += 1;
    largestChange = Math.max(largestChange, change);
    const pixel = index / 4;
    const x = pixel % a.width;
    const y = Math.floor(pixel / a.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  const where = differentPixels === 0 ? null : {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
  return {sizes, differentPixels, largestChange, where};
}

export interface CapturedImage {
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  devicePixelRatio: number;
  distinctColors: number;
  cornerBrightness: number;
}

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
