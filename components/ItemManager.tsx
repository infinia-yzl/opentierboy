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
import {ItemWithTags, packageItemLookup} from "@/lib/tierStateUtils";
import {
  API_PREFIX_MOE, encodeMoeApiItemId,
  FormatCategoryName,
  FormatGameName,
  MoeAsset,
  MoeGame,
  wandererMoeApiClient
} from "@/lib/wandererMoeApiClient";

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
  const [games, setGames] = useState<MoeGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const fetchedGames = await wandererMoeApiClient.getAllGames();
        setGames(fetchedGames);
      } catch (error) {
        console.error('Failed to fetch games:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGames().then();
  }, []);
  const [isItemCreatorOpen, setIsItemCreatorOpen] = useState(false);
  const [isItemSetSelectorOpen, setIsItemSetSelectorOpen] = useState(false);

  const itemSets = useMemo(() => {
    const apiSets: ItemSet[] = games.flatMap(game =>
      game.subfolders.map(subfolder => ({
        packageName: `${API_PREFIX_MOE}${game.name}`,
        packageDisplayName: `${FormatGameName(game.name)} (Wanderer Moe)`,
        tagName: subfolder.name,
        tagTitle: FormatCategoryName(subfolder.name),
        images: [], // We'll fetch actual images when selected
      }))
    );

    const packageSets: ItemSet[] = [];
    Object.entries(imagesetConfig.packages).forEach(([packageName, packageData]) => {
      const packageDisplayName = packageData.displayName;
      packageSets.push({
        packageName,
        packageDisplayName,
        tagName: 'all',
        tagTitle: 'All Items',
        images: packageData.images.map(img => img.filename)
      });
      Object.entries(packageData.tags).forEach(([tagName, tagData]) => {
        const taggedImages = packageData.images.filter(image => image.tags.includes(tagName));
        if (taggedImages.length > 0) {
          packageSets.push({
            packageName,
            packageDisplayName,
            tagName,
            tagTitle: tagData.title,
            images: taggedImages.map(img => img.filename)
          });
        }
      });
    });
    return [...packageSets, ...apiSets];
  }, [games]);

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

  const handleItemSetSelect = async (packageName: string, tagName: string) => {
    const selectedItemSet = itemSets.find(set => set.packageName === packageName && set.tagName === tagName);

    if (!selectedItemSet) {
      console.error('Selected item set not found');
      return;
    }

    if (packageName.startsWith(API_PREFIX_MOE)) {
      const gameName = packageName.replace(API_PREFIX_MOE, '');
      try {
        const assetData = await wandererMoeApiClient.getGameAssetData(gameName, tagName);
        const newItems: Item[] = assetData.images.map((asset: MoeAsset) => ({
          id: encodeMoeApiItemId(gameName, tagName, asset.name),
          content: asset.name,
          imageUrl: asset.path,
        }));

        handleCreateItems(newItems);
      } catch (error) {
        console.error('Failed to fetch game assets:', error);
      }
    } else {
      // Handle local item sets
      const newItems: Item[] = (
        tagName === 'all' ? Object.values(packageItemLookup)
          : Object.values(packageItemLookup).filter((item: ItemWithTags) =>
            item.id.startsWith(packageName) && item.tags.includes(tagName)
          )
      ).map(({tags, ...item}) => item); // Remove tags from the final item object

      handleCreateItems(newItems);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <DashboardIcon className="h-4 w-4"/>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Add Items</DropdownMenuLabel>
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
        <DialogContent>
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
        isLoading={isLoading}
      />
    </>
  );
};

export default ItemManager;
