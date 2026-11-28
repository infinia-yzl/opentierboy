import {FALLBACK_UNIT, type Box, type Place, type Surface} from '@/lib/scribble/anchors';

export const SCRIBBLE_ITEM_ATTRIBUTE = 'data-scribble-item';
export const SCRIBBLE_AREA_ATTRIBUTE = 'data-scribble-area';
export const SCRIBBLE_TRAY_ATTRIBUTE = 'data-scribble-tray';
const ROW_SELECTOR = '[data-tier-row]';

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

function shownIn(surface: Element, element: Element, rect: Rect): boolean {
  for (let box = element.parentElement; box && box !== surface; box = box.parentElement) {
    if (box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1) continue;
    const clip = box.getBoundingClientRect();
    if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) return false;
  }
  return true;
}

function shownPart(surface: Element, element: Element, rect: Rect): Rect | null {
  let part = rect;
  for (let box = element.parentElement; box && box !== surface; box = box.parentElement) {
    if (box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1) continue;
    const clip = box.getBoundingClientRect();
    const left = Math.max(part.left, clip.left);
    const top = Math.max(part.top, clip.top);
    const right = Math.min(part.right, clip.right);
    const bottom = Math.min(part.bottom, clip.bottom);
    if (right <= left || bottom <= top) return null;
    part = {left, top, right, bottom, width: right - left, height: bottom - top};
  }
  return part;
}

function tileUnitOf(area: Element | null): number {
  const unit = area ? parseFloat(getComputedStyle(area).minHeight) : NaN;
  return unit > 0 ? unit : 0;
}

export function measureSurface(layer: Element): Surface {
  const surface = layer.parentElement;
  if (!surface) return {unit: FALLBACK_UNIT, items: [], rows: [], tray: null};
  const base = layer.getBoundingClientRect();
  const boxOf = (rect: Rect): Box => ({x: rect.left - base.left, y: rect.top - base.top, width: rect.width, height: rect.height});
  const placeOf = (element: Element, origin: Element, unit: number): Place => {
    const rect = element.getBoundingClientRect();
    const start = origin === element ? rect : origin.getBoundingClientRect();
    return {
      box: boxOf(rect),
      origin: {x: start.left - base.left, y: start.top - base.top, unit},
      shown: rect.width > 0 && rect.height > 0 && shownIn(surface, element, rect),
    };
  };
  const rowElements = Array.from(surface.querySelectorAll(ROW_SELECTOR));
  const rowAreas = rowElements.map((row) => row.querySelector(`[${SCRIBBLE_AREA_ATTRIBUTE}]`));
  const rowUnits = rowAreas.map(tileUnitOf);
  const trayElement = surface.querySelector(`[${SCRIBBLE_TRAY_ATTRIBUTE}]`);
  const trayUnit = tileUnitOf(trayElement?.querySelector(`[${SCRIBBLE_AREA_ATTRIBUTE}]`) ?? null);
  const unit = rowUnits.find((size) => size > 0) || trayUnit || FALLBACK_UNIT;
  const itemElements = Array.from(surface.querySelectorAll(`[${SCRIBBLE_ITEM_ATTRIBUTE}]`));
  return {
    unit,
    pictures: itemElements.flatMap((element) => {
      const tile = element.querySelector('img') ?? element;
      const rect = tile.getBoundingClientRect();
      const part = rect.width > 0 && rect.height > 0 ? shownPart(surface, tile, rect) : null;
      return part ? [boxOf(part)] : [];
    }),
    items: itemElements.map((element) => {
      const tile = element.querySelector('img') ?? element;
      return {
        id: element.getAttribute(SCRIBBLE_ITEM_ATTRIBUTE) ?? '',
        ...placeOf(element, tile, tile.getBoundingClientRect().height),
      };
    }),
    rows: rowElements.map((row, index) => placeOf(row, rowAreas[index] ?? row, rowUnits[index] || unit)),
    tray: trayElement ? placeOf(trayElement, trayElement, trayUnit || unit) : null,
  };
}

export function sameSurface(a: Surface, b: Surface): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
