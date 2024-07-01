import React from 'react';
import Image from 'next/image';
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from "@/components/ui/context-menu";
import {TrashIcon} from "@radix-ui/react-icons";

export interface ItemProps {
  id: string;
  content: string;
  imageUrl?: string;
  onDelete?: (id: string) => void;
}

const Item: React.FC<ItemProps> = ({
  id,
  content,
  imageUrl,
  onDelete = () => {
  },
}) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="flex flex-col items-center justify-center text-center w-16 h-16 overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={content}
              width={128}
              height={128}
              objectFit="cover"
            />
          ) : (
            <div className="m-4 p-4">{content}</div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onDelete(id)}>
          <TrashIcon className="mr-2 h-4 w-4"/>
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default Item;
