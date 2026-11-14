'use client';

import React, {useMemo} from 'react';
import dynamic from 'next/dynamic';
import {usePathname} from 'next/navigation';
import imagesetConfig from '@/imageset.config.json';
import type ImageSetConfig from '@/models/ImageSet';
import {rankItemSet, rankItemSetTitle, rankSegments} from '@/lib/rankRoute';
import {gameColourKey} from '@/lib/appearance';
import {GameColours} from '@/components/GameColours';
import {Skeleton} from '@/components/ui/skeleton';

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

const TierListManager = dynamic(
  () => import('@/components/TierListManager'),
  {
    loading: () => (
      <div className="space-y-4 w-full flex flex-col items-center">
        {/* Title */}
        <Skeleton className="h-12 w-48"/>

        {/* Buttons */}
        <div className="flex space-x-2">
          <Skeleton className="h-10 w-10"/>
          <Skeleton className="h-10 w-10"/>
          <Skeleton className="h-10 w-10"/>
        </div>

        {/* Help Text */}
        <div className="flex flex-col space-y-1 items-center">
          <Skeleton className="h-4 w-16"/>
          <Skeleton className="h-4 w-28"/>
        </div>

        {/* Tier List */}
        <Skeleton className="h-12 w-1/2"/>
        <Skeleton className="h-12 w-1/2"/>
        <Skeleton className="h-12 w-1/2"/>
        <Skeleton className="h-12 w-1/2"/>
        <Skeleton className="h-12 w-1/2"/>
        <Skeleton className="h-12 w-1/2"/>
      </div>
    ),
  }
);

/**
 * The editor of a /rank page (app/rank/layout.tsx). The template comes from the path and the
 * image-set config, the list from the link (contexts/TierContext.tsx), so the server's copy and
 * the browser start from the same address. Another path starts a new editor, as another page did.
 */
export function RankEditor() {
  const pathname = usePathname();
  const segments = useMemo(() => rankSegments(pathname) ?? [], [pathname]);
  const editorKey = segments.join('/');
  const itemSet = useMemo(() => rankItemSet(typedImageSetConfig, segments), [segments]);

  return (
    <>
      <GameColours gameKey={gameColourKey(itemSet?.packageName)}/>
      <TierListManager key={editorKey} initialItemSet={itemSet ?? undefined} title={rankItemSetTitle(itemSet)}/>
    </>
  );
}
