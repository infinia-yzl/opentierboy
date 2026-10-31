/**
 * Security: the Content Security Policy, user text shown as plain text, and device pictures
 * that stay in the browser (product rule 5).
 */
import {expect, SHARED_LINKS, test} from '../support/test';
import {packageItemId, rankingState, v3State} from '../support/links';
import {BLUE_SQUARE, imageFile, noisePng, RED_SQUARE, serveImageSite} from '../support/image-sites';
import {pngFile} from '../support/snapshot-files';
import {escapeRegExp} from '../support/regexp';
import {type CaptureMethod, SCRIPTED_PASTE_SKIP, type SentRequest} from '../pages/tier-list-page';

/**
 * User text is shown as text (review rules: cross-site scripting). Titles, row names and labels
 * come from links anyone can make, so each one here holds markup that would set
 * window.__otbInjected if the page ran it.
 */
const IMG_MARKUP = '<img src=x onerror="window.__otbInjected=1">';

const SCRIPT_MARKUP = '<script>window.__otbInjected=2</script>';

const CLOSING_MARKUP = '"></title></script><svg onload="window.__otbInjected=3">';

const TANKS = '/rank/overwatch/tank';

const LIST_WITH_MARKUP = v3State({
  t: `Title ${IMG_MARKUP}`,
  tp: 3,
  r: [
    [`S ${SCRIPT_MARKUP}`, [{i: 'image-unknown-gone.webp', c: `Item ${IMG_MARKUP}`}]],
    ['A', [{u: 'https://images.example.org/a.png', c: `Link ${CLOSING_MARKUP}`}]],
    ['B', []],
    ['', []],
  ],
});

function carriesPicture(request: SentRequest, picture: Buffer): boolean {
  const base64 = picture.toString('base64');
  const inAddress = [base64, encodeURIComponent(base64), 'data:image'].some((text) => request.url.includes(text));
  // The PNG signature, or the picture itself, as bytes or as base64 text.
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const inBody = request.body.includes(signature) || request.body.includes(picture) || request.body.includes(base64) || request.body.includes('data:image');
  return inAddress || inBody;
}

function expectNoPictureSent(requests: SentRequest[], pictures: Buffer[]) {
  // data: and blob: addresses stay in the browser; only network requests count.
  const network = requests.filter((request) => /^https?:/.test(request.url));
  // The editor still talks to the server (page data for each Back step), so check that it did.
  expect(network.length).toBeGreaterThan(0);
  for (const request of network) {
    for (const picture of pictures) {
      expect(carriesPicture(request, picture), `${request.method} ${request.url}`).toBe(false);
    }
  }
}

/**
 * The Content Security Policy (lib/security/csp.ts, A11). A page that breaks it shows a
 * `securitypolicyviolation` event; every test here expects none.
 */
