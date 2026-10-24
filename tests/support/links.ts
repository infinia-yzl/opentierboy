import LZString from 'lz-string';
import imagesetConfig from '../../imageset.config.json';

type PackageConfig = {images: {filename: string; label: string}[]};
const packages = (imagesetConfig as {packages: Record<string, PackageConfig>}).packages;

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
