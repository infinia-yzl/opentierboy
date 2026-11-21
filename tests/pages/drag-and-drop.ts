import {expect, type Locator, type Page} from '@playwright/test';
import {escapeRegExp} from '../support/regexp';
import {boxOf, centerOf, centerOfBox, changeAndWaitForLink, rowPhrase, scrollPosition, scrollPositionAfterFrames, type Box, type Point} from './helpers';
import type {TierListPage} from './tier-list-page';

export class DragAndDrop {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  async expectEveryItemDraggable() {
    await expect.poll(() => this.tierList.allItems.evaluateAll((items) => items
      .filter((item) => item.getAttribute('aria-roledescription') !== 'draggable')
      .map((item) => item.getAttribute('aria-label'))), {
      message: 'every item tile should take a drag (role description "draggable")',
    }).toEqual([]);
  }

  private async dropAndWaitForLink(drop: () => Promise<void>) {
    await changeAndWaitForLink(this.page, drop);
    await this.expectEveryItemDraggable();
  }

  private async freeSpaceIn(tierName: string, itemName: string): Promise<Point> {
    const row = this.tierList.tier(tierName);
    const rowBox = await boxOf(row);
    const others = (await this.tierList.itemNamesIn(tierName)).filter((name) => name !== itemName);
    const addImages = row.getByRole('button', {name: /^Add images\b/});
    if (others.length === 0 && await addImages.count() === 0) return centerOfBox(rowBox);
    const last = await boxOf(await addImages.count() > 0 ? addImages : this.tierList.itemIn(tierName, others[others.length - 1]));
    const stack = this.tierList.rowStack(tierName);
    const end = await stack.count() > 0 ? (await boxOf(stack)).x : rowBox.x + rowBox.width;
    return {x: (last.x + last.width + end) / 2, y: last.y + last.height / 2};
  }

  private async halfOf(itemName: string, side: 'before' | 'after'): Promise<Point> {
    const box = await boxOf(this.tierList.item(itemName));
    return {x: box.x + box.width * (side === 'before' ? 0.25 : 0.75), y: box.y + box.height / 2};
  }

  private async shownUnderPointer(tile: Locator, pointer: () => Promise<Point>) {
    const at = await pointer();
    await expect.poll(async () => {
      const box = await boxOf(tile);
      return box.x <= at.x && at.x <= box.x + box.width && box.y <= at.y && at.y <= box.y + box.height;
    }, {message: 'the dragged tile should show under the pointer before the drop'}).toBe(true);
  }

  private overRow(itemName: string, tierName: string) {
    return () => expect(this.tierList.itemIn(tierName, itemName), `${itemName} should show in ${tierName} before the drop`).toBeVisible();
  }

  private besideTarget(itemName: string, targetItemName: string, side: 'before' | 'after') {
    return () => expect.poll(async () => {
      const row = this.tierList.tiers.filter({has: this.page.getByRole('button', {name: targetItemName, exact: true})});
      const names = await this.tierList.itemsIn(row).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
      return names.indexOf(itemName) - names.indexOf(targetItemName);
    }, {message: `${itemName} should show ${side} ${targetItemName} before the drop`, timeout: 1_000}).toBe(side === 'before' ? -1 : 1);
  }

