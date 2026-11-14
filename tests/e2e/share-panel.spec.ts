import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import {packageItemId, rankingState, v3LinkJson, v3State} from '../support/links';
import {escapeRegExp} from '../support/regexp';
import {imageFile, serveImageSite} from '../support/image-sites';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {snapshotTextOf} from '../support/snapshot-files';
import type {TierListPage} from '../pages/tier-list-page';
import {sharePanelModel, sharePanelViewOf, type SharePanelEvent, type SharePanelSnapshot, type SharePanelView} from '../models/share-panel';

const TANKS = '/rank/overwatch/tank';

test.describe('share panel', () => {
  test.describe('share link', () => {
    test('renders the tabs URL and Image and button "Copy Markdown" when the user opens the share panel', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.openSharePanel();

      await expect(tierList.shareTab('URL')).toBeVisible();
      await expect(tierList.shareTab('Image')).toBeVisible();
      await expect(tierList.copyMarkdownButton).toBeVisible();
    });

    test('writes Markdown with the title and the v3 link of the list to the clipboard when the user clicks Copy Markdown', {tag: '@mobile'}, async ({
      tierList,
      openAsVisitor,
    }) => {
      await tierList.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.copyMarkdown();

      const markdown = await tierList.clipboardText();
      expect(markdown).toContain('**OVERWATCH - Tank**');
      // The link of the list on screen (A46): this page, written as a v3 link.
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
      await tierList.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.chooseLabelPosition('Top');
      // Back: Mauga leaves S, and the labels stay on Top, while the address holds the entry
      // before (labels on the left).
      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveCount(0);

      await tierList.copyMarkdown();

      const linkInMarkdown = (await tierList.clipboardText()).match(/\]\((\S+)\)/)?.[1];
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('S')).toHaveCount(0);
      await expect(friend.itemsIn(friend.unranked)).toHaveText(['Mauga', 'Winston']);
      await friend.openRowOptions();
      await expect(friend.rowOption('Top')).toBeChecked();
      await expect(friend.rowOption('Show Labels')).toBeChecked();
      await friend.closeMenus();
    });

    test('writes the latest list to the clipboard when the user clicks Copy Markdown after 3 quick moves on a slow server', async ({
      tierList,
      openAsVisitor,
    }) => {
      await tierList.readCopiedText();
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      // The server answers only after the copy: the share text must not wait for the links.
      const hold = await tierList.holdListWrites();
      for (const name of ['Mauga', 'Winston', 'Sigma']) {
        await tierList.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false});
      }
      await tierList.copyMarkdown();
      await hold.release();

      const linkInMarkdown = (await tierList.clipboardText()).match(/\]\((\S+)\)/)?.[1];
      const friend = await openAsVisitor(linkInMarkdown!);
      await expect(friend.itemsIn('F')).toHaveCount(3);
    });

    test('writes the label position and label visibility to the share link when the user changes them', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.chooseLabelPosition('Top');
      await tierList.setItemLabelsVisible(false);

      const friend = await openAsVisitor(await tierList.shareLink());
      await friend.openRowOptions();
      await expect(friend.rowOption('Top')).toBeChecked();
      await expect(friend.rowOption('Hide Labels')).toBeChecked();
      await friend.closeMenus();
      await expect.poll(() => friend.tierLabelIsAbove('S', 'Mauga')).toBe(true);
      await expect(friend.item('Mauga')).toHaveText('');
    });

    test('renders the label settings of the link, also after a reload, when the page opens /rank/?state= with lp and sl', async ({tierList}) => {
      // The landing page's "Create Blank List" opens /rank/; its links carry the settings too.
      const mauga = packageItemId('image-overwatch', 'Mauga');
      await tierList.goto('/rank/', v3State({t: 'Blank list', tp: 5, lp: 'top', sl: false, r: [['S', [mauga]], ['A', []], ['B', []], ['C', []], ['F', []], ['', []]]}));

      await expect(tierList.title).toHaveText('Blank list');
      await tierList.openRowOptions();
      await expect(tierList.rowOption('Top')).toBeChecked();
      await expect(tierList.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect.poll(() => tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);

      await tierList.reload();
      await tierList.openRowOptions();
      await expect(tierList.rowOption('Top')).toBeChecked();
      await expect(tierList.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect(tierList.item('Mauga')).toHaveText('');
    });

    test('renders row labels on top when the page opens a v3 link with lp top', {tag: '@mobile'}, async ({tierList}) => {
      const mauga = packageItemId('image-overwatch', 'Mauga');
      await tierList.goto(TANKS, v3State({tp: 5, lp: 'top', r: [['S', [mauga]], ['A', []], ['B', []], ['C', []], ['F', []], ['', []]]}));

      await tierList.openRowOptions();

      await expect(tierList.rowOption('Top')).toBeChecked();

      await expect(tierList.rowOption('Show Labels')).toBeChecked();

      await tierList.closeMenus();
      await expect.poll(() => tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);
      await expect(tierList.item('Mauga')).toHaveText('Mauga');
    });
  });

  // The share panel says which images the link carries (the board "SharePanel"): link images
  // travel in the link, device images stay in this browser and go along only in a Freeze Frame file.
  test.describe('images in the link', () => {
    test('renders no image note in the share panel when the page opens a list with only image-set items', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      await tierList.openSharePanel();

      await expect(tierList.copyMarkdownButton).toBeVisible();
      await expect(tierList.linkImageNotes).toHaveCount(0);
    });

    test('renders the note "2 images from the web are in the link." when the page opens a list with 2 link images', {tag: '@mobile'}, async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS, v3State({t: 'Link images', tp: 3, r: [
        ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'Red'}]],
        ['A', []], ['B', []], ['', [{u: 'https://i.imgur.com/blue.png', c: 'Blue'}]],
      ]}));

      await tierList.openSharePanel();

      await expect(tierList.linkImageNotes).toHaveCount(1);
      await expect(tierList.linkImageNotes).toHaveText(
        "2 images from the web are in the link. People who open the link see them too. Some sites need their OK first: until they press Load, they see the images' names.");
    });

    test('renders the note "1 image from your device isn\'t in the link." when the user adds an image from the device', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.addItemsFromDevice([imageFile('red-square.png')]);

      await tierList.openSharePanel();

      await expect(tierList.linkImageNotes).toHaveCount(1);
      await expect(tierList.linkImageNotes).toHaveText(
        "1 device image shows as a placeholder.");
    });

    test('renders a note for 3 device images and one for 1 link image when the page opens a list with both', {tag: '@mobile'}, async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS, v3State({t: 'Both', tp: 3, r: [
        ['S', [{u: 'https://i.imgur.com/red.png', c: 'Red'}, {d: 'NeverHere1234567', c: 'Cat'}]],
        ['A', [{d: 'NeverHere7654321', c: 'Dog'}]], ['B', []], ['', [{d: 'NeverHere0000001', c: 'Bird'}]],
      ]}));

      await tierList.openSharePanel();

      await expect(tierList.linkImageNotes).toHaveText([
        "3 device images show as placeholders.",
        "1 image from the web is in the link. People who open the link see it too. Some sites need their OK first: until they press Load, they see the image's name.",
      ]);
    });
  });

  /**
   * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
   * suite stays green while the bug exists. See editor-items.spec.ts for the convention.
   */
  test.describe('Known bugs', () => {
    test('renders the Facebook and X share buttons with accessible names when the user opens the share panel', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.openSharePanel();
      // Marked here, after the steps that must work: a failure above fails the test as usual.
      test.fail(true, 'The two buttons hold only an icon (components/ShareButton.tsx), so they have no accessible name.');
      await tierList.settled();
      expect(await tierList.socialShareButton(/Facebook/).isVisible()).toBe(true);
      expect(await tierList.socialShareButton(/\bX\b|Twitter/).isVisible()).toBe(true);
    });
  });

  test.describe('model', () => {
    /** The note on one image from the device (components/ShareButton.tsx, LinkImageNotes). */
    const ONE_DEVICE_IMAGE_NOTE = '1 device image shows as a placeholder.';

    /**
     * A list as a link holds it (v3): the items of the rows above Unranked, all empty here, and
     * Unranked's items, a device image as {d, c} with its local id left out.
     */
    const listOfState = (state: string) => {
      const {r: rows} = v3LinkJson(`https://opentierboy.com${TANKS}?state=${state}`) as {r: unknown[][]};
      const itemsOf = (row: unknown[]) => (row.at(-1) as unknown[])
        .map((item) => (typeof item === 'object' && item !== null && 'd' in item ? {c: (item as unknown as {c: string}).c} : item));
      return {ranked: rows.slice(0, -1).flatMap((row) => itemsOf(row)), unranked: itemsOf(rows.at(-1)!)};
    };

    /** The share panel machine's events and checks (modelSut). Each run opens the template with nothing copied. */
    const sharePanelSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let added = 0;
      /** The template's items in Unranked, by id, as the run opened them. */
      let opened: string[] = [];
      /** The names of the device images this run added, in order. */
      let deviceImages: string[] = [];
      /** The file the last DOWNLOAD saved, until the next check reads it. */
      let downloaded: {name: string; buffer: Buffer} | null = null;
      /** The list with the first `count` device images of this run, as a link holds it. */
      const expectedList = (count: 0 | 1) => ({ranked: [], unranked: [...opened, ...deviceImages.slice(0, count).map((c) => ({c}))]});

      /** The panel, its tab and note, and the clipboard, as a state of the share panel machine shows them. */
      const expectSharePanel = async (view: SharePanelView) => {
        if (view.tab === null) {
          await expect(tierList.sharePanel).toBeHidden();
          await expect(tierList.shareButton).toBeEnabled();
        } else {
          await expect(tierList.shareTab(view.tab)).toHaveAttribute('aria-selected', 'true');
          if (view.tab === 'URL') await expect(tierList.copyMarkdownButton).toBeVisible();
          if (view.captured === true) {
            await expect(tierList.capturedImage).toBeVisible();
            await expect(tierList.downloadButton).toBeEnabled();
          }
          if (view.captured === false) {
            await expect(tierList.captureHint).toBeVisible();
            await expect(tierList.capturedImage).toHaveCount(0);
          }
          if (view.deviceImages === 1) await expect(tierList.linkImageNotes).toHaveText([ONE_DEVICE_IMAGE_NOTE]);
          else await expect(tierList.linkImageNotes).toHaveCount(0);
        }
        await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(opened.length + view.deviceImages);
        if (view.clipboardDeviceImages === null) {
          await expect.poll(() => tierList.clipboardText()).toBe('');
          return;
        }
        // The link of the list as it was when Copy Markdown was clicked, from the editor's own
        // copy of the list (A46): this page, written as a v3 link.
        const link = (await tierList.clipboardText()).match(/\]\((\S+)\)/)?.[1] ?? '';
        expect(link).toMatch(new RegExp(`^${escapeRegExp(new URL(TANKS, page.url()).href)}\\?state=3\\.`));
        expect(listOfState(new URL(link).searchParams.get('state') ?? ''), 'the list in the copied link').toEqual(expectedList(view.clipboardDeviceImages));
      };

      return modelSut<SharePanelSnapshot, SharePanelEvent>(page, {
        reset: async () => {
          await tierList.goto(TANKS);
          await tierList.emptyClipboard();
          const names = await tierList.itemsIn(tierList.unranked).evaluateAll((items) => items.map((item) => item.getAttribute('aria-label') ?? ''));
          opened = names.map((name) => packageItemId('image-overwatch', name));
          deviceImages = [];
          downloaded = null;
        },
        events: {
          OPEN_SHARE_PANEL: () => tierList.openSharePanel(),
          CLOSE_WITH_SHARE_BUTTON: () => tierList.closeSharePanelWithShareButton(),
          PRESS_ESCAPE: () => tierList.pressEscapeOnList(),
          CLICK_OUTSIDE: () => tierList.clickOutsideSharePanel(),
          CHOOSE_IMAGE_TAB: () => tierList.chooseShareTab('Image'),
          CHOOSE_URL_TAB: () => tierList.chooseShareTab('URL'),
          CAPTURE_PREVIEW: () => tierList.captureInOpenPanel(),
          COPY_MARKDOWN: () => tierList.copyMarkdownInOpenPanel(),
          ADD_DEVICE_IMAGE: async () => {
            const name = `picture-${++added}`;
            await tierList.addItemsFromDeviceAndWaitForLink([imageFile(`${name}.png`)]);
            deviceImages.push(name);
          },
          // The file holds the list the picture shows, which the check of DOWNLOAD's state reads
          // from the machine: the picture, not the list on screen now (components/ShareButton.tsx).
          DOWNLOAD: async () => {
            downloaded = await tierList.downloadCapturedImage();
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
        // Before the first page opens: Firefox and WebKit keep the copied text in the page.
        await tierList.readCopiedText();
        const coverage = await walkModel(sharePanelModel, sharePanelSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, sharePanelModel, coverage, part);
      });
    }
  });
});
