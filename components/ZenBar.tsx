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
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {setLayoutChoice, setWordmark, useZenLayout} from '@/components/useZenLayout';
import {
  LAYOUT_CHOICE_NAMES,
  LAYOUT_CHOICES,
  layoutAddress,
  layoutChoiceId,
  type ZenLayout,
} from '@/lib/zen/layouts';
import {cn} from '@/lib/utils';

/** How long the mouse stays still before the Zen bar hides. */
export const ZEN_BAR_IDLE_MS = 2500;

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

/**
 * Copies the address of this list in the overlay, for an OBS browser source (lib/zen/layouts.ts,
 * layoutAddress). The address is the page's own, with the `layout` parameter.
 */
async function copyOverlayAddress(choiceId: string) {
  const {origin, pathname, search} = window.location;
  try {
    await navigator.clipboard.writeText(layoutAddress(origin, pathname, search, LAYOUT_CHOICES[choiceId]));
    toast.success('Link for OBS copied', {description: 'Add it to OBS as a browser source.'});
  } catch {
    toast.error('Failed to copy the link');
  }
}

/** The Zen bar's menus: Ranking order and Layout. */
type BarMenu = 'order' | 'layout';

/** The ids of the Unranked items (the last row). */
const trayIdsOf = (tiers: readonly {items: readonly {id: string}[]}[]) => tiers[tiers.length - 1]?.items.map(item => item.id) ?? [];

/**
 * True while the bar should show: for ZEN_BAR_IDLE_MS after the mouse last moved or a finger
 * last touched the page, and as long as `keepShown` (pointer over the bar, focus in it, its menu
 * open).
 */
function useBarShown(keepShown: boolean): boolean {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      setAwake(true);
      clearTimeout(timer);
      timer = setTimeout(() => setAwake(false), ZEN_BAR_IDLE_MS);
    };
    wake();
    window.addEventListener('pointermove', wake, {passive: true});
    window.addEventListener('pointerdown', wake, {passive: true});
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, []);
  return awake || keepShown;
}

/**
 * True while the last input was the keyboard: focus in the bar then keeps it shown. Focus that a
 * click leaves behind (or a menu gives back after a click) does not.
 */
function useKeyboardInput(): () => boolean {
  const keyboard = useRef(false);
  useEffect(() => {
    const onKey = () => {
      keyboard.current = true;
    };
    const onPointer = () => {
      keyboard.current = false;
    };
    window.addEventListener('keydown', onKey, {capture: true});
    window.addEventListener('pointerdown', onPointer, {capture: true});
    return () => {
      window.removeEventListener('keydown', onKey, {capture: true});
      window.removeEventListener('pointerdown', onPointer, {capture: true});
    };
  }, []);
  return () => keyboard.current;
}

