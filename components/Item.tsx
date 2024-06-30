import React from 'react';
import Image from 'next/image';

export interface ItemProps {
  id: string;
  content: string;
  imageUrl?: string;
}

const Item: React.FC<ItemProps> = ({content, imageUrl}) => {
  return (
    <div className="p-2 m-1 rounded-md flex flex-col items-center justify-center w-12 h-12 overflow-hidden">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={content}
          width={80}
          height={80}
          objectFit="cover"
          className="rounded-md"
        />
      ) : (
        <span className="text-center">{content}</span>
      )}
    </div>
  );
};

export default Item;
