import React, {useCallback, useContext, useMemo, useRef, useState} from 'react';
import {Button, buttonVariants} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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

/** The dialogs that adding images opens. Each is rendered once, by AddImagesProvider. */
type AddImagesDialog = 'template' | 'device' | 'link' | 'removeAll';

interface AddImagesContextValue {
  /** Opens a dialog. Focus goes back to `from` when it closes (or to the Add images button). */
  open: (dialog: AddImagesDialog, from: HTMLElement | null) => void;
  /** "Open a Freeze Frame…": the file chooser. */
  chooseFile: () => void;
  reset: () => void;
}

const AddImagesContext = React.createContext<AddImagesContextValue | undefined>(undefined);

function useAddImages(): AddImagesContextValue {
  const context = useContext(AddImagesContext);
  if (context === undefined) throw new Error('useAddImages must be used within an AddImagesProvider');
  return context;
}

interface AddImagesProviderProps {
  /** Opens files chosen with "Open a Freeze Frame…" (components/useSnapshotFiles.tsx: openFiles). */
  onOpenFiles: (files: File[]) => void;
  /**
   * The toolbar's Add images button: focus goes there when a dialog closes and the control that
   * opened it is gone (the empty list's drop area, once images are added).
   */
  fallbackFocusRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}

/** Pictures, as "From your device" offers them. The bytes are checked again after choosing. */
const ACCEPTED_FILES = 'image/*';

/**
 * The ways of adding images, shared by every control that offers them: the toolbar's Add images
 * menu, the tile that ends the Unranked tray, and an empty list's drop area. The dialogs ("From
 * template", "From your device", "From a link", Remove All) and the file chooser of "Open a
 * Freeze Frame…" exist once, so a dialog stays open when the control that opened it goes away.
 */
export const AddImagesProvider: React.FC<AddImagesProviderProps> = ({onOpenFiles, fallbackFocusRef, children}) => {
  const {tiers, tierCortex, resetRankings, removeAllItems, restoreTiers} = useTierContext();
  const addItemsWithUndo = useAddItemsWithUndo();

  const [isItemCreatorOpen, setIsItemCreatorOpen] = useState(false);
  const [isLinkCreatorOpen, setIsLinkCreatorOpen] = useState(false);
  const [isItemSetSelectorOpen, setIsItemSetSelectorOpen] = useState(false);
  // The Remove All confirmation sits outside the menu, so the menu closes when it opens.
  const [isRemoveAllOpen, setIsRemoveAllOpen] = useState(false);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const reset = useCallback(() => {
    const tiersBefore = tiers;
    resetRankings();
    toast('Items Reset', {
      description: 'All item rankings have been reset.',
      action: {
        label: 'Undo',
        onClick: () => restoreTiers(tiersBefore),
      },
    });
  }, [tiers, resetRankings, restoreTiers]);

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

  // The dialogs have no trigger of their own (they open from a menu or a button), so give focus
  // back to the control that opened them when they close.
  const returnFocus = (event: Event) => {
    event.preventDefault();
    const target = returnFocusTo.current;
    (target?.isConnected ? target : fallbackFocusRef.current)?.focus();
  };

  const handleItemSetSelect = (packageName: string, images: string[]) => {
    handleCreateItems(tierCortex.resolveItemsFromPackage(packageName, images));
  };

  const open = useCallback((dialog: AddImagesDialog, from: HTMLElement | null) => {
    returnFocusTo.current = from;
    if (dialog === 'template') setIsItemSetSelectorOpen(true);
    else if (dialog === 'device') setIsItemCreatorOpen(true);
    else if (dialog === 'link') setIsLinkCreatorOpen(true);
    else setIsRemoveAllOpen(true);
  }, []);

  const chooseFile = useCallback(() => fileInput.current?.click(), []);

  const value = useMemo<AddImagesContextValue>(() => ({open, chooseFile, reset}), [open, chooseFile, reset]);

  return (
    <AddImagesContext.Provider value={value}>
      {children}
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
        <AlertDialogContent onCloseAutoFocus={returnFocus}>
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
        <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col" onCloseAutoFocus={returnFocus}>
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
        <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col" onCloseAutoFocus={returnFocus}>
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
    </AddImagesContext.Provider>
  );
};

