import imagesetConfig from '@/imageset.config.json';
import {
  type CanonicalItem,
  type CanonicalState,
  type CanonicalTier,
  defaultTierId,
  type LabelPosition,
  type RowTemplate,
  ROW_TEMPLATE_TIER_IDS,
} from '@/lib/state';

/**
 * Seeded random tier lists in the shape TierListManager hands to
 * encodeTierStateForURL (lib/listLink.ts): items are {i, c} with c undefined for package items.
 * The same seed always gives the same lists, so a failure can be reproduced.
 */

export interface AppItem {
  i: string;
  c?: string;
}

export interface AppTier {
  id: string;
  name: string;
  items: AppItem[];
}

export interface AppState {
  title: string | undefined;
  tiers: AppTier[];
}

/** mulberry32: a small deterministic PRNG returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const packages = (imagesetConfig as {packages: Record<string, {images: {filename: string}[]}>}).packages;

export const PACKAGE_ITEM_IDS: string[] = Object.entries(packages)
  .flatMap(([packageName, data]) => data.images.map(image => `${packageName}-${image.filename}`));

const TIER_IDS = ['tier-ss', 'tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-d', 'tier-f', 'uncategorized'];

/** Text that has broken encoders elsewhere: quotes, escapes, control and astral characters. */
const FRAGMENTS = [
  'S', 'A', 'B', 'Tier', 'GOAT', ' ', '  ', '"', "'", '\\', '\\"', '\n', '\r\n', '\t', ' ',
  '\u0000', '\u007f', ' ', '😀', '👨‍👩‍👧‍👦', '🇲🇾', '🐱‍👤', '\ud83d', '日本語', '한국어', 'مرحبا',
  'Ñandú', 'Torbjörn', 'é', 'é', '<b>', '</script>', '&amp;', '%20', '+', '/', '?', '#',
  '.', '=', '{"tiers":[]}', '[', ']', 'null', 'a'.repeat(40),
];

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)];
}

function randomText(random: () => number, maxFragments: number): string {
  const count = Math.floor(random() * (maxFragments + 1));
  let text = '';
  for (let index = 0; index < count; index++) text += pick(random, FRAGMENTS);
  return text;
}

function randomCustomId(random: () => number): string {
  // Same shape as ItemCreator's generateId: Math.random().toString(36).slice(2, 11)
  return random().toString(36).slice(2, 11) || 'x';
}

function randomItem(random: () => number): AppItem {
  const roll = random();
  if (roll < 0.6) return {i: pick(random, PACKAGE_ITEM_IDS), c: undefined};
  if (roll < 0.65) return {i: pick(random, PACKAGE_ITEM_IDS), c: randomText(random, 3)};
  if (roll < 0.7) return {i: randomCustomId(random)};
  return {i: randomCustomId(random), c: randomText(random, 4)};
}

function randomTitle(random: () => number): string | undefined {
  const roll = random();
  if (roll < 0.25) return undefined;
  if (roll < 0.4) return '';
  if (roll < 0.45) return ' ';
  return randomText(random, 6) || 'Title';
}

export function randomAppStates(count: number, seed: number): AppState[] {
  const random = seededRandom(seed);
  const states: AppState[] = [];
  for (let index = 0; index < count; index++) {
    const tierCount = random() < 0.03 ? 0 : 1 + Math.floor(random() * 9);
    const tiers: AppTier[] = [];
    for (let tierIndex = 0; tierIndex < tierCount; tierIndex++) {
      const itemCount = random() < 0.02 ? 120 : Math.floor(random() * 12);
      const items: AppItem[] = [];
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) items.push(randomItem(random));
      tiers.push({
        id: random() < 0.8 ? pick(random, TIER_IDS) : randomText(random, 2),
        name: randomText(random, 3),
        items,
      });
    }
    states.push({title: randomTitle(random), tiers});
  }
  return states;
}

