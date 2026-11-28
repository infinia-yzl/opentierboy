import React, {useId, useRef, useState} from 'react';
import Image from 'next/image';
import {
  type Border,
  type Bounds,
  type Fit,
  type Handle,
  HANDLES,
  keptSquare,
  moveBorder,
  moveCut,
  resizeBorder,
  resizeEvery,
} from '@/lib/extract/borders';
import type {Box} from '@/lib/extract/picture';

export interface StageChange {
  borders: Border[];
  atSmallest: boolean;
}

interface ExtractorStageProps {
  src: string;
  picture: Bounds;
  scale: number;
  borders: readonly Border[];
  selected: number | null;
  fit: Fit;
  sameSize: boolean;
  onSelect: (id: number | null) => void;
  onChange: (change: StageChange) => void;
  onDraw: (box: Box) => void;
  onRemove: (id: number) => void;
}

type Drag =
  | {kind: 'move' | 'cut'; id: number; x: number; y: number; start: readonly Border[]}
  | {kind: 'resize'; id: number; handle: Handle; x: number; y: number; start: readonly Border[]}
  | {kind: 'draw'; x: number; y: number};

const HANDLE_PIXELS = 10;
const LABEL_PIXELS = 12;

function handlePoint(border: Border, handle: Handle): {x: number; y: number} {
  const x = handle.includes('w') ? border.x : handle.includes('e') ? border.x + border.width : border.x + border.width / 2;
  const y = handle.includes('n') ? border.y : handle.includes('s') ? border.y + border.height : border.y + border.height / 2;
  return {x, y};
}

const HANDLE_CURSORS: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

const KEY_STEPS: Record<string, {dx: number; dy: number}> = {
  ArrowLeft: {dx: -1, dy: 0},
  ArrowRight: {dx: 1, dy: 0},
  ArrowUp: {dx: 0, dy: -1},
  ArrowDown: {dx: 0, dy: 1},
};

export function resizeWithPeers(start: readonly Border[], id: number, handle: Handle, dx: number, dy: number, picture: Bounds, sameSize: boolean): StageChange {
  const original = start.find((border) => border.id === id);
  if (!original) return {borders: [...start], atSmallest: false};
  const resized = resizeBorder(original, handle, dx, dy, picture);
  if (!sameSize) {
    return {borders: start.map((border) => (border.id === id ? resized.border : border)), atSmallest: resized.atSmallest};
  }
  const others = resizeEvery(start.filter((border) => border.id !== id), resized.change, picture);
  const byId = new Map(others.borders.map((border) => [border.id, border]));
  return {
    borders: start.map((border) => (border.id === id ? resized.border : byId.get(border.id) ?? border)),
    atSmallest: resized.atSmallest || others.atSmallest,
  };
}

