import React, {useMemo, useRef, useState} from 'react';
import {Button, buttonVariants} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {toast} from "sonner";
import ItemCreator from "@/components/ItemCreator";
import LinkImageCreator from "@/components/LinkImageCreator";
import ItemSetSelector from "@/components/ItemSetSelector";
import {ImageIcon, PlusIcon} from "@radix-ui/react-icons";
import {TILE_SIZES} from "@/lib/tileSize";
import {cn} from "@/lib/utils";
import Item from "@/models/Item";
import {visibleImageSets} from "@/lib/imageSets";
import {ItemSet} from "@/models/ItemSet";
import {useTierContext} from "@/contexts/TierContext";
import {useAddItemsWithUndo} from "@/components/useAddItems";

interface ItemManagerProps {
  /** Opens files chosen with "Open a Freeze Frame…" (components/useSnapshotFiles.tsx: openFiles). */
  onOpenFiles: (files: File[]) => void;
  /** Focus returns here after the "Open the list in this file?" dialog. */
  openFocusRef?: React.RefObject<HTMLButtonElement | null>;
  /**
   * What opens the menu: the toolbar button, or the dashed tile that ends the Unranked tray
   * ("Add images to Unranked", owner decision 2026-10-28: the decided editor board).
   */
  trigger?: 'button' | 'tile';
}

/** Pictures, as "From your device" offers them. The bytes are checked again after choosing. */
const ACCEPTED_FILES = 'image/*';

