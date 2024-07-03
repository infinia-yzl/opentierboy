import React from 'react';
import Image from 'next/image';
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu";
import {TrashIcon} from "@radix-ui/react-icons";

export interface ItemProps {
  id: string;
  content: string;
  imageUrl?: string;
  onDelete?: (id: string) => void;
  showLabel?: boolean;
}

const Item: React.FC<ItemProps> = ({
  id,
  content,
  imageUrl,
  onDelete = () => {
  },
  showLabel = true,
}) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="relative flex flex-col items-center justify-center text-center w-16 h-16 overflow-hidden">
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
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onDelete(id)}
                         className="dark:focus:bg-destructive dark:focus:text-primary focus:text-destructive"
        >
          <TrashIcon className="mr-2 h-4 w-4"/>
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default Item;