interface ItemManagerProps {
  /** Focus returns here after the "Open the list in this file?" dialog. */
  openFocusRef?: React.RefObject<HTMLButtonElement | null>;
  /**
   * What opens the menu: the toolbar button, or the dashed tile that ends the Unranked tray
   * ("Add images to Unranked", owner decision 2026-10-28: the decided editor board).
   */
  trigger?: 'button' | 'tile';
}

/** A hint after a menu item: how else to add images that way (owner decision, 2026-10-31). */
const MenuHint: React.FC<{children: React.ReactNode}> = ({children}) => (
  <DropdownMenuShortcut className="pl-4 tracking-normal opacity-100 text-muted-foreground">{children}</DropdownMenuShortcut>
);

/** The Add images menu, opened by the toolbar button or by the Unranked tray's tile. */
const ItemManager: React.FC<ItemManagerProps> = ({openFocusRef, trigger = 'button'}) => {
  const {tiers} = useTierContext();
  const {open, chooseFile, reset} = useAddImages();
  const showGradientBorder = tiers.every(tier => tier.items.length === 0);
  const manageItemsButton = useRef<HTMLButtonElement>(null);
  const setTriggerRef = (element: HTMLButtonElement | null) => {
    manageItemsButton.current = element;
    if (openFocusRef) openFocusRef.current = element;
  };
  const openFromMenu = (dialog: AddImagesDialog) => open(dialog, manageItemsButton.current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === 'tile' ? (
          <Button variant="ghost" ref={setTriggerRef} aria-label="Add images to Unranked"
                  className={`${TILE_SIZES.square.className} p-0 flex-col gap-0.5 whitespace-normal leading-tight text-center rounded-md border border-dashed border-muted-foreground/40 text-[11px] text-muted-foreground hover:text-foreground`}
          >
            <PlusIcon className="h-4 w-4"/>
            Add images
            <span className="text-[9px] font-normal leading-tight">drop or paste</span>
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
          <DropdownMenuItem onSelect={() => openFromMenu('template')}>
            From template
          </DropdownMenuItem>
          {/* The hints say what else works (owner decision, 2026-10-31): files can be dropped,
              image addresses pasted. */}
          <DropdownMenuItem onSelect={() => openFromMenu('device')}>
            From your device{' '}
            <MenuHint>or drop</MenuHint>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openFromMenu('link')}>
            From a link{' '}
            <MenuHint>or paste</MenuHint>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator/>
        {/* Opening a saved Freeze Frame picture brings a list in, so it sits with the list
            actions (owner decision, 2026-10-29). Pictures without a list become items. */}
        <DropdownMenuItem onSelect={chooseFile}>
          Open a Freeze Frame…{' '}
          <MenuHint>or drop</MenuHint>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={reset}>Reset</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openFromMenu('removeAll')}
                          className="dark:focus:bg-destructive dark:focus:text-primary focus:text-destructive"
        >
          Remove All
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * An empty list's drop area, in place of the Unranked tray's items (owner decision, 2026-10-31):
 * "Drop or paste images here", with Template, Upload and Link. They open "From template", "From
 * your device" and "From a link".
 */
export const EmptyListDropArea: React.FC = () => {
  const {open} = useAddImages();
  const action = (dialog: AddImagesDialog) => (event: React.MouseEvent<HTMLButtonElement>) => open(dialog, event.currentTarget);
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 py-7 rounded-lg border border-dashed border-muted-foreground/40 text-center">
      <ImageIcon aria-hidden="true" className="h-7 w-7 text-muted-foreground"/>
      <p className="text-[15px] font-semibold">Drop or paste images here</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="outline" onClick={action('template')}>Template</Button>
        <Button size="sm" variant="outline" onClick={action('device')}>Upload</Button>
        <Button size="sm" variant="outline" onClick={action('link')}>Link</Button>
      </div>
    </div>
  );
};

export default ItemManager;
