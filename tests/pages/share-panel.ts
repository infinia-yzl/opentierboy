import fs from 'node:fs/promises';
import {expect, type Locator, type Page} from '@playwright/test';
import {boxOf, scrollPosition, type Box} from './helpers';
import {expectOnlyNewToast} from './toasts';
import type {TierListPage} from './tier-list-page';

/**
 * The share panel: the link and the Markdown text (URL tab), and Freeze Frame (Image tab):
 * capture, Download and what the captured picture holds.
 *
 * The panel opens from the Share button in the title row (TierListPage.shareButton).
 *
 * Specs reach it as `tierList.share` (TierListPage.share).
 */
export class SharePanel {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  /** The share panel, a dialog with the heading "Share Your Rankings". */
  get sharePanel(): Locator {
    return this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', {name: 'Share Your Rankings'}),
    });
  }

  /**
   * Freeze Frame's Download, after Capture Preview: returns the downloaded file. When the list
   * does not fit into the picture, the app offers the picture without it in a toast instead.
   */
  async downloadCapturedImage(): Promise<{name: string; buffer: Buffer}> {
    const button = this.sharePanel.getByRole('button', {name: 'Download', exact: true});
    await expect(button).toBeEnabled();
    const download = this.page.waitForEvent('download');
    await button.click();
    const file = await download;
    return {name: file.suggestedFilename(), buffer: await fs.readFile(await file.path())};
  }

  /**
   * Freeze Frame's Download when the list does not fit into the picture: checks the message that
   * says so, takes its "Download picture" and returns that file.
   */
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

  /**
   * Opens the Image tab of the share panel (Freeze Frame), where a capture stays until the next
   * one, opening the panel first when it is closed. The panel opens and closes in the event that
   * asks for it, so once the page has settled one look tells whether it is open.
   */
  async openImageTab() {
    await this.tierList.settled();
    if (!(await this.sharePanel.isVisible())) await this.openSharePanel();
    await this.chooseShareTab('Image');
  }

  /** A share button in the URL tab of the share panel, by its accessible name. */
  socialShareButton(name: string | RegExp): Locator {
    return this.sharePanel.getByRole('button', {name});
  }

  /** A tab of the share panel ("URL" or "Image"). */
  shareTab(name: 'URL' | 'Image'): Locator {
    return this.sharePanel.getByRole('tab', {name});
  }

  /** The Copy Markdown button of the share panel. */
  get copyMarkdownButton(): Locator {
    return this.sharePanel.getByRole('button', {name: 'Copy Markdown'});
  }

  /** Opens the share panel and clicks Copy Markdown (see copyMarkdownInOpenPanel). */
  async copyMarkdown() {
    await this.openSharePanel();
    await this.copyMarkdownInOpenPanel();
  }

  /**
   * Lets the test read the text the app copies. Call it before goto(). Chromium grants read
   * access to the real clipboard. Firefox and WebKit refuse a test that access, so there the
   * page's navigator.clipboard.writeText keeps the text in the page instead, and resolves as
   * the real one does. Either way the test reads what the app handed out.
   */
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

  /** The text the app copied last (see readCopiedText). */
  async clipboardText(): Promise<string> {
    return this.page.evaluate(async () => {
      const copied = (window as unknown as {__otbCopiedText?: string}).__otbCopiedText;
      return copied ?? navigator.clipboard.readText();
    });
  }

  /** The preview that "Capture Preview" (Freeze Frame) shows in the share panel. */
  get capturedImage(): Locator {
    return this.sharePanel.getByRole('img', {name: 'Captured tier list'});
  }

  /** The "Frame" choice in the Image tab of the share panel. Open the tab first (openImageTab). */
  get frameSelect(): Locator {
    return this.sharePanel.getByRole('combobox', {name: 'Frame'});
  }

  /** The notes in the share panel that say which images the link carries. */
  get linkImageNotes(): Locator {
    return this.sharePanel.getByRole('note');
  }

  /**
   * Captures the page as an image from the Image tab of the share panel ("Freeze Frame"),
   * and waits until the app reports the result in a toast. Without a method or a frame, the
   * app's defaults are used.
   */
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

  /**
   * Clicks Capture Preview in the open Image tab, and waits until this capture has shown the
   * toast "Image captured successfully" and no other toast (a failed capture shows "Failed to
   * capture image" instead, and then this fails).
   */
  private async captureAndExpectSuccess() {
    await expectOnlyNewToast(this.page, () => this.sharePanel.getByRole('button', {name: 'Capture Preview'}).click(), 'Image captured successfully');
  }

  /**
   * Counts the colours in an item's tile as the page shows it now, from a screenshot of the
   * tile. Returns the tile's box in page coordinates as well, to find the tile in a capture.
   */
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

  /**
   * Finds the most colourful spot in the first tile column of the captured list card, and
   * counts its colours. Freeze Frame draws the list card (components/ListCard.tsx): 1200 CSS
   * pixels wide, 36 px of space on each side, 120 px tier labels and 92 px tiles for a short
   * list. The picture may hold more pixels than CSS pixels; its width tells how many.
   */
  async capturedCardTileColors(): Promise<number> {
    const src = await this.capturedImage.evaluate((img: HTMLImageElement) => img.currentSrc);
    return this.page.evaluate(countColors, {src, column: {x: 36 + 120, y: 0, width: 92, height: 92}, cardWidth: CARD_WIDTH});
  }

  /** Waits for the captured preview image to load, then measures it. */
  async capturedImageDetails(): Promise<CapturedImage> {
    await expect(this.capturedImage).toBeVisible();
    // The capture is done once the page is no longer busy; decode() waits until the picture
    // has loaded.
    await this.tierList.settled();
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

  /** The Image tab's line before the first capture. */
  get captureHint(): Locator {
    return this.sharePanel.getByText('Capture an image to get started.');
  }

  /** Freeze Frame's Download button, shown after Capture Preview. */
  get downloadButton(): Locator {
    return this.sharePanel.getByRole('button', {name: 'Download', exact: true});
  }

  /** Writes an empty text to the clipboard (see readCopiedText), so a run starts with nothing copied. */
  async emptyClipboard() {
    await this.page.evaluate(() => navigator.clipboard.writeText(''));
  }

  /** Closes the open share panel with the Share button. */
  async closeSharePanelWithShareButton() {
    await this.tierList.shareButton.click();
    await expect(this.sharePanel).toBeHidden();
  }

  /** Closes the open share panel with a click on the Unranked tray's heading, outside the panel. */
  async clickOutsideSharePanel() {
    await this.tierList.unranked.getByRole('heading', {level: 2}).click();
    await expect(this.sharePanel).toBeHidden();
  }

  /** Chooses a tab of the open share panel. */
  async chooseShareTab(name: 'URL' | 'Image') {
    await this.shareTab(name).click();
    await expect(this.shareTab(name)).toHaveAttribute('aria-selected', 'true');
  }

  /** Clicks Copy Markdown in the open share panel, and checks that this click showed the toast "Markdown copied to clipboard". */
  async copyMarkdownInOpenPanel() {
    await expectOnlyNewToast(this.page, () => this.copyMarkdownButton.click(), 'Markdown copied to clipboard');
  }

  /**
   * Clicks Capture Preview in the open Image tab, and waits until the capture has ended: the
   * button reads "Capture Preview" again (it reads "Capturing..." meanwhile), with the picture,
   * and this capture showed the toast "Image captured successfully" and no error toast.
   */
  async captureInOpenPanel() {
    await this.captureAndExpectSuccess();
    await this.tierList.settled();
    await expect(this.sharePanel.getByRole('button', {name: 'Capture Preview'})).toBeEnabled();
    await expect(this.capturedImage).toBeVisible();
  }

  /** Closes the open share panel with Escape, pressed with the focus on the list, and waits until it is hidden. */
  async closeSharePanelWithEscape() {
    await this.tierList.pressEscapeOnList();
    await expect(this.sharePanel).toBeHidden();
  }
}

/** The capture methods offered under "Options" in the Image tab of the share panel. */
export type CaptureMethod = 'html2canvas-pro' | 'Original html2canvas';

/** The pictures offered under "Frame" in the Image tab of the share panel. */
export type FreezeFrame = 'Whole list' | 'Landscape 1200×675' | 'Square 1080×1080' | 'Portrait 1080×1350';

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
  /**
   * SHA-256 of the image's pixels at full size: equal digests mean the same picture. Unlike
   * the 64 x 64 copy, it needs no resizing, which WebKit does not do the same way every time.
   */
  pixelDigest: string;
  /** Brightness (0 to 255) of the top-left corner, where the background shows. */
  cornerBrightness: number;
}

/** Width of the list card that Freeze Frame draws, in CSS pixels (lib/listCard/model.ts). */
const CARD_WIDTH = 1200;

/**
 * Runs in the browser: loads an image and counts its different colours (5 bits per channel).
 * With `column` (a box in CSS pixels), it slides a box of that size down that column of the
 * image (scaled by the device pixel ratio) and returns the highest count.
 */
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
