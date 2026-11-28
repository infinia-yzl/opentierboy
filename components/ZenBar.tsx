'use client';

import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, Cross2Icon} from '@radix-ui/react-icons';
import {
  LuCast,
  LuLayoutGrid,
  LuListOrdered,
  LuPanelsTopLeft,
  LuRectangleHorizontal,
  LuRectangleVertical,
  LuShuffle,
} from 'react-icons/lu';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {useTierContext} from '@/contexts/TierContext';
import {useZenMode} from '@/components/usePageState';
import {setZenMode} from '@/components/zenMode';
import {stepBack, stepForward, useListSteps} from '@/components/useListSteps';
import {getRankingOrder, setHideQueue, setRankingOrder, useRankingOrder} from '@/components/useRankingOrder';
import {RANKING_ORDER_NAMES, RANKING_ORDERS, type RankingOrder} from '@/lib/zen/queue';
import {setZenLayout, useZenLayout} from '@/components/useZenLayout';
import {ZEN_LAYOUT_NAMES, ZEN_LAYOUTS, type ZenLayout} from '@/lib/zen/layouts';
import {BAR_BOX, BAR_CHEVRON_SIZE, BAR_ICON_SIZE, BAR_MENU_BUTTON, BAR_SEPARATOR, BarButton} from '@/components/ZenBarButton';
import {ScribbleControls} from '@/components/ScribbleControls';
import {ScribbleIcon} from '@/components/ScribbleIcon';
import {getPen, setScribble, toggleScribble, useScribble} from '@/components/useScribble';
import {cn} from '@/lib/utils';

const ORDER_ICONS: Record<RankingOrder, React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>> = {
  pick: LuLayoutGrid,
  order: LuListOrdered,
  shuffle: LuShuffle,
};

const LAYOUT_ICONS: Record<ZenLayout, React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>> = {
  editor: LuPanelsTopLeft,
  wide: LuRectangleHorizontal,
  tall: LuRectangleVertical,
  overlay: LuCast,
};

type BarMenu = 'order' | 'layout' | 'ink';

/** The ids of the Unranked items (the last row). */
const trayIdsOf = (tiers: readonly {items: readonly {id: string}[]}[]) => tiers[tiers.length - 1]?.items.map(item => item.id) ?? [];

