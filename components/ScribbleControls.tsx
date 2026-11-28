'use client';

import React, {useLayoutEffect, useRef, useState} from 'react';
import {ChevronDownIcon} from '@radix-ui/react-icons';
import {LuTrash2, LuUndo2} from 'react-icons/lu';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {BAR_BOX, BAR_CHEVRON_SIZE, BAR_ICON_SIZE, BAR_MENU_BUTTON, BarButton} from '@/components/ZenBarButton';
import {clearScribbles, removeLastNote, setInkColour, useScribble} from '@/components/useScribble';
import {INK_COLOUR_NAMES, INK_COLOURS, isInkColour, type InkColour} from '@/lib/scribble/colours';
import {inkLevel, inkStatusText, type InkLevel} from '@/lib/scribble/supply';
import {cn} from '@/lib/utils';

export const INK_DOT_CLASSES: Readonly<Record<InkColour, string>> = Object.freeze({
  red: 'bg-scribble-red',
  blue: 'bg-scribble-blue',
  contrast: 'bg-scribble-contrast',
});

const OUT_OF_INK_HINT = 'bg-amber-500/25 text-amber-800 hover:bg-amber-500/35 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100';
const BESIDE_GAP = 8;

function InkDot({colour, className}: {colour: InkColour; className?: string}) {
  return <span aria-hidden="true" className={cn('inline-block rounded-full border border-foreground/30', INK_DOT_CLASSES[colour], className)}/>;
}

function useFitsBeside(barRef: React.RefObject<HTMLElement | null>, controlsRef: React.RefObject<HTMLElement | null>): boolean {
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const controls = controlsRef.current;
    if (!bar || !controls) return;
    const check = () => setFits(bar.getBoundingClientRect().right + BESIDE_GAP + controls.offsetWidth <= document.documentElement.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(bar);
    observer.observe(controls);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [barRef, controlsRef]);
  return fits;
}

function InkLevelStatus({level}: {level: InkLevel}) {
  const status = inkStatusText(level);
  if (!status) return null;
  const out = level.state === 'out';
  return (
    <div role="status" className={cn(BAR_BOX, 'gap-2 px-3 tabular-nums')}>
      <span className="sr-only">{status}</span>
      <span aria-hidden="true" className="block h-1.5 w-[2.5em] overflow-hidden rounded-full bg-muted-foreground/25">
        <span className="block h-full rounded-full bg-amber-500" style={{width: `${level.percent}%`}}/>
      </span>
      <span aria-hidden="true">{out ? 'Out of ink' : `${level.percent}%`}</span>
      <span aria-hidden="true" className="text-muted-foreground">{out ? '(x_x)' : '(o_o;)'}</span>
    </div>
  );
}

export function ScribbleControls({barRef, menuOpen, onMenuOpenChange}: {
  barRef: React.RefObject<HTMLElement | null>;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const {colour, spent} = useScribble();
  const controlsRef = useRef<HTMLDivElement>(null);
  const beside = useFitsBeside(barRef, controlsRef);
  const level = inkLevel(spent);
  const out = level.state === 'out';
  const colourName = INK_COLOUR_NAMES[colour];
  return (
    <div
      ref={controlsRef}
      role="toolbar"
      aria-label="Scribble"
      className={cn(
        'pointer-events-auto absolute z-40 flex w-max items-center gap-2',
        beside ? 'left-full top-0 ml-2' : 'left-1/2 top-full mt-1 -translate-x-1/2',
      )}
    >
      <div className={BAR_BOX}>
        <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={cn(BAR_MENU_BUTTON, out && 'opacity-40')} aria-label={`Ink colour: ${colourName}`} disabled={out}>
                  <InkDot colour={colour} className={BAR_ICON_SIZE}/>
                  <ChevronDownIcon aria-hidden className={BAR_CHEVRON_SIZE}/>
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Ink colour: {colourName}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="center" className="w-44">
            <DropdownMenuLabel>Ink colour</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={colour} onValueChange={(value) => isInkColour(value) && setInkColour(value)}>
              {INK_COLOURS.map((option) => (
                <DropdownMenuRadioItem key={option} value={option} className="gap-2">
                  <InkDot colour={option} className="h-3 w-3"/>
                  {INK_COLOUR_NAMES[option]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <BarButton label="Remove last note" tip="Remove last note" className={out ? OUT_OF_INK_HINT : undefined} onClick={removeLastNote}>
          <LuUndo2 aria-hidden className={BAR_ICON_SIZE}/>
        </BarButton>
        <BarButton label="Clear scribbles" tip="Clear scribbles" className={out ? OUT_OF_INK_HINT : undefined} onClick={clearScribbles}>
          <LuTrash2 aria-hidden className={BAR_ICON_SIZE}/>
        </BarButton>
      </div>
      <div className="flex w-[13em] stage:text-(length:--stage-bar-text)">
        <InkLevelStatus level={level}/>
      </div>
    </div>
  );
}
