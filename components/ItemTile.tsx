import React, {useState, useEffect, useCallback, memo, useRef} from 'react';
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
import {tileSize} from "@/lib/tileSize";

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

  const [isZenMode, setIsZenMode] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkZenMode = () => {
      setIsZenMode(document.documentElement.classList.contains('zen-mode'));
    };

    checkZenMode();
    const observer = new MutationObserver(checkZenMode);
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});

    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 450);
    };

    window.addEventListener('scroll', handleScroll, {passive: true});

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleDelete = useCallback(() => onDelete(id), [id, onDelete]);

  const tileContent = (
    <div className={`relative ${size.className} overflow-hidden rounded-md`}
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
          {showLabel && (
            // The label background is a plain rgb() value: "Original html2canvas" (Freeze Frame)
            // cannot read the oklab() colour that Tailwind 4 writes for bg-black/30.
            <div
              className={`absolute bottom-0 left-0 right-0 bg-[rgb(0_0_0/0.3)] ${
                isScrolling ? '' : 'backdrop-blur-xs will-change-transform transform-gpu'
              }  p-1 transition-all ease-in-out`}
            >
              <span
                className="text-[9px] leading-tight text-white block mb-0.5 text-center"
              >
                {label}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-sm text-center break-words">
          <span>{label}</span>
          {domain && domain !== label && <span className="text-[9px] leading-tight text-muted-foreground">{domain}</span>}
        </div>
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
