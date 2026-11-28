import {expect, type Locator, type Page} from '@playwright/test';
import {boxOf, centerOfBox, menuClosedOnto, type Box, type Point} from './helpers';
import type {TierListPage} from './tier-list-page';

export type InkColourName = 'Red' | 'Blue' | 'Contrast';

export const INK_SUPPLY = 500;
const ZIGZAG_SPAN = 60;

export function notesName(count: number): string {
  return `Scribbles: ${count === 0 ? 'no notes' : count === 1 ? '1 note' : `${count} notes`}`;
}

export class Scribble {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  get toggle(): Locator {
    return this.tierList.zen.zenBar.getByRole('button', {name: 'Scribble', exact: true});
  }

  get controls(): Locator {
    return this.page.getByRole('toolbar', {name: 'Scribble', exact: true});
  }

  get inkColourButton(): Locator {
    return this.controls.getByRole('button', {name: /^Ink colour: /});
  }

  get removeLastNoteButton(): Locator {
    return this.controls.getByRole('button', {name: 'Remove last note', exact: true});
  }

  get clearButton(): Locator {
    return this.controls.getByRole('button', {name: 'Clear scribbles', exact: true});
  }

  get inkStatus(): Locator {
    return this.controls.getByRole('status');
  }

  get inkNotice(): Locator {
    return this.page.getByRole('status').filter({hasText: 'The scribbles in this link could not be shown.'});
  }

  inkInAddress(): string | null {
    const value = new URL(this.page.url()).searchParams.get('ink');
    return value === null ? null : value.replace(/ /g, '+');
  }

  stateInAddress(): string | null {
    const value = new URL(this.page.url()).searchParams.get('state');
    return value === null ? null : value.replace(/ /g, '+');
  }

  async gotoWithInk(path: string, state: string | undefined, ink: string) {
    await this.tierList.goto(state ? `${path}?state=${state}&ink=${ink}` : `${path}?ink=${ink}`);
  }

  async drawNoteAndWaitForInk(target: Locator, notes: number) {
    const before = this.page.url();
    await this.drawCircleOn(target);
    await this.expectNotes(notes);
    await expect(this.page, 'the address should hold the new ink').not.toHaveURL(before);
  }

  async holdScribbleKey() {
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const keyboard = this.page.keyboard;
    await keyboard.down('d');
    await keyboard.down('d');
    await keyboard.down('d');
    await keyboard.down('d');
    await keyboard.up('d');
  }

  async strokeWithPointer(pointerType: 'touch' | 'pen', points: readonly Point[], end: 'pointerup' | 'pointercancel' | 'none' = 'pointerup') {
    const [first, ...rest] = points;
    const last = rest[rest.length - 1] ?? first;
    const event = (point: Point) => ({pointerId: 7, pointerType, isPrimary: true, button: 0, clientX: point.x, clientY: point.y, bubbles: true});
    await this.layer.dispatchEvent('pointerdown', {...event(first), buttons: 1});
    for (const point of rest) await this.layer.dispatchEvent('pointermove', {...event(point), buttons: 1});
    if (end !== 'none') await this.layer.dispatchEvent(end, event(last));
  }

  async movePointerAfterStroke(pointerType: 'touch' | 'pen', point: Point) {
    const event = {pointerId: 7, pointerType, isPrimary: true, button: 0, clientX: point.x, clientY: point.y, bubbles: true};
    await this.layer.dispatchEvent('pointermove', {...event, buttons: 1});
    await this.layer.dispatchEvent('pointerup', event);
  }

  async tickPointsAt(target: Locator, x: number, y: number): Promise<Point[]> {
    const from = await this.pointIn(target, x, y);
    return [from, {x: from.x + 12, y: from.y + 12}, {x: from.x + 30, y: from.y - 10}];
  }

  async placeOnTile(note: Locator, itemName: string): Promise<Box> {
    const [ink, tile] = await this.boxes(note, this.tierList.itemImage(itemName));
    const part = (value: number) => Math.round((value / tile.height) * 100) / 100;
    return {x: part(ink.x - tile.x), y: part(ink.y - tile.y), width: part(ink.width), height: part(ink.height)};
  }

