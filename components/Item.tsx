import React from 'react';
import Image from 'next/image';

export interface ItemProps {
  id: string;
  content: string;
  imageUrl?: string;
}

const Item: React.FC<ItemProps> = ({content, imageUrl}) => {
  return (
    <div className="flex flex-col items-center justify-center w-12 h-12 overflow-hidden">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={content}
          width={128}
          height={128}
          objectFit="cover"
        />
      ) : (
        <span className="text-center">{content}</span>
      )}
    </div>
  );
};

export default Item;
