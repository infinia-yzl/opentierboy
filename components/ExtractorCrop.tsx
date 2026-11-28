import React from 'react';
import Image from 'next/image';
import {cn} from '@/lib/utils';
import type {Box} from '@/lib/extract/picture';
import type {Bounds} from '@/lib/extract/borders';

export type CropShape = 'as-is' | 'contain' | 'fill';

interface ExtractorCropProps {
  src: string;
  picture: Bounds;
  box: Box;
  size: number;
  shape: CropShape;
  highlight?: Box;
  className?: string;
}

export const ExtractorCrop: React.FC<ExtractorCropProps> = ({src, picture, box, size, shape, highlight, className}) => {
  const longest = Math.max(box.width, box.height);
  const scale = shape === 'fill' ? size / Math.min(box.width, box.height) : size / longest;
  const width = shape === 'fill' ? size : Math.round(box.width * scale);
  const height = shape === 'fill' ? size : Math.round(box.height * scale);
  const offsetX = shape === 'fill' ? (box.width * scale - size) / 2 : 0;
  const offsetY = shape === 'fill' ? (box.height * scale - size) / 2 : 0;
  const frame = shape === 'as-is' ? {width, height} : {width: size, height: size};
  return (
    <span
      aria-hidden="true"
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted', className)}
      style={frame}
    >
      <span className="relative block overflow-hidden" style={{width, height}}>
        <Image
          src={src}
          alt=""
          unoptimized
          draggable={false}
          width={Math.max(1, Math.round(picture.width * scale))}
          height={Math.max(1, Math.round(picture.height * scale))}
          className="absolute max-w-none select-none"
          style={{
            left: -box.x * scale - offsetX,
            top: -box.y * scale - offsetY,
            width: picture.width * scale,
            height: picture.height * scale,
          }}
        />
        {highlight && (
          <span
            className="absolute border-2 border-primary"
            style={{
              left: (highlight.x - box.x) * scale - offsetX,
              top: (highlight.y - box.y) * scale - offsetY,
              width: highlight.width * scale,
              height: highlight.height * scale,
            }}
          />
        )}
      </span>
    </span>
  );
};