  async expectPlaceOnTile(note: Locator, itemName: string, place: Box, message: string) {
    await expect.poll(async () => {
      const now = await this.placeOnTile(note, itemName);
      return Math.max(Math.abs(now.x - place.x), Math.abs(now.y - place.y), Math.abs(now.width - place.width), Math.abs(now.height - place.height));
    }, {message: `${message}: the note should be where it was on its tile, and as large`}).toBeLessThanOrEqual(0.02);
  }

  async prepareInkWriteRefusals() {
    await this.page.addInitScript(() => {
      const refusals = {left: 0};
      const inkOf = (address: string) => new URL(address, window.location.href).searchParams.get('ink');
      for (const name of ['pushState', 'replaceState'] as const) {
        const write = History.prototype[name];
        History.prototype[name] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
          const writesInk = url !== undefined && url !== null && inkOf(String(url)) !== inkOf(window.location.href);
          if (writesInk && refusals.left > 0) {
            refusals.left--;
            throw new DOMException('Too many calls to the history', 'SecurityError');
          }
          write.call(this, data, unused, url);
        };
      }
      Object.defineProperty(window, 'inkWriteRefusals', {value: refusals});
    });
  }

  async refuseNextInkWrite(writes = 1) {
    await this.page.evaluate((left) => {
      const refusals = (window as unknown as {inkWriteRefusals?: {left: number}}).inkWriteRefusals;
      if (!refusals) throw new Error('Call prepareInkWriteRefusals before the page opens.');
      refusals.left = left;
    }, writes);
  }

  async setInkWriteLimit(limit: {writes: number; windowMs: number} | null) {
    await this.page.evaluate(([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }, ['otb-ink-write-limit', limit === null ? null : JSON.stringify(limit)] as const);
  }

  async drawNoteHeld(target: Locator, notes: number) {
    const before = this.page.url();
    await this.drawCircleOn(target);
    await this.expectNotes(notes);
    expect(this.page.url(), 'a held note should not be in the address yet').toBe(before);
  }

  async hidePage() {
    await this.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  async expectCaptionUnder(itemName: string) {
    await expect.poll(async () => {
      const [item, picture] = await this.boxes(this.tierList.item(itemName), this.tierList.itemImage(itemName));
      return item.height - picture.height;
    }, {message: `the name of ${itemName} should sit under its tile`}).toBeGreaterThan(5);
  }

  get urlLengthWarning(): Locator {
    return this.page.getByRole('heading', {name: /SIDE-QUEST UNLOCKED/});
  }

  get layer(): Locator {
    return this.page.getByRole('group', {name: /^Scribbles: /});
  }

  get notes(): Locator {
    return this.layer.getByRole('img');
  }

  note(name: string): Locator {
    return this.layer.getByRole('img', {name, exact: true});
  }

  async expectNotes(count: number) {
    await expect(this.layer).toHaveAccessibleName(notesName(count));
  }

  async expectScribble(on: boolean) {
    await expect(this.toggle).toHaveAttribute('aria-pressed', String(on));
    await expect(this.controls).toHaveCount(on ? 1 : 0);
  }

  async setScribble(on: boolean) {
    await expect(this.toggle).toHaveAttribute('aria-pressed', String(!on));
    await this.toggle.click();
    await this.expectScribble(on);
  }

  async gotoWithScribble(path: string, state?: string) {
    await this.tierList.goto(path, state);
    await this.tierList.zen.setZenMode(true);
    await this.setScribble(true);
  }

  async pressScribbleKey() {
    await this.page.keyboard.press('d');
  }

  async tooltipOf(button: Locator): Promise<Locator> {
    await button.hover();
    const tooltip = this.page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    return tooltip;
  }

  async press(points: readonly Point[]) {
    const [first, ...rest] = points;
    const mouse = this.page.mouse;
    await mouse.move(first.x, first.y);
    await mouse.down();
    for (const point of rest) await mouse.move(point.x, point.y);
  }

  async lift() {
    await this.page.mouse.up();
  }

  async draw(points: readonly Point[]) {
    await this.press(points);
    await this.lift();
  }

  async circleOf(target: Locator): Promise<Point[]> {
    const box = await boxOf(target);
    const centre = centerOfBox(box);
    const radius = Math.min(box.width, box.height) * 0.4;
    return Array.from({length: 13}, (_, index) => {
      const angle = (index / 12) * 2 * Math.PI;
      return {x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle)};
    });
  }

  async drawCircleOn(target: Locator) {
    await this.draw(await this.circleOf(target));
  }

  async drawTickAt(from: Point) {
    await this.draw([from, {x: from.x + 12, y: from.y + 12}, {x: from.x + 30, y: from.y - 10}]);
  }

  async pointIn(target: Locator, x: number, y: number): Promise<Point> {
    const box = await boxOf(target);
    return {x: box.x + box.width * x, y: box.y + box.height * y};
  }

  async dotAt(point: Point) {
    await this.draw([point]);
  }

  async pressToggle() {
    const pressed = await this.toggle.getAttribute('aria-pressed');
    await this.toggle.click();
    await this.expectScribble(pressed !== 'true');
  }

  async pressScribbleKeyOnList() {
    const pressed = await this.toggle.getAttribute('aria-pressed');
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await this.pressScribbleKey();
    await this.expectScribble(pressed !== 'true');
  }

  async pressOnItemAndMoveTo(itemName: string, tierName: string) {
    const [from, to] = await Promise.all([boxOf(this.tierList.item(itemName)), boxOf(this.tierList.tier(tierName))]);
    const start = centerOfBox(from);
    const end = centerOfBox(to);
    await this.press([start, {x: start.x + 10, y: start.y + 10}, {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2}, end]);
  }

  zigzagFrom(start: Point, points: number): Point[] {
    return Array.from({length: points}, (_, index) => ({x: start.x + (index % 2) * ZIGZAG_SPAN, y: start.y + (index % 4 < 2 ? 0 : 6)}));
  }

  async chooseInkColour(name: InkColourName) {
    await this.inkColourButton.click();
    await this.page.getByRole('menuitemradio', {name, exact: true}).click();
    await expect(this.inkColourButton).toHaveAccessibleName(`Ink colour: ${name}`);
    await menuClosedOnto(this.page, this.inkColourButton);
  }

  async openInkColourMenu(): Promise<Locator> {
    await this.inkColourButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  async removeLastNote() {
    await this.removeLastNoteButton.click();
  }

  async clear() {
    await this.clearButton.click();
  }

  async inkColoursOf(note: Locator): Promise<string[]> {
    return note.evaluate((element) => Array.from(element.children, (stroke) => getComputedStyle(stroke).stroke));
  }

  async inkTokens(): Promise<{dark: boolean; red: string; blue: string}> {
    return this.page.evaluate(() => {
      const root = document.documentElement;
      const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
      return {dark: root.classList.contains('dark'), red: token('--scribble-red'), blue: token('--scribble-blue')};
    });
  }

  async strokeCountOf(note: Locator): Promise<number> {
    return note.evaluate((element) => element.childElementCount);
  }

  async noteNames(): Promise<string[]> {
    return this.notes.evaluateAll((notes) => notes.map((note) => note.getAttribute('aria-label') ?? ''));
  }

  async controlNames(): Promise<string[]> {
    return this.controls.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''));
  }

  async backgroundOf(button: Locator): Promise<string> {
    return button.evaluate((element) => getComputedStyle(element).backgroundColor);
  }

  async overlapOf(note: Locator, target: Locator): Promise<number> {
    const [ink, box] = await Promise.all([boxOf(note), boxOf(target)]);
    const width = Math.min(ink.x + ink.width, box.x + box.width) - Math.max(ink.x, box.x);
    const height = Math.min(ink.y + ink.height, box.y + box.height) - Math.max(ink.y, box.y);
    return width <= 0 || height <= 0 ? 0 : (width * height) / (ink.width * ink.height);
  }

  async boxes(...locators: Locator[]): Promise<Box[]> {
    return Promise.all(locators.map((locator) => boxOf(locator)));
  }
}
