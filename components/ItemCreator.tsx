"use client";

import React, {useCallback, useRef, useState} from 'react'
import {zodResolver} from "@hookform/resolvers/zod"
import {useForm} from "react-hook-form"
import * as z from "zod"
import {Button} from "@/components/ui/button"
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,} from "@/components/ui/form"
import {Input} from "@/components/ui/input"
import Image from 'next/image'
import Item from "@/models/Item";
import {useTierContext} from "@/contexts/TierContext";

const formSchema = z.object({
  files: z.any().refine((files) => files?.length > 0, "At least one file is required."),
})

interface ItemCreatorProps {
  onItemsCreate: (items: Item[]) => void;
}

interface UploadedItem {
  id: string;
  content: string;
  imageUrl: string;
}

const generateId = () => Math.random().toString(36).slice(2, 11);

const ItemCreator: React.FC<ItemCreatorProps> = ({onItemsCreate}) => {
  const {tierCortex, tiers} = useTierContext();

  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate current and projected custom image count for sharing warnings
  const currentCustomImageCount = tiers.reduce((count, tier) => 
    count + tier.items.filter(item => tierCortex.isCustomItem(item.id)).length, 0
  );
  const projectedCustomImageCount = currentCustomImageCount + uploadedItems.length;

  // Get sharing warning info
  const getSharingWarning = () => {
    if (projectedCustomImageCount === 0) {
      return null;
    } else if (projectedCustomImageCount <= 3) {
      return { level: 'info', message: `${projectedCustomImageCount} custom images - good for sharing` };
    } else if (projectedCustomImageCount <= 5) {
      return { level: 'warning', message: `${projectedCustomImageCount} custom images - limited compatibility` };
    } else {
      return { 
        level: 'error', 
        message: `${projectedCustomImageCount} custom images - URLs may break` 
      };
    }
  };

  const sharingWarning = getSharingWarning();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      files: undefined,
    },
  })

  const onSubmit = useCallback((values: z.infer<typeof formSchema>) => {
    if (values.files && values.files.length > 0) {
      tierCortex.addCustomItems(uploadedItems);
      onItemsCreate(uploadedItems);

      setUploadedItems([]);
      form.reset();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [tierCortex, uploadedItems, onItemsCreate, form]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      form.setValue('files', files);
      const newItems = Array.from(files).map(file => ({
        id: generateId(),
        content: file.name.split('.')[0],
        imageUrl: URL.createObjectURL(file)
      }));
      setUploadedItems(newItems);
    }
  };

  const handleNameChange = (id: string, newName: string) => {
    setUploadedItems((prev) =>
      prev.map((item) => (item.id === id ? {...item, content: newName} : item))
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col overflow-y-hidden">
        <FormField
          control={form.control}
          name="files"
          render={({field}) => (
            <FormItem>
              <FormLabel>Upload Images</FormLabel>
              <FormControl>
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={fileInputRef}
                  onChange={(e) => {
                    field.onChange(e);
                    handleFileChange(e);
                  }}
                />
              </FormControl>
              <FormDescription>
                Choose multiple image files to create new items.
              </FormDescription>
              {sharingWarning && (
                <div className={`p-3 rounded-lg text-sm mt-2 border ${
                  sharingWarning.level === 'info' ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' :
                  sharingWarning.level === 'warning' ? 'bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800' :
                  'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-start space-x-2">
                    <span className="text-base">
                      {sharingWarning.level === 'info' ? 'ℹ️' :
                       sharingWarning.level === 'warning' ? '⚠️' : '🚨'}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">Sharing Impact</div>
                      <div className="mt-1">{sharingWarning.message}</div>
                    </div>
                  </div>
                </div>
              )}
              <FormMessage/>
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 overflow-y-auto pe-6">
          {uploadedItems.map((item) => (
            <div key={item.id} className="space-y-2">
              <div className="w-28 h-28 relative">
                <Image src={item.imageUrl} alt={item.content} style={{objectFit: 'cover'}} fill
                />
              </div>
              <Input
                type="text"
                value={item.content}
                onChange={(e) => handleNameChange(item.id, e.target.value)}
                placeholder="Item name"
              />
            </div>
          ))}
        </div>
        <div className="pt-4">
          <Button type="submit" disabled={uploadedItems.length === 0}>
            Add {uploadedItems.length} Item{uploadedItems.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export default ItemCreator;
