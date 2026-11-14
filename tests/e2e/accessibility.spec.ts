/** Automatic accessibility scans (axe-core, WCAG 2.1 A and AA) of each page and of the dialogs and menus that matter. */
import fs from 'node:fs';
import path from 'node:path';
import {expect, test} from '../support/test';
import {scanForViolations} from '../support/accessibility';
import {packageItemId, rankingState, v3State} from '../support/links';
import {serveImageSite} from '../support/image-sites';
import {pngFile} from '../support/snapshot-files';
import type {SitePage, ThemeMode} from '../pages/site-page';
import type {TierListPage} from '../pages/tier-list-page';

const TANKS = '/rank/overwatch/tank';
const SHARED_LIST = rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma', 'Orisa']}, 'Shared tanks');
/** A list with a row without a name (it shows its position, "Row 2", as a hint) and items to move. */
const UNNAMED_ROW_LIST = v3State({r: [
  ['tier-s', 'S', [packageItemId('image-overwatch', 'Mauga')]], ['tier-1', '', [packageItemId('image-overwatch', 'Winston')]], ['tier-b', 'B', []], ['uncategorized', '', []],
]});
const SNAPSHOT = path.resolve(__dirname, '../fixtures/snapshots/chromium-2026-10-31.png');

/** What one scan looks at, and how the test gets there. */
interface Scan {
  /** What the scan sees, as the test name says it: "when the page opens <name>" or "when the user opens <name>". */
  readonly name: string;
  readonly by: 'page' | 'user';
  /** True when a phone shows it too: the scan also runs on the phone projects (@mobile). */
  readonly phone: boolean;
  readonly open: (pages: {site: SitePage; tierList: TierListPage}) => Promise<void>;
}

/** Opens the shared list, then does what opens the dialog or menu. */
const onSharedList = (open: (pages: {site: SitePage; tierList: TierListPage}) => Promise<unknown>) =>
  async (pages: {site: SitePage; tierList: TierListPage}) => {
    await pages.tierList.goto(TANKS, SHARED_LIST);
    await open(pages);
  };

const SCANS: readonly Scan[] = [
  {name: 'Home', by: 'page', phone: true, open: ({site}) => site.gotoHome()},
  {name: 'About', by: 'page', phone: true, open: ({site}) => site.goto('/about')},
  {name: 'the blog', by: 'page', phone: true, open: ({site}) => site.goto('/blog')},
  {name: 'a blog article', by: 'page', phone: true, open: ({site}) => site.goto('/blog/opentierboy-2-0-0')},
  {name: 'the editor on an empty list', by: 'page', phone: true, open: ({tierList}) => tierList.goto('/rank')},
  {name: 'the editor on a template', by: 'page', phone: true, open: ({tierList}) => tierList.goto(TANKS)},
  {name: 'the editor with a shared list', by: 'page', phone: true, open: ({tierList}) => tierList.goto(TANKS, SHARED_LIST)},
  {name: 'the editor with a row without a name', by: 'page', phone: true, open: ({tierList}) => tierList.goto(TANKS, UNNAMED_ROW_LIST)},
  // The row handles (owner decision, 2026-11-14): focus on a handle shows what it moves.
  {name: 'the focused grip of a row', by: 'user', phone: false, open: async ({tierList}) => {
    await tierList.goto(TANKS, UNNAMED_ROW_LIST);
    await tierList.focusWithKeyboard(tierList.rowGrip('S'));
  }},
  {name: 'the focused stack of a row', by: 'user', phone: false, open: async ({tierList}) => {
    await tierList.goto(TANKS, UNNAMED_ROW_LIST);
    await tierList.focusWithKeyboard(tierList.rowStack('S'));
  }},
  {name: 'Zen on a shared list', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.zen.setZenMode(true))},
  {name: 'the Appearance menu', by: 'user', phone: true, open: onSharedList(({site}) => site.openAppearance())},
  {name: 'the Add images menu', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.items.openManageItemsMenu())},
  {name: 'the template picker', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.items.openTemplatePicker())},
  {name: 'the upload dialog', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openUploadDialog())},
  {name: 'the link dialog', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.linkImages.openLinkImageDialog())},
  {name: 'the share panel', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.share.openSharePanel())},
  {name: 'the Remove All dialog', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.items.openRemoveAll())},
  {name: 'the Row options menu', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openRowOptions())},
  // A Freeze Frame file chosen on Home (its link image's site answers from tests/support/image-sites.ts).
  {name: 'the dialog "Open the list in this file?"', by: 'user', phone: false, open: async ({site}) => {
    await site.gotoHome();
    await site.openFreezeFrame(pngFile(path.basename(SNAPSHOT), fs.readFileSync(SNAPSHOT)));
    await expect(site.openListDialog).toBeVisible();
  }},
];

/** Colour contrast changes with the mode, so every scan runs in both. */
const MODES: readonly ThemeMode[] = ['light', 'dark'];

/** Opens a scan's page in a mode, and returns what axe-core finds there. */
async function scanIn(scan: Scan, mode: ThemeMode, pages: {site: SitePage; tierList: TierListPage}) {
  await serveImageSite(pages.tierList.page, 'i.imgur.com');
  await pages.site.rememberBeforeLoad('theme', mode);
  await scan.open(pages);
  return scanForViolations(pages.tierList.page);
}

test.describe('accessibility', () => {
  for (const scan of SCANS) {
    for (const mode of MODES) {
      test(`renders no WCAG 2.1 A or AA violation when the ${scan.by} opens ${scan.name} in ${mode} mode`, scan.phone ? {tag: '@mobile'} : {}, async ({site, tierList}) => {
        const violations = await scanIn(scan, mode, {site, tierList});

        expect(violations).toEqual([]);
      });
    }
  }
});
