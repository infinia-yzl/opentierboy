'use client';

import React, {memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {useTierContext} from '@/contexts/TierContext';
import {useZenMode} from '@/components/usePageState';
import {useActiveStage} from '@/components/useZenLayout';
import {useRankingOrder} from '@/components/useRankingOrder';
import {getInkNotes, setInkBeingDrawn, useScribble, writeScribbleNotes} from '@/components/useScribble';
import {measureSurface, sameSurface} from '@/components/scribbleSurface';
import {EMPTY_SURFACE, originOf, type Box, type Surface} from '@/lib/scribble/anchors';
import type {InkColour} from '@/lib/scribble/colours';
import type {Note} from '@/lib/scribble/notes';
import {anchorPhrase, notesText} from '@/lib/scribble/names';
import {addStroke} from '@/lib/scribble/notes';
import {notesOverPictures, outsidePicturesClip, picturesClip} from '@/lib/scribble/pictures';
import {liftPen, movePen, penIsDry, startPen, strokePath, type Pen, type Point} from '@/lib/scribble/points';
import {inkLevel} from '@/lib/scribble/supply';
import {cn} from '@/lib/utils';

export const INK_WIDTH = 0.05;

const INK_STROKE_CLASSES: Readonly<Record<InkColour, string>> = Object.freeze({
  red: 'stroke-scribble-red',
  blue: 'stroke-scribble-blue',
  contrast: 'stroke-scribble-contrast',
});

const INK_TINT_CLASSES: Readonly<Record<InkColour, string | undefined>> = Object.freeze({
  red: 'stroke-scribble-red',
  blue: 'stroke-scribble-blue',
  contrast: undefined,
});

const NO_PICTURES: readonly Box[] = Object.freeze([]);
const PAINT_LAYER_ATTRIBUTE = 'data-scribble-paint';

interface InkPaintProps {
  readonly clip: string;
  readonly blend?: 'mix-blend-difference' | 'mix-blend-color';
  readonly strokeClass: (colour: InkColour) => string | undefined;
  readonly notes: readonly Note[];
  readonly surface: Surface;
}

const InkPaint = memo(function InkPaint({clip, blend, strokeClass, notes, surface}: InkPaintProps) {
  return (
    <div
      aria-hidden="true"
      data-html2canvas-ignore
      {...{[PAINT_LAYER_ATTRIBUTE]: ''}}
      className={cn('pointer-events-none absolute inset-0 z-30', blend)}
      style={{clipPath: clip}}
    >
      <svg className="absolute inset-0 h-full w-full fill-none [stroke-linecap:round] [stroke-linejoin:round]" strokeWidth={INK_WIDTH}>
        {notes.map((note, index) => {
          const origin = originOf(surface, note.anchor);
          if (!origin) return null;
          return (
            <g key={index} transform={`translate(${origin.x} ${origin.y}) scale(${origin.unit})`}>
              {note.strokes.map((stroke, strokeIndex) => (
                <path key={strokeIndex} d={strokePath(stroke.points)} className={strokeClass(stroke.colour)}/>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
});

const solidStroke = (colour: InkColour) => INK_STROKE_CLASSES[colour];
const negativeStroke = () => 'stroke-white';
const tintStroke = (colour: InkColour) => INK_TINT_CLASSES[colour];

function inPaintLayer(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(`[${PAINT_LAYER_ATTRIBUTE}]`) != null;
}

interface LiveStroke {
  readonly pointerId: number;
  readonly pen: Pen;
  readonly unit: number;
  readonly colour: InkColour;
  readonly surface: Surface;
}

function capturePointer(layer: Element, pointerId: number) {
  try {
    layer.setPointerCapture(pointerId);
  } catch {
    return;
  }
}

export function ScribbleLayer() {
  const isZenMode = useZenMode();
  const {on, notes} = useScribble();
  return notes.length > 0 || (isZenMode && on) ? <ScribbleInk/> : null;
}

function ScribbleInk() {
  const isZenMode = useZenMode();
  const {on: penOn, colour, notes, spent} = useScribble();
  const on = penOn && isZenMode;
  const {tiers, labelPosition, showLabels} = useTierContext();
  const stage = useActiveStage();
  const rankingOrder = useRankingOrder();
  const layerRef = useRef<SVGSVGElement>(null);
  const livePathRef = useRef<SVGPathElement>(null);
  const liveRef = useRef<LiveStroke | null>(null);
  const drawLivePath = useCallback((path: string) => {
    livePathRef.current?.setAttribute('d', path);
  }, []);
  const [surface, setSurface] = useState<Surface>(EMPTY_SURFACE);

  const measure = useCallback((): Surface => {
    const layer = layerRef.current;
    if (!layer) return EMPTY_SURFACE;
    const next = measureSurface(layer);
    setSurface((current) => sameSurface(current, next) ? current : next);
    return next;
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, tiers, labelPosition, showLabels, stage, rankingOrder, notes]);

  useEffect(() => {
    const layer = layerRef.current;
    const area = layer?.parentElement;
    if (!layer || !area) return;
    const remeasure = () => flushSync(() => {
      measure();
    });
    let dragging = area.querySelector('[data-dragging]') !== null;
    const remeasureAtRest = () => {
      if (!dragging) remeasure();
    };
    const resizes = new ResizeObserver(remeasureAtRest);
    resizes.observe(area);
    const drags = new MutationObserver(() => {
      dragging = area.querySelector('[data-dragging]') !== null;
      remeasureAtRest();
    });
    drags.observe(area, {attributes: true, attributeFilter: ['data-dragging'], subtree: true});
    const changes = new MutationObserver((records) => {
      if (dragging || records.every((record) => layer.contains(record.target) || inPaintLayer(record.target))) return;
      remeasure();
    });
    changes.observe(area, {attributes: true, childList: true, characterData: true, subtree: true});
    const pageChanges = new MutationObserver(remeasure);
    pageChanges.observe(document.documentElement, {attributes: true});
    let frame = 0;
    const remeasureOnNextFrame = () => {
      if (frame || dragging) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        remeasureAtRest();
      });
    };
    area.addEventListener('scroll', remeasureAtRest, {capture: true, passive: true});
    area.addEventListener('transitionend', remeasureOnNextFrame);
    window.addEventListener('resize', remeasure);
    document.fonts?.addEventListener('loadingdone', remeasure);
    return () => {
      resizes.disconnect();
      drags.disconnect();
      changes.disconnect();
      pageChanges.disconnect();
      cancelAnimationFrame(frame);
      area.removeEventListener('scroll', remeasureAtRest, {capture: true});
      area.removeEventListener('transitionend', remeasureOnNextFrame);
      window.removeEventListener('resize', remeasure);
      document.fonts?.removeEventListener('loadingdone', remeasure);
    };
  }, [measure]);

  const finish = useCallback((last: Point | null) => {
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    const layer = layerRef.current;
    const pen = last ? liftPen(live.pen, last) : live.pen;
    const points = pen.kept.map((point) => ({x: point.x * live.unit, y: point.y * live.unit}));
    writeScribbleNotes(addStroke(getInkNotes(), layer ? measureSurface(layer) : live.surface, live.colour, points));
    drawLivePath('');
    if (layer?.hasPointerCapture(live.pointerId)) layer.releasePointerCapture(live.pointerId);
  }, [drawLivePath]);

  useEffect(() => {
    if (!on) finish(null);
  }, [on, finish]);
  useEffect(() => () => finish(null), [finish]);

  const pointOf = (event: React.PointerEvent, unit: number): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return {x: (event.clientX - box.left) / unit, y: (event.clientY - box.top) / unit};
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!on || liveRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const {left} = inkLevel(spent);
    if (left === 0) return;
    event.preventDefault();
    const measured = measure();
    const pen = startPen(pointOf(event, measured.unit), left);
    liveRef.current = {pointerId: event.pointerId, pen, unit: measured.unit, colour, surface: measured};
    capturePointer(event.currentTarget, event.pointerId);
    setInkBeingDrawn(pen.kept.length);
    drawLivePath(strokePath(pen.kept));
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const live = liveRef.current;
    if (!live || event.pointerId !== live.pointerId) return;
    const point = pointOf(event, live.unit);
    const pen = movePen(live.pen, point);
    if (pen.kept.length !== live.pen.kept.length) setInkBeingDrawn(pen.kept.length);
    liveRef.current = {...live, pen};
    if (penIsDry(pen)) {
      finish(null);
      return;
    }
    drawLivePath(strokePath([...pen.kept, point]));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const live = liveRef.current;
    if (live && event.pointerId === live.pointerId) finish(pointOf(event, live.unit));
  };

  const onPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerId === liveRef.current?.pointerId) finish(null);
  };

  const pictures = surface.pictures ?? NO_PICTURES;
  const overPictures = useMemo(() => picturesClip(pictures), [pictures]);
  const outsidePictures = useMemo(() => outsidePicturesClip(pictures), [pictures]);
  const notesOnPictures = useMemo(() => notesOverPictures(notes, surface, pictures, INK_WIDTH), [notes, surface, pictures]);
  return (
    <>
      <InkPaint clip={outsidePictures} strokeClass={solidStroke} notes={notes} surface={surface}/>
      {notesOnPictures.length > 0 && (
        <>
          <InkPaint clip={overPictures} blend="mix-blend-difference" strokeClass={negativeStroke} notes={notesOnPictures} surface={surface}/>
          <InkPaint clip={overPictures} blend="mix-blend-color" strokeClass={tintStroke} notes={notesOnPictures} surface={surface}/>
        </>
      )}
      <svg
        ref={layerRef}
        role="group"
        aria-label={`Scribbles: ${notesText(notes.length)}`}
        data-html2canvas-ignore
        className={cn(
          'absolute inset-0 z-30 h-full w-full fill-none [stroke-linecap:round] [stroke-linejoin:round]',
          on ? 'cursor-crosshair touch-none select-none' : 'pointer-events-none',
        )}
        strokeWidth={INK_WIDTH}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
      >
        <g className="opacity-0">
          {notes.map((note, index) => {
            const origin = originOf(surface, note.anchor);
            if (!origin) return null;
            return (
              <g
                key={index}
                role="img"
                aria-label={`Note ${index + 1} ${anchorPhrase(note.anchor, tiers)}`}
                transform={`translate(${origin.x} ${origin.y}) scale(${origin.unit})`}
              >
                {note.strokes.map((stroke, strokeIndex) => (
                  <path key={strokeIndex} d={strokePath(stroke.points)} className={INK_STROKE_CLASSES[stroke.colour]}/>
                ))}
              </g>
            );
          })}
        </g>
        <path ref={livePathRef} aria-hidden="true" transform={`scale(${surface.unit})`} className={INK_STROKE_CLASSES[colour]}/>
      </svg>
    </>
  );
}
