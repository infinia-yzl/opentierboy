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
import {previewableImage} from "@/lib/images/prepareImage";

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
  /**
   * A blob: URL of the file as its real type (sniffed from its bytes, never the type the browser
   * reports from the file name), for the preview. Null when the file is not a PNG, JPEG, WebP,
   * GIF or AVIF (it is converted when added, like SVG, or refused), or when its header does not
   * declare a size within the pixel caps. Revoked when the preview goes away.
   */
  imageUrl: string | null;
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
    const current = uploadedItems.flatMap((item) => (item.imageUrl ? [item.imageUrl] : []));
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

  // Counts file choices, so that a slow preview of an older choice does not replace a newer one.
  const fileChoice = useRef(0);
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    form.setValue('files', files);
    setErrors([]);
    const choice = ++fileChoice.current;
    const chosen = Array.from(files);
    const previews = await Promise.all(chosen.map((file) => previewableImage(file).catch(() => null)));
    if (choice !== fileChoice.current) return;
    setUploadedItems(chosen.map((file, index) => {
      const preview = previews[index];
      return {
        key: `${index}-${file.name}`,
        content: file.name.split('.')[0],
        imageUrl: preview ? URL.createObjectURL(preview.blob) : null,
        file,
      };
    }));
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
                    void handleFileChange(e);
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
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.content} style={{objectFit: 'cover'}} fill unoptimized/>
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-md bg-muted p-2 text-center text-xs text-muted-foreground">
                    No preview
                  </div>
                )}
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
