#!/usr/bin/env node
/**
 * Records the feature GIFs from a running build: the 2.0.0 blog post (public/blog/2-0-0/), the
 * README (docs/media/) and the About page (public/about/), and the blog post's link preview
 * image (public/blog/2-0-0/og-2-0-0.webp).
 *
 *   npm run build && npm run start -- -p 3000      (in another terminal)
 *   npm run record:gifs -- --url http://127.0.0.1:3000 [rank images ...]
 *
 * Each clip drives Chromium through one feature, records it with the DevTools screencast and
 * turns the frames into a GIF with ffmpeg (it must be installed). A drawn pointer shows where
 * the mouse is, because a headless browser draws none. With no names, every clip is recorded.
 * Record again after a change to what a clip shows. Build with the real fonts: a build with
 * stand-in fonts records the wrong letters.
 *
 * Every clip starts in a new browser profile, in light mode, with the tips off (as "Hide tips"
 * leaves them), except the onboarding clip, which shows the tips of a first visit. Images "from
 * the web" come from the local image sets, served in the browser under a trusted site's address
 * (as the e2e tests do, tests/support/image-sites.ts), so no clip reaches the internet.
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import LZString from 'lz-string';
import sharp from 'sharp';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const BASE = urlIndex === -1 ? 'http://127.0.0.1:3000' : args[urlIndex + 1];
const names = args.filter((arg, index) => !arg.startsWith('--') && index !== urlIndex + 1);
const ROOT = path.resolve(import.meta.dirname, '..');
const BLOG = path.join(ROOT, 'public', 'blog', '2-0-0');
const README = path.join(ROOT, 'docs', 'media');
const ABOUT = path.join(ROOT, 'public', 'about');

/** The window each clip is recorded at, and the GIF's width. */
const VIEWPORT = Object.freeze({width: 1200, height: 880});
const GIF = Object.freeze({width: 880, fps: 15, colours: 192});

