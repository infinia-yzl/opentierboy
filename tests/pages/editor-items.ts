import {expect, type Locator, type Page} from '@playwright/test';
import {escapeRegExp} from '../support/regexp';
import {letToastTimeOut} from '../support/page-clock';
import {changeAndWaitForLink} from './helpers';
import {letClosedToastLeave} from './toasts';
import type {TierListPage} from './tier-list-page';

export class EditorItems {
  readonly tierList: TierListPage;
  readonly page: Page;

  constructor(tierList: TierListPage) {
    this.tierList = tierList;
    this.page = tierList.page;
  }

  async openItemsMenu() {
    await this.tierList.manageItemsButton.click();
  }

  async openManageItemsMenu() {
    await this.openItemsMenu();
    await expect(this.page.getByRole('menu')).toBeVisible();
  }

  get templatePicker(): Locator {
    return this.page.getByRole('dialog');
  }

  templateOption(name?: string | RegExp): Locator {
    return name === undefined ? this.templatePicker.getByRole('option') : this.templatePicker.getByRole('option', {name});
  }

  async openTemplatePicker() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'From template'}).click();
    await expect(this.templatePicker.getByRole('combobox')).toBeVisible();
  }

  async searchTemplates(text: string) {
    await this.templatePicker.getByRole('combobox').fill(text);
  }

  async addItemsFromTemplate(packageName: string, setTitle: string) {
    await this.openTemplatePicker();
    const picker = this.templatePicker;
    await picker.getByRole('option', {name: packageName, exact: true}).click();
    await picker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
  }

  get dropOverlay(): Locator {
    return this.page.getByText('Drop images or image links to add them');
  }

  get dropOverlayNote(): Locator {
    return this.page.getByText('Saved Freeze Frame pictures reopen as editable lists.');
  }

  get emptyListDropArea(): Locator {
    return this.tierList.unranked.getByText(/^(?:Drop or paste images here|Add images here)$/).filter({visible: true});
  }

  get addImagesTileHint(): Locator {
    return this.tierList.addImagesTile.getByText('drop or paste', {exact: true});
  }

  menuHint(item: string, hint: 'or drop' | 'or paste'): Locator {
    return this.tierList.menuItem(item).getByText(hint, {exact: true});
  }

  emptyListAction(name: 'Template' | 'Upload' | 'Link'): Locator {
    return this.tierList.unranked.getByRole('button', {name, exact: true});
  }

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

  get removeAllDialog(): Locator {
    return this.page.getByRole('alertdialog', {name: 'Are you sure?'});
  }

  undoButtonIn(title: string | RegExp): Locator {
    return this.tierList.toast(title).getByRole('button', {name: 'Undo'});
  }

  async restOnToast(title: string | RegExp) {
    await expect(this.undoButtonIn(title)).toBeVisible();
    await this.tierList.restOnMessage(this.tierList.toast(title));
  }

  async deleteItemAndRestOnToast(itemName: string) {
    await this.deleteItem(itemName);
    await this.restOnToast('Item deleted');
  }

  async resetRankingsAndRestOnToast() {
    await this.resetRankings();
    await this.restOnToast('Items Reset');
  }

  async openRemoveAll() {
    await this.openItemsMenu();
    await this.page.getByRole('menuitem', {name: 'Remove All'}).click();
    await expect(this.removeAllDialog).toBeVisible();
  }

  async confirmRemoveAllAndRestOnToast() {
    await changeAndWaitForLink(this.page, () => this.removeAllDialog.getByRole('button', {name: 'Remove All Items'}).click());
    await expect(this.removeAllDialog).toBeHidden();
    await this.restOnToast('All Items Deleted');
  }

  async cancelRemoveAll() {
    await this.removeAllDialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(this.removeAllDialog).toBeHidden();
  }

  async waitOutToast(title: string) {
    await letToastTimeOut(this.page, this.tierList.toast(title));
  }

  templatePickerPage(name: string): Locator {
    return this.templatePicker.getByRole('group', {name, exact: true});
  }

  templatePickerButton(name: string): Locator {
    return this.templatePicker.getByRole('button', {name, exact: true});
  }

  async openTemplatePickerFromDropArea() {
    await this.emptyListAction('Template').click();
    await expect(this.templatePicker.getByRole('combobox')).toBeVisible();
  }

  async openTemplatePackage(name: string) {
    await this.templatePicker.getByRole('option', {name, exact: true}).click();
    await expect(this.templatePickerPage(name)).toBeVisible();
  }

  async pressEscapeForTemplatePicker() {
    await this.page.keyboard.press('Escape');
    await expect(this.templatePicker).toBeHidden();
  }

  async chooseTemplateSetAndHoldToast(setTitle: string) {
    await this.templatePicker.getByRole('option', {name: new RegExp(`^${escapeRegExp(setTitle)}\\b`)}).click();
    await expect(this.templatePicker).toBeHidden();
    const toast = this.tierList.toast('Items Added').or(this.tierList.toast('No New Items'));
    await expect(toast).toBeVisible();
    await toast.hover();
  }

  async waitOutTemplateAddToast() {
    await letToastTimeOut(this.page, this.tierList.toast('Items Added').or(this.tierList.toast('No New Items')));
  }

  async undoTemplateAddAndLetToastLeave() {
    await this.undoButtonIn('Items Added').click();
    await letClosedToastLeave(this.page, this.tierList.toast('Items Added'));
  }

  async undoInToastAndLetItLeave(title: string, {changesList}: {changesList: boolean}) {
    const before = this.page.url();
    await this.undoButtonIn(title).click();
    if (title === 'Item deleted') await expect(this.tierList.toast('Item restored')).toBeVisible();
    if (changesList) await expect(this.page, 'Undo should write a new link').not.toHaveURL(before);
    await letClosedToastLeave(this.page, this.tierList.toast(title));
  }
}
