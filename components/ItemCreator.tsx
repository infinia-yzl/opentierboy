"use client";
import React, {useState, useCallback} from 'react';
import Image from 'next/image';
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

interface ItemCreatorProps {
  onItemCreate: (item: { content: string; imageUrl?: string }) => Promise<void>;
}

const ItemCreator: React.FC<ItemCreatorProps> = ({onItemCreate}) => {
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleContentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
  };

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content) {
      await onItemCreate({content, imageUrl: imageUrl || undefined});
      setContent('');
      setImageUrl(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="text"
          value={content}
          onChange={handleContentChange}
          placeholder="Enter item name"
          className="w-full p-2 border rounded"
        />
      </div>
      <div>
        <Input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="w-full p-2 border rounded"
        />
      </div>
      {imageUrl && (
        <div className="w-24 h-24">
          <Image src={imageUrl} alt="Preview" width={96} height={96} objectFit="cover"/>
        </div>
      )}
      <Button type="submit" className="px-4 py-2">
        Create Item
      </Button>
    </form>
  );
};

export default ItemCreator;
