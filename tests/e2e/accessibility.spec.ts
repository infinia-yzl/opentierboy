/** Automatic accessibility scans (axe-core, WCAG 2.1 A and AA) of each page and of the dialogs and menus that matter. */
import fs from 'node:fs';
import path from 'node:path';
import {expect, test} from '../support/test';
import {scanForViolations, violationsBesides, violationsOf, type KnownViolation} from '../support/accessibility';
import {rankingState} from '../support/links';
import {serveImageSite} from '../support/image-sites';
import {pngFile} from '../support/snapshot-files';
import type {SitePage, ThemeMode} from '../pages/site-page';
import type {TierListPage} from '../pages/tier-list-page';

const TANKS = '/rank/overwatch/tank';
const SHARED_LIST = rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma', 'Orisa']}, 'Shared tanks');
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
  {name: 'Zen on a shared list', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.setZenMode(true))},
  {name: 'the Appearance menu', by: 'user', phone: true, open: onSharedList(({site}) => site.openAppearance())},
  {name: 'the Add images menu', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openManageItemsMenu())},
  {name: 'the template picker', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openTemplatePicker())},
  {name: 'the upload dialog', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openUploadDialog())},
  {name: 'the link dialog', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openLinkImageDialog())},
  {name: 'the share panel', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openSharePanel())},
  {name: 'the Remove All dialog', by: 'user', phone: true, open: onSharedList(({tierList}) => tierList.openRemoveAll())},
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

/** A violation the scans found that is still open. Its test in `Known bugs` fails while it is there. */
interface OpenViolation extends KnownViolation {
  readonly reason: string;
  /** The scans that find it, by name: its Known bugs test opens the first. */
  readonly scans: readonly string[];
  /** The modes it shows in: its Known bugs test uses the first. */
  readonly modes: readonly ThemeMode[];
}

type OpenViolationKey = 'templateButtonNames' | 'communityLinkNames' | 'addImagesTileName' | 'blogDiscordContrast'
  | 'menuHidesFocusable' | 'shareHelpButtonName' | 'socialButtonNames' | 'openShareButtonContrast' | 'removeAllButtonContrast';

/**
 * The violations found when the scans were added (axe-core 4.14, 2026-11-14), one entry per
 * issue. The scans above leave out only these elements, and only in the scans and modes listed;
 * anything else fails them. Each entry has its own Known bugs test, which fails while the
 * violation is there. When a fix lands, its test passes, and test.fail reports it: remove the
 * entry. Nothing in the app was changed for them: each one is for the owner to decide.
 */
const OPEN_VIOLATIONS: Readonly<Record<OpenViolationKey, OpenViolation>> = {
  templateButtonNames: {
    rule: 'label-content-name-mismatch',
    element: /: <a aria-label="[^"]*" class="[^"]*" href="\/rank\//,
    scans: ['Home'],
    modes: MODES,
    reason: 'WCAG 2.5.3 Label in Name: each template button shows a rounded count such as "70+", but its name says "about 70 items" (lib/templateButtons.ts), so a voice user who says what they see names nothing. The names were chosen on purpose: the owner decides.',
  },
  communityLinkNames: {
    rule: 'label-content-name-mismatch',
    element: /aria-label="(GitHub|Discord)">$/,
    scans: ['About', 'a blog article'],
    modes: MODES,
    reason: 'WCAG 2.5.3 Label in Name: the links read "Contribute on GitHub" and "Join our Discord", but aria-label names them only "GitHub" and "Discord" (About, and the Discord link of each blog article).',
  },
  addImagesTileName: {
    rule: 'label-content-name-mismatch',
    element: /aria-label="Add images to Unrank/,
    scans: ['the editor on a template', 'the editor with a shared list', 'the share panel'],
    modes: MODES,
    reason: 'WCAG 2.5.3 Label in Name: the tile shows "Add images" and "drop or paste", but its name is "Add images to Unranked" (components/ItemManager.tsx), without "drop or paste". Phones hide that line.',
  },
  blogDiscordContrast: {
    rule: 'color-contrast',
    element: /Share it with us on Discord!/,
    scans: ['a blog article'],
    modes: MODES,
    reason: 'WCAG 1.4.3 Contrast: the line under "Got something to say?" at the end of each blog article uses the muted text colour on the inverted card, about 2.4:1 where 4.5:1 is needed.',
  },
  menuHidesFocusable: {
    rule: 'aria-hidden-focus',
    element: /^(header|main|footer): </,
    scans: ['the Row options menu', 'the Appearance menu', 'the Add images menu'],
    modes: MODES,
    reason: 'WCAG 4.1.2: an open dropdown menu (Radix, modal) sets aria-hidden on the header, <main> and the footer, which still hold links and buttons that can take focus. The menu keeps focus while it is open, so this may be how the library works: the owner decides.',
  },
  shareHelpButtonName: {
    rule: 'button-name',
    element: /^h3 > button\[data-state="closed"\]: /,
    scans: ['the share panel'],
    modes: MODES,
    reason: 'WCAG 4.1.2: the question mark icon button beside "As URL" (a tooltip trigger in components/ShareButton.tsx) has no accessible name.',
  },
  socialButtonNames: {
    rule: 'button-name',
    element: /flex-row\.flex > \.border-input/,
    scans: ['the share panel'],
    modes: MODES,
    reason: 'WCAG 4.1.2: the Facebook and X share buttons are icons without accessible names. share-panel.spec.ts has the same bug in its Known bugs.',
  },
  openShareButtonContrast: {
    rule: 'color-contrast',
    element: /aria-haspopup="dialog" aria-expanded="true"/,
    scans: ['the share panel'],
    modes: ['light'],
    reason: 'WCAG 1.4.3 Contrast: while the share panel is open, the Share button\'s white text on its lighter OVERWATCH orange is about 4.4:1 where 4.5:1 is needed (light mode).',
  },
  removeAllButtonContrast: {
    rule: 'color-contrast',
    element: /^\.bg-destructive: /,
    scans: ['the Remove All dialog'],
    modes: ['light'],
    reason: 'WCAG 1.4.3 Contrast: the red "Remove All Items" button has white text at about 3.6:1 where 4.5:1 is needed (light mode).',
  },
};

