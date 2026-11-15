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
        <Skeleton className="h-12 w-48"/>

        <div className="flex space-x-2">
          <Skeleton className="h-10 w-10"/>
          <Skeleton className="h-10 w-10"/>
          <Skeleton className="h-10 w-10"/>
        </div>

        <div className="flex flex-col space-y-1 items-center">
          <Skeleton className="h-4 w-16"/>
          <Skeleton className="h-4 w-28"/>
        </div>

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
