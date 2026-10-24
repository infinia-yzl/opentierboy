import LZString from 'lz-string';
import imagesetConfig from '../../imageset.config.json';
import legacyConfig from '../../imageset.legacy.json';

type PackageConfig = {images: {filename: string; label: string; tags: string[]}[]};
const packages = (imagesetConfig as {packages: Record<string, PackageConfig>}).packages;
const legacyPackages = legacyConfig as Record<string, PackageConfig>;

/**
 * The legacy image sets (imageset.legacy.json): their package names, display names and
 * display-name slugs (both work in /rank URLs), and one tag each with its URL form and title.
 */
export const LEGACY_SETS = [
  {packageName: 'image-set', displayName: 'Example Items Template', slug: 'example-items-template', tag: 'people', tagPath: 'people', tagTitle: 'People'},
  {packageName: 'image-wutheringwaves', displayName: 'WUTHERING WAVES', slug: 'wuthering-waves', tag: 'c_rarity_5', tagPath: 'c-rarity-5', tagTitle: '5-Star Resonators'},
  {packageName: 'image-webdev', displayName: 'Web Development Technologies', slug: 'web-development-technologies', tag: 'fe', tagPath: 'fe', tagTitle: 'Frontend Technologies'},
  {packageName: 'image-supervive', displayName: 'SUPERVIVE', slug: 'supervive', tag: 'hunter', tagPath: 'hunter', tagTitle: 'All Hunters'},
  {packageName: 'image-helldivers2', displayName: 'HELLDIVERS 2', slug: 'helldivers-2', tag: 'Stratagems', tagPath: 'stratagems', tagTitle: 'Stratagems'},
] as const;

/** The item names of a legacy set (or of one of its tags), in the order its template lists them. */
export function legacyItems(packageName: string, tag?: string): string[] {
  const set = legacyPackages[packageName];
  if (!set) throw new Error(`${packageName} is not a legacy set`);
  return set.images
    .filter((image) => tag === undefined || image.tags.includes(tag))
    .map((image) => image.label || image.filename.split('.')[0]);
}

/** The files of a legacy set in public/images/<package>/: each image and its PNG copy for link previews. */
export function legacyFiles(packageName: string): string[] {
  return legacyPackages[packageName].images.flatMap(({filename}) => (
    filename.endsWith('.webp') ? [filename, filename.replace(/\.webp$/, '.png')] : [filename]
  ));
}

/** Tier ids of the default five-row template, keyed by their labels. */
export const FIVE_ROW_TIERS = [
  {id: 'tier-s', name: 'S'},
  {id: 'tier-a', name: 'A'},
  {id: 'tier-b', name: 'B'},
  {id: 'tier-c', name: 'C'},
  {id: 'tier-f', name: 'F'},
  {id: 'uncategorized', name: ''},
] as const;

/** Finds the item id of a package image by its visible label, for example 'Mauga'. */
export function packageItemId(packageName: string, label: string): string {
  const image = packages[packageName]?.images.find((img) => img.label === label);
  if (!image) throw new Error(`No item "${label}" in ${packageName}`);
  return `${packageName}-${image.filename}`;
}

/**
 * Builds a `state` value in the current (v2) link format, so a test can start from a
 * known ranking without dragging items through the UI first.
 *
 * `tiers` maps a five-row tier label ('' for unranked) to the item labels it holds.
 */
export function rankingState(
  packageName: string,
  tiers: Partial<Record<'S' | 'A' | 'B' | 'C' | 'F' | '', string[]>>,
  title?: string,
): string {
  const state = {
    ...(title ? {title} : {}),
    tiers: FIVE_ROW_TIERS.map((tier) => ({
      i: tier.id,
      n: tier.name,
      t: (tiers[tier.name] ?? []).map((label) => ({i: packageItemId(packageName, label)})),
    })),
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

/**
 * Builds a `state` value from raw link JSON in the current (v2) format, for lists that
 * `rankingState()` cannot express, such as uploaded items (`{i: id, c: label}`) or odd ids.
 */
export function rawState(state: {title?: string; tiers: {i: string; n: string; t: {i: string; c?: string}[]}[]}): string {
  return stateFromJson(state);
}

/**
 * Builds a `state` value from any JSON, including lists that the app never writes (a tier
 * name that is an object, no tiers at all). For tests of links with bad data.
 */
export function stateFromJson(json: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(json));
}
