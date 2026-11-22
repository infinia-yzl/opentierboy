import {expect, type Locator, type Page} from '@playwright/test';
import {boxOf, changeAndWaitForLink, menuClosedOnto, type Box} from './helpers';
import type {TierListPage} from './tier-list-page';

export class Zen {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  get zenBar(): Locator {
    return this.page.getByRole('toolbar', {name: 'Zen'});
  }

  get zenBarButtons(): Locator {
    return this.zenBar.getByRole('button');
  }

  get siteHeader(): Locator {
    return this.page.getByRole('banner');
  }

  zenBarButton(name: 'Back' | 'Forward' | 'Exit Zen'): Locator {
    return this.zenBar.getByRole('button', {name, exact: true});
  }

  get zenStepCount(): Locator {
    return this.zenBar.getByRole('status');
  }

  get rankingOrderButton(): Locator {
    return this.zenBar.getByRole('button', {name: /^Ranking order: /});
  }

  get zenWordmark(): Locator {
    return this.tierList.main.getByRole('img', {name: 'OpenTierBoy'});
  }

  get upNextItem(): Locator {
    return this.tierList.unranked.getByRole('button');
  }

  queue(name: 'Queue' | 'Queue (hidden)' = 'Queue'): Locator {
    return this.tierList.unranked.getByRole('list', {name, exact: true});
  }

  get queueItems(): Locator {
    return this.queue().getByRole('listitem');
  }

  async queueItemNames(): Promise<string[]> {
    return this.queueItems.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''));
  }

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

  async stepInZenBar(name: 'Back' | 'Forward') {
    await changeAndWaitForLink(this.page, () => this.zenBarButton(name).click());
  }

  async chooseRankingOrder(order: 'Pick freely' | 'In order' | 'Shuffle') {
    await this.rankingOrderButton.click();
    await this.page.getByRole('menuitemradio', {name: order, exact: true}).click();
    await expect(this.rankingOrderButton).toHaveAccessibleName(`Ranking order: ${order}`);
    await menuClosedOnto(this.page, this.rankingOrderButton);
  }

  async setHideQueue(on: boolean) {
    await this.rankingOrderButton.click();
    const item = this.page.getByRole('menuitemcheckbox', {name: 'Hide the queue'});
    await expect(item).toHaveAttribute('aria-checked', String(!on));
    await item.click();
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }

  async openRankingOrderMenu(): Promise<Locator> {
    await this.rankingOrderButton.click();
    const menu = this.page.getByRole('menu');
    await expect(menu).toBeVisible();
    return menu;
  }

  get layoutButton(): Locator {
    return this.zenBar.getByRole('button', {name: /^Layout: /});
  }

  async gotoInLayout(path: string, state: string | undefined, layout: ZenLayoutName) {
    await this.tierList.goto(path, state);
    await this.setZenMode(true);
    if (layout !== 'Editor') await this.chooseLayout(layout);
  }

  async chooseLayout(name: ZenLayoutName) {
    await this.layoutButton.click();
    await this.page.getByRole('menuitemradio', {name, exact: true}).click();
    await expect(this.layoutButton).toHaveAccessibleName(`Layout: ${name}`);
    await menuClosedOnto(this.page, this.layoutButton);
  }

  async openLayoutMenu(): Promise<Locator> {
    await this.layoutButton.click();
    return this.page.getByRole('menu');
  }

  async clickZenBarMenuButtonOverOpenMenu(menu: 'Ranking order' | 'Layout') {
    const bar = this.page.getByRole('toolbar', {name: 'Zen', includeHidden: true});
    await bar.getByRole('button', {name: new RegExp(`^${menu}: `), includeHidden: true}).click();
  }

  async upNextItemName(): Promise<string> {
    await expect(this.upNextItem).toHaveCount(1);
    return (await this.upNextItem.getAttribute('aria-label')) ?? '';
  }

  get zenFrame(): Locator {
    return this.page.getByRole('region', {name: /^Frame /});
  }

  async clickFrameCorner() {
    const frame = await boxOf(this.zenFrame);
    await this.page.mouse.click(frame.x + 10, frame.y + 10);
    await expect(this.page.getByRole('tooltip')).toHaveCount(0);
  }

  async frameCoverColour(): Promise<string> {
    return this.zenFrame.evaluate((frame) => getComputedStyle(frame.parentElement as Element).backgroundColor);
  }

  async unrankedItemsScroll(): Promise<boolean> {
    return scrollsInside(this.tierList.unranked.getByRole('button').first());
  }

  async rowsScroll(): Promise<boolean> {
    return scrollsInside(this.tierList.tiers.first());
  }

  async frameOverflows(): Promise<boolean> {
    return this.zenFrame.evaluate((frame) => [frame, frame.parentElement as HTMLElement]
      .some((box) => box.scrollHeight > box.clientHeight + 1 || box.scrollTop > 0));
  }

  async pressUnavailableHideQueue(checked: boolean) {
    const menu = await this.openRankingOrderMenu();
    const box = this.tierList.menuItemCheckbox('Hide the queue');
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await expect(box).toHaveAttribute('aria-checked', String(checked));
    await expect(box).toBeInViewport();
    await box.click({force: true});
    await expect(menu).toBeVisible();
    await expect(box).toHaveAttribute('aria-checked', String(checked));
    await this.tierList.closeMenus();
  }
}

export type ZenLayoutName = 'Editor' | '16:9' | '9:16' | 'Overlay · green key';

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

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