const ItemManager: React.FC<ItemManagerProps> = ({onOpenFiles, openFocusRef, trigger = 'button'}) => {
  const {tiers, tierCortex, resetRankings, removeAllItems, restoreTiers} = useTierContext();
  const addItemsWithUndo = useAddItemsWithUndo();
  const showGradientBorder = tiers.every(tier => tier.items.length === 0);

  const [isItemCreatorOpen, setIsItemCreatorOpen] = useState(false);
  const [isLinkCreatorOpen, setIsLinkCreatorOpen] = useState(false);
  const [isItemSetSelectorOpen, setIsItemSetSelectorOpen] = useState(false);
  // The Remove All confirmation sits outside the menu, so the menu closes when it opens.
  const [isRemoveAllOpen, setIsRemoveAllOpen] = useState(false);
  const manageItemsButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const setTriggerRef = (element: HTMLButtonElement | null) => {
    manageItemsButton.current = element;
    if (openFocusRef) openFocusRef.current = element;
  };

  const itemSets = useMemo(() => {
    const sets: ItemSet[] = [];
    // Legacy sets are not offered as templates (lib/imageSets.ts).
    visibleImageSets().forEach(([packageName, packageData]) => {
      const packageDisplayName = packageData.displayName;
      sets.push({
        packageName,
        packageDisplayName,
        tagName: 'all',
        tagTitle: 'All Items',
        images: packageData.images.map(img => img.filename)
      });
      Object.entries(packageData.tags).forEach(([tagName, tagData]) => {
        const taggedImages = packageData.images.filter(image => image.tags.includes(tagName));
        if (taggedImages.length > 0) {
          sets.push({
            packageName,
            packageDisplayName,
            tagName,
            tagTitle: tagData.title,
            images: taggedImages.map(img => img.filename)
          });
        }
      });
    });
    return sets;
  }, []);

  // Each Undo below is a new change to the list, so it adds a history entry (A6).
  const handleCreateItems = (newItems: Item[]) => {
    addItemsWithUndo(newItems);
    setIsItemCreatorOpen(false);
    setIsLinkCreatorOpen(false);
    setIsItemSetSelectorOpen(false);
  };

  const handleReset = () => {
    const tiersBefore = tiers;
    resetRankings();
    toast('Items Reset', {
      description: 'All item rankings have been reset.',
      action: {
        label: 'Undo',
        onClick: () => restoreTiers(tiersBefore),
      },
    });
  };

  const handleDelete = () => {
    const tiersBefore = tiers;
    removeAllItems();
    toast('All Items Deleted', {
      description: 'All items have been removed.',
      action: {
        label: 'Undo',
        onClick: () => restoreTiers(tiersBefore),
      },
    });
  };

  // The item dialogs have no trigger of their own (they open from the menu), so give focus back
  // to the menu button when they close.
  const focusManageItems = (event: Event) => {
    event.preventDefault();
    manageItemsButton.current?.focus();
  };

  const handleItemSetSelect = (packageName: string, images: string[]) => {
    handleCreateItems(tierCortex.resolveItemsFromPackage(packageName, images));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger === 'tile' ? (
            <Button variant="ghost" ref={setTriggerRef} aria-label="Add images to Unranked"
                    className={`${TILE_SIZES.square.className} p-0 flex-col gap-1 whitespace-normal leading-tight text-center rounded-md border border-dashed border-muted-foreground/40 text-[11px] text-muted-foreground hover:text-foreground`}
            >
              <PlusIcon className="h-4 w-4"/>
              Add images
            </Button>
          ) : (
            <Button variant="outline" ref={setTriggerRef}
                    className={`gap-2 ${showGradientBorder ? 'glow-effect' : ''}`}
            >
              <ImageIcon className="h-4 w-4"/>
              Add images
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Add Items</DropdownMenuLabel>
          <DropdownMenuGroup className="mx-2">
            <DropdownMenuItem onSelect={() => setIsItemSetSelectorOpen(true)}>
              From template
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsItemCreatorOpen(true)}>
              From your device
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsLinkCreatorOpen(true)}>
              From a link
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator/>
          {/* Opening a saved Freeze Frame picture brings a list in, so it sits with the list
              actions (owner decision, 2026-10-29). Pictures without a list become items. */}
          <DropdownMenuItem onSelect={() => fileInput.current?.click()}>Open a Freeze Frame…</DropdownMenuItem>
          <DropdownMenuItem onSelect={handleReset}>Reset</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsRemoveAllOpen(true)}
                            className="dark:focus:bg-destructive dark:focus:text-primary focus:text-destructive"
          >
            Remove All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_FILES}
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Clear the input, so choosing the same file again opens it again.
          event.target.value = '';
          if (files.length > 0) onOpenFiles(files);
        }}
      />

      <AlertDialog open={isRemoveAllOpen} onOpenChange={setIsRemoveAllOpen}>
        <AlertDialogContent onCloseAutoFocus={(event) => {
          // The dialog has no trigger of its own, so give focus back to the menu button.
          event.preventDefault();
          manageItemsButton.current?.focus();
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all items from all tiers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className={cn(buttonVariants({variant: "destructive"}))}>
              Remove All Items
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isItemCreatorOpen} onOpenChange={setIsItemCreatorOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col" onCloseAutoFocus={focusManageItems}>
          <DialogHeader>
            <DialogTitle>Add New Items</DialogTitle>
            <DialogDescription>
              Add your images to create new items. Edit names if needed.
            </DialogDescription>
          </DialogHeader>
          <ItemCreator onItemsCreate={handleCreateItems}/>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkCreatorOpen} onOpenChange={setIsLinkCreatorOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col" onCloseAutoFocus={focusManageItems}>
          <DialogHeader>
            <DialogTitle>Add an Image from a Link</DialogTitle>
            <DialogDescription>
              Paste the address of an image on the web. People who open your list load the image from
              that site.
            </DialogDescription>
          </DialogHeader>
          <LinkImageCreator onItemsCreate={handleCreateItems}/>
        </DialogContent>
      </Dialog>

      <ItemSetSelector
        itemSets={itemSets}
        onSelectItemSet={handleItemSetSelect}
        open={isItemSetSelectorOpen}
        onOpenChange={setIsItemSetSelectorOpen}
      />
    </>
  );
};

export default ItemManager;
