import {expect, type Locator, type Page} from '@playwright/test';
import {escapeRegExp} from '../support/regexp';
import {boxOf, centerOf, centerOfBox, changeAndWaitForLink, clamp, rowPhrase, scrollPosition, scrollPositionAfterFrames, type Box, type Point} from './helpers';
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

  async dragItemToTier(itemName: string, tierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.item(itemName), this.tierList.tier(tierName), (box) => ({
        x: box.x + box.width - 120,
        y: box.y + box.height / 2,
      })),
    );
    await expect(this.tierList.itemIn(tierName, itemName)).toBeVisible();
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
      await mouse.move(row.x + 150, row.y + row.height / 2, {steps: 16});
      await expect(this.dragAnnouncer).toHaveText(/ moves to row /);
      await scrollPositionAfterFrames(this.page);
      await mouse.up();
      await this.dropEnded();
    });
    await this.expectEveryItemDraggable();
  }

  async dragItemToTierThenPressItem(itemName: string, tierName: string, pressedName: string) {
    const pressed = this.tierList.item(pressedName);
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.item(itemName), this.tierList.tier(tierName), (box) => ({
        x: box.x + box.width - 120,
        y: box.y + box.height / 2,
      }), {
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
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.tier(tierName), (box) => ({
      x: box.x + box.width - 120,
      y: box.y + box.height / 2,
    }), {cancel: true});
  }

  async dragItemOnto(itemName: string, targetItemName: string) {
    const [from, to] = await Promise.all([boxOf(this.tierList.item(itemName)), boxOf(this.tierList.item(targetItemName))]);
    const comesFromBefore = from.y + from.height <= to.y || (from.y < to.y + to.height && from.x < to.x);
    await this.dragItemNextTo(itemName, targetItemName, comesFromBefore ? 'after' : 'before');
  }

  async dragItemNextTo(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.item(itemName), this.tierList.item(targetItemName), (box) => ({
        x: box.x + box.width * (side === 'before' ? 0.25 : 0.75),
        y: box.y + box.height / 2,
      }), {followTarget: true}),
    );
  }

  async dragItemAndDropInPlace(itemName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.item(itemName), centerOfBox);
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\. It stays in `));
  }

  async dragRowOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.rowGrip(tierName), this.tierList.tier(targetTierName), centerOfBox),
    );
  }

  async dragRowItemsOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.rowStack(tierName), this.tierList.tier(targetTierName), centerOfBox),
    );
  }

  private async dragWithMouse(handle: Locator, target: Locator, pointIn: (box: Box) => Point, {followTarget = false, cancel = false, afterRelease}: {followTarget?: boolean; cancel?: boolean; afterRelease?: () => Promise<void>} = {}) {
    await handle.scrollIntoViewIfNeeded();
    await this.scrollToShow(handle, pointIn(await boxOf(target)));
    const scrollBefore = await scrollPosition(this.page);
    const onPage = (point: Point, scroll: Point) => ({x: point.x + scroll.x, y: point.y + scroll.y});
    const dropAtOnPage = onPage(pointIn(await boxOf(target)), scrollBefore);
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};

    const mouse = this.page.mouse;
    await this.dropEnded();
    const from = await centerOf(handle);
    await mouse.move(from.x, from.y);
    await mouse.down();
    await mouse.move(from.x + 8, from.y + 8, {steps: 4});
    await expect(this.dragAnnouncer, 'the drag should start').toHaveText(/^Picked up /);

    let lastProblem: unknown = null;
    for (let tryNumber = 1; tryNumber <= DROP_POINT_TRIES; tryNumber++) {
      try {
        await this.moveToDropPoint(target, pointIn, {followTarget, dropAtOnPage, onPage, viewport});
        lastProblem = null;
        break;
      } catch (error) {
        lastProblem = error;
      }
    }
    if (lastProblem !== null) {
      const check = lastProblem instanceof Error ? lastProblem.message.split('\n').slice(0, 3).join(' ') : String(lastProblem);
      throw new Error(`The drag did not settle on its drop point in ${DROP_POINT_TRIES} tries. Last check: ${check}`, {cause: lastProblem});
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

  private async moveToDropPoint(target: Locator, pointIn: (box: Box) => Point, {followTarget, dropAtOnPage: measured, onPage, viewport}: {
    followTarget: boolean;
    dropAtOnPage: Point;
    onPage: (point: Point, scroll: Point) => Point;
    viewport: {width: number; height: number};
  }) {
    const scroll = await scrollPosition(this.page);
    const dropAtOnPage = followTarget ? onPage(pointIn(await boxOf(target)), scroll) : measured;
    const x = clamp(dropAtOnPage.x - scroll.x, 1, viewport.width - 2);
    const y = clamp(dropAtOnPage.y - scroll.y, 1, viewport.height - 2);
    await this.page.mouse.move(x, y, {steps: 5});
    const scrollAfter = await scrollPositionAfterFrames(this.page);
    expect(scrollAfter, 'the page should stop auto-scrolling').toEqual(scroll);
    expect({x: x + scroll.x, y: y + scroll.y}, 'the pointer should be on the drop point').toEqual(dropAtOnPage);
    if (followTarget) {
      expect(onPage(pointIn(await boxOf(target)), scrollAfter), 'the target should stay put').toEqual(dropAtOnPage);
    }
  }

  private async dropEnded() {
    await expect.poll(() => this.page.evaluate(() => document.querySelector('[data-dragging]') === null), {
      message: 'the last drop should have ended',
    }).toBe(true);
  }

  private async scrollToShow(handle: Locator, dropAt: Point) {
    const margin = 16;
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};
    const scroll = await scrollPosition(this.page);
    const from = await boxOf(handle);
    const handleTop = from.y + scroll.y;
    const handleBottom = from.y + from.height + scroll.y;
    const drop = dropAt.y + scroll.y;
    const band = Math.ceil(viewport.height * AUTO_SCROLL_EDGE) + 1;
    const lowest = Math.max(handleBottom - viewport.height + margin, drop - viewport.height + band, 0);
    const maxScroll = await this.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const highest = Math.min(handleTop - margin, drop - band, maxScroll);
    let y: number;
    if (lowest <= highest) {
      if (scroll.y >= lowest && scroll.y <= highest) return;
      y = Math.round(scroll.y < lowest ? lowest : highest);
    } else {
      const top = Math.min(handleTop, drop);
      const bottom = Math.max(handleBottom, drop);
      const shows = top >= scroll.y + margin && bottom <= scroll.y + viewport.height - margin;
      if (shows || bottom - top > viewport.height - 2 * margin) return;
      y = Math.max(0, Math.round((top + bottom - viewport.height) / 2));
    }
    await this.page.evaluate((toY) => window.scrollTo({top: toY, behavior: 'instant'}), y);
    let last = await scrollPositionAfterFrames(this.page, 2);
    await expect.poll(async () => {
      const now = await scrollPositionAfterFrames(this.page, 2);
      const still = now.x === last.x && now.y === last.y;
      last = now;
      return still;
    }, {message: 'the window should stop scrolling'}).toBe(true);
  }

  async moveItemWithKeyboard(itemName: string, keys: string[], {waitForLink = true} = {}) {
    const move = () => this.moveWithKeyboard(this.tierList.item(itemName), keys, itemName);
    await (waitForLink ? this.dropAndWaitForLink(move) : move());
  }

  async moveItemWithKeyboardAndListen(itemName: string, keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.item(itemName), keys, itemName, heard));
    return heard;
  }

  async moveRowWithKeyboard(tierName: string, keys: string[]) {
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.rowGrip(tierName), keys, /^Move (?:row |Row \d+$)/));
  }

  async moveRowItemsWithKeyboard(tierName: string, keys: string[]) {
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.rowStack(tierName), keys, /^Move the \d+ items? of /));
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

  async moveRowWithKeyboardAndListen(tierName: string, handle: 'grip' | 'stack', keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    const [locator, focusAfter] = handle === 'grip'
      ? [this.tierList.rowGrip(tierName), /^Move (?:row |Row \d+$)/]
      : [this.tierList.rowStack(tierName), /^Move the \d+ items? of /];
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(locator, keys, focusAfter, heard));
    return heard;
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
      const to = {x: box.x + box.width - 80, y: box.y + box.height / 2};
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
      const to = {x: row.x + row.width - 120, y: row.y + row.height / 2};
      await mouse.move(to.x, to.y, {steps: 20});
      await scrollPositionAfterFrames(this.page);
      await mouse.move(to.x + 1, to.y);
      await scrollPositionAfterFrames(this.page);
      await mouse.move(to.x, to.y);
      const atRow = new RegExp(`^${escapeRegExp(itemName)} moves to ${escapeRegExp(rowPhrase(tierName))},`);
      await expect(this.dragAnnouncer, 'the press should drag the item to the row').toHaveText(atRow);
      await mouse.up();
      await this.dropEnded();
    });
  }

  async rankFirstUnrankedItem(tierName: string) {
    const name = await this.tierList.itemsIn(this.tierList.unranked).first().getAttribute('aria-label');
    if (!name) throw new Error('The Unranked tray has no item to rank');
    await this.dragItemToTier(name, tierName);
  }

  async moveFirstUnrankedItemUpWithKeyboard() {
    const name = await this.tierList.itemsIn(this.tierList.unranked).first().getAttribute('aria-label');
    if (!name) throw new Error('The Unranked tray has no item to move');
    await changeAndWaitForLink(this.page, () => this.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false}));
  }

  async dragFirstUnrankedItemToTier(tierName: string) {
    let name: string | null = null;
    await expect.poll(async () => {
      [name = null] = await this.tierList.itemsIn(this.tierList.unranked).evaluateAll((items) => items
        .filter((item) => item.getAttribute('aria-roledescription') === 'draggable')
        .map((item) => item.getAttribute('aria-label')));
      return name;
    }, {message: 'Unranked should hold an item that takes a drag'}).not.toBeNull();
    await this.dragItemToTier(name!, tierName);
  }

  async focusItemReadyToDrag(name: string) {
    const item = this.tierList.item(name);
    await expect(item).toHaveAttribute('aria-roledescription', 'draggable');
    await item.focus();
    await expect(item).toBeFocused();
  }

  async dragItemToTierWhenReady(itemName: string, tierName: string) {
    await expect(this.tierList.item(itemName), `${itemName} should take a drag`).toHaveAttribute('aria-roledescription', 'draggable');
    await this.dragItemToTier(itemName, tierName);
  }

  async dragItemToFreeSpaceOf(itemName: string, tierName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.tier(tierName), (box) => ({
      x: box.x + box.width - 120,
      y: box.y + box.height / 2,
    }));
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  async dragItemBeside(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.item(targetItemName), (box) => ({
      x: box.x + box.width * (side === 'before' ? 0.25 : 0.75),
      y: box.y + box.height / 2,
    }), {followTarget: true});
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  get siteFooter(): Locator {
    return this.page.getByRole('contentinfo');
  }

  async dragItemOutOfTheRows(itemName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), this.siteFooter, centerOfBox);
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Move cancelled\\. ${escapeRegExp(itemName)} is back in `));
  }
}

const DROP_POINT_TRIES = 100;

const AUTO_SCROLL_EDGE = 0.2;
