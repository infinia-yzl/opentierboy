import React, {useState, useEffect, useCallback, memo, useRef} from 'react';
import Image from 'next/image';
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu";
import {TrashIcon} from "@radix-ui/react-icons";
import Item from "@/models/Item";

interface ItemTileProps extends Item {
  onDelete?: (id: string) => void;
  showLabel?: boolean;
}

const ItemTile: React.FC<ItemTileProps> = memo(({
  id,
  content,
  imageUrl,
  onDelete = () => {
  },
  showLabel = true,
}) => {
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
    <div className="relative w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 overflow-hidden rounded-md">
      {imageUrl ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            <Image
              src={imageUrl}
              alt={content}
              fill
              sizes="(max-width: 640px) 64px, (max-width: 768px) 80px, 96px"
              style={{
                objectFit: "cover"
              }}
              placeholder="blur"
              blurDataURL={imageUrl}
            />
          </div>
          {showLabel && (
            <div
              className={`absolute bottom-0 left-0 right-0 bg-black bg-opacity-30  ${
                isScrolling ? '' : 'backdrop-blur-sm will-change-transform transform-gpu'
              }  p-1 transition-all duration-180 ease-in-out`}
            >
              <span
                className="text-[9px] leading-tight text-white block mb-0.5 text-center"
              >
                {content}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-sm">
          {content}
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
