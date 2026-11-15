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

export const getTierColour = (index: number, tiersLength: number): string => {
  const shade = tierShade(index, tiersLength);
  return shade === null ? '' : `var(--tier-colour-${shade})`;
};

export function createSEOFriendlyTagSlug(tag: string): string {
  return tag ? tag.toLowerCase().replace(/_+/g, '-').replace(/^-|-$/g, '') : '';
}