/** Opens a scan's page in a mode, and returns what axe-core finds there. */
async function scanIn(scan: Scan, mode: ThemeMode, pages: {site: SitePage; tierList: TierListPage}) {
  await serveImageSite(pages.tierList.page, 'i.imgur.com');
  await pages.site.rememberBeforeLoad('theme', mode);
  await scan.open(pages);
  return scanForViolations(pages.tierList.page);
}

/**
 * The Known bugs check of an open violation: opens the first scan that finds it, in its first
 * mode, then marks the test as failing and expects none of its elements.
 */
async function expectFixed(open: OpenViolation, pages: {site: SitePage; tierList: TierListPage}) {
  const scan = SCANS.find((entry) => entry.name === open.scans[0]);
  if (!scan) throw new RangeError(`No scan named ${open.scans[0]}`);
  const violations = await scanIn(scan, open.modes[0], pages);
  // Marked here, after the steps that must work: a failure above fails the test as usual.
  test.fail(true, open.reason);

  expect(violationsOf(violations, open)).toEqual([]);
}

test.describe('accessibility', () => {
  for (const scan of SCANS) {
    for (const mode of MODES) {
      test(`renders no WCAG 2.1 A or AA violation when the ${scan.by} opens ${scan.name} in ${mode} mode`, scan.phone ? {tag: '@mobile'} : {}, async ({site, tierList}) => {
        const violations = await scanIn(scan, mode, {site, tierList});

        const known = Object.values(OPEN_VIOLATIONS).filter((entry) => entry.scans.includes(scan.name) && entry.modes.includes(mode));
        expect(violationsBesides(violations, known), 'violations other than the known ones (OPEN_VIOLATIONS)').toEqual([]);
      });
    }
  }

  /**
   * Known bugs, one test per open violation (OPEN_VIOLATIONS). Each test describes the correct
   * behaviour and is marked `test.fail`, so the suite stays green while the bug exists.
   */
  test.describe('Known bugs', () => {
    test('renders the visible count of each template button in its accessible name when the page opens Home', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.templateButtonNames, {site, tierList});
    });

    test('renders "Contribute on GitHub" and "Join our Discord" in the names of their links when the page opens About', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.communityLinkNames, {site, tierList});
    });

    test('renders the visible text "drop or paste" in the name of the tile "Add images to Unranked" when the page opens a template', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.addImagesTileName, {site, tierList});
    });

    test('renders "Share it with us on Discord!" at a contrast of at least 4.5:1 when the page opens a blog article', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.blogDiscordContrast, {site, tierList});
    });

    test('renders no focusable element in the parts of the page a menu hides when the user opens the Row options menu', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.menuHidesFocusable, {site, tierList});
    });

    test('renders an accessible name on the help button beside "As URL" when the user opens the share panel', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.shareHelpButtonName, {site, tierList});
    });

    test('renders accessible names on the Facebook and X buttons when the user opens the share panel', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.socialButtonNames, {site, tierList});
    });

    test('renders button "Share" open at a contrast of at least 4.5:1 when the user opens the share panel in light mode', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.openShareButtonContrast, {site, tierList});
    });

    test('renders button "Remove All Items" at a contrast of 4.5:1 or more when the user opens Remove All in light mode', async ({site, tierList}) => {
      await expectFixed(OPEN_VIOLATIONS.removeAllButtonContrast, {site, tierList});
    });
  });
});
