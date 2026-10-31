import React, {useCallback, memo} from 'react';
import Image from 'next/image';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {TrashIcon} from "@radix-ui/react-icons";
import Item from "@/models/Item";
import {useDeviceImage, useLinkImage} from "@/contexts/CustomImagesContext";
import {itemDisplayLabel} from "@/lib/images/listImages";
import {tileClassName, tileSize} from "@/lib/tileSize";
import {useCompactTiles, usePageScrolling, useZenMode} from "@/components/usePageState";
import {useActiveStage} from "@/components/useZenLayout";

interface ItemTileProps extends Item {
  onDelete?: (id: string) => void;
  showLabel?: boolean;
}

const ItemTile: React.FC<ItemTileProps> = memo(({
  id,
  content,
  imageUrl,
  source,
  url,
  shape,
  onDelete = () => {
  },
  showLabel = true,
}) => {
  const item: Item = {id, content, imageUrl, source, url};
  const link = useLinkImage(item);
  const device = useDeviceImage(item);
  // Link images: a plain <img> (never the image optimizer, A8) once the site is allowed and the
  // image passed its check; until then, and when it fails, a label tile with the site's name.
  const linkSrc = link?.status === 'ready' ? link.src : undefined;
  // Uploads: the image from the device store (a blob: URL). The placeholder until it is loaded
  // or when this browser does not have it; a label tile when the store removed it for room.
  const deviceSrc = device?.status === 'ready' ? device.url : undefined;
  const tileImageUrl = link ? undefined : device?.status === 'evicted' ? undefined : deviceSrc ?? imageUrl;
  const domain = link?.domain ?? '';
  const label = itemDisplayLabel(item);
  // Tiles render at their shape (square, landscape or portrait), all with the same height.
  const size = tileSize({shape});

  // One listener for the whole page, shared by every tile (components/usePageState.ts).
  const isZenMode = useZenMode();
  const isScrolling = usePageScrolling();
  // Compact tiles show the name only in a tag on hover; a frame layout has its own sizes.
  const compactTiles = useCompactTiles();
  const stage = useActiveStage();
  const isCompact = compactTiles && stage === null;

  const handleDelete = useCallback(() => onDelete(id), [id, onDelete]);

  // Compact tiles (the dense editor) show the name only on hover or keyboard focus, in a tag
  // under the tile; the tile then lets the tag out of its box.
  const tileContent = (
    <div className={`group/tile relative ${tileClassName({shape})} overflow-hidden compact:overflow-visible`}
         title={domain ? `Image from ${domain}` : undefined}>
      {linkSrc || tileImageUrl ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            {linkSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- link images never go through the image optimizer (A8)
              <img
                src={linkSrc}
                alt={label}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                data-link-image={linkSrc}
                className="w-full h-full object-contain"
              />
            ) : (
              <Image
                src={tileImageUrl as string}
                alt={label}
                fill
                sizes={size.sizes}
                style={{
                  objectFit: "contain"
                }}
                unoptimized={tileImageUrl?.startsWith('blob:')}
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN8Vw8AAmEBb87E6jIAAAAASUVORK5CYII="
              />
            )}
          </div>
          {showLabel && !isCompact && (
            // The label background is a plain rgb() value: "Original html2canvas" (Freeze Frame)
            // cannot read the oklab() colour that Tailwind 4 writes for bg-black/30.
            <div
              className={`absolute bottom-0 left-0 right-0 bg-[rgb(0_0_0/0.3)] ${
                isScrolling ? '' : 'tile-label-blur backdrop-blur-xs will-change-transform transform-gpu'
              }  p-1 stage:p-[calc(var(--stage-label)*0.25)] transition-all ease-in-out compact:hidden`}
            >
              <span
                className="text-[9px] stage:text-(length:--stage-label) stage:font-semibold leading-tight text-white block mb-0.5 text-center"
              >
                {label}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full overflow-hidden text-sm compact:text-[9px] compact:leading-tight stage:text-(length:--stage-label) text-center break-words">
          <span>{label}</span>
          {domain && domain !== label && <span className="text-[9px] leading-tight text-muted-foreground">{domain}</span>}
        </div>
      )}
      {isCompact && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover/tile:block in-focus-visible:block"
        >
          {label}
        </span>
      )}
    </div>
  );

  if (isZenMode) {
    return tileContent;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{tileContent}</ContextMenuTrigger>
      <ContextMenuContent>
        {domain && (
          <>
            <ContextMenuLabel className="text-xs font-normal text-muted-foreground">Image from {domain}</ContextMenuLabel>
            <ContextMenuSeparator/>
          </>
        )}
        <ContextMenuItem
          onClick={handleDelete}
          className="dark:focus:bg-destructive dark:focus:text-primary focus:text-destructive"
        >
          <TrashIcon className="mr-2 h-4 w-4"/>
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

ItemTile.displayName = 'ItemTile';

export default ItemTile;
