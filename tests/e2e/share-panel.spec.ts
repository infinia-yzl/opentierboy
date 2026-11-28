import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import {circleNoteOn, inkValue, packageItemId, rankingState, v3LinkJson, v3State} from '../support/links';
import {escapeRegExp} from '../support/regexp';
import {imageFile, serveImageSite} from '../support/image-sites';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {snapshotTextOf} from '../support/snapshot-files';
import type {TierListPage} from '../pages/tier-list-page';
import {sharePanelModel, sharePanelViewOf, type SharePanelEvent, type SharePanelSnapshot, type SharePanelView} from '../models/share-panel';
import {
  SCRIBBLES_LINES, shareScribblesModel, shareScribblesViewOf, type ShareScribblesEvent, type ShareScribblesSnapshot,
} from '../models/share-scribbles';

const TANKS = '/rank/overwatch/tank';

test.describe('share panel', () => {
  test.describe('share link', () => {
    test('renders the tabs URL and Image and button "Copy Markdown" when the user opens the share panel', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.share.openSharePanel();

      await expect(tierList.share.shareTab('URL')).toBeVisible();
      await expect(tierList.share.shareTab('Image')).toBeVisible();
      await expect(tierList.share.copyMarkdownButton).toBeVisible();
    });

    test('writes Markdown with the title and the v3 link of the list to the clipboard when the user clicks Copy Markdown', {tag: '@mobile'}, async ({
      tierList,
      openAsVisitor,
    }) => {
      await tierList.share.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.share.copyMarkdown();

      const markdown = await tierList.share.clipboardText();
      expect(markdown).toContain('**OVERWATCH - Tank**');
      const linkInMarkdown = markdown.match(/\]\((\S+)\)/)?.[1];
      expect(linkInMarkdown).toMatch(new RegExp(`^${escapeRegExp(new URL(TANKS, tierList.page.url()).href)}\\?state=3\\.`));
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('writes the list and label settings on screen to the clipboard link when the user clicks Copy Markdown after Back', async ({
      tierList,
      openAsVisitor,
      page,
    }) => {
      await tierList.share.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));
      await tierList.drag.dragItemToTier('Mauga', 'S');
      await tierList.rows.chooseLabelPosition('Top');
      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveCount(0);

      await tierList.share.copyMarkdown();

      const linkInMarkdown = (await tierList.share.clipboardText()).match(/\]\((\S+)\)/)?.[1];
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('S')).toHaveCount(0);
      await expect(friend.itemsIn(friend.unranked)).toHaveText(['Mauga', 'Winston']);
      await friend.rows.openRowOptions();
      await expect(friend.rows.rowOption('Top')).toBeChecked();
      await expect(friend.rows.rowOption('Show Labels')).toBeChecked();
      await friend.closeMenus();
    });

    test('writes the latest list to the clipboard when the user clicks Copy Markdown right after 3 quick moves', async ({
      tierList,
      openAsVisitor,
    }) => {
      await tierList.share.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      for (const name of ['Mauga', 'Winston', 'Sigma']) {
        await tierList.drag.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false});
      }
      await tierList.share.copyMarkdown();

      const linkInMarkdown = (await tierList.share.clipboardText()).match(/\]\((\S+)\)/)?.[1];
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('F')).toHaveCount(3);
    });

    test('writes the label position and label visibility to the share link when the user changes them', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.rows.chooseLabelPosition('Top');
      await tierList.rows.setItemLabelsVisible(false);

      const friend = await openAsVisitor(await tierList.shareLink());
      await friend.rows.openRowOptions();
      await expect(friend.rows.rowOption('Top')).toBeChecked();
      await expect(friend.rows.rowOption('Hide Labels')).toBeChecked();
      await friend.closeMenus();
      await expect.poll(() => friend.rows.tierLabelIsAbove('S', 'Mauga')).toBe(true);
      await expect(friend.item('Mauga')).toHaveText('');
    });

    test('renders row labels on top when the page opens a v3 link with lp top', {tag: '@mobile'}, async ({tierList}) => {
      const mauga = packageItemId('image-overwatch', 'Mauga');
      await tierList.goto(TANKS, v3State({tp: 5, lp: 'top', r: [['S', [mauga]], ['A', []], ['B', []], ['C', []], ['F', []], ['', []]]}));

      await tierList.rows.openRowOptions();

      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Show Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect.poll(() => tierList.rows.tierLabelIsAbove('S', 'Mauga')).toBe(true);
      await expect(tierList.item('Mauga')).toHaveText('Mauga');
    });

    test('renders the label settings of the link, also after a reload, when the page opens /rank/?state= with lp and sl', {tag: '@mobile'}, async ({tierList}) => {
      const mauga = packageItemId('image-overwatch', 'Mauga');
      await tierList.goto('/rank/', v3State({t: 'Blank list', tp: 5, lp: 'top', sl: false, r: [['S', [mauga]], ['A', []], ['B', []], ['C', []], ['F', []], ['', []]]}));

      await expect(tierList.title).toHaveText('Blank list');
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect.poll(() => tierList.rows.tierLabelIsAbove('S', 'Mauga')).toBe(true);

      await tierList.reload();
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect(tierList.item('Mauga')).toHaveText('');
    });
  });

  test.describe('images in the link', () => {
    test('renders no image note in the share panel when the page opens a list with only image-set items', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      await tierList.share.openSharePanel();

      await expect(tierList.share.copyMarkdownButton).toBeVisible();
      await expect(tierList.share.linkImageNotes).toHaveCount(0);
    });

    test('renders the note "2 images from the web are in the link." when the page opens a list with 2 link images', {tag: '@mobile'}, async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS, v3State({t: 'Link images', tp: 3, r: [
        ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'Red'}]],
        ['A', []], ['B', []], ['', [{u: 'https://i.imgur.com/blue.png', c: 'Blue'}]],
      ]}));

      await tierList.share.openSharePanel();

      await expect(tierList.share.linkImageNotes).toHaveCount(1);
      await expect(tierList.share.linkImageNotes).toHaveText(
        "2 images from the web are in the link. People who open the link see them too. Some sites need their OK first: until they press Load, they see the images' names.");
    });

    test('renders the note "1 image from your device isn\'t in the link." when the user adds an image from the device', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.deviceImages.addItemsFromDevice([imageFile('red-square.png')]);

      await tierList.share.openSharePanel();

      await expect(tierList.share.linkImageNotes).toHaveCount(1);
      await expect(tierList.share.linkImageNotes).toHaveText(
        "1 device image shows as a placeholder.");
    });

    test('renders a note for 3 device images and one for 1 link image when the page opens a list with both', {tag: '@mobile'}, async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS, v3State({t: 'Both', tp: 3, r: [
        ['S', [{u: 'https://i.imgur.com/red.png', c: 'Red'}, {d: 'NeverHere1234567', c: 'Cat'}]],
        ['A', [{d: 'NeverHere7654321', c: 'Dog'}]], ['B', []], ['', [{d: 'NeverHere0000001', c: 'Bird'}]],
      ]}));

      await tierList.share.openSharePanel();

      await expect(tierList.share.linkImageNotes).toHaveText([
        "3 device images show as placeholders.",
        "1 image from the web is in the link. People who open the link see it too. Some sites need their OK first: until they press Load, they see the image's name.",
      ]);
    });
  });

  test('renders the Facebook and X share buttons by their names when the user opens the share panel', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.share.openSharePanel();

    await expect(tierList.share.socialShareButton('Share on Facebook')).toBeVisible();
    await expect(tierList.share.socialShareButton('Share on X')).toBeVisible();
  });

  test.describe('scribbles', () => {
    const LIST = rankingState('image-overwatch', {S: ['Mauga'], '': ['Sigma']});
    const INK = inkValue([circleNoteOn('image-overwatch', 'Mauga')]);
    const LINK_WITH_INK = `${TANKS}?state=${LIST}&ink=${INK}`;
    const INCLUDED = 'Every button below shares your scribbles too';
    const LEFT_OUT = 'Every button below shares the list without your scribbles';
    const inkOf = (link: string) => new URL(link).searchParams.get('ink')?.replace(/ /g, '+') ?? null;

    test('renders the URL tab without a group, a switch or button "Copy link" when the list has no scribbles', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);

      await tierList.share.openSharePanel();

      await expect(tierList.share.copyMarkdownButton).toBeVisible();
      await expect(tierList.share.scribblesGroup).toHaveCount(0);
      await expect(tierList.share.includeScribblesSwitch).toHaveCount(0);
      await expect(tierList.share.copyLinkButton).toHaveCount(0);
      await tierList.share.chooseShareTab('Image');
      await expect(tierList.share.scribblesPictureNote).toHaveCount(0);
    });

    test('renders the group "Include scribbles" with its switch on and every share button inside when the list has scribbles', async ({tierList}) => {
      await tierList.goto(LINK_WITH_INK);
      await tierList.scribble.expectNotes(1);

      await tierList.share.openSharePanel();

      const group = tierList.share.scribblesGroup;
      await expect(tierList.share.includeScribblesSwitch).toHaveAttribute('aria-checked', 'true');
      await expect(tierList.share.includeScribblesSwitch).toHaveAccessibleDescription(INCLUDED);
      await expect(group.getByRole('button')).toHaveText(['Copy link', 'Copy Markdown', '', '']);
      await expect(group.getByRole('button', {name: 'Share on Facebook'})).toBeVisible();
      await expect(group.getByRole('button', {name: 'Share on X'})).toBeVisible();
      await expect(group.getByText('OR', {exact: true})).toBeVisible();
    });

    test('writes the link with the ink value to the clipboard, with a toast, when the user clicks Copy link with the switch on', async ({tierList, openAsVisitor}) => {
      await tierList.share.readCopiedText();
      await tierList.goto(LINK_WITH_INK);
      await tierList.scribble.expectNotes(1);
      await tierList.share.openSharePanel();

      await tierList.share.copyLinkInOpenPanel();

      await expect(tierList.toast('Link copied to clipboard')).toContainText('It shares your scribbles too.');
      const link = await tierList.share.clipboardText();
      expect(link).toMatch(new RegExp(`^${escapeRegExp(new URL(TANKS, tierList.page.url()).href)}\\?state=3\\.[^&]+&ink=1\\.[^&]+$`));
      expect(inkOf(link)).toBe(INK);
      const friend = await openAsVisitor(link);
      await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
      await friend.scribble.expectNotes(1);
    });

    test('writes the Facebook, X, Markdown and Copy link addresses with the ink value when the switch is on', async ({tierList}) => {
      await tierList.share.readCopiedText();
      await tierList.share.recordShareWindows();
      await tierList.goto(LINK_WITH_INK);
      await tierList.scribble.expectNotes(1);
      await tierList.share.openSharePanel();

      expect(inkOf(await tierList.share.addressSharedOn('Facebook'))).toBe(INK);
      expect(inkOf(await tierList.share.addressSharedOn('X'))).toBe(INK);
      await tierList.share.copyMarkdownInOpenPanel();
      expect(inkOf(await tierList.share.copiedLink())).toBe(INK);
      await tierList.share.copyLinkInOpenPanel();
      expect(inkOf(await tierList.share.copiedLink())).toBe(INK);
    });

    test('writes the Facebook, X, Markdown and Copy link addresses without the ink value when the user turns the switch off', async ({tierList, openAsVisitor}) => {
      await tierList.share.readCopiedText();
      await tierList.share.recordShareWindows();
      await tierList.goto(LINK_WITH_INK);
      await tierList.scribble.expectNotes(1);
      await tierList.share.openSharePanel();

      await tierList.share.setIncludeScribbles(false);

      await expect(tierList.share.includeScribblesSwitch).toHaveAccessibleDescription(LEFT_OUT);
      const shared = [await tierList.share.addressSharedOn('Facebook'), await tierList.share.addressSharedOn('X')];
      await tierList.share.copyMarkdownInOpenPanel();
      shared.push(await tierList.share.copiedLink());
      await tierList.share.copyLinkInOpenPanel();
      await expect(tierList.toast('Link copied to clipboard')).toContainText('It shares the list without your scribbles.');
      shared.push(await tierList.share.copiedLink());
      for (const link of shared) {
        expect(link).toMatch(new RegExp(`^${escapeRegExp(new URL(TANKS, tierList.page.url()).href)}\\?state=3\\.[^&]+$`));
      }
      expect(new Set(shared).size).toBe(1);
      expect(tierList.scribble.inkInAddress()).toBe(INK);
      const friend = await openAsVisitor(shared[0]);
      await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
      await expect(friend.scribble.layer).toHaveCount(0);
    });

    test('writes the canonical ink value alone to Copy link, Copy Markdown, Facebook and X when the link has text after its ink', async ({tierList, page}) => {
      const tail = encodeURIComponent(') [x](https://evil.example) @everyone\n# hi&foo=bar#frag');
      await tierList.share.readCopiedText();
      await tierList.share.recordShareWindows();
      await tierList.goto(`${LINK_WITH_INK}${tail}`);
      await tierList.scribble.expectNotes(1);
      const clean = new RegExp(`^${escapeRegExp(new URL(TANKS, page.url()).href)}\\?state=3\\.[A-Za-z0-9+$-]+&ink=${escapeRegExp(INK)}$`);
      await tierList.share.openSharePanel();

      expect(await tierList.share.addressSharedOn('Facebook')).toMatch(clean);
      expect(await tierList.share.addressSharedOn('X')).toMatch(clean);
      await tierList.share.copyLinkInOpenPanel();
      expect(await tierList.share.clipboardText()).toMatch(clean);
      await tierList.share.copyMarkdownInOpenPanel();
      const markdown = await tierList.share.clipboardText();
      expect(await tierList.share.copiedLink()).toMatch(clean);
      expect(markdown.match(/\]\(/g)).toHaveLength(1);
      expect(markdown).not.toMatch(/evil|@everyone|# hi|foo=bar|#frag/);
    });

    test('renders the switch off after the panel closes and opens, and on again when the user turns it on', async ({tierList}) => {
      await tierList.share.readCopiedText();
      await tierList.goto(LINK_WITH_INK);
      await tierList.scribble.expectNotes(1);
      await tierList.share.openSharePanel();
      await tierList.share.setIncludeScribbles(false);
      await tierList.share.closeSharePanelWithShareButton();

      await tierList.share.openSharePanel();

      await expect(tierList.share.includeScribblesSwitch).toHaveAttribute('aria-checked', 'false');
      await tierList.share.setIncludeScribbles(true);
      await expect(tierList.share.includeScribblesSwitch).toHaveAccessibleDescription(INCLUDED);
      await tierList.share.copyLinkInOpenPanel();
      expect(inkOf(await tierList.share.copiedLink())).toBe(INK);
    });

    test('renders "Scribbles are not in the picture." in the Image tab when the list has scribbles', async ({tierList}) => {
      await tierList.goto(LINK_WITH_INK);
      await tierList.scribble.expectNotes(1);

      await tierList.share.openImageTab();

      await expect(tierList.share.scribblesPictureNote).toBeVisible();
    });
  });

  test.describe('model', () => {
    const ONE_DEVICE_IMAGE_NOTE = '1 device image shows as a placeholder.';
    const STEPS_WHILE_ENCODING = ['Loading images Done', 'Drawing the image Done', 'Saving the image Step 3 of 3'];

    const listOfState = (state: string) => {
      const {r: rows} = v3LinkJson(`https://opentierboy.com${TANKS}?state=${state}`) as {r: unknown[][]};
      const itemsOf = (row: unknown[]) => (row.at(-1) as unknown[])
        .map((item) => (typeof item === 'object' && item !== null && 'd' in item ? {c: (item as unknown as {c: string}).c} : item));
      return {ranked: rows.slice(0, -1).flatMap((row) => itemsOf(row)), unranked: itemsOf(rows.at(-1)!)};
    };

    const sharePanelSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let added = 0;
      let opened: string[] = [];
      let deviceImages: string[] = [];
      let downloaded: {name: string; buffer: Buffer} | null = null;
      const expectedList = (count: 0 | 1) => ({ranked: [], unranked: [...opened, ...deviceImages.slice(0, count).map((c) => ({c}))]});

      const expectSharePanel = async (view: SharePanelView) => {
        if (view.tab === null) {
          await expect(tierList.share.sharePanel).toBeHidden();
          if (view.capturing) await expect(tierList.shareButton).toBeDisabled();
          else await expect(tierList.shareButton).toBeEnabled();
        } else {
          await expect(tierList.share.shareTab(view.tab)).toHaveAttribute('aria-selected', 'true');
          if (view.tab === 'URL') await expect(tierList.share.copyMarkdownButton).toBeVisible();
          if (view.tab === 'URL') {
            await expect(tierList.share.scribblesGroup).toHaveCount(0);
            await expect(tierList.share.includeScribblesSwitch).toHaveCount(0);
            await expect(tierList.share.copyLinkButton).toHaveCount(0);
          }
          if (view.tab === 'Image') await expect(tierList.share.scribblesPictureNote).toHaveCount(0);
          if (view.tab === 'Image' && view.capturing) {
            await expect(tierList.share.captureStepRows).toHaveText(STEPS_WHILE_ENCODING);
            await expect(tierList.share.captureStep('Saving the image')).toHaveAttribute('aria-current', 'step');
            await expect(tierList.share.captureButton).toHaveText('Capturing...');
            await expect(tierList.share.captureButton).toBeDisabled();
          }
          if (view.tab === 'Image' && !view.capturing) {
            await expect(tierList.share.captureSteps).toHaveCount(0);
            await expect(tierList.share.captureButton).toHaveText('Capture Preview');
            await expect(tierList.share.captureButton).toBeEnabled();
          }
          if (view.captured === true) {
            await expect(tierList.share.capturedImage).toBeVisible();
            await expect(tierList.share.downloadButton).toBeEnabled();
          }
          if (view.captured === false) {
            await expect(tierList.share.captureHint).toBeVisible();
            await expect(tierList.share.capturedImage).toHaveCount(0);
          }
          if (view.deviceImages === 1) await expect(tierList.share.linkImageNotes).toHaveText([ONE_DEVICE_IMAGE_NOTE]);
          else await expect(tierList.share.linkImageNotes).toHaveCount(0);
        }
        await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(opened.length + view.deviceImages);
        if (view.clipboardDeviceImages === null) {
          await expect.poll(() => tierList.share.clipboardText()).toBe('');
          return;
        }
        const link = (await tierList.share.clipboardText()).match(/\]\((\S+)\)/)?.[1] ?? '';
        expect(link).toMatch(new RegExp(`^${escapeRegExp(new URL(TANKS, page.url()).href)}\\?state=3\\.`));
        expect(listOfState(new URL(link).searchParams.get('state') ?? ''), 'the list in the copied link').toEqual(expectedList(view.clipboardDeviceImages));
      };

      return modelSut<SharePanelSnapshot, SharePanelEvent>(page, {
        reset: async () => {
          await tierList.goto(TANKS);
          await tierList.share.emptyClipboard();
          const names = await tierList.itemNamesIn('Unranked');
          opened = names.map((name) => packageItemId('image-overwatch', name));
          deviceImages = [];
          downloaded = null;
        },
        events: {
          OPEN_SHARE_PANEL: () => tierList.share.openSharePanel(),
          CLOSE_WITH_SHARE_BUTTON: () => tierList.share.closeSharePanelWithShareButton(),
          PRESS_ESCAPE: () => tierList.pressEscapeOnList(),
          CLICK_OUTSIDE: () => tierList.share.clickOutsideSharePanel(),
          CHOOSE_IMAGE_TAB: () => tierList.share.chooseShareTab('Image'),
          CHOOSE_URL_TAB: () => tierList.share.chooseShareTab('URL'),
          CAPTURE_PREVIEW: () => tierList.share.startCaptureUntilEncoderAsked(),
          ENCODER_ANSWERS: () => tierList.share.releasePictureEncoderUntilCaptureEnds(),
          COPY_MARKDOWN: () => tierList.share.copyMarkdownInOpenPanel(),
          ADD_DEVICE_IMAGE: async () => {
            const name = `picture-${++added}`;
            await tierList.deviceImages.addItemsFromDeviceAndWaitForLink([imageFile(`${name}.png`)]);
            deviceImages.push(name);
          },
          DOWNLOAD: async () => {
            downloaded = await tierList.share.downloadCapturedImage();
          },
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = sharePanelViewOf(snapshot);
            await expectSharePanel(view);
            if (!downloaded) return;
            const file = downloaded;
            downloaded = null;
            expect(file.name).toMatch(/\.png$/);
            const payload = JSON.parse(snapshotTextOf(file.buffer) ?? 'null') as {path: string; state: string; images: {id: string; label: string}[]};
            expect(payload.path).toBe(TANKS);
            const count = view.pictureDeviceImages!;
            expect(listOfState(payload.state), 'the list in the downloaded file').toEqual(expectedList(count));
            expect(payload.images.map((image) => image.label), 'the device images in the downloaded file').toEqual(deviceImages.slice(0, count));
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(sharePanelModel)) {
      test(`renders each state of the share panel machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await tierList.share.readCopiedText();
        await tierList.share.holdPictureEncoder();
        const coverage = await walkModel(sharePanelModel, sharePanelSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, sharePanelModel, coverage, part);
      });
    }
  });

  test.describe('model: scribbles', () => {
    const LIST = rankingState('image-overwatch', {S: ['Mauga'], '': ['Sigma']});

    const shareScribblesSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let copied = false;
      return modelSut<ShareScribblesSnapshot, ShareScribblesEvent>(page, {
        reset: async () => {
          copied = false;
          await tierList.goto(TANKS, LIST);
          await tierList.share.emptyClipboard();
        },
        events: {
          OPEN_SHARE_PANEL: () => tierList.share.openSharePanel(),
          CLOSE_WITH_SHARE_BUTTON: () => tierList.share.closeSharePanelWithShareButton(),
          DRAW_SCRIBBLE: async () => {
            await tierList.zen.setZenMode(true);
            await tierList.scribble.setScribble(true);
            await tierList.scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
            await tierList.zen.setZenMode(false);
          },
          COPY_MARKDOWN: async () => {
            await tierList.share.copyMarkdownInOpenPanel();
            copied = true;
          },
          COPY_LINK: async () => {
            await tierList.share.copyLinkInOpenPanel();
            copied = true;
          },
          SWITCH_SCRIBBLES_OFF: () => tierList.share.setIncludeScribbles(false),
          SWITCH_SCRIBBLES_ON: () => tierList.share.setIncludeScribbles(true),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = shareScribblesViewOf(snapshot);
            const ink = tierList.scribble.inkInAddress();
            if (view.scribbles === 'none') {
              await expect(tierList.scribble.layer).toHaveCount(0);
              expect(ink).toBeNull();
            } else {
              await tierList.scribble.expectNotes(1);
              expect(ink).toMatch(/^1\./);
            }
            if (!view.open) {
              await expect(tierList.share.sharePanel).toBeHidden();
            } else if (view.scribbles === 'none') {
              await expect(tierList.share.copyMarkdownButton).toBeVisible();
              await expect(tierList.share.scribblesGroup).toHaveCount(0);
              await expect(tierList.share.includeScribblesSwitch).toHaveCount(0);
              await expect(tierList.share.copyLinkButton).toHaveCount(0);
            } else {
              await expect(tierList.share.includeScribblesSwitch).toHaveAttribute('aria-checked', String(view.scribbles === 'included'));
              await expect(tierList.share.includeScribblesSwitch).toHaveAccessibleDescription(SCRIBBLES_LINES[view.scribbles]);
              await expect(tierList.share.scribblesGroup.getByRole('button')).toHaveText(['Copy link', 'Copy Markdown', '', '']);
            }
            if (!copied) {
              await expect.poll(() => tierList.share.clipboardText()).toBe('');
              return;
            }
            const link = await tierList.share.copiedLink();
            expect(link).toMatch(new RegExp(`^${escapeRegExp(new URL(TANKS, page.url()).href)}\\?state=3\\.`));
            expect(new URL(link).searchParams.get('ink')?.replace(/ /g, '+') ?? null, 'the ink value in the copied link').toBe(view.clipboardScribbles ? ink : null);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(shareScribblesModel)) {
      test(`renders each state of the share scribbles machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await tierList.share.readCopiedText();
        const coverage = await walkModel(shareScribblesModel, shareScribblesSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, shareScribblesModel, coverage, part);
      });
    }
  });
});
