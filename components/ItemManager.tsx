import React, {useMemo, useState} from 'react';
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
import ItemSetSelector from "@/components/ItemSetSelector";
import {DashboardIcon} from "@radix-ui/react-icons";
import {cn} from "@/lib/utils";
import Item from "@/models/Item";
import {visibleImageSets} from "@/lib/imageSets";
import {ItemSet} from "@/models/ItemSet";
import {useTierContext} from "@/contexts/TierContext";

const ItemManager: React.FC = () => {
  const {tiers, tierCortex, addItems, removeItems, resetRankings, removeAllItems, restoreTiers} = useTierContext();
  const showGradientBorder = tiers.every(tier => tier.items.length === 0);

  const [isItemCreatorOpen, setIsItemCreatorOpen] = useState(false);
  const [isItemSetSelectorOpen, setIsItemSetSelectorOpen] = useState(false);
  // The Remove All confirmation sits outside the menu, so the menu closes when it opens.
  const [isRemoveAllOpen, setIsRemoveAllOpen] = useState(false);

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
    addItems(newItems);
    setIsItemCreatorOpen(false);
    setIsItemSetSelectorOpen(false);
    toast('Items Added', {
      description: `${newItems.length} item(s) have been added.`,
      action: {
        label: 'Undo',
        onClick: () => removeItems(newItems.map(item => item.id)),
      },
    });
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

  const handleItemSetSelect = (packageName: string, images: string[]) => {
    handleCreateItems(tierCortex.resolveItemsFromPackage(packageName, images));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon"
                  className={`${showGradientBorder ? 'glow-effect' : ''}`}
          >
            <DashboardIcon className="h-4 w-4"/>
            <span className="sr-only">Manage items</span>
          </Button>
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
          </DropdownMenuGroup>
          <DropdownMenuSeparator/>
          <DropdownMenuItem onSelect={handleReset}>Reset</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setIsRemoveAllOpen(true)}
                            className="dark:focus:bg-destructive dark:focus:text-primary focus:text-destructive"
          >
            Remove All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isRemoveAllOpen} onOpenChange={setIsRemoveAllOpen}>
        <AlertDialogContent>
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
        <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add New Items</DialogTitle>
            <DialogDescription>
              Add your images to create new items. Edit names if needed.
            </DialogDescription>
          </DialogHeader>
          <ItemCreator onItemsCreate={handleCreateItems}/>
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