test.describe('security', () => {
  test.describe('Content Security Policy', () => {
    test('returns the Content-Security-Policy header, without unsafe-eval, when the page opens /', async ({page}) => {
      const response = await page.goto('/');
      const policy = response?.headers()['content-security-policy'] ?? '';
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("img-src 'self' https: data: blob:");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).not.toContain('unsafe-eval');
    });

    test('writes no CSP violation report when the page opens home, a template, a blog article and a shared link', {tag: '@mobile'}, async ({page, tierList, site, cspViolations}) => {
      await page.goto('/', {waitUntil: 'networkidle'});
      await expect(site.main).toBeVisible();
      await tierList.goto('/rank/overwatch/tank');
      await page.goto('/blog/overwatch-2-karq-tier-list-season-11', {waitUntil: 'networkidle'});
      await expect(site.pageHeading).toBeVisible();
      await tierList.gotoLink(`${SHARED_LINKS[0].path}?state=${SHARED_LINKS[0].state}`);
      await page.waitForLoadState('networkidle');
      await expect.poll(() => cspViolations()).toEqual([]);
    });

    test('writes no CSP violation report when the user saves and opens a Freeze Frame and drops a picture', async ({tierList, site, page, cspViolations}) => {
      await tierList.goto('/rank/overwatch/tank', rankingState('image-overwatch', {S: ['Mauga']}, 'CSP snapshot'));
      await tierList.addItemsFromDevice([imageFile('red-square.png')]);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
      await tierList.capturePreview();
      const snapshot = await tierList.downloadCapturedImage();
      await page.keyboard.press('Escape');

      await tierList.goto('/rank');
      await tierList.dropFile(imageFile('blue-square.png'));
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue-square']);
      await tierList.openFile(pngFile(snapshot.name, snapshot.buffer));
      await tierList.confirmOpenList();
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);

      await site.gotoHome();
      await expect(site.recentLinks.first()).toHaveText('CSP snapshot');
      await page.waitForLoadState('networkidle');
      await expect.poll(() => cspViolations()).toEqual([]);
    });

    for (const method of ['html2canvas-pro', 'Original html2canvas'] as CaptureMethod[]) {
      test(`writes no CSP violation report when the user captures a Freeze Frame with ${method} with a link image and a device image`, async ({tierList, page, cspViolations}) => {
        await serveImageSite(page, 'i.imgur.com');
        const state = v3State({t: 'CSP', tp: 3, r: [
          ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'Link image'}]],
          ['A', []], ['B', []], ['', []],
        ]});
        await tierList.goto('/rank/overwatch/tank', state);
        await tierList.addItemsFromDevice([imageFile('red-square.png')]);
        await expect.poll(() => tierList.itemImageHasLoaded('Link image')).toBe(true);
        await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);

        await tierList.capturePreview(method);

        await expect(tierList.toast('Image captured successfully')).toBeVisible();
        await expect.poll(() => cspViolations()).toEqual([]);
      });
    }
  });

  test.describe('user text', () => {
    test('renders markup as text in the editor, the tab title and Recently viewed when the page opens a link with markup', {tag: '@mobile'}, async ({tierList, site}) => {
      await tierList.goto(TANKS, LIST_WITH_MARKUP);
      await tierList.waitUntilInteractive();

      await expect(tierList.title).toHaveText(`Title ${IMG_MARKUP}`);
      await expect(tierList.tier(`S ${SCRIPT_MARKUP}`)).toBeVisible();
      await expect(tierList.itemsIn(`S ${SCRIPT_MARKUP}`)).toHaveText([`Item ${IMG_MARKUP}`]);
      // A link image's tile also names its site under the label.
      await expect(tierList.itemsIn('A')).toContainText([`Link ${CLOSING_MARKUP}`]);
      await expect(tierList.page).toHaveTitle(new RegExp(escapeRegExp(`Title ${IMG_MARKUP}`)));
      expect(await tierList.injectedMarkupRan()).toBe(false);

      await site.gotoHome();
      await expect(site.recentLinks).toHaveText([`Title ${IMG_MARKUP}`]);
      expect(await tierList.injectedMarkupRan()).toBe(false);
    });

    test('renders markup as text in the title and a row label, also after a reload, when the user types it', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.setTitle(CLOSING_MARKUP);
      await tierList.renameTier('S', SCRIPT_MARKUP);
      await expect(tierList.title).toHaveText(CLOSING_MARKUP);
      await expect(tierList.tier(SCRIPT_MARKUP)).toBeVisible();

      await tierList.reload();
      await expect(tierList.title).toHaveText(CLOSING_MARKUP);
      await expect(tierList.tier(SCRIPT_MARKUP)).toBeVisible();
      await expect(tierList.page).toHaveTitle(new RegExp(escapeRegExp(CLOSING_MARKUP)));
      expect(await tierList.injectedMarkupRan()).toBe(false);
    });

    test('renders the file name with markup as the item label when the user uploads a picture named with markup', async ({tierList}) => {
      await tierList.goto(TANKS);
      // The label is the name before its first dot, so the markup has none.
      await tierList.addItemsFromDevice([imageFile('<img src=x onerror=__otbInjected=4>.png')]);
      await expect(tierList.item('<img src=x onerror=__otbInjected=4>')).toBeVisible();
      expect(await tierList.injectedMarkupRan()).toBe(false);
    });

    test('returns the markup of the list HTML-escaped in the page when the request has a state parameter with markup', async ({page}) => {
      const response = await page.request.get(`${TANKS}?state=${encodeURIComponent(LIST_WITH_MARKUP)}`);
      expect(response.status()).toBe(200);
      const html = await response.text();
      // The server writes the title into the page (heading, <title>, link preview tags). Each
      // copy must be escaped, so the markup never appears as it was typed.
      for (const markup of [IMG_MARKUP, SCRIPT_MARKUP, CLOSING_MARKUP]) expect(html).not.toContain(markup);
      expect(html).toContain('Title &lt;img');
    });
  });

  test.describe('device images and the network', () => {
    test('writes no device image bytes to the network when the user uploads, drops and captures pictures', async ({tierList}) => {
      // A bigger picture than the test squares, so its bytes are unmistakable.
      const photo = noisePng(48, 48, 7);
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Private pictures'));
      const sent = tierList.recordRequests();

      await tierList.addItemsFromDevice([imageFile('photo.png', photo)]);
      await tierList.dropFile(imageFile('dropped.png', BLUE_SQUARE));
      await expect(tierList.itemsIn(tierList.unranked)).toContainText(['photo', 'dropped']);
      await expect.poll(() => tierList.itemImageHasLoaded('dropped')).toBe(true);
      await tierList.capturePreview();
      await tierList.downloadCapturedImage();

      expectNoPictureSent(sent(), [photo, BLUE_SQUARE]);
    });

    test('writes no pasted image bytes to the network when the user pastes a picture', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto(TANKS);
      const sent = tierList.recordRequests();

      await tierList.pasteImages([imageFile('pasted.png', RED_SQUARE)]);
      await expect(tierList.itemsIn(tierList.unranked)).toContainText(['pasted']);
      await expect.poll(() => tierList.itemImageHasLoaded('pasted')).toBe(true);

      expectNoPictureSent(sent(), [RED_SQUARE]);
    });

    test('writes no image or snapshot file bytes to the network when the user opens a snapshot file', async ({tierList, openAsVisitor}) => {
      const photo = noisePng(40, 40, 11);
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Shared pictures'));
      await tierList.addItemsFromDevice([imageFile('photo.png', photo)]);
      await expect.poll(() => tierList.itemImageHasLoaded('photo')).toBe(true);
      await tierList.capturePreview();
      const file = await tierList.downloadCapturedImage();

      const friend = await openAsVisitor('/rank');
      const sent = friend.recordRequests();
      await friend.openFile(pngFile(file.name, file.buffer));
      await friend.confirmOpenList();
      await expect(friend.itemsIn(friend.unranked)).toHaveText(['photo']);
      await expect.poll(() => friend.itemImageHasLoaded('photo')).toBe(true);

      // The file is itself a PNG: its bytes must not leave either.
      expectNoPictureSent(sent(), [file.buffer.subarray(0, 4096)]);
    });
  });
});
