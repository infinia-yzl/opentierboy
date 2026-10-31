'use client';

import React from 'react';
import {useActiveStage, useZenLayout} from '@/components/useZenLayout';
import {OVERLAY_GREEN, stageVariables} from '@/lib/zen/layouts';
import {cn} from '@/lib/utils';

/**
 * The frame of Zen's creator layouts (owner decision, 2026-10-31): Zen 16:9 for recording at
 * 1920 x 1080, Zen 9:16 for Shorts and TikTok at 1080 x 1920, and the stream overlay for OBS.
 *
 * It covers the window, and holds a frame of the layout's aspect ratio, as large as the window
 * allows and centred. The frame's style holds every size of the layout as a CSS variable in
 * frame pixels (lib/zen/layouts.ts, stageVariables); the components inside take them through the
 * `stage:` variant (app/globals.css). The editor inside is the same editor, with the same Zen bar
 * and Up next tray: one design for one thing. The frame grows taller when a list needs it, and
 * then scrolls.
 *
 * Behind the overlay's panel: the green key (for a chroma key filter on a window capture), or
 * nothing at all (for an OBS browser source; the page's own background is off too, see
 * app/globals.css). Outside a frame layout the two wrappers are `display: contents`, so the
 * editor keeps its place in the page and nothing mounts again when the layout changes.
 */
export function ZenStage({children}: {children: React.ReactNode}) {
  const stage = useActiveStage();
  const {background} = useZenLayout();
  if (!stage) {
    return (
      <div className="contents">
        <div className="contents">{children}</div>
      </div>
    );
  }
  const keyed = stage === 'overlay';
  return (
    <div
      data-zen-stage={stage}
      className={cn(
        'fixed inset-0 z-40 flex overflow-x-hidden overflow-y-auto text-foreground',
        !keyed && 'bg-background',
      )}
      style={{
        ...stageVariables(stage),
        ...(keyed && background === 'green' ? {backgroundColor: OVERLAY_GREEN} : {}),
      }}
    >
      <div
        role="region"
        aria-label={`Frame ${stage === 'tall' ? '9:16' : '16:9'}`}
        className="relative m-auto flex shrink-0 flex-col w-(--stage-frame-width) min-h-(--stage-frame-height)"
      >
        {children}
      </div>
    </div>
  );
}