export const ExtractorStage: React.FC<ExtractorStageProps> = ({
  src, picture, scale, borders, selected, fit, sameSize, onSelect, onChange, onDraw, onRemove,
}) => {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [drawing, setDrawing] = useState<Box | null>(null);
  const hintId = useId();
  const unit = 1 / scale;

  const toPicture = (event: React.PointerEvent) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return {x: 0, y: 0};
    return {
      x: Math.min(Math.max(((event.clientX - rect.left) * picture.width) / rect.width, 0), picture.width),
      y: Math.min(Math.max(((event.clientY - rect.top) * picture.height) / rect.height, 0), picture.height),
    };
  };

  const drawnBox = (from: {x: number; y: number}, to: {x: number; y: number}): Box => ({
    x: Math.round(Math.min(from.x, to.x)),
    y: Math.round(Math.min(from.y, to.y)),
    width: Math.round(Math.abs(to.x - from.x)),
    height: Math.round(Math.abs(to.y - from.y)),
  });

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !svg.current) return;
    const point = toPicture(event);
    const target = event.target instanceof Element ? event.target : null;
    const handle = target?.closest('[data-handle]')?.getAttribute('data-handle') as Handle | null | undefined;
    const cut = target?.closest('[data-cut]')?.getAttribute('data-cut');
    const border = target?.closest('[data-border]')?.getAttribute('data-border');
    svg.current.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (handle && selected !== null) {
      drag.current = {kind: 'resize', id: selected, handle, ...point, start: borders};
    } else if (cut) {
      drag.current = {kind: 'cut', id: Number(cut), ...point, start: borders};
    } else if (border) {
      const id = Number(border);
      onSelect(id);
      drag.current = {kind: 'move', id, ...point, start: borders};
    } else {
      onSelect(null);
      drag.current = {kind: 'draw', ...point};
      setDrawing({x: point.x, y: point.y, width: 0, height: 0});
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) return;
    const point = toPicture(event);
    const dx = point.x - current.x;
    const dy = point.y - current.y;
    if (current.kind === 'draw') {
      setDrawing(drawnBox(current, point));
      return;
    }
    if (current.kind === 'move') {
      onChange({borders: current.start.map((border) => (border.id === current.id ? moveBorder(border, dx, dy, picture) : border)), atSmallest: false});
      return;
    }
    if (current.kind === 'resize') {
      onChange(resizeWithPeers(current.start, current.id, current.handle, dx, dy, picture, sameSize));
      return;
    }
    const dragged = current.start.find((border) => border.id === current.id);
    if (!dragged) return;
    const delta = keptSquare(dragged).along === 'x' ? dx : dy;
    onChange({
      borders: current.start.map((border) => (border.id === current.id || sameSize ? moveCut(border, delta) : border)),
      atSmallest: false,
    });
  };

  const onPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    drag.current = null;
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    if (current?.kind === 'draw') {
      setDrawing(null);
      const box = drawnBox(current, toPicture(event));
      if (box.width > 2 || box.height > 2) onDraw(box);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<SVGRectElement>, border: Border) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove(border.id);
      return;
    }
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    if (event.shiftKey) {
      const handle: Handle = step.dx !== 0 ? 'e' : 's';
      onChange(resizeWithPeers(borders, border.id, handle, step.dx, step.dy, picture, sameSize));
      return;
    }
    onChange({borders: borders.map((other) => (other.id === border.id ? moveBorder(other, step.dx, step.dy, picture) : other)), atSmallest: false});
  };

  const selectedBorder = borders.find((border) => border.id === selected) ?? null;
  const total = borders.length;

  return (
    <div className="relative select-none" style={{width: picture.width * scale, height: picture.height * scale}}>
      <Image
        src={src}
        alt=""
        unoptimized
        draggable={false}
        width={Math.max(1, Math.round(picture.width * scale))}
        height={Math.max(1, Math.round(picture.height * scale))}
        className="absolute inset-0 h-full w-full max-w-none"
      />
      <svg
        ref={svg}
        role="group"
        aria-label="Item borders"
        className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
        viewBox={`0 0 ${picture.width} ${picture.height}`}
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {borders.map((border, index) => {
          const isSelected = border.id === selected;
          const square = fit === 'square' ? keptSquare(border) : null;
          return (
            <g key={border.id}>
              <rect
                x={border.x} y={border.y} width={border.width} height={border.height}
                fill="none" stroke="black" strokeOpacity={0.6} strokeWidth={4 * unit}
                pointerEvents="none"
              />
              <rect
                data-border={border.id}
                role="button"
                tabIndex={0}
                aria-label={`Item ${index + 1} of ${total}`}
                aria-describedby={hintId}
                aria-pressed={isSelected}
                x={border.x} y={border.y} width={border.width} height={border.height}
                fill="transparent"
                strokeWidth={(isSelected ? 2.5 : 1.5) * unit}
                className={`${isSelected ? 'stroke-primary' : 'stroke-white'} cursor-move outline-none`}
                onFocus={() => onSelect(border.id)}
                onKeyDown={(event) => onKeyDown(event, border)}
              />
              {square && (
                <rect
                  data-cut={border.id}
                  x={square.x} y={square.y} width={square.width} height={square.height}
                  fill="white" fillOpacity={0.12} stroke="white" strokeDasharray={`${4 * unit} ${3 * unit}`} strokeWidth={1.5 * unit}
                  className={square.room > 0 ? (square.along === 'x' ? 'cursor-ew-resize' : 'cursor-ns-resize') : undefined}
                />
              )}
              <g aria-hidden="true" pointerEvents="none">
                <rect
                  x={border.x} y={border.y}
                  width={(String(index + 1).length * 7 + 8) * unit} height={(LABEL_PIXELS + 4) * unit}
                  className={isSelected ? 'fill-primary' : 'fill-black/70'}
                />
                <text
                  x={border.x + 4 * unit} y={border.y + (LABEL_PIXELS + 0.5) * unit}
                  fontSize={LABEL_PIXELS * unit}
                  className={isSelected ? 'fill-primary-foreground' : 'fill-white'}
                >
                  {index + 1}
                </text>
              </g>
            </g>
          );
        })}
        {selectedBorder && HANDLES.map((handle) => {
          const point = handlePoint(selectedBorder, handle);
          return (
            <rect
              key={handle}
              data-handle={handle}
              aria-hidden="true"
              x={point.x - (HANDLE_PIXELS / 2) * unit} y={point.y - (HANDLE_PIXELS / 2) * unit}
              width={HANDLE_PIXELS * unit} height={HANDLE_PIXELS * unit}
              strokeWidth={1.5 * unit}
              className="fill-background stroke-primary"
              style={{cursor: HANDLE_CURSORS[handle]}}
            />
          );
        })}
        {drawing && (
          <rect
            x={drawing.x} y={drawing.y} width={drawing.width} height={drawing.height}
            fill="none" strokeDasharray={`${5 * unit} ${4 * unit}`} strokeWidth={2 * unit}
            className="stroke-primary" pointerEvents="none"
          />
        )}
      </svg>
      <p id={hintId} className="sr-only">Arrow keys move the border. Shift and arrow keys resize it. Delete removes it.</p>
    </div>
  );
};

