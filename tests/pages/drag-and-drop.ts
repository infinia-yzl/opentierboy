import {expect, type Locator, type Page} from '@playwright/test';
import {escapeRegExp} from '../support/regexp';
import {boxOf, centerOf, centerOfBox, changeAndWaitForLink, clamp, rowPhrase, scrollPosition, scrollPositionAfterFrames, type Box, type Point} from './helpers';
import type {TierListPage} from './tier-list-page';

/**
 * Drag and drop in the editor: mouse, keyboard and touch drags of items and rows, where to aim,
 * and what the drag announcer says.
 *
 * tests/README.md, "Drag and drop". Every helper that drops something checks after the drop that
 * every item tile still takes a drag (expectEveryItemDraggable).
 *
 * Specs reach it as `tierList.drag` (TierListPage.drag).
 */
export class DragAndDrop {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  /**
   * Checks that every item tile can start a drag. A tile has the role description "draggable"
   * only while the drag library has its draggable (lib/dnd/react.tsx, DraggableTierItem), so
   * a tile that would take no drag, where a press starts the browser's own image drag, has
   * none. The drop helpers call this after every drop, so any test that drops something
   * fails on such a tile.
   */
  async expectEveryItemDraggable() {
    await expect.poll(() => this.tierList.allItems.evaluateAll((items) => items
      .filter((item) => item.getAttribute('aria-roledescription') !== 'draggable')
      .map((item) => item.getAttribute('aria-label'))), {
      message: 'every item tile should take a drag (role description "draggable")',
    }).toEqual([]);
  }

  /**
   * Runs a drop that changes the list, waits for the new link, and checks again that every
   * item tile can start a drag: the list on screen has its final tiles once the link is written.
   */
  private async dropAndWaitForLink(drop: () => Promise<void>) {
    await changeAndWaitForLink(this.page, drop);
    await this.expectEveryItemDraggable();
  }

  /** Drags an item with the mouse and drops it at the end of a tier. */
  async dragItemToTier(itemName: string, tierName: string) {
    await this.dropAndWaitForLink(() =>
      // Drop in the free space at the end of the row, left of the row handle.
      this.dragWithMouse(this.tierList.item(itemName), this.tierList.tier(tierName), (box) => ({
        x: box.x + box.width - 120,
        y: box.y + box.height / 2,
      })),
    );
  }

