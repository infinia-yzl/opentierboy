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

/** The size classes of the bar's buttons and icons; in a frame layout, the frame's sizes (lib/zen/layouts.ts). */
const BUTTON_SIZE = 'h-8 w-8 stage:size-(--stage-bar-button)';
const ICON_SIZE = 'h-4 w-4 stage:size-(--stage-bar-icon)';
const SEPARATOR = 'mx-1 h-5 w-px bg-border stage:h-[calc(var(--stage-bar)*0.57)]';

/** The Zen bar's menus: Ranking order and Layout. */
type BarMenu = 'order' | 'layout';

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

function ZenBarContent() {
  const {tiers} = useTierContext();
  const {step, total} = useListSteps();
  const {order, hideQueue} = useRankingOrder();
  const zenLayout = useZenLayout();
  // One menu open at a time: opening one closes the other. The bar sets its own pointer events,
  // so it still takes clicks while a menu has turned them off for the rest of the page; a click
  // on the other menu's button opened that menu and left the first one open.
  const [openMenu, setOpenMenu] = useState<BarMenu | null>(null);
  const onMenuOpenChange = (menu: BarMenu) => (open: boolean) => {
    setOpenMenu((current) => open ? menu : current === menu ? null : current);
  };
  const barRef = useRef<HTMLDivElement>(null);

  // The Zen toggle that turned Zen on hides with the tools: its focus moves to the bar, so Tab
  // goes on to the bar's buttons. (On the bar itself, not a button, which would open a tooltip.)
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || active.offsetParent === null) barRef.current?.focus();
  }, []);

  // A new Zen session in Shuffle draws a new order of the Unranked items.
  const tiersRef = useRef(tiers);
  useLayoutEffect(() => {
    tiersRef.current = tiers;
  }, [tiers]);
  useEffect(() => {
    if (getRankingOrder().order === 'shuffle') setRankingOrder('shuffle', trayIdsOf(tiersRef.current));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isTextField(event.target)) return;
      setZenMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const orderName = RANKING_ORDER_NAMES[order];
  const OrderIcon = ORDER_ICONS[order];
  const layoutName = ZEN_LAYOUT_NAMES[zenLayout];
  const LayoutIcon = LAYOUT_ICONS[zenLayout];

  return (
    // Its own row at the top centre, above the title row: it takes room instead of covering the
    // list. In a frame layout, the strip above the frame is its row (components/ZenStage.tsx).
    <div className="flex w-full justify-center pb-3 stage:pb-0" data-html2canvas-ignore>
      <TooltipProvider>
        <div
          ref={barRef}
          role="toolbar"
          aria-label="Zen"
          tabIndex={-1}
          className={cn(
            // Its own pointer events: a click on one menu's button reaches it while the other
            // menu is open (an open menu turns them off for the rest of the page).
            'pointer-events-auto flex h-11 items-center gap-0.5 rounded-lg border outline-none bg-background px-1.5 text-sm font-medium shadow-md',
            'stage:h-(--stage-bar) stage:text-(length:--stage-bar-text)',
          )}
        >
          <BarButton label="Back" tip="Back: the previous version of the list" disabled={step <= 1} onClick={stepBack}>
            <ChevronLeftIcon className={ICON_SIZE}/>
          </BarButton>
          <span role="status" className="px-1 whitespace-nowrap tabular-nums text-muted-foreground">
            {step} / {total}
          </span>
          <BarButton label="Forward" tip="Forward: the next version of the list" disabled={step >= total} onClick={stepForward}>
            <ChevronRightIcon className={ICON_SIZE}/>
          </BarButton>
          <span aria-hidden="true" className={SEPARATOR}/>
          <DropdownMenu open={openMenu === 'order'} onOpenChange={onMenuOpenChange('order')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-1 px-2 stage:h-(--stage-bar-button)" aria-label={`Ranking order: ${orderName}`}>
                    <OrderIcon aria-hidden className={ICON_SIZE}/>
                    <ChevronDownIcon aria-hidden className="h-3 w-3 stage:size-[calc(var(--stage-bar-icon)*0.75)]"/>
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
          {/* Layout (owner decisions, 2026-10-31 and 2026-11-01): Zen in the editor, 16:9, 9:16 or
              the stream overlay. A view setting: it never writes the link or history. */}
          <DropdownMenu open={openMenu === 'layout'} onOpenChange={onMenuOpenChange('layout')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-1 px-2 stage:h-(--stage-bar-button)" aria-label={`Layout: ${layoutName}`}>
                    <LayoutIcon aria-hidden className={ICON_SIZE}/>
                    <ChevronDownIcon aria-hidden className="h-3 w-3 stage:size-[calc(var(--stage-bar-icon)*0.75)]"/>
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
          <span aria-hidden="true" className={SEPARATOR}/>
          <BarButton label="Exit Zen" tip="Exit Zen (Esc)" onClick={() => setZenMode(false)}>
            <Cross2Icon className={ICON_SIZE}/>
          </BarButton>
        </div>
      </TooltipProvider>
    </div>
  );
}

/** A button of the bar, with its tooltip. */
function BarButton({label, tip, disabled, onClick, children}: {
  label: string;
  tip: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the tooltip needs a wrapper to show. */}
        <span className="inline-flex" tabIndex={-1}>
          <Button variant="ghost" size="icon" className={BUTTON_SIZE} aria-label={label} disabled={disabled} onClick={onClick}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
