import {expect, type Locator, type Page} from '@playwright/test';


export const UNTIL_STARTED = {waitUntil: 'domcontentloaded'} as const;

export type Box = {x: number; y: number; width: number; height: number};
export type Point = {x: number; y: number};

export function rowPhrase(tierName: string): string {
  return /^(?:row|tier)\b/i.test(tierName) ? tierName : `row ${tierName}`;
}

export async function changeAndWaitForLink(page: Page, action: () => Promise<void>) {
  const before = page.url();
  await action();
  await expect(page, 'the shareable link should update').not.toHaveURL(before);
}

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
