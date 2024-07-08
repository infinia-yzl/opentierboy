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

    // Check initial state
    checkZenMode();

    // Set up a MutationObserver to watch for changes to the class on the html element
    const observer = new MutationObserver(checkZenMode);
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});

    // Cleanup
    return () => observer.disconnect();
  }, []);

  const tileContent = (
    <div
      className="relative flex flex-col items-center justify-center text-center w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 overflow-hidden"
    >
      {imageUrl ? (
        <>
          <Image
            src={imageUrl}
            alt={content}
            width={128}
            height={128}
            style={{
              objectFit: 'cover',
            }}
          />
          <div
            className={`absolute bottom-0 left-0 right-0 p-0.5 bg-black bg-opacity-30 backdrop-blur-sm
                        transition-opacity duration-180 ease-in-out
                        ${showLabel ? 'opacity-100' : 'opacity-0'}`}
          >
            <span className="text-[8px] leading-tight text-white block truncate">{content}</span>
          </div>
        </>
      ) : (
        <div className="m-4 p-4">{content}</div>
      )}
    </div>
  );

  if (isZenMode) {
    return tileContent;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        {tileContent}
      </ContextMenuTrigger>
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
