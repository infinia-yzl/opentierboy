"use client";
import React, {useState, useCallback} from 'react';
import Image from 'next/image';
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Label} from "@/components/ui/label";

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
    <Card>
      <CardHeader>
        <CardTitle>
          Add a New Item
        </CardTitle>
        <CardDescription>
          Enter the name and upload an image for the new item.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={content}
                onChange={handleContentChange}
                placeholder="Enter item name"
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="image">Image</Label>
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
              />
              {imageUrl && (
                <div className="w-24 h-24">
                  <Image src={imageUrl} alt="Preview" width={96} height={96} objectFit="cover"/>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit">
            Add Item
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default ItemCreator;
