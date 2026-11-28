'use client';

import React, {useEffect} from 'react';
import Image from "next/image";
import DragDropTierList from './DragDropTierList';
import {TierListProvider, useTierContext} from '@/contexts/TierContext';
import {CustomImagesProvider} from '@/contexts/CustomImagesContext';
import LinkImageNotice from "@/components/LinkImageNotice";
import {usePasteImages} from "@/components/usePasteImages";
import {useEditorDrop, useSnapshotFiles} from "@/components/useSnapshotFiles";
import DropOverlay from "@/components/DropOverlay";
import {useZenMode} from "@/components/usePageState";
import {RowControls} from "@/components/TierTemplateSelector";
import {ZenToggle} from "@/components/ZenToggle";
import {ZenBar} from "@/components/ZenBar";
import {setZenMode} from "@/components/zenMode";
import {useStepLog} from "@/components/useListSteps";
import {useActiveStage, useStageAttributes} from "@/components/useZenLayout";
import {ZenStage} from "@/components/ZenStage";
import {ScribbleLayer} from "@/components/ScribbleLayer";
import {resetScribble, useScribble} from "@/components/useScribble";
import {InkNotice} from "@/components/InkNotice";
import {inkAddressLength} from "@/lib/scribble/address";
import {usePathname} from "next/navigation";
import {cn} from "@/lib/utils";
import {ListTitle} from "@/components/ListTitle";
import ItemManager, {AddImagesProvider, EmptyListDropArea} from "@/components/ItemManager";
import ShareButton from "@/components/ShareButton";
import {ItemSet} from "@/models/ItemSet";
import otbLogo from "@/public/brand/otb-logo-wide.webp";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {CameraIcon, QuestionMarkCircledIcon} from "@radix-ui/react-icons";
import {GiCardAceSpades, GiLightBackpack, GiScrollQuill} from "react-icons/gi";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {EditorTips} from "@/components/EditorTips";

interface TierListManagerProps {
  initialItemSet?: ItemSet;
  title?: string;
}

/** The tier list editor. The list lives in the store (contexts/TierContext.tsx). */
const TierListManager: React.FC<TierListManagerProps> = ({initialItemSet, title}) => (
  <TierListProvider initialItemSet={initialItemSet} pageTitle={title ?? ''}>
    <CustomImagesProvider>
      <TierListEditor/>
      <EditorTips/>
    </CustomImagesProvider>
  </TierListProvider>
);

const TierListEditor: React.FC = () => {
  const {title, setTitle, urlLength} = useTierContext();
  const {openFiles, openLinks, dialog: openListDialog, openFileButtonRef} = useSnapshotFiles();
  usePasteImages(openFiles, openLinks);
  const dragging = useEditorDrop(openFiles, openLinks);
  const isZenMode = useZenMode();
  useStepLog();
  useEffect(() => () => {
    setZenMode(false, {announce: false});
    resetScribble();
  }, []);
  useStageAttributes();
  const stage = useActiveStage();
  const pathname = usePathname();
  const inkLength = inkAddressLength(useScribble().addressInk);
  const addressLength = urlLength > 0 ? urlLength + inkLength : inkLength > 0 ? pathname.length + inkLength : 0;

  return (
    <AddImagesProvider onOpenFiles={openFiles} fallbackFocusRef={openFileButtonRef}>
    <ZenStage bar={<ZenBar/>}>
    <div className={cn(
      'w-full flex flex-col items-center',
      !stage && 'relative',
      (stage === 'wide' || stage === 'tall') && 'grow px-(--stage-pad-x) py-(--stage-pad-y) gap-(--stage-gap)',
      (stage === 'wide' || stage === 'tall') && 'min-h-0',
      stage === 'overlay' && 'absolute top-(--stage-pad-y) right-(--stage-pad-x) stage:w-(--stage-panel-width) max-h-[calc(var(--stage-frame-height)-2*var(--stage-pad-y))] p-(--stage-panel-pad) rounded-(--stage-panel-radius) gap-(--stage-gap) bg-background text-foreground',
    )}>
      <div className={stage
        ? cn('w-full flex flex-row justify-between gap-(--stage-gap)', stage === 'tall' ? 'items-start' : 'items-end')
        : 'w-full flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between'}>
        <ListTitle title={title} onSave={setTitle}/>
        <div role="group" aria-label="Editor tools" className="hide-in-zen flex flex-wrap gap-2 sm:flex-nowrap sm:shrink-0" id="settings" data-html2canvas-ignore>
          <span><ItemManager openFocusRef={openFileButtonRef}/></span>
          <ZenToggle/>
          <span><ShareButton title={title}/></span>
        </div>
        <Image
          src={otbLogo}
          alt="OpenTierBoy"
          height={36}
          className={cn(
            'hidden zen-mode:block h-9 w-auto self-end sm:self-center sm:shrink-0 opacity-95',
            'stage:h-(--stage-wordmark) stage:shrink-0 stage:self-auto',
          )}
        />
      </div>
      <LinkImageNotice/>
      <InkNotice/>
      <div className={stage ? cn('w-full min-h-0 flex flex-col', stage !== 'overlay' && 'grow') : 'w-full mt-3'}>
        <DragDropTierList
          belowRows={<RowControls/>}
          addImagesTile={<ItemManager trigger="tile"/>}
          emptyListArea={<EmptyListDropArea/>}
        />
      </div>
      <div className="w-full hide-in-zen" data-html2canvas-ignore>
        <UrlLengthWarning urlLength={addressLength}/>
      </div>
      {openListDialog}
      <DropOverlay visible={dragging && !isZenMode}/>
      {!stage && <ScribbleLayer/>}
    </div>
    {stage && <ScribbleLayer/>}
    </ZenStage>
    </AddImagesProvider>
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
