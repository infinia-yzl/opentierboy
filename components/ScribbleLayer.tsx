'use client';

import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {useTierContext} from '@/contexts/TierContext';
import {useZenMode} from '@/components/usePageState';
import {useActiveStage} from '@/components/useZenLayout';
import {useRankingOrder} from '@/components/useRankingOrder';
import {getScribble, setInkBeingDrawn, setScribbleNotes, useScribble} from '@/components/useScribble';
import {measureSurface, sameSurface} from '@/components/scribbleSurface';
import {EMPTY_SURFACE, originOf, type Surface} from '@/lib/scribble/anchors';
import type {InkColour} from '@/lib/scribble/colours';
import {anchorPhrase, notesText} from '@/lib/scribble/names';
import {addStroke} from '@/lib/scribble/notes';
import {liftPen, movePen, penIsDry, startPen, strokePath, type Pen, type Point} from '@/lib/scribble/points';
import {inkLevel} from '@/lib/scribble/supply';
import {cn} from '@/lib/utils';

export const INK_WIDTH = 0.05;

const INK_STROKE_CLASSES: Readonly<Record<InkColour, string>> = Object.freeze({
  red: 'stroke-scribble-red',
  blue: 'stroke-scribble-blue',
  contrast: 'stroke-scribble-contrast',
});

interface LiveStroke {
  readonly pointerId: number;
  readonly pen: Pen;
  readonly unit: number;
  readonly colour: InkColour;
  readonly surface: Surface;
}

export function ScribbleLayer() {
  const isZenMode = useZenMode();
  const {on, notes} = useScribble();
  return isZenMode && (on || notes.length > 0) ? <ScribbleInk/> : null;
}

function ScribbleInk() {
  const {on, colour, notes} = useScribble();
  const {tiers, labelPosition, showLabels} = useTierContext();
  const stage = useActiveStage();
  const rankingOrder = useRankingOrder();
  const layerRef = useRef<SVGSVGElement>(null);
  const livePathRef = useRef<SVGPathElement>(null);
  const liveRef = useRef<LiveStroke | null>(null);
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
    const resizes = new ResizeObserver(remeasure);
    resizes.observe(area);
    const changes = new MutationObserver((records) => {
      if (records.every((record) => layer.contains(record.target)) || area.querySelector('[data-dragging]')) return;
      remeasure();
    });
    changes.observe(area, {attributes: true, childList: true, characterData: true, subtree: true});
    const pageChanges = new MutationObserver(remeasure);
    pageChanges.observe(document.documentElement, {attributes: true});
    let frame = 0;
    const remeasureOnNextFrame = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!area.querySelector('[data-dragging]')) remeasure();
      });
    };
    area.addEventListener('scroll', remeasure, {capture: true, passive: true});
    area.addEventListener('transitionend', remeasureOnNextFrame);
    window.addEventListener('resize', remeasure);
    document.fonts?.addEventListener('loadingdone', remeasure);
    return () => {
      resizes.disconnect();
      changes.disconnect();
      pageChanges.disconnect();
      cancelAnimationFrame(frame);
      area.removeEventListener('scroll', remeasure, {capture: true});
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
    setScribbleNotes(addStroke(getScribble().notes, layer ? measureSurface(layer) : live.surface, live.colour, points));
    livePathRef.current?.setAttribute('d', '');
    if (layer?.hasPointerCapture(live.pointerId)) layer.releasePointerCapture(live.pointerId);
  }, []);

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
    const {left} = inkLevel(getScribble().spent);
    if (left === 0) return;
    event.preventDefault();
    const measured = measure();
    const pen = startPen(pointOf(event, measured.unit), left);
    liveRef.current = {pointerId: event.pointerId, pen, unit: measured.unit, colour, surface: measured};
    event.currentTarget.setPointerCapture(event.pointerId);
    setInkBeingDrawn(pen.kept.length);
    livePathRef.current?.setAttribute('d', strokePath(pen.kept));
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
    livePathRef.current?.setAttribute('d', strokePath([...pen.kept, point]));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const live = liveRef.current;
    if (live && event.pointerId === live.pointerId) finish(pointOf(event, live.unit));
  };

  const onPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerId === liveRef.current?.pointerId) finish(null);
  };

  return (
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
      <path ref={livePathRef} aria-hidden="true" transform={`scale(${surface.unit})`} className={INK_STROKE_CLASSES[colour]}/>
    </svg>
  );
}