/** True when a key press belongs to a text field (Escape there cancels the edit). */
function isTextField(target: EventTarget | null): boolean {
  const element = target as {closest?: (selector: string) => unknown} | null;
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

/**
 * The Zen bar (owner decisions, 2026-10-28 and 2026-10-31), at the top centre while Zen is on:
 * Back, the step count, Forward, the ranking order and Exit Zen. Back and Forward are the
 * browser's own (the list's undo); Back stops at the list's first version. The bar hides while
 * the mouse is still, and shows again when it moves or when the keyboard reaches the bar.
 * Escape also exits Zen, unless something else used it (a menu, a drag, a text box).
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
  const menuOpen = openMenu !== null;
  const onMenuOpenChange = (menu: BarMenu) => (open: boolean) => {
    setOpenMenu((current) => open ? menu : current === menu ? null : current);
  };
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const shown = useBarShown(menuOpen || hovered || focused);
  const barRef = useRef<HTMLDivElement>(null);
  const lastInputWasKeyboard = useKeyboardInput();

  // The pointer over the bar itself. React's pointer events would count its menu too (a portal).
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    bar.addEventListener('pointerenter', enter);
    bar.addEventListener('pointerleave', leave);
    return () => {
      bar.removeEventListener('pointerenter', enter);
      bar.removeEventListener('pointerleave', leave);
    };
  }, []);

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
  const layoutId = layoutChoiceId(zenLayout);
  const layoutName = LAYOUT_CHOICE_NAMES[layoutId];
  const LayoutIcon = LAYOUT_ICONS[zenLayout.layout];

  return (
    // The wrapper lets clicks through: while the bar is hidden, the page under it stays usable.
    // In a frame layout the bar sits at the frame's padding and takes the frame's sizes: at the
    // top, at the bottom in 9:16 (the board "9:16 · In order"), and at the top left beside the
    // overlay's panel.
    <div className="pointer-events-none fixed top-6 left-1/2 z-40 -translate-x-1/2 stage:top-(--stage-pad-y) stage-tall:top-auto stage-tall:bottom-(--stage-pad-y) stage-overlay:left-(--stage-pad-x) stage-overlay:translate-x-0" data-html2canvas-ignore>
      <TooltipProvider>
        <div
          ref={barRef}
          role="toolbar"
          aria-label="Zen"
          tabIndex={-1}
          // Keyboard focus keeps the bar shown; focus that a click left behind does not.
          onFocus={() => setFocused(lastInputWasKeyboard())}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
          className={cn(
            'flex h-11 items-center gap-0.5 rounded-lg border outline-none bg-background/95 px-1.5 text-sm font-medium shadow-md transition-opacity duration-300',
            'stage:h-(--stage-bar) stage:text-(length:--stage-bar-text)',
            shown ? 'pointer-events-auto opacity-100' : 'opacity-0',
          )}
        >
          <BarButton label="Back" tip="Back: the previous version of the list" shown={shown} disabled={step <= 1} onClick={stepBack}>
            <ChevronLeftIcon className={ICON_SIZE}/>
          </BarButton>
          <span role="status" className="px-1 whitespace-nowrap tabular-nums text-muted-foreground">
            {step} / {total}
          </span>
          <BarButton label="Forward" tip="Forward: the next version of the list" shown={shown} disabled={step >= total} onClick={stepForward}>
            <ChevronRightIcon className={ICON_SIZE}/>
          </BarButton>
          <span aria-hidden="true" className={SEPARATOR}/>
          <DropdownMenu open={openMenu === 'order'} onOpenChange={onMenuOpenChange('order')}>
            <Tooltip open={shown ? undefined : false}>
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
          {/* Layout (owner decision, 2026-10-31): Zen in the editor, 16:9, 9:16 or the stream
              overlay, and the wordmark. View settings: they never write the link or history. */}
          <DropdownMenu open={openMenu === 'layout'} onOpenChange={onMenuOpenChange('layout')}>
            <Tooltip open={shown ? undefined : false}>
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
              <DropdownMenuRadioGroup value={layoutId} onValueChange={(value) => setLayoutChoice(LAYOUT_CHOICES[value])}>
                {Object.keys(LAYOUT_CHOICES).map((id) => (
                  <DropdownMenuRadioItem key={id} value={id}>
                    {LAYOUT_CHOICE_NAMES[id]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator/>
              <DropdownMenuCheckboxItem checked={zenLayout.wordmark} onCheckedChange={setWordmark}>
                Wordmark
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem disabled={zenLayout.layout !== 'overlay'} onSelect={() => copyOverlayAddress(layoutId)}>
                Copy link for OBS
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span aria-hidden="true" className={SEPARATOR}/>
          <BarButton label="Exit Zen" tip="Exit Zen (Esc)" shown={shown} onClick={() => setZenMode(false)}>
            <Cross2Icon className={ICON_SIZE}/>
          </BarButton>
        </div>
      </TooltipProvider>
    </div>
  );
}

/** A button of the bar, with its tooltip (closed while the bar is hidden). */
function BarButton({label, tip, shown, disabled, onClick, children}: {
  label: string;
  tip: string;
  shown: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip open={shown ? undefined : false}>
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
