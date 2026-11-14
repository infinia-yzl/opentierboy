import {expect, type Locator, type Page} from '@playwright/test';

/**
 * Helpers that the page objects share (tier-list-page.ts and the area objects beside it): boxes
 * on screen, the window's scroll position, menus that give focus back, and changes that write a
 * new link. Specs do not use them: they call page object methods.
 */

/**
 * How the page objects navigate: until the new document has been read (DOMContentLoaded), not
 * until its load event. A page says when it has started and finished on <main> (`aria-busy`,
 * lib/busy.ts), and every navigation helper ends with `settled()`, which waits for that. The load
 * event waits for every picture, font and held server answer as well: a picture the test holds,
 * or one that comes late on a slow machine, would stall the step with no error that names it.
 */
export const UNTIL_STARTED = {waitUntil: 'domcontentloaded'} as const;

/** A box on screen, in CSS pixels. */
export type Box = {x: number; y: number; width: number; height: number};
export type Point = {x: number; y: number};

/**
 * A ranked row inside a button name or an announcement, as the editor says it
 * (lib/dnd/labels.ts): "row S", or as it is for "Row 4" (a row without a label) and labels that
 * start with "Row" or "Tier".
 */
export function rowPhrase(tierName: string): string {
  return /^(?:row|tier)\b/i.test(tierName) ? tierName : `row ${tierName}`;
}

/**
 * Runs an action that changes the ranking, and waits until the app has written the
 * change into the address bar. Only then is the link ready to share.
 */
export async function changeAndWaitForLink(page: Page, action: () => Promise<void>) {
  const before = page.url();
  await action();
  await expect(page, 'the shareable link should update').not.toHaveURL(before);
}

/**
 * True when the page has a <main> that is not busy (lib/busy.ts), read once, without waiting
 * for a <main> to show (a crashed page has none).
 */
export async function startedAndIdle(main: Locator): Promise<boolean> {
  return main.evaluateAll((mains) => mains.length > 0 && mains.every((element) => element.getAttribute('aria-busy') !== 'true'));
}

/**
 * Waits until the menu has closed and given focus back to its button. The menu gives it back a
 * moment after it closes: a key pressed before that would go to the element focused meanwhile,
 * and then lose its focus.
 */
export async function menuClosedOnto(page: Page, button: Locator) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).toBeFocused();
}

export async function scrollPosition(page: Page): Promise<Point> {
  return page.evaluate(() => ({x: window.scrollX, y: window.scrollY}));
}

export async function scrollPositionAfterFrames(page: Page, frames = 5): Promise<Point> {
  return page.evaluate(async (count) => {
    for (let frame = 0; frame < count; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {x: window.scrollX, y: window.scrollY};
  }, frames);
}

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element is not visible: ${locator}`);
  return box;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function centerOfBox(box: Box): Point {
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

export async function centerOf(locator: Locator): Promise<Point> {
  return centerOfBox(await boxOf(locator));
}
