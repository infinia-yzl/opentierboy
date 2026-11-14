import {expect, type Locator, type Page} from '@playwright/test';
import {boxOf, changeAndWaitForLink, menuClosedOnto, type Box} from './helpers';
import type {TierListPage} from './tier-list-page';

/**
 * Zen: the Zen bar (Back, the step count, Forward, Ranking order, Layout, Exit Zen), the item up next and the queue, and the creator layouts.
 *
 * Zen turns on with the Zen button in the title row (TierListPage.zenModeToggle). The ranking order and
 * the layout are view settings: they write no link and no history entry. tests/README.md, "Zen's
 * creator layouts".
 *
 * Specs reach it as `tierList.zen` (TierListPage.zen).
 */
export class Zen {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  /** The Zen bar at the top centre: Back, the step count, Forward, Ranking order, Exit Zen. */
  get zenBar(): Locator {
    return this.page.getByRole('toolbar', {name: 'Zen'});
  }

  /** Every button of the Zen bar, in order. */
  get zenBarButtons(): Locator {
    return this.zenBar.getByRole('button');
  }

  /** The site header (its banner), which Zen hides. */
  get siteHeader(): Locator {
    return this.page.getByRole('banner');
  }

  zenBarButton(name: 'Back' | 'Forward' | 'Exit Zen'): Locator {
    return this.zenBar.getByRole('button', {name, exact: true});
  }

  /** The Zen bar's step count, such as "7 / 13". */
  get zenStepCount(): Locator {
    return this.zenBar.getByRole('status');
  }

  /** The Zen bar's button that opens the Ranking order menu; its name says the order. */
  get rankingOrderButton(): Locator {
    return this.zenBar.getByRole('button', {name: /^Ranking order: /});
  }

  /** The OpenTierBoy wordmark that Zen shows in place of the editor tools. */
  get zenWordmark(): Locator {
    return this.tierList.main.getByRole('img', {name: 'OpenTierBoy'});
  }

  /** In Zen with In order or Shuffle: the item up next, the one item of the Unranked tray to drag. */
  get upNextItem(): Locator {
    return this.tierList.unranked.getByRole('button');
  }

  /** In Zen with In order or Shuffle: the queue after the item up next ("Queue" or "Queue (hidden)"). */
  queue(name: 'Queue' | 'Queue (hidden)' = 'Queue'): Locator {
    return this.tierList.unranked.getByRole('list', {name, exact: true});
  }

  /** The items in the queue, in order, each named after its item. */
  get queueItems(): Locator {
    return this.queue().getByRole('listitem');
  }

  /**
   * Turns Zen on with the Zen toggle in the title row, or off with the Zen bar's "Exit Zen"
   * (the toggle hides in Zen, with the other tools).
   */
  async setZenMode(on: boolean) {
    if (on) {
      await this.tierList.zenModeToggle.click();
      await expect(this.zenBar).toBeVisible();
    } else {
      await this.zenBarButton('Exit Zen').click();
      await expect(this.zenBar).toHaveCount(0);
      await expect(this.tierList.zenModeToggle).toHaveAttribute('aria-pressed', 'false');
    }
  }

  /**
   * The parts of the list that the Zen bar's box overlaps: the title ("title"), the rows and the
   * Unranked tray (by their heading) and the items (by their label). Empty when the bar covers
   * nothing of the list.
   */
  async listPartsUnderZenBar(): Promise<string[]> {
    const bar = await this.zenBar.boundingBox();
    if (!bar) throw new Error('The Zen bar is not on the page');
    const title = (await this.tierList.title.count()) > 0 ? this.tierList.title : this.tierList.titleInput;
    const parts: {name: string; locator: Locator}[] = [{name: 'title', locator: title}];
    for (const row of await this.tierList.tiers.all()) {
      parts.push({name: `row ${await row.getByRole('heading', {level: 2}).innerText()}`, locator: row});
    }
    for (const item of await this.tierList.allItems.all()) {
      parts.push({name: `item ${await item.getAttribute('aria-label')}`, locator: item});
    }
    const covered: string[] = [];
    for (const {name, locator} of parts) {
      const box = await locator.boundingBox();
      if (box && boxesOverlap(bar, box)) covered.push(name);
    }
    return covered;
  }

  /** Steps Back or Forward with the Zen bar, and waits until the address has changed. */
  async stepInZenBar(name: 'Back' | 'Forward') {
    await changeAndWaitForLink(this.page, () => this.zenBarButton(name).click());
  }

  /** Chooses a ranking order in the Zen bar's menu. It writes no history entry. */
  async chooseRankingOrder(order: 'Pick freely' | 'In order' | 'Shuffle') {
    await this.rankingOrderButton.click();
    await this.page.getByRole('menuitemradio', {name: order, exact: true}).click();
    await expect(this.rankingOrderButton).toHaveAccessibleName(`Ranking order: ${order}`);
    await menuClosedOnto(this.page, this.rankingOrderButton);
  }