// A pointer drawn in the page. It is a popover, so it sits in the top layer above drag previews.
const POINTER_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('__gif_pointer')) return;
    const pointer = document.createElement('div');
    pointer.id = '__gif_pointer';
    pointer.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.5 21.5 L14.2 20.3 L11.3 13.7 L17.5 13.7 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(pointer.style, {position: 'fixed', left: '-40px', top: '-40px', inset: 'auto', margin: '0', border: '0', padding: '0',
      width: '26px', height: '26px', background: 'transparent', overflow: 'visible', pointerEvents: 'none',
      transition: 'transform 80ms', transformOrigin: '4px 2px'});
    pointer.setAttribute('popover', 'manual');
    document.documentElement.appendChild(pointer);
    const raise = () => { try { pointer.hidePopover(); pointer.showPopover(); } catch {} };
    raise();
    window.__gifRaisePointer = raise;
    const move = (event) => { pointer.style.left = (event.clientX - 4) + 'px'; pointer.style.top = (event.clientY - 2) + 'px'; };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('mousemove', move, true);
    window.addEventListener('pointerdown', () => { pointer.style.transform = 'scale(0.85)'; [60, 200, 400].forEach((ms) => setTimeout(raise, ms)); }, true);
    window.addEventListener('pointerup', () => { pointer.style.transform = 'scale(1)'; }, true);
    new MutationObserver(() => { if (document.querySelector(':popover-open:not(#__gif_pointer):not(#__gif_ghost):not(#__gif_keys), dialog[open]')) raise(); })
      .observe(document.body, {childList: true, subtree: true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
`;

// Blurs a menu's button when a closing menu gives it the focus back (blurMenuButtonOnClose).
const FOCUS_SCRIPT = `
window.addEventListener('focusin', (event) => {
  if (!window.__gifBlurMenuButton) return;
  const button = event.target instanceof Element ? event.target.closest('[aria-haspopup="menu"]') : null;
  if (!button) return;
  window.__gifBlurMenuButton = false;
  queueMicrotask(() => button.blur());
}, true);
`;

// Tips off before the page starts, as "Hide tips" leaves them (lib/tips/tips.ts, otb-tips).
const TIPS_OFF_SCRIPT = `
try { if (localStorage.getItem('otb-tips') === null) localStorage.setItem('otb-tips', JSON.stringify({seen: [], off: true})); } catch {}
`;

/**
 * Records one clip and writes <out>/<name>.gif, then copies it to `copies`.
 * Options: `out` (default the blog folder), `copies` (other paths of the same GIF), `tips`
 * (true: the tips of a first visit), `viewport`, `gifWidth` (default: the window's width at the
 * usual scale), `permissions`.
 */
async function record(name, {setup, scenario, out = BLOG, copies = [], tips = false, viewport = VIEWPORT, gifWidth, permissions = []}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport, deviceScaleFactor: 1, colorScheme: 'light', acceptDownloads: true});
  if (permissions.length > 0) await context.grantPermissions(permissions, {origin: BASE});
  if (!tips) await context.addInitScript(TIPS_OFF_SCRIPT);
  await context.addInitScript(POINTER_SCRIPT);
  await context.addInitScript(FOCUS_SCRIPT);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await setup(page);

  const dir = mkdtempSync(path.join(tmpdir(), `otb-gif-${name}-`));
  const frames = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async ({data, metadata, sessionId}) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({file, time: metadata.timestamp});
    await cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 92, maxWidth: viewport.width, maxHeight: viewport.height});
  await scenario(page);
  await page.waitForTimeout(1_800);
  const ended = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await browser.close();

  // Each frame shows until the next one: the screencast sends a frame only when the page changes.
  const list = ['ffconcat version 1.0'];
  frames.forEach((frame, index) => {
    const next = index + 1 < frames.length ? frames[index + 1].time : Math.max(ended, frame.time + 0.1);
    list.push(`file '${frame.file}'`, `duration ${Math.max(0.01, next - frame.time).toFixed(3)}`);
  });
  list.push(`file '${frames.at(-1).file}'`);
  writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  mkdirSync(out, {recursive: true});
  const gif = path.join(out, `${name}.gif`);
  // One palette from every frame. A palette from the changed pixels only (stats_mode=diff) lacks
  // the colours of a page that appears late, such as the tier rows after Recently viewed opens a list.
  const width = gifWidth ?? Math.round(GIF.width * viewport.width / VIEWPORT.width);
  const filters = `fps=${GIF.fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=${GIF.colours}:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', filters, '-loop', '0', gif]);
  rmSync(dir, {recursive: true, force: true});
  for (const copy of copies) {
    mkdirSync(path.dirname(copy), {recursive: true});
    copyFileSync(gif, copy);
  }
  console.log(`${path.relative(ROOT, gif)}: ${frames.length} frames${copies.length ? `, copied to ${copies.map((copy) => path.relative(ROOT, copy)).join(', ')}` : ''}`);
}

// ---- Moves a person would make --------------------------------------------------------------

async function centre(locator) {
  const box = await locator.boundingBox();
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function glide(page, to, steps = 16) {
  await page.mouse.move(to.x, to.y, {steps});
}

async function clickOn(page, locator, wait = 350) {
  await locator.scrollIntoViewIfNeeded();
  await glide(page, await centre(locator), 14);
  await page.waitForTimeout(wait);
  await locator.click();
}

async function typeSlowly(page, text) {
  for (const character of text) await page.keyboard.type(character, {delay: 55});
}

/** Scrolls the page with the mouse wheel, in small steps, as a person does. */
async function wheel(page, dy, steps = 8) {
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(300);
}

/**
 * A closing menu returns the focus to its menu's button, which then shows its tooltip over the
 * page. A person's next click would close it; the clip takes the focus away instead, as it
 * arrives (FOCUS_SCRIPT), before the tooltip paints. Call it before the step that closes the menu.
 */
async function blurMenuButtonOnClose(page) {
  await page.evaluate(() => { window.__gifBlurMenuButton = true; });
}

/** Takes the focus away from the focused element (its tooltip closes). */
async function dropFocus(page) {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
}

const unranked = (page) => page.getByRole('group', {name: 'Unranked'});
const row = (page, name) => page.getByRole('group', {name, exact: true});
/** The item tiles of a row: not its handle, nor the tray's "Add images" tile. */
const itemsOf = (rowLocator) => rowLocator.getByRole('button', {name: /^(?!Move tier\b|Add images to\b)/});

/** Where to drop an item at the end of a row: after its last item, or at the start of an empty row. */
async function endOfRow(page, rowName) {
  const box = await row(page, rowName).boundingBox();
  const items = itemsOf(row(page, rowName));
  const count = await items.count();
  if (count === 0) return {x: box.x + 150, y: box.y + box.height / 2};
  const last = await items.nth(count - 1).boundingBox();
  return {x: last.x + last.width + 36, y: last.y + last.height / 2};
}

/** Waits until the page stops scrolling (a drag near the window's edge scrolls it). */
async function scrollSettled(page) {
  let before = await page.evaluate(() => scrollY);
  for (let tries = 0; tries < 20; tries++) {
    await page.waitForTimeout(60);
    const now = await page.evaluate(() => scrollY);
    if (now === before) return;
    before = now;
  }
}

/**
 * Drags an item to a point, with smooth, visible moves. `target` gives the point; it is read
 * again during the drag, because a drag near the window's edge scrolls the page.
 */
async function dragTo(page, item, target, {hold = 200} = {}) {
  await item.scrollIntoViewIfNeeded();
  const from = await centre(item);
  await glide(page, from, 14);
  await page.waitForTimeout(120);
  await page.mouse.down();
  // A mouse drag starts once the pointer has moved a few pixels.
  await page.mouse.move(from.x + 8, from.y - 8, {steps: 3});
  // Into the row from its right, then along it to the drop point: dragged straight up into the
  // left part of a row, the item can land in the row below (seen 2026-11-07, Chromium).
  const ahead = await target();
  const right = page.viewportSize().width - 200;
  await glide(page, {x: Math.min(Math.max(ahead.x + 300, right - 380), right), y: ahead.y}, 16);
  await scrollSettled(page);
  await glide(page, await target(), 10);
  await scrollSettled(page);
  await page.waitForTimeout(120);
  const to = await target();
  await page.mouse.move(to.x, to.y, {steps: 2});
  await page.waitForTimeout(hold);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** Drags an item to the free space after the last item of a row. */
async function dragToRow(page, item, rowName) {
  await dragTo(page, item, () => endOfRow(page, rowName));
}

async function renameList(page, title) {
  await clickOn(page, page.getByRole('button', {name: 'Edit title'}));
  await page.keyboard.press('ControlOrMeta+a');
  await typeSlowly(page, title);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
}

/** Shows the keys a person presses (a keyboard shortcut has nothing else to see), for a moment. */
async function showKeys(page, keys, ms = 1_100) {
  await page.evaluate(({keys, ms}) => {
    const box = document.createElement('div');
    box.id = '__gif_keys';
    box.setAttribute('popover', 'manual');
    box.innerHTML = keys.map((key) => `<kbd style="display:inline-block;min-width:40px;padding:8px 14px;margin:0 4px;border-radius:8px;background:#fff;color:#111;border:1px solid #c8ccd4;box-shadow:0 2px 0 #c8ccd4;font:600 20px system-ui,sans-serif;text-align:center">${key}</kbd>`).join('<span style="font:600 20px system-ui;color:#fff">+</span>');
    Object.assign(box.style, {position: 'fixed', inset: 'auto', left: '50%', bottom: '40px', transform: 'translateX(-50%)', margin: '0',
      padding: '12px 16px', border: '0', borderRadius: '14px', background: 'rgba(17,24,39,0.82)', pointerEvents: 'none'});
    document.documentElement.appendChild(box);
    box.showPopover();
    window.__gifRaisePointer?.();
    setTimeout(() => box.remove(), ms);
  }, {keys, ms});
}

/**
 * Drags an image from another window onto the page and drops it: what the browser does for a
 * picture dragged from a web page (text/uri-list, text/plain and text/html with its <img>). A
 * headless browser cannot drag between windows, so the clip sends the same drag events the e2e
 * tests send (tests/pages/link-images.ts, dropText), along the pointer's path, and draws the
 * picture under the pointer as a browser does.
 */
async function dragImageIn(page, {url, alt}, from, to, steps = 32) {
  await page.mouse.move(from.x, from.y);
  await page.evaluate(({url, alt}) => {
    const data = new DataTransfer();
    data.setData('text/uri-list', url);
    data.setData('text/plain', url);
    data.setData('text/html', `<img src="${url}" alt="${alt}">`);
    const ghost = document.createElement('div');
    ghost.id = '__gif_ghost';
    ghost.setAttribute('popover', 'manual');
    ghost.innerHTML = `<img src="${url}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:6px;opacity:0.75;box-shadow:0 6px 18px rgba(0,0,0,0.25)">`;
    Object.assign(ghost.style, {position: 'fixed', inset: 'auto', left: '-200px', top: '-200px', margin: '0', padding: '0', border: '0',
      background: 'transparent', overflow: 'visible', pointerEvents: 'none'});
    document.documentElement.appendChild(ghost);
    ghost.showPopover();
    window.__gifRaisePointer?.();
    window.__gifDrag = {data, ghost, over: null};
  }, {url, alt});
  const fire = (type, point) => page.evaluate(({type, point}) => {
    const drag = window.__gifDrag;
    const init = {bubbles: true, cancelable: true, dataTransfer: drag.data, clientX: point.x, clientY: point.y};
    const target = document.elementFromPoint(point.x, point.y) ?? document.body;
    drag.ghost.style.left = `${point.x - 40}px`;
    drag.ghost.style.top = `${point.y - 30}px`;
    if (type === 'drop') {
      target.dispatchEvent(new DragEvent('drop', init));
      drag.ghost.remove();
      return;
    }
    // Over a new element, the browser sends dragenter to it before dragleave to the old one.
    if (target !== drag.over) {
      target.dispatchEvent(new DragEvent('dragenter', init));
      drag.over?.dispatchEvent(new DragEvent('dragleave', init));
      drag.over = target;
    }
    target.dispatchEvent(new DragEvent('dragover', init));
  }, {type, point});
  for (let step = 1; step <= steps; step++) {
    const point = {x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps};
    await page.mouse.move(point.x, point.y);
    await fire('over', point);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(900);
  await fire('drop', to);
}

/**
 * Pastes text into the page with Ctrl+V, as pasting a copied image address does. The clip puts
 * the text on the clipboard first (the clip needs the clipboard permissions).
 */
async function pasteText(page, text) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await showKeys(page, ['Ctrl', 'V']);
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+V');
}

/** Serves the pictures of a folder under https://<host>/<prefix><name>, as an image site would. */
async function serveImageSite(page, host, files) {
  await page.context().route(`https://${host}/**`, async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    const file = files[name];
    if (!file) return route.fulfill({status: 404, body: ''});
    await route.fulfill({status: 200, contentType: 'image/png', body: readFileSync(file), headers: {'access-control-allow-origin': '*'}});
  });
}

// ---- The lists the clips open ------------------------------------------------------------

const ow = (file) => `image-overwatch-${file}.webp`;
const tf = (file) => `image-reachthefinals-${file}_Rank_1.webp`;
const TF_IMAGES = path.join(ROOT, 'public', 'images', 'image-reachthefinals');

/** A v2 link to a list on a template page. `rows` holds S to F and '' (Unranked); `extraRows` adds rows after F. */
function listLink(pagePath, title, rows, names = ['S', 'A', 'B', 'C', 'F']) {
  const tiers = names.map((name) => ({i: `tier-${name.toLowerCase()}`, n: name, t: (rows[name] ?? []).map((i) => ({i}))}));
  tiers.push({i: 'uncategorized', n: '', t: (rows[''] ?? []).map((i) => ({i}))});
  return `${BASE}${pagePath}?state=${LZString.compressToEncodedURIComponent(JSON.stringify({title, tiers}))}`;
}

const TANK_PICKS = () => listLink('/rank/overwatch/tank', 'My tank picks', {
  S: [ow('dva'), ow('rei')], A: [ow('win'), ow('sig')], B: [ow('ori')], C: [ow('hog')],
  '': [ow('bal'), ow('dfs'), ow('hzd'), ow('jqn'), ow('mau'), ow('ram'), ow('zar')],
});

/** Every tank ranked, for the link preview image. */
const TANKS_RANKED = () => listLink('/rank/overwatch/tank', 'My tank picks', {
  S: [ow('dva'), ow('rei'), ow('mau')], A: [ow('win'), ow('sig'), ow('zar')], B: [ow('ori'), ow('ram'), ow('jqn')],
  C: [ow('hog'), ow('hzd')], F: [ow('bal'), ow('dfs')],
});

/** THE FINALS medium weapons, without the AKM and the FCAR (they come "from the wiki"). */
const MEDIUM_WEAPONS = () => listLink('/rank/the-finals/medium', 'Medium weapons', {
  S: [tf('FAMAS')], A: [tf('Pike-556'), tf('CB-01_Repeater')], B: [tf('CL-40'), tf('Model_1887')],
  '': [tf('R_.357'), tf('Dual_Blades'), tf('Riot_Shield'), tf('Cerberus_12GA')],
});

/** The wiki's pictures: the image set's own, under THE FINALS wiki's address. */
const WIKI = 'www.thefinals.wiki';
const WIKI_FILES = {'AKM.png': path.join(TF_IMAGES, 'AKM_Rank_1.png'), 'FCAR.png': path.join(TF_IMAGES, 'FCAR_Rank_1.png')};
const wikiImage = (name) => `https://${WIKI}/images/${name}`;

async function openList(page, link) {
  await page.goto(link);
  await unranked(page).getByRole('button').first().waitFor();
  await page.waitForTimeout(1_500);
  await page.mouse.move(700, 500);
}

/** Opens a list and turns on Zen, then waits until the "Entered Zen Mode" toast has gone. */
async function openInZen(page, link) {
  await openList(page, link);
  await page.getByRole('button', {name: 'Zen', exact: true}).click();
  await page.getByRole('toolbar', {name: 'Zen'}).waitFor();
  await page.getByText('Entered Zen Mode').waitFor();
  await page.getByText('Entered Zen Mode').waitFor({state: 'hidden', timeout: 15_000});
  await page.mouse.move(page.viewportSize().width - 200, page.viewportSize().height - 60);
  await page.waitForTimeout(500);
}

/** Opens the editor's empty list, ready for images. */
async function openEmptyEditor(page) {
  await page.goto(`${BASE}/rank`);
  await page.getByRole('button', {name: 'Add images', exact: true}).first().waitFor();
  await page.waitForTimeout(1_200);
  await page.mouse.move(700, 500);
}

const SNAPSHOT = path.join(tmpdir(), 'otb-gif-my-tank-picks.png');

/** Captures a picture in Share › Image (the panel is open) and waits for it. */
async function capture(page) {
  await clickOn(page, page.getByRole('button', {name: 'Capture Preview'}), 250);
  await page.getByRole('img', {name: 'Captured tier list'}).waitFor();
  await page.waitForTimeout(300);
}

/** Downloads the captured picture, and keeps it for the reopen clip. */
async function download(page) {
  const done = page.waitForEvent('download');
  await clickOn(page, page.getByRole('button', {name: 'Download', exact: true}), 500);
  copyFileSync(await (await done).path(), SNAPSHOT);
}

async function chooseFrame(page, frame) {
  await clickOn(page, page.getByRole('combobox', {name: 'Frame'}), 150);
  await page.getByRole('listbox').waitFor();
  await page.waitForTimeout(350);
  await clickOn(page, page.getByRole('option', {name: frame, exact: true}), 150);
  await page.waitForTimeout(150);
}

/** Opens the Appearance menu, chooses each item in turn (the menu stays open), then closes it. */
async function chooseAppearance(page, choices) {
  await clickOn(page, page.getByRole('banner').getByRole('button', {name: 'Appearance'}));
  await page.getByRole('menu').waitFor();
  await page.waitForTimeout(500);
  for (const [role, name] of choices) {
    await clickOn(page, page.getByRole(role, {name}), 250);
    await page.waitForTimeout(1_300);
  }
  await blurMenuButtonOnClose(page);
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({state: 'hidden'});
  await dropFocus(page);
  await glide(page, {x: 700, y: 500}, 12);
  await page.waitForTimeout(600);
}

/** Opens a Zen bar menu and chooses an item. */
async function chooseInZenBar(page, menu, role, name, wait = 1_400) {
  await clickOn(page, page.getByRole('toolbar', {name: 'Zen'}).getByRole('button', {name: new RegExp(`^${menu}: `)}), 250);
  await page.getByRole('menu').waitFor();
  await page.waitForTimeout(500);
  await blurMenuButtonOnClose(page);
  await clickOn(page, page.getByRole(role, {name, exact: true}), 250);
  await page.getByRole('menu').waitFor({state: 'hidden'});
  await dropFocus(page);
  const {width, height} = page.viewportSize();
  await glide(page, {x: width - 100, y: height - 40}, 12);
  await page.waitForTimeout(wait);
}

/** The first-drag tip, in the Unranked tray's hint line (tests/pages/tips.ts). */
const firstDragTip = (page) => page.getByRole('status').filter({hasText: 'Drag an image into a row to rank it'});

async function addRecentLists(page) {
  for (const link of [
    listLink('/rank/overwatch/tank', 'My tank picks', {S: [ow('dva')], A: [ow('win')], '': [ow('sig')]}),
    listLink('/rank/overwatch/sup', 'Support tier list', {S: [ow('ana')], '': [ow('mer')]}),
    listLink('/rank/overwatch/dps', 'DPS for ranked', {S: [ow('tra')], '': [ow('gen')]}),
  ]) await openList(page, link);
}

// ---- The clips ---------------------------------------------------------------------------

const CLIPS = {
  // Blog post, README (top) and About ("Rank by dragging").
  rank: {
    copies: [path.join(README, 'rank.gif'), path.join(ABOUT, 'rank.gif')],
    setup: (page) => openList(page, `${BASE}/rank/overwatch/tank`),
    scenario: async (page) => {
      await renameList(page, 'My tank picks');
      for (const [name, target] of [['D.Va', 'S'], ['Winston', 'A'], ['Orisa', 'B'], ['Roadhog', 'C']]) {
        await dragToRow(page, unranked(page).getByRole('button', {name, exact: true}), target);
      }
      await glide(page, {x: 1150, y: 500}, 20);
    },
  },

  rows: {
    // Tall enough for ten rows and the Unranked tray, so the page needs no scrolling.
    viewport: {width: 1200, height: 1240},
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      const addRow = page.getByRole('button', {name: 'Add row', exact: true});
      for (let added = 0; added < 5; added++) {
        await clickOn(page, addRow, 150);
        await page.waitForTimeout(350);
      }
      await page.waitForTimeout(400);
      await clickOn(page, page.getByRole('button', {name: 'Row options'}), 250);
      await page.getByRole('menu').waitFor();
      await page.waitForTimeout(400);
      await clickOn(page, page.getByRole('menuitem', {name: 'Remove a row'}), 300);
      const rows = page.getByRole('menu').filter({hasNot: page.getByRole('menuitem', {name: 'Remove a row'})});
      await rows.waitFor();
      await page.waitForTimeout(500);
      // Its items go back to Unranked: row C holds Roadhog.
      await blurMenuButtonOnClose(page);
      await clickOn(page, rows.getByRole('menuitem', {name: 'C', exact: true}), 400);
      await page.getByRole('menu').first().waitFor({state: 'hidden'});
      await dropFocus(page);
      await glide(page, await centre(unranked(page).getByRole('button', {name: 'Roadhog', exact: true})), 16);
      await page.waitForTimeout(600);
    },
  },

  'multi-line-drag': {
    setup: (page) => openList(page, listLink('/rank/overwatch/h-all', 'Every hero', {
      S: ['ana', 'ash', 'bap', 'bas', 'brg', 'dva', 'ech', 'gen', 'han', 'ill', 'jun', 'kir', 'luc', 'mcr'].map(ow),
      A: ['mei', 'mer'].map(ow),
      '': ['moi', 'ori', 'pha', 'rei', 'sig', 'soj', 'tra', 'win'].map(ow),
    })),
    scenario: async (page) => {
      // The second line of row S: drop Tracer on the second place there, where it stays. The
      // point is kept relative to the row, which moves when the drag scrolls the page.
      const sRow = row(page, 'S');
      const rowBox = await sRow.boundingBox();
      const lines = await itemsOf(sRow).evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().toJSON()));
      const second = lines.filter((tile) => tile.top > lines[0].top)[1];
      const offset = {x: second.left + second.width * 0.3 - rowBox.x, y: second.top + second.height / 2 - rowBox.y};
      await dragTo(page, unranked(page).getByRole('button', {name: 'Tracer', exact: true}), async () => {
        const box = await sRow.boundingBox();
        return {x: box.x + offset.x, y: box.y + offset.y};
      }, {hold: 900});
      await page.waitForTimeout(500);
      await glide(page, {x: 1150, y: 500}, 20);
      await page.waitForTimeout(800);
    },
  },

  // Blog post, README and About ("Your own images").
  images: {
    copies: [path.join(README, 'images.gif'), path.join(ABOUT, 'images.gif')],
    setup: openEmptyEditor,
    scenario: async (page) => {
      const folder = path.join(ROOT, 'public', 'images', 'image-webdev', 'fe');
      const files = ['react', 'vue', 'svelte', 'angular', 'preact', 'qwik', 'nuxt', 'htmx'].map((name) => ({
        name: `${name[0].toUpperCase()}${name.slice(1)}.png`, mimeType: 'image/png', buffer: readFileSync(path.join(folder, `${name}.png`)),
      }));
      await clickOn(page, page.getByRole('button', {name: 'Add images', exact: true}).first());
      await clickOn(page, page.getByRole('menuitem', {name: 'From your device'}));
      const dialog = page.getByRole('dialog', {name: 'Add New Items'});
      await dialog.waitFor();
      await page.waitForTimeout(400);
      await dialog.getByLabel('Upload Images').setInputFiles(files);
      await page.waitForTimeout(1_000);
      await clickOn(page, dialog.getByRole('button', {name: /^Add \d+ Items?$/}), 300);
      await dialog.waitFor({state: 'hidden'});
      await page.waitForTimeout(600);
      for (const [name, target] of [['React', 'S'], ['Svelte', 'A'], ['Htmx', 'B']]) {
        await dragToRow(page, unranked(page).getByRole('button', {name, exact: true}), target);
      }
      await glide(page, {x: 1150, y: 500}, 20);
    },
  },

  'link-drop-paste': {
    permissions: ['clipboard-read', 'clipboard-write'],
    setup: async (page) => {
      await serveImageSite(page, WIKI, WIKI_FILES);
      await openList(page, MEDIUM_WEAPONS());
      await page.mouse.move(1150, 420);
    },
    scenario: async (page) => {
      await page.waitForTimeout(500);
      // From the wiki's page in another window, onto the rows.
      await dragImageIn(page, {url: wikiImage('AKM.png'), alt: 'AKM'}, {x: 1195, y: 330}, {x: 640, y: 360});
      await itemsOf(unranked(page)).filter({hasText: 'AKM'}).first().waitFor();
      await page.waitForTimeout(1_200);
      await glide(page, {x: 620, y: 440}, 14);
      await pasteText(page, wikiImage('FCAR.png'));
      await itemsOf(unranked(page)).filter({hasText: 'FCAR'}).first().waitFor();
      await page.waitForTimeout(600);
      await glide(page, {x: 1000, y: 380}, 16);
      await page.waitForTimeout(600);
    },
  },

  'share-panel': {
    permissions: ['clipboard-read', 'clipboard-write'],
    setup: async (page) => {
      await serveImageSite(page, WIKI, WIKI_FILES);
      await openList(page, MEDIUM_WEAPONS());
      // One image from the web (the wiki's AKM) and one from the device (a FCAR picture).
      await page.getByRole('button', {name: 'Add images', exact: true}).first().click();
      await page.getByRole('menuitem', {name: 'From a link'}).click();
      const linkDialog = page.getByRole('dialog', {name: 'Add an Image from a Link'});
      await linkDialog.getByLabel('Image address').fill(wikiImage('AKM.png'));
      await linkDialog.getByRole('button', {name: 'Add Item'}).click();
      await linkDialog.waitFor({state: 'hidden'});
      await page.getByRole('button', {name: 'Add images', exact: true}).first().click();
      await page.getByRole('menuitem', {name: 'From your device'}).click();
      const deviceDialog = page.getByRole('dialog', {name: 'Add New Items'});
      await deviceDialog.getByLabel('Upload Images').setInputFiles({name: 'FCAR.png', mimeType: 'image/png', buffer: readFileSync(WIKI_FILES['FCAR.png'])});
      await deviceDialog.getByRole('button', {name: /^Add \d+ Items?$/}).click();
      await deviceDialog.waitFor({state: 'hidden'});
      await page.waitForTimeout(800);
      await dragToRow(page, itemsOf(unranked(page)).filter({hasText: 'AKM'}).first(), 'S');
      await dragToRow(page, itemsOf(unranked(page)).filter({hasText: 'FCAR'}).first(), 'A');
      await page.mouse.move(700, 620);
      await page.waitForTimeout(1_000);
    },
    scenario: async (page) => {
      await page.waitForTimeout(400);
      await clickOn(page, page.getByRole('button', {name: 'Share', exact: true}));
      await page.getByRole('note').first().waitFor();
      await glide(page, {x: 820, y: 330}, 18);
      await page.waitForTimeout(2_600);
      await clickOn(page, page.getByRole('button', {name: 'Copy Markdown'}), 400);
      await page.getByText('Markdown copied to clipboard').waitFor();
      await page.waitForTimeout(600);
    },
  },

  'freeze-frame-frames': {
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      await clickOn(page, page.getByRole('button', {name: 'Share', exact: true}));
      await page.waitForTimeout(500);
      await clickOn(page, page.getByRole('tab', {name: 'Image'}), 250);
      await page.waitForTimeout(300);
      for (const frame of ['Landscape 1200×675', 'Square 1080×1080', 'Portrait 1080×1350']) {
        await chooseFrame(page, frame);
        await capture(page);
      }
      await page.waitForTimeout(500);
      await download(page);
      await page.waitForTimeout(900);
    },
  },

  // README and About ("Freeze Frame"): the plain capture and download.
  'freeze-frame': {
    out: README,
    copies: [path.join(ABOUT, 'freeze-frame.gif')],
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      await clickOn(page, page.getByRole('button', {name: 'Share', exact: true}));
      await page.waitForTimeout(700);
      await clickOn(page, page.getByRole('tab', {name: 'Image'}));
      await capture(page);
      await page.waitForTimeout(1_200);
      await download(page);
      await page.waitForTimeout(1_200);
    },
  },

  // Blog post and README. Needs the file that a Freeze Frame clip downloads, so it runs after one.
  reopen: {
    copies: [path.join(README, 'reopen.gif')],
    setup: openEmptyEditor,
    scenario: async (page) => {
      await clickOn(page, page.getByRole('button', {name: 'Add images', exact: true}).first());
      const chooser = page.waitForEvent('filechooser');
      await clickOn(page, page.getByRole('menuitem', {name: 'Open a Freeze Frame…'}));
      await (await chooser).setFiles({name: 'my-tank-picks.png', mimeType: 'image/png', buffer: readFileSync(SNAPSHOT)});
      await page.getByRole('button', {name: 'Open list'}).waitFor();
      await page.waitForTimeout(1_200);
      await clickOn(page, page.getByRole('button', {name: 'Open list'}), 500);
      await page.getByRole('heading', {level: 1, name: 'My tank picks'}).waitFor();
      await page.waitForTimeout(1_200);
      await dragToRow(page, unranked(page).getByRole('button', {name: 'Zarya', exact: true}), 'B');
      await glide(page, {x: 1150, y: 500}, 20);
    },
  },

  'zen-bar': {
    // A smaller window, drawn larger, so the bar's step count reads in the GIF.
    viewport: {width: 1000, height: 700},
    gifWidth: GIF.width,
    setup: (page) => openInZen(page, TANK_PICKS()),
    scenario: async (page) => {
      const bar = page.getByRole('toolbar', {name: 'Zen'});
      await dragToRow(page, unranked(page).getByRole('button', {name: 'Mauga', exact: true}), 'S');
      await page.waitForTimeout(300);
      for (const step of ['Back', 'Forward']) {
        await clickOn(page, bar.getByRole('button', {name: step, exact: true}), 200);
        await page.waitForTimeout(650);
      }
      await dropFocus(page);
      await chooseInZenBar(page, 'Ranking order', 'menuitemradio', 'Shuffle', 1_400);
      await chooseInZenBar(page, 'Ranking order', 'menuitemcheckbox', 'Hide the queue', 1_200);
    },
  },

  'creator-layouts': {
    // A window wider than 16:9, so each frame shows its own edges.
    viewport: {width: 1280, height: 780},
    gifWidth: GIF.width,
    setup: (page) => openInZen(page, TANK_PICKS()),
    scenario: async (page) => {
      for (const layout of ['16:9', '9:16', 'Overlay · green key']) {
        await chooseInZenBar(page, 'Layout', 'menuitemradio', layout, 1_300);
      }
    },
  },

  'home-page': {
    setup: async (page) => {
      await addRecentLists(page);
      await page.goto(BASE);
      await page.getByRole('region', {name: 'Recently viewed'}).waitFor();
      await page.waitForTimeout(1_200);
      await page.mouse.move(980, 290);
    },
    scenario: async (page) => {
      await page.waitForTimeout(500);
      for (const name of ['THE FINALS', 'OVERWATCH']) {
        const heading = page.getByRole('heading', {name, exact: true});
        const box = await heading.boundingBox();
        // Onto the card, between its heading and its templates.
        await glide(page, {x: box.x + 150, y: box.y + box.height + 8}, 18);
        await page.waitForTimeout(1_500);
      }
      await glide(page, {x: 600, y: 760}, 16);
      await page.waitForTimeout(300);
      const region = page.getByRole('region', {name: 'Recently viewed'});
      const box = await region.boundingBox();
      await wheel(page, Math.max(0, box.y - 140), 14);
      await page.waitForTimeout(1_200);
    },
  },

  // Blog post and README.
  appearance: {
    copies: [path.join(README, 'appearance.gif')],
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      await chooseAppearance(page, [['menuitemradio', 'Dark'], ['menuitemradio', 'Classic']]);
    },
  },

  onboarding: {
    tips: true,
    // The tips show on a first visit: a new browser profile, with nothing in local storage.
    setup: async (page) => {
      await page.goto(`${BASE}/rank/overwatch/tank`);
      await firstDragTip(page).waitFor();
      await page.waitForTimeout(1_200);
      await page.mouse.move(700, 470);
    },
    scenario: async (page) => {
      const tip = await firstDragTip(page).boundingBox();
      await glide(page, {x: tip.x + 120, y: tip.y + tip.height + 30}, 20);
      await page.waitForTimeout(1_600);
      await dragToRow(page, unranked(page).getByRole('button', {name: 'D.Va', exact: true}), 'S');
      await page.getByText('Your list lives in this page\'s address').waitFor();
      await glide(page, {x: 700, y: 700}, 16);
      await page.waitForTimeout(3_000);
    },
  },

  // README: Zen in the editor.
  zen: {
    out: README,
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      await clickOn(page, page.getByRole('button', {name: 'Zen', exact: true}));
      await page.waitForTimeout(1_200);
      await dragToRow(page, unranked(page).getByRole('button', {name: 'Zarya', exact: true}), 'A');
      await dragToRow(page, unranked(page).getByRole('button', {name: 'Mauga', exact: true}), 'B');
      await page.waitForTimeout(600);
      await clickOn(page, page.getByRole('toolbar', {name: 'Zen'}).getByRole('button', {name: 'Exit Zen'}));
      await page.waitForTimeout(1_000);
    },
  },

  // README: Recently viewed.
  recent: {
    out: README,
    setup: async (page) => {
      await addRecentLists(page);
      await page.goto(BASE);
      const region = page.getByRole('region', {name: 'Recently viewed'});
      await region.waitFor();
      await region.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 120));
      await page.waitForTimeout(600);
      await page.mouse.move(1150, 300);
    },
    scenario: async (page) => {
      const region = page.getByRole('region', {name: 'Recently viewed'});
      await page.waitForTimeout(600);
      await clickOn(page, region.getByRole('button', {name: 'Pin My tank picks', exact: true}));
      await page.waitForTimeout(1_300);
      await clickOn(page, region.getByRole('link', {name: 'My tank picks', exact: true}), 500);
      await page.getByRole('heading', {level: 1, name: 'My tank picks'}).waitFor();
      await page.waitForTimeout(1_500);
    },
  },
};

