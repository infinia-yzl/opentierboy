"use client";

import React, {useState, useRef} from 'react'
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
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card"
import Image from 'next/image'
import {ItemProps} from "@/components/Item";

const formSchema = z.object({
  files: z.any().refine((files) => files?.length > 0, "At least one file is required."),
})

interface ItemCreatorProps {
  onItemsCreate: (items: ItemProps[]) => void;
}

interface UploadedItem {
  id: string;
  content: string;
  imageUrl: string;
}

const generateId = () => Math.random().toString(36).slice(2, 11);

const ItemCreator = ({onItemsCreate}: ItemCreatorProps) => {
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      files: undefined,
    },
  })


  function onSubmit(values: z.infer<typeof formSchema>) {
    if (values.files && values.files.length > 0) {
      // Ensure that uploadedItems correspond to the files in the form
      const filesToSubmit = Array.from(values.files as FileList).map(file => {
        const existingItem = uploadedItems.find(item => item.content === file.name.split('.')[0]) ?? {
          id: generateId(),
          content: file.name.split('.')[0],
          imageUrl: URL.createObjectURL(file)
        };
        return existingItem as ItemProps;
      });

      onItemsCreate(filesToSubmit);
      setUploadedItems([]);
      form.reset();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

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
    <Card>
      <CardHeader>
        <CardTitle>Add New Items</CardTitle>
        <CardDescription>Add your images to create new items. Edit names if needed.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent>
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
                  <div className="w-full h-40 relative">
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
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={uploadedItems.length === 0}>
              Add {uploadedItems.length} Item{uploadedItems.length !== 1 ? 's' : ''}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  )
}

export default ItemCreator;
