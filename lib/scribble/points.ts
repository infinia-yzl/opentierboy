export interface Point {
  readonly x: number;
  readonly y: number;
}

export const INK_GRID = 32;

export function onGrid(point: Point): Point {
  return {x: (Math.round(point.x * INK_GRID) + 0) / INK_GRID, y: (Math.round(point.y * INK_GRID) + 0) / INK_GRID};
}

export const POINT_STEP = 0.3;
export const POINT_MIN_MOVE = 0.08;
export const POINT_TURN_DEGREES = 18;

export interface Pen {
  readonly kept: readonly Point[];
  readonly heading: Point | null;
  readonly budget: number;
}

const TURN_COSINE = Math.cos((POINT_TURN_DEGREES * Math.PI) / 180);

export const penIsDry = (pen: Pen): boolean => pen.kept.length >= pen.budget;

export function startPen(point: Point, budget: number): Pen {
  return {kept: budget >= 1 ? [point] : [], heading: null, budget};
}

function keep(pen: Pen, point: Point): Pen {
  return {kept: [...pen.kept, point], heading: null, budget: pen.budget};
}

export function movePen(pen: Pen, point: Point): Pen {
  const last = pen.kept[pen.kept.length - 1];
  if (!last || penIsDry(pen)) return pen;
  const dx = point.x - last.x;
  const dy = point.y - last.y;
  const distance = Math.hypot(dx, dy);
  if (distance < POINT_MIN_MOVE) return pen;
  if (distance >= POINT_STEP) return keep(pen, point);
  const direction = {x: dx / distance, y: dy / distance};
  if (!pen.heading) return {...pen, heading: direction};
  const cosine = direction.x * pen.heading.x + direction.y * pen.heading.y;
  return cosine <= TURN_COSINE ? keep(pen, point) : pen;
}

export function liftPen(pen: Pen, point: Point): Pen {
  const last = pen.kept[pen.kept.length - 1];
  if (!last || penIsDry(pen) || (last.x === point.x && last.y === point.y)) return pen;
  return keep(pen, point);
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function strokePath(points: readonly Point[]): string {
  const [first, ...rest] = points;
  if (!first) return '';
  const start = `M${round(first.x)} ${round(first.y)}`;
  if (rest.length === 0) return `${start}L${round(first.x)} ${round(first.y)}`;
  const end = rest[rest.length - 1];
  const curves = rest.slice(0, -1).map((point, index) => {
    const next = rest[index + 1];
    return `Q${round(point.x)} ${round(point.y)} ${round((point.x + next.x) / 2)} ${round((point.y + next.y) / 2)}`;
  });
  return `${start}${curves.join('')}L${round(end.x)} ${round(end.y)}`;
}
