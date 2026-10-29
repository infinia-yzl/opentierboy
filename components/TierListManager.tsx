'use client';

import React from 'react';
import DragDropTierList from './DragDropTierList';
import {TierListProvider, useTierContext} from '@/contexts/TierContext';
import {CustomImagesProvider} from '@/contexts/CustomImagesContext';
import LinkImageNotice from "@/components/LinkImageNotice";
import {usePasteImages} from "@/components/usePasteImages";
import {useFileDrop, useSnapshotFiles} from "@/components/useSnapshotFiles";
import {RowControls} from "@/components/TierTemplateSelector";
import {ZenToggle} from "@/components/ZenToggle";
import EditableLabel from "@/components/EditableLabel";
import ItemManager from "@/components/ItemManager";
import ShareButton from "@/components/ShareButton";
import {ItemSet} from "@/models/ItemSet";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {CameraIcon, QuestionMarkCircledIcon} from "@radix-ui/react-icons";
import {GiCardAceSpades, GiLightBackpack, GiScrollQuill} from "react-icons/gi";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";

interface TierListManagerProps {
  initialItemSet?: ItemSet;
  initialState?: string;
  title?: string;
}

/** The tier list editor. The list lives in the store (contexts/TierContext.tsx). */
const TierListManager: React.FC<TierListManagerProps> = ({initialItemSet, initialState, title}) => (
  <TierListProvider initialItemSet={initialItemSet} initialState={initialState} pageTitle={title ?? ''}>
    <CustomImagesProvider>
      <TierListEditor/>
    </CustomImagesProvider>
  </TierListProvider>
);

const TierListEditor: React.FC = () => {
  const {title, setTitle, urlLength} = useTierContext();
  // Files that someone opens, drops or pastes: a snapshot file's list, or pictures as items.
  const {openFiles, dialog: openListDialog, openFileButtonRef} = useSnapshotFiles();
  usePasteImages(openFiles);
  useFileDrop(openFiles);

  return (
    <div className="w-full flex flex-col items-center">
      {/* The title on the left and the editor's three tools on the right (owner decisions,
          2026-10-28): Add images, Zen, Share. Zen stays visible in Zen, to turn it off. */}
      <div className="w-full mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <EditableLabel as="h1" text={title} onSave={setTitle} placeholder="Enter title" className="min-w-0"
                       contentClassName="scroll-m-20 text-3xl font-black tracking-tight first:mt-0"/>
        <div role="group" aria-label="Editor tools" className="flex gap-2 shrink-0" id="settings" data-html2canvas-ignore>
          <span className="hide-in-zen"><ItemManager onOpenFiles={openFiles} openFocusRef={openFileButtonRef}/></span>
          <ZenToggle/>
          <span className="hide-in-zen"><ShareButton title={title}/></span>
        </div>
      </div>
      <div className="flex flex-col items-center hide-in-zen">
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
          <p className="tooltip-mouse text-sm text-muted-foreground text-center">
            Paste an image to add it as an item.
          </p>
          <UrlLengthWarning urlLength={urlLength}/>
        </div>
      </div>
      <LinkImageNotice/>
      <DragDropTierList/>
      <RowControls/>
      {openListDialog}
    </div>
  );
};

const UrlLengthWarning: React.FC<{ urlLength: number }> = ({urlLength}) => {
  if (urlLength <= 2000) return null;

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
          yon&apos; mortal limits, surpassing 2000 characters in length!
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
            <CameraIcon className="inline h-4 w-4 mr-1"/> Use <i>&quot;Freeze Frame&quot;</i>! (Share as picture)
          </li>
          <li>
            <GiCardAceSpades className="inline h-4 w-4 mr-1"/> Activate your Secret Sharing Technique (Will you
            activate your Trump Card?)
          </li>
        </ul>
        <blockquote className="mt-4 border-l-2 pl-6 italic">
          &quot;In the face of adversity, true heroes forge their own paths.&quot; - Sage of the Endless URL
        </blockquote>
      </AlertDescription>
    </Alert>
  );
};

export default TierListManager;