/** The same list as lib/state sees it: content only where the app stored a label. */
export function toCanonical(state: AppState): Omit<CanonicalState, 'version'> {
  return {
    ...(state.title === undefined ? {} : {title: state.title}),
    tiers: state.tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      items: tier.items.map(item => (item.c === undefined ? {id: item.i} : {id: item.i, content: item.c})),
    })),
  };
}

const ROW_TEMPLATES: RowTemplate[] = ['3rows', '5rows', '7rows', 'custom'];
const LABEL_POSITIONS: LabelPosition[] = ['left', 'right', 'top'];

const URL_PARTS = [
  'https://thefinals.wiki/images/a/ab/Light.png',
  'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
  'https://i.imgur.com/abc123.jpeg?x=1&y=2#frag',
  'https://例え.テスト/画像.png',
  'https://cdn.deadlock.wiki/hero%20name.webp',
  'http://localhost:3000/secret.png',
  'javascript:alert(1)',
  ' ',
];

function randomUrl(random: () => number): string {
  const base = pick(random, URL_PARTS);
  return random() < 0.3 ? `${base}${randomText(random, 2)}` : base;
}

const DEVICE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** An id that follows the device id rule (lib/state/deviceId.ts): 8 to 64 URL-safe characters. */
function randomDeviceId(random: () => number): string {
  const length = random() < 0.5 ? 16 : 8 + Math.floor(random() * 57);
  let id = '';
  for (let index = 0; index < length; index++) id += DEVICE_ID_ALPHABET[Math.floor(random() * DEVICE_ID_ALPHABET.length)];
  return id;
}

function randomV3Item(random: () => number): CanonicalItem {
  const roll = random();
  if (roll < 0.6) return {id: pick(random, PACKAGE_ITEM_IDS)};
  if (roll < 0.63) return {id: randomText(random, 3) || 'odd-id'};
  if (roll < 0.65) return {id: randomText(random, 3) || 'odd-id', content: randomText(random, 3) || 'label'};
  if (roll < 0.82) {
    const url = randomUrl(random);
    return {kind: 'link', id: url, url, content: random() < 0.2 ? '' : randomText(random, 4)};
  }
  return {kind: 'device', id: randomDeviceId(random), content: random() < 0.2 ? '' : randomText(random, 4)};
}

function randomTierId(random: () => number, template: RowTemplate, index: number): string {
  const fallback = defaultTierId(template, index);
  const roll = random();
  if (fallback !== undefined && roll < 0.7) return fallback;
  if (roll < 0.9) return pick(random, TIER_IDS);
  return randomText(random, 2) || 'tier-x';
}

/**
 * Seeded random lists in the form decodeState gives for v3 links: every layout field set, no
 * empty title, items without `kind` with a non-empty `content` or none (A45), link items whose
 * id is their URL, no empty ids or addresses, device ids that follow the device id rule. Decoding what encodeV3 writes
 * for one of them gives it back unchanged.
 */
export function randomV3States(count: number, seed: number): CanonicalState[] {
  const random = seededRandom(seed);
  const states: CanonicalState[] = [];
  for (let index = 0; index < count; index++) {
    const rowTemplate = pick(random, ROW_TEMPLATES);
    const templateRows = rowTemplate === 'custom' ? 0 : ROW_TEMPLATE_TIER_IDS[rowTemplate].length;
    const roll = random();
    const tierCount = roll < 0.6 && templateRows > 0 ? templateRows : 1 + Math.floor(random() * 12);
    const tiers: CanonicalTier[] = [];
    for (let tierIndex = 0; tierIndex < tierCount; tierIndex++) {
      const itemCount = random() < 0.02 ? 120 : Math.floor(random() * 12);
      const items: CanonicalItem[] = [];
      for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) items.push(randomV3Item(random));
      tiers.push({id: randomTierId(random, rowTemplate, tierIndex), name: randomText(random, 3), items});
    }
    const title = random() < 0.3 ? '' : randomText(random, 6);
    states.push({
      version: 3,
      ...(title === '' ? {} : {title}),
      rowTemplate,
      labelPosition: pick(random, LABEL_POSITIONS),
      showLabels: random() < 0.7,
      tiers,
    });
  }
  return states;
}
