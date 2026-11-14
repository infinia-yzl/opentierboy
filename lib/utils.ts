import {type ClassValue, clsx} from "clsx"
import {twMerge} from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
}

/**
 * The colour shade (0 to 6) of the row at `index` in a list of `tiersLength` rows, or null for
 * the last row (Unranked). Colours belong to positions: a row that moves takes the colour of its
 * new place.
 */
function tierShade(index: number, tiersLength: number): number | null {
  if (index === tiersLength - 1) return null;
  switch (tiersLength) {
    case 4:
      return [0, 2, 4][index % 3];
    case 6:
      return [0, 1, 3, 4, 6][index % 5];
    default:
      return index % 7;
  }
}

export const getTierGradient = (index: number, tiersLength: number): string => {
  const shade = tierShade(index, tiersLength);
  return shade === null ? '' : `var(--tier-gradient-${shade})`;
};

/** The first colour of the row's gradient (the grip takes it), or '' for the last row. */
export const getTierColour = (index: number, tiersLength: number): string => {
  const shade = tierShade(index, tiersLength);
  return shade === null ? '' : `var(--tier-colour-${shade})`;
};

export function createSEOFriendlyTagSlug(tag: string): string {
  return tag ? tag.toLowerCase().replace(/_+/g, '-').replace(/^-|-$/g, '') : '';
}
