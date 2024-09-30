import React, {useEffect, useMemo, useState} from 'react';
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {toast} from "sonner";
import ItemCreator from "@/components/ItemCreator";
import ItemSetSelector from "@/components/ItemSetSelector";
import {DashboardIcon} from "@radix-ui/react-icons";
import {cn} from "@/lib/utils";
import Item from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import {ItemSet} from "@/models/ItemSet";
import {useTierContext} from "@/contexts/TierContext";

interface ItemManagerProps {
  onItemsCreate: (newItems: Item[]) => void;
  onUndoItemsCreate: (itemIds: string[]) => void;
  resetItems: () => void;
  deleteAllItems: () => void;
  undoReset: () => void;
  undoDelete: () => void;
}

const ItemManager: React.FC<ItemManagerProps> = ({
  onItemsCreate,
  onUndoItemsCreate,
  resetItems,
  deleteAllItems,
  undoReset,
  undoDelete,
}) => {
  const {tiers, tierCortex} = useTierContext();
  const [showGradientBorder, setShowGradientBorder] = useState(false);

  useEffect(() => {
    const totalItems = tiers.reduce((sum, tier) => sum + tier.items.length, 0);
    setShowGradientBorder(totalItems === 0);
  }, [tiers]);

  const [isItemCreatorOpen, setIsItemCreatorOpen] = useState(false);
  const [isItemSetSelectorOpen, setIsItemSetSelectorOpen] = useState(false);

  const itemSets = useMemo(() => {
    const sets: ItemSet[] = [];
    Object.entries(imagesetConfig.packages).forEach(([packageName, packageData]) => {
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

  const handleCreateItems = (newItems: Item[]) => {
    onItemsCreate(newItems);
    setIsItemCreatorOpen(false);
    setIsItemSetSelectorOpen(false);
    toast('Items Added', {
      description: `${newItems.length} item(s) have been added.`,
      action: {
        label: 'Undo',
        onClick: () => onUndoItemsCreate(newItems.map(item => item.id)),
      },
    });
  };

  const handleReset = () => {
    resetItems();
    toast('Items Reset', {
      description: 'All item rankings have been reset.',
      action: {
        label: 'Undo',
        onClick: undoReset,
      },
    });
  };

  const handleDelete = () => {
    deleteAllItems();
    toast('All Items Deleted', {
      description: 'All items have been removed.',
      action: {
        label: 'Undo',
        onClick: undoDelete,
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}
                                className="dark:focus:bg-destructive dark:focus:text-primary focus:text-destructive"
              >
                Remove All
              </DropdownMenuItem>
            </AlertDialogTrigger>
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
        </DropdownMenuContent>
      </DropdownMenu>

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
