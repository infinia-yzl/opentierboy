"use client";

import React, {useState, useRef, useCallback} from 'react'
import {zodResolver} from "@hookform/resolvers/zod"
import {useForm} from "react-hook-form"
import * as z from "zod"
import {Button} from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {Input} from "@/components/ui/input"
import Image from 'next/image'
import {toast} from "sonner"
import Item from "@/models/Item";

const formSchema = z.object({
  files: z.any().refine((files) => files?.length > 0, "At least one file is required."),
})

interface ItemCreatorProps {
  onItemsCreate: (items: Item[]) => void;
  onUndoItemsCreate: (itemIds: string[]) => void;
}

interface UploadedItem {
  id: string;
  content: string;
  imageUrl: string;
}

const generateId = () => Math.random().toString(36).slice(2, 11);

const ItemCreator: React.FC<ItemCreatorProps> = ({onItemsCreate, onUndoItemsCreate}) => {
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      files: undefined,
    },
  })

  const onSubmit = useCallback((values: z.infer<typeof formSchema>) => {
    if (values.files && values.files.length > 0) {
      const filesToSubmit = Array.from(values.files as FileList).map(file => {
        const existingItem = uploadedItems.find(item => item.content === file.name.split('.')[0]) ?? {
          id: generateId(),
          content: file.name.split('.')[0],
          imageUrl: URL.createObjectURL(file)
        };
        return existingItem as Item;
      });

      onItemsCreate(filesToSubmit);

      toast('Items added', {
        description: `${filesToSubmit.length} item(s) have been added.`,
        action: {
          label: 'Undo',
          onClick: () => onUndoItemsCreate(filesToSubmit.map(item => item.id)),
        },
      });

      setUploadedItems([]);
      form.reset();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [uploadedItems, form, onItemsCreate, onUndoItemsCreate]);

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
      <form onSubmit={form.handleSubmit(onSubmit)}>
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
              <FormMessage/>
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
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
