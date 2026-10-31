#!/usr/bin/env node
/**
 * Records the feature GIFs of the README (docs/media/*.gif) from a running build.
 *
 *   npm run build && npm run start -- -p 3000      (in another terminal)
 *   npm run record:gifs -- --url http://127.0.0.1:3000 [rank images ...]
 *
 * Each clip drives Chromium through one feature, records it with the DevTools screencast and
 * turns the frames into a GIF with ffmpeg (it must be installed). A drawn pointer shows where
 * the mouse is, because a headless browser draws none. With no names, every clip is recorded.
 * Record again after a change to what a clip shows. Build with the real fonts: a build with
 * stand-in fonts records the wrong letters.
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from '@playwright/test';
import LZString from 'lz-string';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const BASE = urlIndex === -1 ? 'http://127.0.0.1:3000' : args[urlIndex + 1];
const names = args.filter((arg, index) => !arg.startsWith('--') && index !== urlIndex + 1);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'media');

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
    const move = (event) => { pointer.style.left = (event.clientX - 4) + 'px'; pointer.style.top = (event.clientY - 2) + 'px'; };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('mousemove', move, true);
    window.addEventListener('pointerdown', () => { pointer.style.transform = 'scale(0.85)'; [60, 200, 400].forEach((ms) => setTimeout(raise, ms)); }, true);
    window.addEventListener('pointerup', () => { pointer.style.transform = 'scale(1)'; }, true);
    new MutationObserver(() => { if (document.querySelector(':popover-open:not(#__gif_pointer), dialog[open]')) raise(); })
      .observe(document.body, {childList: true, subtree: true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
`;

/** Records one clip and writes docs/media/<name>.gif. */
async function record(name, {setup, scenario}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'light', acceptDownloads: true});
  await context.addInitScript(POINTER_SCRIPT);
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
  await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 92, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height});
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
  const gif = path.join(OUT, `${name}.gif`);
  // One palette from every frame. A palette from the changed pixels only (stats_mode=diff) lacks
  // the colours of a page that appears late, such as the tier rows after Recently viewed opens a list.
  const filters = `fps=${GIF.fps},scale=${GIF.width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=${GIF.colours}:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', filters, '-loop', '0', gif]);
  rmSync(dir, {recursive: true, force: true});
  console.log(`${name}.gif: ${frames.length} frames`);
}

// ---- Moves a person would make --------------------------------------------------------------

async function centre(locator) {
  const box = await locator.boundingBox();
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function glide(page, to, steps = 25) {
  await page.mouse.move(to.x, to.y, {steps});
}

async function clickOn(page, locator, wait = 350) {
  await glide(page, await centre(locator), 22);
  await page.waitForTimeout(wait);
  await locator.click();
}

async function typeSlowly(page, text) {
  for (const character of text) await page.keyboard.type(character, {delay: 55});
}

const unranked = (page) => page.getByRole('group', {name: 'Unranked'});
const row = (page, name) => page.getByRole('group', {name, exact: true});

/** Drags an item to the free space after the last item of a row, with smooth, visible moves. */
async function dragToRow(page, item, rowName) {
  const box = await row(page, rowName).boundingBox();
  const count = await row(page, rowName).getByRole('button').count();
  const from = await centre(item);
  await glide(page, from, 18);
  await page.waitForTimeout(150);
  await page.mouse.down();
  // A mouse drag starts once the pointer has moved a few pixels.
  await page.mouse.move(from.x + 10, from.y + 10, {steps: 4});
  await glide(page, {x: box.x + 160 + count * 88, y: box.y + box.height / 2}, 30);
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(450);
}

async function renameList(page, title) {
  await clickOn(page, page.getByRole('button', {name: 'Edit title'}));
  await page.keyboard.press('ControlOrMeta+a');
  await typeSlowly(page, title);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
}

// ---- The lists the clips open ------------------------------------------------------------

const ow = (file) => `image-overwatch-${file}.webp`;

/** A v2 link to a list on an OVERWATCH page. */
function listLink(pagePath, title, rows) {
  const tiers = ['S', 'A', 'B', 'C', 'F'].map((name) => ({i: `tier-${name.toLowerCase()}`, n: name, t: (rows[name] ?? []).map((i) => ({i}))}));
  tiers.push({i: 'uncategorized', n: '', t: (rows[''] ?? []).map((i) => ({i}))});
  return `${BASE}${pagePath}?state=${LZString.compressToEncodedURIComponent(JSON.stringify({title, tiers}))}`;
}

const TANK_PICKS = () => listLink('/rank/overwatch/tank', 'My tank picks', {
  S: [ow('dva'), ow('rei')], A: [ow('win'), ow('sig')], B: [ow('ori')], C: [ow('hog')],
  '': [ow('bal'), ow('dfs'), ow('hzd'), ow('jqn'), ow('mau'), ow('ram'), ow('zar')],
});

async function openList(page, link) {
  await page.goto(link);
  await unranked(page).getByRole('button').first().waitFor();
  await page.waitForTimeout(1_500);
  await page.mouse.move(700, 500);
}

const SNAPSHOT = path.join(tmpdir(), 'otb-gif-my-tank-picks.png');

// ---- The clips ---------------------------------------------------------------------------

const CLIPS = {
  rank: {
    setup: (page) => openList(page, `${BASE}/rank/overwatch/tank`),
    scenario: async (page) => {
      await renameList(page, 'My tank picks');
      for (const [name, target] of [['D.Va', 'S'], ['Winston', 'A'], ['Reinhardt', 'S'], ['Roadhog', 'C'], ['Orisa', 'B'], ['Sigma', 'A']]) {
        await dragToRow(page, unranked(page).getByRole('button', {name, exact: true}), target);
      }
      await glide(page, {x: 1000, y: 820}, 20);
    },
  },

  images: {
    setup: async (page) => {
      await page.goto(`${BASE}/rank`);
      await page.getByRole('button', {name: 'Add images', exact: true}).first().waitFor();
      await page.waitForTimeout(1_000);
      await page.mouse.move(700, 500);
    },
    scenario: async (page) => {
      const folder = path.join(ROOT, 'public', 'images', 'image-webdev', 'fe');
      const files = ['react', 'vue', 'svelte', 'angular', 'preact', 'qwik', 'nuxt', 'htmx'].map((name) => ({
        name: `${name[0].toUpperCase()}${name.slice(1)}.png`, mimeType: 'image/png', buffer: readFileSync(path.join(folder, `${name}.png`)),
      }));
      await renameList(page, 'Frontend frameworks');
      await clickOn(page, page.getByRole('button', {name: 'Add images', exact: true}).first());
      await clickOn(page, page.getByRole('menuitem', {name: 'From your device'}));
      const dialog = page.getByRole('dialog', {name: 'Add New Items'});
      await dialog.waitFor();
      await page.waitForTimeout(600);
      await dialog.getByLabel('Upload Images').setInputFiles(files);
      await page.waitForTimeout(1_400);
      await clickOn(page, dialog.getByRole('button', {name: /^Add \d+ Items?$/}), 500);
      await dialog.waitFor({state: 'hidden'});
      await page.waitForTimeout(900);
      for (const [name, target] of [['React', 'S'], ['Svelte', 'S'], ['Vue', 'A'], ['Htmx', 'B']]) {
        await dragToRow(page, unranked(page).getByRole('button', {name, exact: true}), target);
      }
      await glide(page, {x: 1000, y: 820}, 20);
    },
  },

  'freeze-frame': {
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      await clickOn(page, page.getByRole('button', {name: 'Share', exact: true}));
      await page.waitForTimeout(700);
      await clickOn(page, page.getByRole('tab', {name: 'Image'}));
      await clickOn(page, page.getByRole('button', {name: 'Capture Preview'}));
      await page.getByRole('listitem').filter({hasText: 'Image captured successfully'}).waitFor();
      await page.waitForTimeout(1_500);
      const download = page.waitForEvent('download');
      await clickOn(page, page.getByRole('button', {name: 'Download'}), 600);
      copyFileSync(await (await download).path(), SNAPSHOT);
      await page.waitForTimeout(1_200);
    },
  },

  // Needs the file that the freeze-frame clip downloads, so it runs after it.
  reopen: {
    setup: async (page) => {
      await page.goto(`${BASE}/rank`);
      await page.getByRole('button', {name: 'Add images', exact: true}).first().waitFor();
      await page.waitForTimeout(1_200);
      await page.mouse.move(700, 500);
    },
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
      await glide(page, {x: 1000, y: 820}, 20);
    },
  },

  appearance: {
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      const choose = async (role, name, wait = 1_300) => {
        if (await page.getByRole('menu').isVisible()) await page.keyboard.press('Escape');
        await page.getByRole('menu').waitFor({state: 'hidden'});
        await clickOn(page, page.getByRole('banner').getByRole('button', {name: 'Appearance'}));
        await page.getByRole('menu').waitFor();
        await page.waitForTimeout(500);
        await clickOn(page, page.getByRole(role, {name}), 300);
        await page.waitForTimeout(wait);
      };
      await choose('menuitemradio', 'Dark');
      await choose('menuitemcheckbox', 'Game colours');
      await choose('menuitemcheckbox', 'Game colours', 1_000);
      await choose('menuitemradio', 'Classic');
      await choose('menuitemradio', 'Modern', 500);
      await choose('menuitemradio', 'Light', 800);
    },
  },

  zen: {
    setup: (page) => openList(page, TANK_PICKS()),
    scenario: async (page) => {
      await clickOn(page, page.getByRole('button', {name: 'Zen'}));
      await page.waitForTimeout(1_200);
      await dragToRow(page, unranked(page).getByRole('button', {name: 'Zarya', exact: true}), 'A');
      await dragToRow(page, unranked(page).getByRole('button', {name: 'Mauga', exact: true}), 'B');
      await page.waitForTimeout(600);
      await clickOn(page, page.getByRole('button', {name: 'Zen'}));
      await page.waitForTimeout(800);
    },
  },

  recent: {
    setup: async (page) => {
      for (const link of [
        listLink('/rank/overwatch/tank', 'My tank picks', {S: [ow('dva')], A: [ow('win')], '': [ow('sig')]}),
        listLink('/rank/overwatch/sup', 'Support tier list', {S: [ow('ana')], '': [ow('mer')]}),
        listLink('/rank/overwatch/dps', 'DPS for ranked', {S: [ow('tra')], '': [ow('gen')]}),
      ]) await openList(page, link);
      await page.goto(BASE);
      const region = page.getByRole('region', {name: 'Recently viewed'});
      await region.waitFor();
      await region.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 120));
      await page.waitForTimeout(600);
      await page.mouse.move(700, 300);
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

mkdirSync(OUT, {recursive: true});
const chosen = names.length > 0 ? names : Object.keys(CLIPS);
const unknown = chosen.filter((name) => !(name in CLIPS));
if (unknown.length > 0) {
  console.error(`Unknown clip: ${unknown.join(', ')}. Clips: ${Object.keys(CLIPS).join(', ')}.`);
  process.exit(1);
}
for (const name of chosen) await record(name, CLIPS[name]);