  /** Turns "Hide the queue" on or off in the Zen bar's menu. */
  async setHideQueue(on: boolean) {
    await this.rankingOrderButton.click();
    const item = this.page.getByRole('menuitemcheckbox', {name: 'Hide the queue'});
    await expect(item).toHaveAttribute('aria-checked', String(!on));
    await item.click();
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  /** Opens the Zen bar's Ranking order menu, and returns it. */
  async openRankingOrderMenu(): Promise<Locator> {
    await this.rankingOrderButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  /** The Zen bar's button that opens the Layout menu; its name says the layout. */
  get layoutButton(): Locator {
    return this.zenBar.getByRole('button', {name: /^Layout: /});
  }

  /** Opens a list, turns Zen on and chooses a layout in the Zen bar's Layout menu. */
  async gotoInLayout(path: string, state: string | undefined, layout: ZenLayoutName) {
    await this.tierList.goto(path, state);
    await this.setZenMode(true);
    if (layout !== 'Editor') await this.chooseLayout(layout);
  }

  /** Chooses a layout in the Zen bar's Layout menu. It writes no history entry. */
  async chooseLayout(name: ZenLayoutName) {
    await this.layoutButton.click();
    await this.page.getByRole('menuitemradio', {name, exact: true}).click();
    await expect(this.layoutButton).toHaveAccessibleName(`Layout: ${name}`);
    await menuClosedOnto(this.page, this.layoutButton);
  }

  /** Opens the Zen bar's Layout menu, and returns it. */
  async openLayoutMenu(): Promise<Locator> {
    await this.layoutButton.click();
    return this.page.getByRole('menu');
  }

  /** Clicks a menu button of the Zen bar while one of its menus is open, as a person can. */
  async clickZenBarMenuButtonOverOpenMenu(menu: 'Ranking order' | 'Layout') {
    const bar = this.page.getByRole('toolbar', {name: 'Zen', includeHidden: true});
    await bar.getByRole('button', {name: new RegExp(`^${menu}: `), includeHidden: true}).click();
  }

  /** The name of the item up next (In order or Shuffle). */
  async upNextItemName(): Promise<string> {
    await expect(this.upNextItem).toHaveCount(1);
    return (await this.upNextItem.getAttribute('aria-label')) ?? '';
  }

  /** The frame of a creator layout: "Frame 16:9" (16:9 and the overlays) or "Frame 9:16". */
  get zenFrame(): Locator {
    return this.page.getByRole('region', {name: /^Frame /});
  }

  /**
   * Clicks the frame's top left corner: the green key in the overlay, away from the list's panel.
   * Waits until no tooltip is left: a closing tooltip still takes the next Escape.
   */
  async clickFrameCorner() {
    const frame = await boxOf(this.zenFrame);
    await this.page.mouse.click(frame.x + 10, frame.y + 10);
    await expect(this.page.getByRole('tooltip')).toHaveCount(0);
  }

  /** The colour of the cover behind a creator layout's frame, as a computed CSS colour. */
  async frameCoverColour(): Promise<string> {
    return this.zenFrame.evaluate((frame) => getComputedStyle(frame.parentElement as Element).backgroundColor);
  }

  /**
   * The Unranked tray scrolls (a long list in a creator layout): true when its items, or Up next
   * and the queue, are taller than the box that scrolls them.
   */
  async unrankedItemsScroll(): Promise<boolean> {
    return scrollsInside(this.tierList.unranked.getByRole('button').first());
  }

  /** The rows scroll (more rows than a creator layout's frame holds): true when they are taller than their box. */
  async rowsScroll(): Promise<boolean> {
    return scrollsInside(this.tierList.tiers.first());
  }

  /**
   * True when the content of a creator layout's frame, or of the cover around it, is taller than
   * its box: then the frame or the cover would scroll. A creator layout keeps both still (owner
   * decision, 2026-11-01).
   */
  async frameOverflows(): Promise<boolean> {
    return this.zenFrame.evaluate((frame) => [frame, frame.parentElement as HTMLElement]
      .some((box) => box.scrollHeight > box.clientHeight + 1 || box.scrollTop > 0));
  }

  /**
   * Presses "Hide the queue" in the Zen bar's Ranking order menu while it is unavailable (Pick
   * freely). Checks that the box says so and holds `checked`, that the press changes nothing and
   * leaves the menu open, then closes the menu with Escape, which the menu takes: Zen stays on.
   */
  async pressUnavailableHideQueue(checked: boolean) {
    const menu = await this.openRankingOrderMenu();
    const box = this.tierList.menuItemCheckbox('Hide the queue');
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await expect(box).toHaveAttribute('aria-checked', String(checked));
    // A person can still click it; Playwright waits for an enabled element unless forced. Forced, it
    // skips its other checks too, so the test waits until the menu has placed the box on screen.
    await expect(box).toBeInViewport();
    await box.click({force: true});
    await expect(menu).toBeVisible();
    await expect(box).toHaveAttribute('aria-checked', String(checked));
    await this.tierList.closeMenus();
  }
}

/** The choices of the Zen bar's Layout menu. */
export type ZenLayoutName = 'Editor' | '16:9' | '9:16' | 'Overlay · green key';

/**
 * True when the nearest box around an element that scrolls (overflow auto or scroll) has more
 * content than room. False when no box around it scrolls.
 */
async function scrollsInside(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    let box: HTMLElement | null = element.parentElement;
    while (box && box !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(box).overflowY)) return box.scrollHeight > box.clientHeight + 1;
      box = box.parentElement;
    }
    return false;
  });
}

/** True when two boxes share some area (boxes that only touch at an edge do not). */
function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