/** The blog post's link preview image: the editor with a ranked list, 1200 x 630 WebP. */
async function recordPreviewImage() {
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'light'});
  await context.addInitScript(TIPS_OFF_SCRIPT);
  const page = await context.newPage();
  await page.goto(TANKS_RANKED());
  await row(page, 'S').getByRole('button', {name: 'D.Va', exact: true}).waitFor();
  // Every picture on screen has loaded (pictures below the window load lazily; the Zen
  // wordmark is hidden).
  await page.waitForFunction(() => [...document.querySelectorAll('main img')]
    .filter((image) => image.getBoundingClientRect().width > 0 && image.getBoundingClientRect().top < innerHeight)
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
  // From the title row to "Add row", with a margin, on the page's background at 1200:630.
  const title = await page.getByRole('heading', {level: 1}).boundingBox();
  const addRow = await page.getByRole('button', {name: 'Add row', exact: true}).boundingBox();
  const margin = 20;
  const left = title.x - margin;
  const width = VIEWPORT.width - 2 * left;
  const top = title.y - 14;
  const height = addRow.y + addRow.height + 12 - top;
  const png = await page.screenshot({clip: {x: left, y: top, width, height}});
  await browser.close();
  const file = path.join(BLOG, 'og-2-0-0.webp');
  mkdirSync(BLOG, {recursive: true});
  // The page's background: the margin's top-left pixel.
  const [r, g, b] = await sharp(png).extract({left: 0, top: 0, width: 1, height: 1}).removeAlpha().raw().toBuffer();
  await sharp(png).resize(1200, 630, {fit: 'contain', background: {r, g, b}}).webp({quality: 82}).toFile(file);
  console.log(`${path.relative(ROOT, file)}: 1200 x 630`);
}

const ALL = [...Object.keys(CLIPS), 'og'];
const chosen = names.length > 0 ? names : ALL;
const unknown = chosen.filter((name) => !ALL.includes(name));
if (unknown.length > 0) {
  console.error(`Unknown clip: ${unknown.join(', ')}. Clips: ${ALL.join(', ')}.`);
  process.exit(1);
}
for (const name of chosen) {
  if (name === 'og') await recordPreviewImage();
  else await record(name, CLIPS[name]);
}