/** True when a key press belongs to a text field (Escape there cancels the edit). */
function isTextField(target: EventTarget | null): boolean {
  const element = target as {closest?: (selector: string) => unknown} | null;
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

/**
 * The Zen bar (owner decisions, 2026-10-28 and 2026-10-31), at the top centre while Zen is on:
 * Back, the step count, Forward, the ranking order, the layout and Exit Zen. Back and Forward are
 * the browser's own (the list's undo); Back stops at the list's first version. Escape also exits
 * Zen, unless something else used it (a menu, a drag, a text box).
 *
 * The bar is always shown, and it never covers the list (owner decisions, 2026-11-01): it has
 * its own row at the top of the editor, above the title, and scrolls with the page. In 16:9,
 * 9:16 and the stream overlay it sits in a strip above the frame, at the frame's sizes.
 */
export function ZenBar() {
  const isZenMode = useZenMode();
  return isZenMode ? <ZenBarContent/> : null;
}

function isScribbleKey(event: KeyboardEvent): boolean {
  if (event.repeat || event.key.toLowerCase() !== 'd' || event.ctrlKey || event.metaKey || event.altKey) return false;
  const element = event.target as {closest?: (selector: string) => unknown} | null;
  return !element?.closest?.('[role="menu"], [role="dialog"]');
}

function ZenBarContent() {
  const {tiers} = useTierContext();
  const {step, total} = useListSteps();
  const {order, hideQueue} = useRankingOrder();
  const zenLayout = useZenLayout();
  const scribble = useScribble();
  const [openMenu, setOpenMenu] = useState<BarMenu | null>(null);
  const onMenuOpenChange = (menu: BarMenu) => (open: boolean) => {
    setOpenMenu((current) => open ? menu : current === menu ? null : current);
  };
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || active.offsetParent === null) barRef.current?.focus();
  }, []);

  const tiersRef = useRef(tiers);
  useLayoutEffect(() => {
    tiersRef.current = tiers;
  }, [tiers]);
  useEffect(() => {
    if (getRankingOrder().order === 'shuffle') setRankingOrder('shuffle', trayIdsOf(tiersRef.current));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextField(event.target)) return;
      if (event.key === 'Escape') {
        if (getPen().on) setScribble(false);
        else setZenMode(false);
        return;
      }
      if (isScribbleKey(event)) toggleScribble();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => setScribble(false), []);

  const orderName = RANKING_ORDER_NAMES[order];
  const OrderIcon = ORDER_ICONS[order];
  const layoutName = ZEN_LAYOUT_NAMES[zenLayout];
  const LayoutIcon = LAYOUT_ICONS[zenLayout];

  return (
    <div className="flex w-full justify-center pb-3 stage:pb-0" data-html2canvas-ignore>
      <TooltipProvider>
        <div className="relative">
          <div
            ref={barRef}
            role="toolbar"
            aria-label="Zen"
            tabIndex={-1}
            className={cn('pointer-events-auto outline-none', BAR_BOX)}
          >
            <BarButton label="Back" tip="Back: the previous version of the list" disabled={step <= 1} onClick={stepBack}>
              <ChevronLeftIcon className={BAR_ICON_SIZE}/>
            </BarButton>
            <span role="status" className="px-1 whitespace-nowrap tabular-nums text-muted-foreground">
              {step} / {total}
            </span>
            <BarButton label="Forward" tip="Forward: the next version of the list" disabled={step >= total} onClick={stepForward}>
              <ChevronRightIcon className={BAR_ICON_SIZE}/>
            </BarButton>
            <span aria-hidden="true" className={BAR_SEPARATOR}/>
            <DropdownMenu open={openMenu === 'order'} onOpenChange={onMenuOpenChange('order')}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className={BAR_MENU_BUTTON} aria-label={`Ranking order: ${orderName}`}>
                      <OrderIcon aria-hidden className={BAR_ICON_SIZE}/>
                      <ChevronDownIcon aria-hidden className={BAR_CHEVRON_SIZE}/>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Ranking order: {orderName}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuLabel>Ranking order</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={order}
                  onValueChange={(value) => setRankingOrder(value as RankingOrder, trayIdsOf(tiers))}
                >
                  {RANKING_ORDERS.map((option) => (
                    <DropdownMenuRadioItem key={option} value={option}>
                      {RANKING_ORDER_NAMES[option]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator/>
                <DropdownMenuCheckboxItem checked={hideQueue} disabled={order === 'pick'} onCheckedChange={setHideQueue}>
                  Hide the queue
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu open={openMenu === 'layout'} onOpenChange={onMenuOpenChange('layout')}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className={BAR_MENU_BUTTON} aria-label={`Layout: ${layoutName}`}>
                      <LayoutIcon aria-hidden className={BAR_ICON_SIZE}/>
                      <ChevronDownIcon aria-hidden className={BAR_CHEVRON_SIZE}/>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Layout: {layoutName}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuLabel>Layout</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={zenLayout} onValueChange={(value) => setZenLayout(value as ZenLayout)}>
                  {ZEN_LAYOUTS.map((layout) => (
                    <DropdownMenuRadioItem key={layout} value={layout}>
                      {ZEN_LAYOUT_NAMES[layout]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <BarButton label="Scribble" tip="Scribble (D)" pressed={scribble.on} onClick={toggleScribble}>
              <ScribbleIcon className={BAR_ICON_SIZE}/>
            </BarButton>
            <span aria-hidden="true" className={BAR_SEPARATOR}/>
            <BarButton label="Exit Zen" tip="Exit Zen (Esc)" onClick={() => setZenMode(false)}>
              <Cross2Icon className={BAR_ICON_SIZE}/>
            </BarButton>
          </div>
          {scribble.on && (
            <ScribbleControls barRef={barRef} menuOpen={openMenu === 'ink'} onMenuOpenChange={onMenuOpenChange('ink')}/>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