  async dragItemToTier(itemName: string, tierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.item(itemName), () => this.freeSpaceIn(tierName, itemName), {over: this.overRow(itemName, tierName)}),
    );
    try {
      await expect(this.tierList.itemIn(tierName, itemName)).toBeVisible();
    } catch (error) {
      throw new Error(`${(error as Error).message}\nThe rows: ${await this.tierList.rowsReport()}`);
    }
  }

  async dragItemToTierStartInOneSweep(itemName: string, tierName: string) {
    await this.dropEnded();
    await changeAndWaitForLink(this.page, async () => {
      const item = this.tierList.item(itemName);
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const row = await boxOf(this.tierList.tier(tierName));
      const mouse = this.page.mouse;
      await mouse.move(from.x, from.y);
      await mouse.down();
      await mouse.move(from.x + 10, from.y + 10, {steps: 4});
      await expect(this.dragAnnouncer).toHaveText(/^Picked up /);
      const to = await this.freeSpaceIn(tierName, itemName);
      await mouse.move(to.x, to.y, {steps: 16});
      await expect(this.dragAnnouncer).toHaveText(/ moves to row /);
      await mouse.up();
      await this.dropEnded();
    });
    await this.expectEveryItemDraggable();
  }

  async dragItemToTierThenPressItem(itemName: string, tierName: string, pressedName: string) {
    const pressed = this.tierList.item(pressedName);
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.item(itemName), () => this.freeSpaceIn(tierName, itemName), {
        over: this.overRow(itemName, tierName),
        afterRelease: async () => {
          const from = await centerOf(pressed);
          const mouse = this.page.mouse;
          await mouse.move(from.x, from.y);
          await mouse.down();
          await mouse.move(from.x + 12, from.y + 6, {steps: 4});
          await mouse.up();
        },
      }),
    );
  }

  async countNativeDrags(): Promise<() => Promise<number>> {
    await this.page.evaluate(() => {
      const counted = window as unknown as {nativeDrags: number};
      counted.nativeDrags = 0;
      window.addEventListener('dragstart', (event) => {
        if (!event.defaultPrevented) counted.nativeDrags += 1;
      });
    });
    return () => this.page.evaluate(() => (window as unknown as {nativeDrags: number}).nativeDrags);
  }

  async dragStartFromItemImageIsCancelled(itemName: string): Promise<boolean> {
    return this.tierList.itemImage(itemName).evaluate((image) => {
      const event = new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: new DataTransfer()});
      image.dispatchEvent(event);
      return event.defaultPrevented;
    });
  }

  async dragItemToTierThenCancel(itemName: string, tierName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), () => this.freeSpaceIn(tierName, itemName), {over: this.overRow(itemName, tierName), cancel: true});
  }

  async dragItemOnto(itemName: string, targetItemName: string) {
    const [from, to] = await Promise.all([boxOf(this.tierList.item(itemName)), boxOf(this.tierList.item(targetItemName))]);
    const comesFromBefore = from.y + from.height <= to.y || (from.y < to.y + to.height && from.x < to.x);
    await this.dragItemNextTo(itemName, targetItemName, comesFromBefore ? 'after' : 'before');
  }

  async dragItemNextTo(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.item(itemName), () => this.halfOf(targetItemName, side), {over: this.besideTarget(itemName, targetItemName, side), follow: true}),
    );
  }

  async dragItemAndDropInPlace(itemName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), () => centerOf(this.tierList.item(itemName)));
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\. It stays in `));
  }

  async dragRowOnto(tierName: string, targetTierName: string) {
    const names = await this.tierList.tiers.evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));
    const at = names.indexOf(targetTierName);
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.rowGrip(tierName), () => centerOf(this.tierList.tier(targetTierName)), {
        over: () => expect(this.tierList.tiers.nth(at), `${tierName} should take the place of ${targetTierName} before the drop`).not.toHaveAccessibleName(targetTierName),
      }),
    );
  }

  async dragRowItemsOnto(tierName: string, targetTierName: string) {
    const moving = await this.tierList.itemNamesIn(tierName);
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.rowStack(tierName), () => centerOf(this.tierList.tier(targetTierName)), {
        over: () => expect.poll(() => this.tierList.itemNamesIn(targetTierName), {message: `the items of ${tierName} should show in ${targetTierName} before the drop`}).toEqual(moving),
      }),
    );
  }

  private async dragWithMouse(handle: Locator, dropPoint: () => Promise<Point>, {over, follow = false, cancel = false, afterRelease}: {over?: () => Promise<void>; follow?: boolean; cancel?: boolean; afterRelease?: () => Promise<void>} = {}) {
    await this.dropEnded();
    await expect(handle, 'the handle should take a drag').toHaveAttribute('aria-roledescription', 'draggable');
    expect(await this.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
      'a mouse drag needs a window that shows the whole page, so that nothing scrolls while it drags').toBe(true);
    const from = await centerOf(handle);
    const mouse = this.page.mouse;
    await mouse.move(from.x, from.y);
    await mouse.down();
    await mouse.move(from.x + 8, from.y + 8, {steps: 4});
    await expect(this.dragAnnouncer, 'the drag should start').toHaveText(/^Picked up /);
    const to = await dropPoint();
    await mouse.move(to.x, to.y, {steps: 10});
    await mouse.move(to.x, to.y);
    if (follow && over) {
      await expect(async () => {
        const now = await dropPoint();
        await mouse.move(now.x, now.y, {steps: 2});
        await over();
      }, 'the pointer should follow its target tile, which moves when the dragged tile enters its row').toPass();
    } else {
      await over?.();
    }
    if (cancel) {
      await this.page.keyboard.press('Escape');
      await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    }
    await mouse.up();
    await afterRelease?.();
    await this.dropEnded();
    await expect(this.dragAnnouncer, 'the drop should be announced').toHaveText(/^(?:Dropped |Move cancelled\. )/);
    await this.expectEveryItemDraggable();
  }

  private async dropEnded() {
    await expect(this.tierList.tiers.getByRole('button', {pressed: true}), 'no tile or handle should still be held').toHaveCount(0);
  }

  async moveItemWithKeyboard(itemName: string, keys: string[], {waitForLink = true} = {}): Promise<string[]> {
    const heard: string[] = [];
    const move = () => this.moveWithKeyboard(this.tierList.item(itemName), keys, itemName, heard);
    await (waitForLink ? this.dropAndWaitForLink(move) : move());
    return heard;
  }

  async moveRowWithKeyboard(tierName: string, keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.rowGrip(tierName), keys, /^Move (?:row |Row \d+$)/, heard));
    return heard;
  }

  async moveRowItemsWithKeyboard(tierName: string, keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.rowStack(tierName), keys, /^Move the \d+ items? of /, heard));
    return heard;
  }

  async moveRowWithKeyboardThenCancel(tierName: string, keys: string[]) {
    const keyboard = this.page.keyboard;
    await this.dropEnded();
    await this.tierList.rowGrip(tierName).focus();
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('Picked up');
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
    }
    await keyboard.press('Escape');
    await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    await expect.poll(() => this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toBe(`Move ${rowPhrase(tierName)}`);
    await this.expectEveryItemDraggable();
  }

  private async moveWithKeyboard(handle: Locator, keys: string[], focusAfter: string | RegExp, heard: string[] = []) {
    const keyboard = this.page.keyboard;
    await this.dropEnded();
    await handle.focus();
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('Picked up');
    for (const key of keys) {
      const before = await this.dragAnnouncer.textContent();
      await keyboard.press(key);
      await expect(this.dragAnnouncer).not.toHaveText(before ?? '');
      heard.push(await this.dragAnnouncer.textContent() ?? '');
    }
    await keyboard.press('Space');
    await expect(this.dragAnnouncer).toContainText('Dropped');
    heard.push(await this.dragAnnouncer.textContent() ?? '');
    await expect.poll(() => this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), {
      message: 'focus should come back to what was moved',
    }).toMatch(typeof focusAfter === 'string' ? new RegExp(`^${escapeRegExp(focusAfter)}$`) : focusAfter);
    await this.expectEveryItemDraggable();
  }

  async touchDragItemToTier(itemName: string, tierName: string) {
    await this.dropAndWaitForLink(async () => {
      const touch = await this.touchscreen();
      const item = this.tierList.item(itemName);
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const start = Date.now() / 1000;
      await touch('touchStart', from, start);
      await touch('touchMove', {x: from.x, y: from.y + 1}, start + 0.3);
      await touch('touchMove', {x: from.x, y: from.y - 10}, start + 0.32);
      await expect(this.dragAnnouncer, 'the drag should start').toHaveText(new RegExp(`^Picked up ${escapeRegExp(itemName)},`));
      const box = await boxOf(this.tierList.tier(tierName));
      const to = await this.freeSpaceIn(tierName, itemName);
      for (let step = 1; step <= 10; step++) {
        await touch('touchMove', {x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10}, start + 0.32 + step * 0.03);
        await scrollPositionAfterFrames(this.page, 2);
      }
      await expect(this.dragAnnouncer).toHaveText(new RegExp(`moves to ${escapeRegExp(tierName === 'Unranked' ? tierName : rowPhrase(tierName))},`));
      await touch('touchEnd', null, start + 0.7);
      await this.dropEnded();
      await this.expectEveryItemDraggable();
    });
  }

  async touchDragRowOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(async () => {
      const touch = await this.touchscreen();
      const grip = this.tierList.rowGrip(tierName);
      await grip.scrollIntoViewIfNeeded();
      const from = await centerOf(grip);
      const box = await boxOf(this.tierList.tier(targetTierName));
      const to = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      const start = Date.now() / 1000;
      await touch('touchStart', from, start);
      await touch('touchMove', {x: from.x, y: from.y + 1}, start + 0.3);
      await expect(this.dragAnnouncer, 'the drag should start').toHaveText(new RegExp(`^Picked up ${escapeRegExp(rowPhrase(tierName))}, `));
      for (let step = 1; step <= 10; step++) {
        await touch('touchMove', {x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10}, start + 0.3 + step * 0.03);
        await scrollPositionAfterFrames(this.page, 2);
      }
      await touch('touchEnd', null, start + 0.7);
      await this.dropEnded();
      await this.expectEveryItemDraggable();
    });
  }

  async longPressItem(itemName: string): Promise<Locator> {
    const touch = await this.touchscreen();
    const item = this.tierList.item(itemName);
    await item.scrollIntoViewIfNeeded();
    await touch('touchStart', await centerOf(item));
    const menu = this.page.getByRole('menu');
    await expect(menu.getByRole('menuitem', {name: 'Delete'})).toBeVisible();
    await touch('touchEnd', null);
    return menu;
  }

  async swipeUpFromItem(itemName: string, distance: number): Promise<number> {
    const touch = await this.touchscreen();
    const item = this.tierList.item(itemName);
    await item.scrollIntoViewIfNeeded();
    const scrollBefore = await scrollPosition(this.page);
    const from = await centerOf(item);
    const start = Date.now() / 1000;
    await touch('touchStart', from, start);
    for (let step = 1; step <= 10; step++) {
      await touch('touchMove', {x: from.x, y: from.y - distance * step / 10}, start + step * 0.01);
    }
    await touch('touchEnd', null, start + 0.12);
    let scrolled = 0;
    await expect.poll(async () => {
      scrolled = (await scrollPosition(this.page)).y - scrollBefore.y;
      return scrolled;
    }, {message: 'the page should scroll'}).toBeGreaterThan(distance / 2);
    return scrolled;
  }

  private async touchscreen() {
    const cdp = await this.page.context().newCDPSession(this.page);
    return async (type: 'touchStart' | 'touchMove' | 'touchEnd', point: Point | null, timestamp?: number) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: point ? [{x: point.x, y: point.y}] : [],
        ...(timestamp !== undefined && {timestamp}),
      });
    };
  }

  get dragAnnouncer(): Locator {
    return this.page.locator('[role="status"][aria-live][id^="dnd-kit-announcement"]');
  }

  async dragItemToTierByHand(itemName: string, tierName: string) {
    await this.dropEnded();
    await changeAndWaitForLink(this.page, async () => {
      const item = this.tierList.item(itemName);
      await this.tierList.tier(tierName).scrollIntoViewIfNeeded();
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const row = await boxOf(this.tierList.tier(tierName));
      const mouse = this.page.mouse;
      await mouse.move(from.x, from.y);
      await mouse.down();
      const to = await this.freeSpaceIn(tierName, itemName);
      await mouse.move(to.x, to.y, {steps: 20});
      await mouse.move(to.x, to.y);
      const atRow = new RegExp(`^${escapeRegExp(itemName)} moves to ${escapeRegExp(rowPhrase(tierName))},`);
      await expect(this.dragAnnouncer, 'the press should drag the item to the row').toHaveText(atRow);
      await mouse.up();
      await this.dropEnded();
    });
  }

  async moveFirstUnrankedItemUpWithKeyboard() {
    const first = this.tierList.itemsIn('Unranked').first();
    await expect(first, 'the Unranked tray should show an item to move').toBeVisible();
    await this.moveItemWithKeyboard(await first.getAttribute('aria-label') ?? '', ['ArrowUp']);
  }

  async dragFirstUnrankedItemToTier(tierName: string) {
    const first = this.tierList.itemsIn('Unranked').first();
    await expect(first, 'the Unranked tray should show an item to rank').toBeVisible();
    await this.dragItemToTier(await first.getAttribute('aria-label') ?? '', tierName);
  }

  async focusItemReadyToDrag(name: string) {
    const item = this.tierList.item(name);
    await expect(item).toHaveAttribute('aria-roledescription', 'draggable');
    await item.focus();
    await expect(item).toBeFocused();
  }

  async dragItemToFreeSpaceOf(itemName: string, tierName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), () => this.freeSpaceIn(tierName, itemName), {over: this.overRow(itemName, tierName)});
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  async dragItemBeside(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dragWithMouse(this.tierList.item(itemName), () => this.halfOf(targetItemName, side), {over: this.besideTarget(itemName, targetItemName, side), follow: true});
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  get siteFooter(): Locator {
    return this.page.getByRole('contentinfo');
  }

  async dragItemOutOfTheRows(itemName: string) {
    const item = this.tierList.item(itemName);
    await this.dragWithMouse(item, () => centerOf(this.siteFooter), {over: () => this.shownUnderPointer(item, () => centerOf(this.siteFooter))});
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Move cancelled\\. ${escapeRegExp(itemName)} is back in `));
  }
}

