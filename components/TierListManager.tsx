'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import DragDropTierList from './DragDropTierList';
import {TierContext} from '@/contexts/TierContext';
import TierTemplateSelector from "@/components/TierTemplateSelector";
import EditableLabel from "@/components/EditableLabel";
import ItemManager from "@/components/ItemManager";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
import ShareButton from "@/components/ShareButton";
import {TierCortex, TierWithSimplifiedItems} from "@/lib/TierCortex";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {ItemSet} from "@/models/ItemSet";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {CameraIcon, QuestionMarkCircledIcon} from "@radix-ui/react-icons";
import {GiLightBackpack, GiScrollQuill} from "react-icons/gi";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";

interface TierListManagerProps {
  initialItemSet?: ItemSet;
  initialState?: string;
  title?: string;
}

const TierListManager: React.FC<TierListManagerProps> = ({initialItemSet, initialState, title}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tierCortex = useMemo(() => new TierCortex(), []);
  const [tiers, setTiers] = useState<Tier[]>(() =>
    tierCortex.getInitialTiers(initialState, initialItemSet)
  );
  const [name, setName] = useState(title ?? '');
  const [showLabels, setShowLabels] = useState(true);
  const [labelPosition, setLabelPosition] = useState<LabelPosition>(tiers[0].labelPosition ?? 'left');
  const previousTiersRef = useRef<Tier[]>(tiers);
  const nameChangedRef = useRef(false);

  const [urlLength, setUrlLength] = useState(0);

  useEffect(() => {
    const state = searchParams.get('state');
    if (!state) return;

    const processUrlState = async () => {
      const decodedState = await tierCortex.decodeTierStateFromURL(state);
      if (!decodedState) return;

      // Update name if present
      if (decodedState.title) {
        setName(decodedState.title);
      }

      // Updated label positions
      const updatedTiers = decodedState.tiers.map(tier => ({
        ...tier,
        labelPosition
      }));

      setTiers(updatedTiers);
      setUrlLength(pathname.length + state.length + 7); // 7 is the length of "?state="
    };

    processUrlState();
  }, [pathname.length, searchParams, tierCortex, labelPosition]);

  const handleTiersUpdate = useCallback((updatedTiers: Tier[]) => {
    previousTiersRef.current = updatedTiers;
    setTiers(updatedTiers);

    // Check if we have Base64 images from a shared URL - if so, don't update URL automatically
    const hasBase64Images = updatedTiers.some(tier =>
      tier.items.some(item =>
        tierCortex.isCustomItem(item.id) && item.imageUrl?.startsWith('data:')
      )
    );

    if (hasBase64Images) {
      // Don't update URL - user must explicitly share to generate new URL with current state
      console.log('🔒 Base64 images detected - URL updates disabled. Use Share button to generate new URL.');
      return;
    }

    // Normal behavior: simple encoding without Base64 image data
    const optimizedTiersForEncoding: TierWithSimplifiedItems[] = updatedTiers.map(tier => ({
      ...tier,
      items: tier.items.map(item => ({
        i: item.id,
        c: tierCortex.isCustomItem(item.id) ? item.content : undefined
        // No 'd' property - images stay in localStorage
      }))
    }));

    const newState = TierCortex.encodeTierStateForURL(name, optimizedTiersForEncoding);
    const newUrlLength = pathname.length + newState.length + 7;
    setUrlLength(newUrlLength);

    router.push(`${pathname}?state=${newState}`, {scroll: false});
  }, [router, pathname, name, tierCortex]);

  const handleNameChange = useCallback((newName: string) => {
    nameChangedRef.current = true;
    setName(newName);
  }, []);

  useEffect(() => {
    if (nameChangedRef.current) {
      nameChangedRef.current = false;
      handleTiersUpdate(tiers);
    }
  }, [name, tiers, handleTiersUpdate]);

  const handleItemsCreate = useCallback((newItems: Item[]) => {
    const updatedTiers = [...tiers];
    const lastTier = updatedTiers[updatedTiers.length - 1];

    const uniqueNewItems = newItems.filter(newItem =>
      !updatedTiers.some(tier =>
        tier.items.some(item => item.id === newItem.id || item.content === newItem.content)
      )
    );

    lastTier.items = [...lastTier.items, ...uniqueNewItems];

    handleTiersUpdate(updatedTiers);
  }, [tiers, handleTiersUpdate]);

  const handleUndoItemsCreate = useCallback((itemIds: string[]) => {
    const updatedTiers = tiers.map(tier => ({
      ...tier,
      items: tier.items.filter(item => !itemIds.includes(item.id))
    }));
    handleTiersUpdate(updatedTiers);
  }, [tiers, handleTiersUpdate]);

  const toggleLabels = useCallback(() => {
    setShowLabels(prev => !prev);
  }, []);

  const handleLabelPositionChange = useCallback((newPosition: LabelPosition) => {
    setLabelPosition(newPosition);
    const updatedTiers = tiers.map(tier => ({...tier, labelPosition: newPosition}));
    handleTiersUpdate(updatedTiers);
  }, [tiers, handleTiersUpdate]);

  const handleTemplateChange = useCallback((newTemplate: Tier[]) => {
    // Create a map of all existing items with their tier IDs
    const allItemsMap = new Map(
      tiers.flatMap(tier =>
        tier.items.map(item => [item.id, {item, tierId: tier.id}])
      )
    );

    // Create new tiers based on the template
    const newTiers: Tier[] = newTemplate.map(templateTier => ({
      ...templateTier,
      items: [] as Item[],
      labelPosition
    }));

    // Distribute existing items to new tiers
    allItemsMap.forEach(({item, tierId}) => {
      const targetTier = newTiers.find(tier => tier.id === tierId) ||
        newTiers.find(tier => tier.id === 'uncategorized');

      if (targetTier) {
        targetTier.items.push(item);
      } else {
        // If no matching tier and no uncategorized tier, create one
        const uncategorizedTier: Tier = {
          id: 'uncategorized',
          name: '',
          items: [item],
          labelPosition: labelPosition
        };
        newTiers.push(uncategorizedTier);
      }
    });

    handleTiersUpdate(newTiers);
  }, [tiers, labelPosition, handleTiersUpdate]);

  const resetItems = useCallback(() => {
    previousTiersRef.current = tiers;

    const allItems = tiers.flatMap(tier => tier.items)
      .sort((a, b) => a.content.localeCompare(b.content));

    const resetTiers = tiers.map(tier => ({...tier, items: [] as Item[]}));

    let uncategorizedTier = resetTiers[resetTiers.length - 1];
    if (!uncategorizedTier || uncategorizedTier.id !== 'uncategorized') {
      uncategorizedTier = {
        id: 'uncategorized',
        name: '',
        items: [],
        labelPosition: labelPosition
      };
      resetTiers.push(uncategorizedTier);
    }

    uncategorizedTier.items = allItems;

    handleTiersUpdate(resetTiers);
  }, [tiers, labelPosition, handleTiersUpdate]);

  const deleteAllItems = useCallback(() => {
    previousTiersRef.current = tiers;
    const emptyTiers = tiers.map(tier => ({...tier, items: []}));
    handleTiersUpdate(emptyTiers);
  }, [tiers, handleTiersUpdate]);

  const undoReset = useCallback(() => {
    handleTiersUpdate(previousTiersRef.current);
  }, [handleTiersUpdate]);

  const undoDelete = useCallback(() => {
    handleTiersUpdate(previousTiersRef.current);
  }, [handleTiersUpdate]);

  const contextValue = {
    tierCortex,
    tiers,
    labelPosition,
    showLabels,
    setLabelPosition: handleLabelPositionChange,
    toggleLabels,
    onTemplateChange: handleTemplateChange
  };

  const UrlLengthWarning: React.FC<{ urlLength: number }> = ({urlLength}) => {
    // Check if we have Base64 images (from shared URL)
    const hasBase64Images = tiers.some(tier =>
      tier.items.some(item =>
        tierCortex.isCustomItem(item.id) && item.imageUrl?.startsWith('data:')
      )
    );

    if (hasBase64Images) {
      return (
        <Alert className="px-4 my-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <QuestionMarkCircledIcon className="h-5 w-5 text-blue-600 dark:text-blue-400"/>
          <AlertTitle className="text-blue-800 dark:text-blue-200">
            📸 Shared Images Detected
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            <p className="mb-2">
              You&apos;re viewing a tier list with custom images from a shared URL.
              Your changes are saved locally but won&apos;t update the URL automatically.
            </p>
            <p>
              <strong>To share your changes:</strong> Click the Share button to generate a new URL with your
              modifications.
            </p>
          </AlertDescription>
        </Alert>
      );
    }

    // Remove the "Link is shareable!" message since sharing now requires explicit button click
    if (urlLength <= 2000) {
      return null;
    }

    return (
      <Alert className="px-4 my-4">
        <GiScrollQuill className="h-5 w-5 animate-pulse"/>
        <AlertTitle className="font-bold text-lg underline underline-offset-2">
          SIDE-QUEST UNLOCKED: THE VANISHING LINK PREVIEW
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <QuestionMarkCircledIcon className="h-4 w-4 ml-2"/>
              </TooltipTrigger>
              <TooltipContent>
                The current URL length exceeds 2000 characters.
                This may cause link previews to fail and may also be incompatible with older browsers. Consider removing
                some items or sharing your tier list preview using an image, or an alternative method.
                Functionality of the tier list itself is not affected.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </AlertTitle>
        <AlertDescription>
          <p className="mb-2">
            Hark, brave adventurer! A most peculiar affliction has befallen your URL. Tis&apos; stretched
            yon&apos; mortal limits <i>(the URL is now {Math.round(urlLength / 1024)}KB, which might cause issues with
            link previews)</i>.
          </p>
          <p className="mb-2">
            This arcane enchantment of elongation threatens to render link previews invisible to the denizens of
            Twitter and Discord.
            Even the ancient browsers of yore may falter before its might. Fear not, for your tier list remains
            unscathed, its power undiminished.
          </p>
          <p className="mb-2">
            Brave adventurer, the choice is yours. Your tier list shall endure regardless, but should you wish to embark
            on this quest for the denizens, pray, consider the paths our scouts have identified:
          </p>
          <ul className="list-disc list-inside">
            <li>
              <GiLightBackpack className="inline h-4 w-4 mr-1"/> Use your Inventory Management skills (Remove some
              items)
            </li>
            <li>
              <CameraIcon className="inline h-4 w-4 mr-1"/> Share as image
            </li>
          </ul>
          <blockquote className="mt-4 border-l-2 pl-6 italic">
            &quot;In the face of adversity, true heroes forge their own paths.&quot; - Sage of the Endless URL
          </blockquote>
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <TierContext.Provider value={contextValue}>
      <div className="mb-4">
        <EditableLabel as="h1" text={name} onSave={handleNameChange} placeholder="Enter title"
                       contentClassName="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0 text-center"/>
      </div>
      <div className="flex flex-col items-center hide-in-zen">
        <div className="flex space-x-2" id="settings" data-html2canvas-ignore>
          <TierTemplateSelector/>
          <ItemManager
            onItemsCreate={handleItemsCreate}
            onUndoItemsCreate={handleUndoItemsCreate}
            resetItems={resetItems}
            deleteAllItems={deleteAllItems}
            undoReset={undoReset}
            undoDelete={undoDelete}
          />
          <ShareButton title={name}/>
        </div>
        <div className="p-2" data-html2canvas-ignore>
          <p className="text-sm text-muted-foreground text-center">
            Drag to reorder.
          </p>
          <p className="tooltip-mouse text-sm text-muted-foreground text-center">
            Right-click on any item to delete.
          </p>
          <p className="tooltip-touch text-sm text-muted-foreground text-center">
            Long-press on any item to delete.
          </p>
          <UrlLengthWarning urlLength={urlLength}/>
        </div>
      </div>
      <DragDropTierList
        tiers={tiers}
        onTiersUpdate={handleTiersUpdate}
      />
    </TierContext.Provider>
  );
};

export default TierListManager;
