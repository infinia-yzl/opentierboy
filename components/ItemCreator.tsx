"use client";

import React, {useCallback, useEffect, useRef, useState} from 'react'
import {zodResolver} from "@hookform/resolvers/zod"
import {useForm} from "react-hook-form"
import {z} from "@/lib/zod"
import {Button} from "@/components/ui/button"
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,} from "@/components/ui/form"
import {Input} from "@/components/ui/input"
import Image from 'next/image'
import Item from "@/models/Item";
import {useCustomImages} from "@/contexts/CustomImagesContext";
import {toast} from "sonner";

const formSchema = z.object({
  files: z.any().refine((files) => files?.length > 0, "At least one file is required."),
})

interface ItemCreatorProps {
  onItemsCreate: (items: Item[]) => void;
}

interface UploadedItem {
  /** Only for the preview list: the store gives each image its own id when it is added. */
  key: string;
  content: string;
  /** A blob: URL of the file, for the preview. Revoked when the preview goes away. */
  imageUrl: string;
  file: File;
}

/**
 * "From your device": the chosen files are kept in the device image store
 * (contexts/CustomImagesContext.tsx), and the list holds their ids.
 */
const ItemCreator: React.FC<ItemCreatorProps> = ({onItemsCreate}) => {
  const {addDeviceImages} = useCustomImages();

  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke preview URLs that no preview uses any more, and all of them when the dialog closes.
  const previewUrls = useRef<string[]>([]);
  useEffect(() => {
    const current = uploadedItems.map((item) => item.imageUrl);
    previewUrls.current.filter((url) => !current.includes(url)).forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = current;
  }, [uploadedItems]);
  useEffect(() => {
    const urls = previewUrls;
    return () => urls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      files: undefined,
    },
  })

  const onSubmit = useCallback(async (values: z.infer<typeof formSchema>) => {
    if (!values.files || values.files.length === 0) return;
    setIsAdding(true);
    const {items, errors: failures} = await addDeviceImages(uploadedItems.map((item) => ({blob: item.file, label: item.content})));
    setIsAdding(false);
    setErrors(failures);
    if (items.length === 0) return;
    onItemsCreate(items);
    // The dialog closes, so the images that failed are listed in a toast.
    if (failures.length > 0) toast.error('Some images could not be added', {description: failures.join(' ')});

    setUploadedItems([]);
    form.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addDeviceImages, uploadedItems, onItemsCreate, form]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      form.setValue('files', files);
      setErrors([]);
      const newItems = Array.from(files).map((file, index) => ({
        key: `${index}-${file.name}`,
        content: file.name.split('.')[0],
        imageUrl: URL.createObjectURL(file),
        file,
      }));
      setUploadedItems(newItems);
    }
  };

  const handleNameChange = (key: string, newName: string) => {
    setUploadedItems((prev) =>
      prev.map((item) => (item.key === key ? {...item, content: newName} : item))
    );
  };

  return (
    <Form {...form}>
      {/* handleSubmit runs in the submit event: onSubmit clears the file input through its ref. */}
      <form onSubmit={(event) => form.handleSubmit(onSubmit)(event)} className="flex flex-col overflow-y-hidden">
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 overflow-y-auto pe-6">
          {uploadedItems.map((item) => (
            <div key={item.key} className="space-y-2">
              <div className="w-28 h-28 relative">
                <Image src={item.imageUrl} alt={item.content} style={{objectFit: 'cover'}} fill unoptimized
                />
              </div>
              <Input
                type="text"
                value={item.content}
                onChange={(e) => handleNameChange(item.key, e.target.value)}
                placeholder="Item name"
              />
            </div>
          ))}
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="pt-4 text-sm text-destructive">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        )}
        <div className="pt-4">
          <Button type="submit" disabled={uploadedItems.length === 0 || isAdding}>
            Add {uploadedItems.length} Item{uploadedItems.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </form>
    </Form>
  )
}

export default ItemCreator;
