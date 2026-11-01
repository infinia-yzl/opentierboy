'use client';

import React from 'react';
import {useActiveStage} from '@/components/useZenLayout';
import {OVERLAY_GREEN, stageVariables} from '@/lib/zen/layouts';
import {cn} from '@/lib/utils';

/**
 * The frame of Zen's creator layouts (owner decision, 2026-10-31): Zen 16:9 for recording at
 * 1920 x 1080, Zen 9:16 for Shorts and TikTok at 1080 x 1920, and the stream overlay over a
 * green key.
 *
 * It covers the window. At the top centre, a strip holds the Zen bar, so the bar never covers
 * the list (owner decisions, 2026-11-01); under it, a frame of the layout's aspect ratio, centred
 * in the space left. The strip and the frame together are as large as the window allows. The
 * cover is a size container, and the frame's style holds every size of the layout as a CSS
 * variable in frame pixels, from its container units (lib/zen/layouts.ts, stageVariables); the
 * components inside take them through the `stage:` variant (app/globals.css). The editor inside
 * is the same editor, with the same Zen bar and Up next tray: one design for one thing. A list
 * longer than the frame scrolls inside the cover: in 16:9 only the Unranked tray scrolls, and
 * the frame keeps its size (owner decision, 2026-11-01).
 *
 * In the editor's own Zen and outside Zen the wrappers are `display: contents`, so the bar and
 * the editor keep their places in the page. The elements are the same in every layout, so
 * nothing mounts again when the layout changes (the bar and its menus, the editor).
 */
export function ZenStage({bar, children}: {bar: React.ReactNode; children: React.ReactNode}) {
  const stage = useActiveStage();
  if (!stage) {
    return (
      <div className="contents">
        <div className="contents">
          <div className="contents">{bar}</div>
          <div className="contents">{children}</div>
        </div>
      </div>
    );
  }
  return (
    // The cover: a size container, so a frame pixel follows the space the cover has.
    <div data-zen-stage={stage} className="fixed inset-0 z-40 overflow-hidden [container-type:size]" style={stageVariables(stage)}>
      <div
        className={cn('absolute inset-0 flex flex-col overflow-x-hidden overflow-y-auto text-foreground', stage !== 'overlay' && 'bg-background')}
        style={stage === 'overlay' ? {backgroundColor: OVERLAY_GREEN} : undefined}
      >
        <div className="flex h-(--stage-strip) w-full shrink-0 items-center justify-center">{bar}</div>
        <div
          role="region"
          aria-label={`Frame ${stage === 'tall' ? '9:16' : '16:9'}`}
          className={cn(
            'relative mx-auto mb-auto flex shrink-0 flex-col w-(--stage-frame-width) min-h-(--stage-frame-height)',
            // 16:9 keeps its size for recording: a long Unranked tray scrolls inside it.
            stage === 'wide' && 'h-(--stage-frame-height)',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
