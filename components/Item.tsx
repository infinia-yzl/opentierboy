import React from 'react';
import Image from 'next/image';

export interface ItemProps {
  id: string;
  content: string;
  imageUrl?: string;
}

const Item: React.FC<ItemProps> = ({content, imageUrl}) => {
  return (
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
  );
};

export default Item;
