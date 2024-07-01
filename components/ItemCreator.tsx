"use client";

import React, {useState} from 'react'
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

const formSchema = z.object({
  files: z.any().refine((files) => files?.length > 0, "At least one file is required."),
})

interface ItemCreatorProps {
  onItemsCreate: (items: { content: string; imageUrl: string }[]) => Promise<void>;
}

interface UploadedItem {
  id: string;
  content: string;
  imageUrl: string;
}

const ItemCreator = ({onItemsCreate}: ItemCreatorProps) => {
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      files: undefined,
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (uploadedItems.length > 0) {
      onItemsCreate(uploadedItems);
      setUploadedItems([]);
      form.reset();
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      form.setValue('files', files);
      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const newItem: UploadedItem = {
            id: Math.random().toString(36).substr(2, 9),
            content: file.name.split('.')[0], // Default name is file name without extension
            imageUrl: reader.result as string,
          };
          setUploadedItems((prev) => [...prev, newItem]);
        };
        reader.readAsDataURL(file);
      });
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
        <CardDescription>Upload multiple images to create new items. Edit names if needed.</CardDescription>
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
                    <Image src={item.imageUrl} alt={item.content} layout="fill" objectFit="cover"/>
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
