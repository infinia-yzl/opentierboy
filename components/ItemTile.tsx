import React, {useState, useEffect} from 'react';
import Image from 'next/image';
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu";
import {TrashIcon} from "@radix-ui/react-icons";
import Item from "@/models/Item";

const ItemTile: React.FC<Item> = ({
  id,
  content,
  imageUrl,
  onDelete = () => {
  },
  showLabel = true,
}) => {
  const [isZenMode, setIsZenMode] = useState(false);

  useEffect(() => {
    const checkZenMode = () => {
      setIsZenMode(document.documentElement.classList.contains('zen-mode'));
    };

    checkZenMode();
    const observer = new MutationObserver(checkZenMode);
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});

    return () => observer.disconnect();
  }, []);

  const tileContent = (
    <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 overflow-hidden rounded-md">
      {imageUrl ? (
        <>
          <div className="absolute inset-0 overflow-hidden">
            <Image
              src={imageUrl}
              alt={content}
              fill
              style={{
                objectFit: "cover"
              }}
            />
          </div>
          {showLabel && (
            <div
              className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-30 p-1 backdrop-blur-sm transition-opacity duration-180 ease-in-out"
            >
              <span
                className="text-[8px] leading-tight text-white block mb-0.5"
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
          onClick={() => onDelete(id)}
          className="dark:focus:bg-destructive dark:focus:text-primary focus:text-destructive"
        >
          <TrashIcon className="mr-2 h-4 w-4"/>
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default ItemTile;
