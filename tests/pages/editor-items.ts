import {expect, type Locator, type Page} from '@playwright/test';
import {escapeRegExp} from '../support/regexp';
import {letToastTimeOut} from '../support/page-clock';
import {changeAndWaitForLink} from './helpers';
import {letClosedToastLeave} from './toasts';
import type {TierListPage} from './tier-list-page';

/**
 * Adding, removing and resetting items: the Add images menu, the template picker, Reset and Remove All, an item's Delete, and their toasts with Undo.
 *
 * Also the empty list's drop area and the overlay that shows while files or links are dragged over
 * the editor. Images from a link and from the device have their own objects (link-images.ts,
 * device-images.ts).
 *
 * Specs reach it as `tierList.items` (TierListPage.items).
 */
export class EditorItems {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  /** Clicks Add images in the title row, which opens its menu (the other area objects open it too). */
  async openItemsMenu() {
    await this.tierList.manageItemsButton.click();
  }

  /** Opens the Add images menu and leaves it open. */
  async openManageItemsMenu() {
    await this.openItemsMenu();
    await expect(this.page.getByRole('menu')).toBeVisible();
  }

  /** The template picker ("From template"): a searchable list of image sets and their tags. */
  get templatePicker(): Locator {
    return this.page.getByRole('dialog');
  }

  /** The options of the open template picker (image sets, then tags). */
  templateOption(name?: string | RegExp): Locator {
    return name === undefined ? this.templatePicker.getByRole('option') : this.templatePicker.getByRole('option', {name});
  }

