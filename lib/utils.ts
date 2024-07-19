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

export const getTierGradient = (index: number, tiersLength: number): string => {
  if (index === tiersLength - 1) return '';

  const tierGradientIndexMap = [0, 1, 2, 3, 4, 5, 6];
  switch (tiersLength) {
    case 4:
      return `var(--tier-gradient-${[0, 2, 4][index % 3]})`;
    case 6:
      return `var(--tier-gradient-${[0, 1, 3, 4, 6][index % 5]})`;
    default:
      return `var(--tier-gradient-${tierGradientIndexMap[index % 7]})`;
  }
};
