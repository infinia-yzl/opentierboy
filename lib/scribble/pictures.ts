import type {Box} from '@/lib/scribble/anchors';

const NOTHING = 'inset(50%)';
const START = '0 0';

function corners({x, y, width, height}: Box): string[] {
  return [`${x}px ${y}px`, `${x + width}px ${y}px`, `${x + width}px ${y + height}px`, `${x}px ${y + height}px`, `${x}px ${y}px`];
}

export function picturesClip(pictures: readonly Box[]): string {
  if (pictures.length === 0) return NOTHING;
  return `polygon(${pictures.flatMap((box) => [START, ...corners(box)]).join(', ')}, ${START})`;
}

export function outsidePicturesClip(pictures: readonly Box[]): string {
  if (pictures.length === 0) return 'none';
  const whole = [START, '100% 0', '100% 100%', '0 100%', START];
  return `polygon(evenodd, ${[...whole, ...pictures.flatMap((box) => [...corners(box), START])].join(', ')})`;
}