  /** Opens the template picker. Its first page lists the image sets as options. */
  async openTemplatePicker() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From template'}).click();
    await expect(this.templatePicker.getByRole('combobox')).toBeVisible();
  }

  /** Types into the search box of the open template picker. Matching sets and tags appear as options. */
  async searchTemplates(text: string) {
    await this.templatePicker.getByRole('combobox').fill(text);
  }

  /** Adds a set from the built-in templates, for example ('OVERWATCH', 'Tank'). */
  async addItemsFromTemplate(packageName: string, setTitle: string) {
    await this.openTemplatePicker();
    const picker = this.templatePicker;
    await picker.getByRole('option', {name: packageName, exact: true}).click();
    await picker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
  }

  /** The overlay that shows while files or links are dragged over the editor. */
  get dropOverlay(): Locator {
    return this.page.getByText('Drop images or image links to add them');
  }

  /** The overlay's second line, about Freeze Frame pictures. */
  get dropOverlayNote(): Locator {
    return this.page.getByText('Saved Freeze Frame pictures reopen as editable lists.');
  }

  /**
   * An empty list's drop area, in the Unranked tray, by its heading on screen: "Drop or paste
   * images here" with a mouse, "Add images here" on a touch screen.
   */
  get emptyListDropArea(): Locator {
    return this.tierList.unranked.getByText(/^(?:Drop or paste images here|Add images here)$/).filter({visible: true});
  }

  /** The line "drop or paste" on the tray's "Add images" tile (mouse only). */
  get addImagesTileHint(): Locator {
    return this.tierList.addImagesTile.getByText('drop or paste', {exact: true});
  }

  /** The hint after a menu item of the Add images menu: "or drop" or "or paste" (mouse only). */
  menuHint(item: string, hint: 'or drop' | 'or paste'): Locator {
    return this.tierList.menuItem(item).getByText(hint, {exact: true});
  }

  /** A button of an empty list's drop area: Template, Upload or Link. */
  emptyListAction(name: 'Template' | 'Upload' | 'Link'): Locator {
    return this.tierList.unranked.getByRole('button', {name, exact: true});
  }

  /** Deletes an item with its right-click menu, and returns once the new link is in the address bar. */
  async deleteItem(itemName: string) {
    await changeAndWaitForLink(this.page, async () => {
      await this.tierList.item(itemName).click({button: 'right'});
      await this.page.getByRole('menuitem', {name: 'Delete'}).click();
    });
  }

  async resetRankings() {
    await changeAndWaitForLink(this.page, async () => {
      await this.openItemsMenu();
      await this.page.getByRole('menuitem', {name: 'Reset'}).click();
    });
  }

  /** Opens Remove All and cancels the confirmation. */
  async cancelRemoveAllItems() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
    const confirm = this.page.getByRole('alertdialog');
    await confirm.getByRole('button', {name: 'Cancel'}).click();
    await expect(confirm).toBeHidden();
  }

  async removeAllItems() {
    await changeAndWaitForLink(this.page, async () => {
      await this.openItemsMenu();
      await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
      const confirm = this.page.getByRole('alertdialog');
      await confirm.getByRole('button', {name: 'Remove All Items'}).click();
    });
  }

  /** The dialog "Are you sure?" that Remove All opens. */
  get removeAllDialog(): Locator {
    return this.page.getByRole('alertdialog', {name: 'Are you sure?'});
  }

  /** The button Undo in the toast `title`. */
  undoButtonIn(title: string | RegExp): Locator {
    return this.tierList.toast(title).getByRole('button', {name: 'Undo'});
  }

  /**
   * Rests the pointer on a toast with an Undo. Sonner, the toast library, pauses the toasts' 4 s
   * timers while the pointer is over them, as when a person reads one, so the toast stays while
   * the test goes on with Back, Forward and Undo, which do not move the pointer. Call it right
   * after the action that shows the toast.
   */
  async restOnToast(title: string | RegExp) {
    await expect(this.undoButtonIn(title)).toBeVisible();
    await this.tierList.restOnMessage(this.tierList.toast(title));
  }

  /** Deletes an item with its right-click menu, waits for the new link, and rests on the toast "Item deleted". */
  async deleteItemAndRestOnToast(itemName: string) {
    await this.deleteItem(itemName);
    await this.restOnToast('Item deleted');
  }

  /** Chooses Reset in the Add images menu, waits for the new link, and rests on the toast "Items Reset". */
  async resetRankingsAndRestOnToast() {
    await this.resetRankings();
    await this.restOnToast('Items Reset');
  }

  /** Chooses Remove All in the Add images menu, and waits for its dialog. */
  async openRemoveAll() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
    await expect(this.removeAllDialog).toBeVisible();
  }

  /** Confirms the open Remove All dialog, waits for the new link, and rests on the toast "All Items Deleted". */
  async confirmRemoveAllAndRestOnToast() {
    await changeAndWaitForLink(this.page, () => this.removeAllDialog.getByRole('button', {name: 'Remove All Items'}).click());
    await expect(this.removeAllDialog).toBeHidden();
    await this.restOnToast('All Items Deleted');
  }

  /** Cancels the open Remove All dialog. */
  async cancelRemoveAll() {
    await this.removeAllDialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(this.removeAllDialog).toBeHidden();
  }

  /**
   * Clicks Undo in the toast `title`, and waits until the toast has closed. With `changesList`,
   * also waits for the new link, so a Back after it starts from the new history entry. The Undo
   * of "Item deleted" also shows the toast "Item restored", whether or not the list changed.
   */
  async undoInToast(title: string, {changesList}: {changesList: boolean}) {
    const before = this.page.url();
    await this.undoButtonIn(title).click();
    await expect(this.tierList.toast(title)).toHaveCount(0);
    if (title === 'Item deleted') await expect(this.tierList.toast('Item restored')).toBeVisible();
    if (changesList) await expect(this.page, 'Undo should write a new link').not.toHaveURL(before);
  }

  /** Lets the toast `title` close by itself (after 4 s, on the page clock: `pageClock`). */
  async waitOutToast(title: string) {
    await letToastTimeOut(this.page, this.tierList.toast(title));
  }

  /** A page of the open template picker, by the heading of its options: "Packages" or a package's name. */
  templatePickerPage(name: string): Locator {
    return this.templatePicker.getByRole('group', {name, exact: true});
  }

  /** A button in the template picker's top bar: Back, or a page of the breadcrumb such as "Packages". */
  templatePickerButton(name: string): Locator {
    return this.templatePicker.getByRole('button', {name, exact: true});
  }

  /** Opens the template picker with the empty list's Template, and waits for its search box. */
  async openTemplatePickerFromDropArea() {
    await this.emptyListAction('Template').click();
    await expect(this.templatePicker.getByRole('combobox')).toBeVisible();
  }

  /** Opens a package's page in the template picker, from Packages, and waits until it lists the package's sets. */
  async openTemplatePackage(name: string) {
    await this.templatePicker.getByRole('option', {name, exact: true}).click();
    await expect(this.templatePickerPage(name)).toBeVisible();
  }

  /** Presses Escape. With the template picker open, waits until it closes. */
  async pressEscapeForTemplatePicker() {
    await this.page.keyboard.press('Escape');
    await expect(this.templatePicker).toBeHidden();
  }

  /**
   * Chooses a set on the open package page of the template picker, such as 'Tank', and waits for
   * the picker to close and the toast "Items Added" or "No New Items" to show. Then it rests the pointer on the
   * toast: Sonner keeps a toast while the pointer is on it, so the toast waits for Undo however
   * slow the next steps are.
   */
  async chooseTemplateSetAndHoldToast(setTitle: string) {
    await this.templatePicker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
    await expect(this.templatePicker).toBeHidden();
    const toast = this.tierList.toast('Items Added').or(this.tierList.toast('No New Items'));
    await expect(toast).toBeVisible();
    await toast.hover();
  }

  /** Clicks Undo in the toast "Items Added" of a template add, and waits until the toast is gone (the link may stay). */
  async undoTemplateAdd() {
    await this.tierList.undoFromToast('Items Added');
    await expect(this.tierList.toast('Items Added')).toHaveCount(0);
  }

  /** Lets the toast of a template add end by itself (after 4 s, on the page clock: `pageClock`). */
  async waitOutTemplateAddToast() {
    await letToastTimeOut(this.page, this.tierList.toast('Items Added').or(this.tierList.toast('No New Items')));
  }

  /** Clicks Undo in the toast "Items Added" of a template add, and returns once the toast left (the link may stay). */
  async undoTemplateAddAndLetToastLeave() {
    await this.undoButtonIn('Items Added').click();
    await letClosedToastLeave(this.page, this.tierList.toast('Items Added'));
  }

  /**
   * Clicks Undo in the toast `title`, as undoInToast does, and returns once the toast
   * left (letClosedToastLeave). The Undo of "Item deleted" also shows the toast "Item restored".
   */
  async undoInToastAndLetItLeave(title: string, {changesList}: {changesList: boolean}) {
    const before = this.page.url();
    await this.undoButtonIn(title).click();
    if (title === 'Item deleted') await expect(this.tierList.toast('Item restored')).toBeVisible();
    if (changesList) await expect(this.page, 'Undo should write a new link').not.toHaveURL(before);
    await letClosedToastLeave(this.page, this.tierList.toast(title));
  }
}