  /**
   * Drags an item with the mouse in one straight sweep, in small steps, from Unranked to the
   * left part of a row: the press, a small move down and right that starts the drag, then the
   * sweep. On the way up the editor shows the item in each row the pointer crosses. Returns
   * once the link is in the address bar.
   */
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
      // The drop target follows the pointer within a few frames. A wrong row stays wrong.
      await expect(this.dragAnnouncer).toHaveText(/ moves to row /);
      await scrollPositionAfterFrames(this.page);
      await mouse.up();
      await this.dropEnded();
    });
    await this.expectEveryItemDraggable();
  }

  /**
   * Drags an item with the mouse to the end of a tier and, right after the release (while the
   * drop still animates), presses another item and moves the mouse a little, as someone ranking
   * fast does, then releases it there. A press during the drop animation starts no drag of the
   * editor (tests/README.md, "Drag and drop"). Returns once the drop animation has ended.
   */
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
          // Past the 5 px that start a mouse drag, and still on the pressed item.
          await mouse.move(from.x + 12, from.y + 6, {steps: 4});
          await mouse.up();
        },
      }),
    );
  }

  /**
   * Starts counting the drags the browser itself starts from now on: dragstart events that no
   * handler cancelled (a native drag, for example of an image). Returns a function that reads
   * the count. The listener sits on the window, so it reads each event after the page's own
   * handlers.
   */
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

  /**
   * Sends a dragstart event from an item's image, as the browser does when a native drag of
   * the picture begins. Returns true when the page cancelled it (no native drag).
   */
  async dragStartFromItemImageIsCancelled(itemName: string): Promise<boolean> {
    return this.tierList.itemImage(itemName).evaluate((image) => {
      const event = new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: new DataTransfer()});
      image.dispatchEvent(event);
      return event.defaultPrevented;
    });
  }

  /**
   * Drags an item with the mouse over a tier, then presses Escape before releasing the button,
   * so the drag is cancelled. Returns once the cancel is announced and the drop animation ended.
   */
  async dragItemToTierThenCancel(itemName: string, tierName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.tier(tierName), (box) => ({
      x: box.x + box.width - 120,
      y: box.y + box.height / 2,
    }), {cancel: true});
  }

  /**
   * Drags an item with the mouse onto another item and drops it there: it takes that item's
   * place. Coming from before it (in reading order) it lands just after it, otherwise just
   * before it.
   */
  async dragItemOnto(itemName: string, targetItemName: string) {
    const [from, to] = await Promise.all([boxOf(this.tierList.item(itemName)), boxOf(this.tierList.item(targetItemName))]);
    const comesFromBefore = from.y + from.height <= to.y || (from.y < to.y + to.height && from.x < to.x);
    await this.dragItemNextTo(itemName, targetItemName, comesFromBefore ? 'after' : 'before');
  }

  /**
   * Drags an item with the mouse onto the left or right half of another item, and drops it just
   * before or just after that item. Items move out of the way during the drag, so the helper
   * follows the target item until it stays put.
   */
  async dragItemNextTo(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.item(itemName), this.tierList.item(targetItemName), (box) => ({
        x: box.x + box.width * (side === 'before' ? 0.25 : 0.75),
        y: box.y + box.height / 2,
      }), {followTarget: true}),
    );
  }

  /** Drags an item with the mouse a little and drops it back where it started. The list stays as it was. */
  async dragItemAndDropInPlace(itemName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.item(itemName), centerOfBox);
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\. It stays in `));
  }

  /**
   * Drags a whole row by its grip and drops it on the place of another row: the row moves with
   * its name and items, and the rows between make room.
   */
  async dragRowOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.rowGrip(tierName), this.tierList.tier(targetTierName), centerOfBox),
    );
  }

  /**
   * Drags the items of a row by its stack and drops them on the place of another row: the items
   * move and the labels stay S, A, B... from top to bottom (product rule 6).
   */
  async dragRowItemsOnto(tierName: string, targetTierName: string) {
    await this.dropAndWaitForLink(() =>
      this.dragWithMouse(this.tierList.rowStack(tierName), this.tierList.tier(targetTierName), centerOfBox),
    );
  }

  /**
   * Presses the mouse on a drag handle, moves it to a point on the drop target, and
   * releases it there.
   *
   * During a drag the editor shows the list as it would be after the drop: rows and items
   * move out of the way of the dragged one. By default the helper measures the drop point
   * once, before the drag starts, in page coordinates, for drops on a row (its free space, or
   * the place of another row): a row target measured during the drag has already moved, and
   * following it pulls the dragged row back, so the target moves back too, and so on.
   * With `followTarget` it aims at the target where it is during the drag, until the target
   * stays put. That suits drops before or after an item: they depend only on the half of the
   * item under the pointer, so following the item settles.
   *
   * Before the drag, the helper scrolls the window so that the handle and the drop point both
   * show, as a person does, when the window is tall enough for both. Otherwise the page
   * auto-scrolls while the pointer is near the top or bottom of the window, and the helper keeps
   * moving the pointer to the same page point until the scrolling stops. Auto-scroll runs on
   * page time, so a test with page time paused needs both points on screen.
   */
  private async dragWithMouse(handle: Locator, target: Locator, pointIn: (box: Box) => Point, {followTarget = false, cancel = false, afterRelease}: {followTarget?: boolean; cancel?: boolean; afterRelease?: () => Promise<void>} = {}) {
    await handle.scrollIntoViewIfNeeded();
    await this.scrollToShow(handle, pointIn(await boxOf(target)));
    const scrollBefore = await scrollPosition(this.page);
    const onPage = (point: Point, scroll: Point) => ({x: point.x + scroll.x, y: point.y + scroll.y});
    const dropAtOnPage = onPage(pointIn(await boxOf(target)), scrollBefore);
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};

    const mouse = this.page.mouse;
    // A press starts no drag until the last drop has ended.
    await this.dropEnded();
    const from = await centerOf(handle);
    await mouse.move(from.x, from.y);
    await mouse.down();
    // A mouse drag starts only after the pointer moves a few pixels.
    await mouse.move(from.x + 8, from.y + 8, {steps: 4});
    // Once a drag starts, the editor announces the lift, and then every change of the
    // drop position. Only the latest message stays in the live region.
    await expect(this.dragAnnouncer, 'the drag should start').toHaveText(/^Picked up /);

    // Each try moves the pointer and waits a few frames; auto-scroll and items that slide out of
    // the way settle within a number of tries, not a time. The last failed check says what did not.
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
      // Escape ends the drag where it is; the button is released after that.
      await this.page.keyboard.press('Escape');
      await expect(this.dragAnnouncer).toContainText('Move cancelled.');
    }
    await mouse.up();
    await afterRelease?.();
    await this.dropEnded();
    await this.expectEveryItemDraggable();
  }

  /** One try of dragWithMouse to put the pointer on the drop point; throws until all is still. */
  private async moveToDropPoint(target: Locator, pointIn: (box: Box) => Point, {followTarget, dropAtOnPage: measured, onPage, viewport}: {
    followTarget: boolean;
    dropAtOnPage: Point;
    onPage: (point: Point, scroll: Point) => Point;
    viewport: {width: number; height: number};
  }) {
    const scroll = await scrollPosition(this.page);
    const dropAtOnPage = followTarget ? onPage(pointIn(await boxOf(target)), scroll) : measured;
    // A drop point outside the window is reached by holding the pointer at the edge,
    // where the page auto-scrolls towards it.
    const x = clamp(dropAtOnPage.x - scroll.x, 1, viewport.width - 2);
    const y = clamp(dropAtOnPage.y - scroll.y, 1, viewport.height - 2);
    await this.page.mouse.move(x, y, {steps: 5});
    // The drag library reads the pointer once per animation frame. Waiting a few frames
    // lets it handle the last move, and shows whether the page is still scrolling.
    const scrollAfter = await scrollPositionAfterFrames(this.page);
    expect(scrollAfter, 'the page should stop auto-scrolling').toEqual(scroll);
    expect({x: x + scroll.x, y: y + scroll.y}, 'the pointer should be on the drop point').toEqual(dropAtOnPage);
    if (followTarget) {
      // Items slide to their new places (an animation): the target must have stopped moving.
      expect(onPage(pointIn(await boxOf(target)), scrollAfter), 'the target should stay put').toEqual(dropAtOnPage);
    }
  }

  /**
   * Waits until no drag or drop is in progress, a drop animation included: the rows carry
   * `data-dragging` until then (components/DragDropTierList.tsx, RowList), and the page is busy
   * (lib/dnd/react.tsx). Until then the drag library blocks text selection on the whole page
   * (typing into a label right away goes nowhere) and a press starts no new drag. Other work,
   * such as a link on its way to the address, may go on: a quick test does not wait for it.
   */
  private async dropEnded() {
    await expect.poll(() => this.page.evaluate(() => document.querySelector('[data-dragging]') === null), {
      message: 'the last drop should have ended',
    }).toBe(true);
  }

  /**
   * Scrolls the window so that the handle and the drop point (in window coordinates) both show,
   * when they fit in the window together and do not show already.
   */
  private async scrollToShow(handle: Locator, dropAt: Point) {
    const margin = 16;
    const viewport = this.page.viewportSize() ?? {width: 1280, height: 720};
    const scroll = await scrollPosition(this.page);
    const from = await boxOf(handle);
    const top = Math.min(from.y, dropAt.y) + scroll.y;
    const bottom = Math.max(from.y + from.height, dropAt.y) + scroll.y;
    const shows = top >= scroll.y + margin && bottom <= scroll.y + viewport.height - margin;
    if (shows || bottom - top > viewport.height - 2 * margin) return;
    const y = Math.max(0, Math.round((top + bottom - viewport.height) / 2));
    await this.page.evaluate((toY) => window.scrollTo({top: toY, behavior: 'instant'}), y);
    // The window may stop short of the point (the end of the page): wait until it holds still.
    let last = await scrollPositionAfterFrames(this.page, 2);
    await expect.poll(async () => {
      const now = await scrollPositionAfterFrames(this.page, 2);
      const still = now.x === last.x && now.y === last.y;
      last = now;
      return still;
    }, {message: 'the window should stop scrolling'}).toBe(true);
  }

  /**
   * Moves an item with the keyboard, as a keyboard or screen-reader user would:
   * focus the item, Space to lift, arrow keys to move, Space to drop.
   * With `waitForLink: false` it returns once the drop is announced, without checking the
   * address bar or the tiles (for quick changes one after another).
   */
  async moveItemWithKeyboard(itemName: string, keys: string[], {waitForLink = true} = {}) {
    const move = () => this.moveWithKeyboard(this.tierList.item(itemName), keys, itemName);
    await (waitForLink ? this.dropAndWaitForLink(move) : move());
  }

  /**
   * Moves an item with the keyboard and checks what screen readers hear after each arrow key:
   * returns the announcements, the drop included.
   */
  async moveItemWithKeyboardAndListen(itemName: string, keys: string[]): Promise<string[]> {
    const heard: string[] = [];
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.item(itemName), keys, itemName, heard));
    return heard;
  }

  /** Moves a whole row with the keyboard, using its grip. Focus comes back to the grip. */
  async moveRowWithKeyboard(tierName: string, keys: string[]) {
    // The name moves with the row, but a row without a name is named by its new position.
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.rowGrip(tierName), keys, /^Move (?:row |Row \d+$)/));
  }

  /**
   * Moves the items of a row with the keyboard, using its stack. Focus comes back to the stack,
   * which the labels in place name after its new position.
   */
  async moveRowItemsWithKeyboard(tierName: string, keys: string[]) {
    await this.dropAndWaitForLink(() => this.moveWithKeyboard(this.tierList.rowStack(tierName), keys, /^Move the \d+ items? of /));
  }

  /**
   * Lifts a whole row by its grip with the keyboard (Space), moves it with the given keys, then
   * presses Escape. Returns once the cancel is announced and focus is back on the grip.
   */
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

  /**
   * Moves a whole row or its items with the keyboard and returns what screen readers hear after
   * each arrow key and the drop.
   */
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
    // The editor announces every step to screen readers. Waiting for those announcements
    // keeps the test in step with the app without fixed sleeps.
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
    // Then focus goes back to the item or handle (in the next frame), and the next action can start.
    await expect.poll(() => this.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), {
      message: 'focus should come back to what was moved',
    }).toMatch(typeof focusAfter === 'string' ? new RegExp(`^${escapeRegExp(focusAfter)}$`) : focusAfter);
    await this.expectEveryItemDraggable();
  }

  /**
   * Touches an item, holds it still, then drags it to the end of a tier and lifts the finger.
   * The hold is in the event times (300 ms between touching and moving), so the test does not
   * wait for it. The drag starts after a 250 ms hold (lib/dnd/activation.ts).
   */
  async touchDragItemToTier(itemName: string, tierName: string) {
    await this.dropAndWaitForLink(async () => {
      const touch = await this.touchscreen();
      const item = this.tierList.item(itemName);
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const start = Date.now() / 1000;
      await touch('touchStart', from, start);
      // Still after the hold, then a few pixels: the drag starts.
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

  /**
   * Touches a row's grip, holds it still, then drags the row onto the place of another row and
   * lifts the finger. The hold is in the event times (300 ms between touching and moving): the
   * grip drags after a 250 ms hold (lib/dnd/activation.ts), so the test does not wait for it.
   */
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

  /**
   * Touches an item and holds the finger still until its menu opens (a long press), then lifts
   * the finger. Returns the menu.
   */
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

  /**
   * A quick swipe up that starts on an item, as when scrolling the page: the finger moves at
   * once, before any hold. Returns how far the page scrolled.
   */
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

  /** Sends touch events to the page (one finger), with optional event times in seconds. */
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

  /**
   * The live region where the editor announces lifts, moves and drops (dnd-kit's Accessibility
   * plugin). It is a `status` with no name, like the toasts, so its id tells it apart: this and
   * metaTag() are the only CSS selectors in the tests.
   */
  get dragAnnouncer(): Locator {
    return this.page.locator('[role="status"][aria-live][id^="dnd-kit-announcement"]');
  }

  /**
   * Drags an item to the end of a tier with the mouse, as a person does: one press on the item,
   * one movement to the row in small steps, one release. Unlike dragItemToTier it never presses
   * twice: a press that starts no drag of the item (the browser's own drag of its image, for
   * example) fails. Returns once the link is in the address bar.
   */
  async dragItemToTierByHand(itemName: string, tierName: string) {
    // A press starts a drag only once the previous drop has landed.
    await this.dropEnded();
    await changeAndWaitForLink(this.page, async () => {
      const item = this.tierList.item(itemName);
      // In a creator layout the rows and the tray scroll on their own, inside a frame that stays
      // still: the row first, then the item.
      await this.tierList.tier(tierName).scrollIntoViewIfNeeded();
      await item.scrollIntoViewIfNeeded();
      const from = await centerOf(item);
      const row = await boxOf(this.tierList.tier(tierName));
      const mouse = this.page.mouse;
      await mouse.move(from.x, from.y);
      await mouse.down();
      const to = {x: row.x + row.width - 120, y: row.y + row.height / 2};
      await mouse.move(to.x, to.y, {steps: 20});
      // A hand never holds perfectly still: the pointer moves by a pixel and back, as a person's
      // does (still the one press). The drag library checks where the pointer is when it moves,
      // after the rows have made room for the item, so the drop point is read again.
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

  /** Drags the first item of the Unranked tray to the end of a tier: one change to the list. */
  async rankFirstUnrankedItem(tierName: string) {
    const name = await this.tierList.itemsIn(this.tierList.unranked).first().getAttribute('aria-label');
    if (!name) throw new Error('The Unranked tray has no item to rank');
    await this.dragItemToTier(name, tierName);
  }

  /**
   * Moves the first item of the Unranked tray up into the last row with the keyboard: one change
   * to the list. Returns once the drop is announced, the focus is back and the address has
   * changed, also while the page is busy on purpose (the trip home waits).
   */
  async moveFirstUnrankedItemUpWithKeyboard() {
    const name = await this.tierList.itemsIn(this.tierList.unranked).first().getAttribute('aria-label');
    if (!name) throw new Error('The Unranked tray has no item to move');
    await changeAndWaitForLink(this.page, () => this.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false}));
  }

  /** Drags the first item of Unranked to the end of a row. Returns once the link is written. */
  async dragFirstUnrankedItemToTier(tierName: string) {
    // Item tiles only: the first-drag tip puts its "Hide tips" and "Close tip" buttons in the tray.
    // Right after a page load, the tiles take a drag only once the page is ready, so this waits.
    let name: string | null = null;
    await expect.poll(async () => {
      [name = null] = await this.tierList.itemsIn(this.tierList.unranked).evaluateAll((items) => items
        .filter((item) => item.getAttribute('aria-roledescription') === 'draggable')
        .map((item) => item.getAttribute('aria-label')));
      return name;
    }, {message: 'Unranked should hold an item that takes a drag'}).not.toBeNull();
    await this.dragItemToTier(name!, tierName);
  }

  /**
   * Focuses an item, as a keyboard user who tabbed to it, once it takes a drag: right after a page
   * load a tile takes a drag only when the page is ready (its role description "draggable").
   */
  async focusItemReadyToDrag(name: string) {
    const item = this.tierList.item(name);
    await expect(item).toHaveAttribute('aria-roledescription', 'draggable');
    await item.focus();
    await expect(item).toBeFocused();
  }

  /**
   * Drags an item to the end of a row once its tile takes a drag (right after a page load the
   * tiles take one only once the page has started). Returns once the link is written.
   */
  async dragItemToTierWhenReady(itemName: string, tierName: string) {
    await expect(this.tierList.item(itemName), `${itemName} should take a drag`).toHaveAttribute('aria-roledescription', 'draggable');
    await this.dragItemToTier(itemName, tierName);
  }

  /**
   * Drags an item with the mouse onto the free space at the end of a row, as dragItemToTier does,
   * and returns once the drop is announced and has settled. It does not wait for a new link: on
   * the free space of its own row the item stays where it is, and the link stays as it was.
   */
  async dragItemToFreeSpaceOf(itemName: string, tierName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.tier(tierName), (box) => ({
      x: box.x + box.width - 120,
      y: box.y + box.height / 2,
    }));
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  /**
   * Drags an item with the mouse onto the left or right half of another item, as dragItemNextTo
   * does, and returns once the drop is announced and has settled, without waiting for a new link:
   * an item already on that side stays where it is.
   */
  async dragItemBeside(itemName: string, targetItemName: string, side: 'before' | 'after') {
    await this.dragWithMouse(this.tierList.item(itemName), this.tierList.item(targetItemName), (box) => ({
      x: box.x + box.width * (side === 'before' ? 0.25 : 0.75),
      y: box.y + box.height / 2,
    }), {followTarget: true});
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Dropped ${escapeRegExp(itemName)}\\b`));
  }

  /** The site footer under the editor: nothing in it takes a drop. */
  get siteFooter(): Locator {
    return this.page.getByRole('contentinfo');
  }

  /**
   * Drags an item with the mouse out of the rows, over the site footer, and releases it there.
   * The drag ends without a drop. Returns once the cancel is announced and the item is back.
   */
  async dragItemOutOfTheRows(itemName: string) {
    await this.dragWithMouse(this.tierList.item(itemName), this.siteFooter, centerOfBox);
    await expect(this.dragAnnouncer).toHaveText(new RegExp(`^Move cancelled\\. ${escapeRegExp(itemName)} is back in `));
  }
}

/**
 * How many times dragWithMouse moves the pointer to its drop point before it gives up. Each try
 * waits five frames, so 100 tries let the page auto-scroll for about 500 frames.
 */
const DROP_POINT_TRIES = 100;
