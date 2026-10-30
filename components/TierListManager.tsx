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
import {ListTitle} from "@/components/ListTitle";
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
          2026-10-28): Add images, Zen, Share. Zen stays visible in Zen, to turn it off. The title
          sits right above the rows; on phones the tools sit above the title (2026-10-31). */}
      <div className="w-full flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListTitle title={title} onSave={setTitle}/>
        <div role="group" aria-label="Editor tools" className="flex flex-wrap gap-2 sm:flex-nowrap sm:shrink-0" id="settings" data-html2canvas-ignore>
          <span className="hide-in-zen"><ItemManager onOpenFiles={openFiles} openFocusRef={openFileButtonRef}/></span>
          <ZenToggle/>
          <span className="hide-in-zen"><ShareButton title={title}/></span>
        </div>
      </div>
      <LinkImageNotice/>
      <DragDropTierList/>
      {/* The hints sit with the unranked items, where items start (owner decision, 2026-10-31). */}
      <div className="w-full -mt-2 mb-2 hide-in-zen" data-html2canvas-ignore>
        {/* A wrapping row: the mouse and touch classes set display: block (app/globals.css). */}
        <p className="flex flex-wrap gap-x-1 text-sm text-muted-foreground">
          <span>Drag to reorder.</span>
          <span className="tooltip-mouse">Right-click on any item to delete.</span>
          <span className="tooltip-touch">Long-press on any item to delete.</span>
          <span className="tooltip-mouse">Paste an image to add it as an item.</span>
        </p>
      </div>
      <RowControls/>
      <div className="w-full hide-in-zen" data-html2canvas-ignore>
        <UrlLengthWarning urlLength={urlLength}/>
      </div>
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
