'use client';

import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, Cross2Icon} from '@radix-ui/react-icons';
import {LuLayoutGrid, LuListOrdered, LuShuffle} from 'react-icons/lu';
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
import {cn} from '@/lib/utils';

/** How long the mouse stays still before the Zen bar hides. */
export const ZEN_BAR_IDLE_MS = 2500;

const ORDER_ICONS: Record<RankingOrder, React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>> = {
  pick: LuLayoutGrid,
  order: LuListOrdered,
  shuffle: LuShuffle,
};

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
  const [menuOpen, setMenuOpen] = useState(false);
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

  return (
    // The wrapper lets clicks through: while the bar is hidden, the page under it stays usable.
    <div className="pointer-events-none fixed top-6 left-1/2 z-40 -translate-x-1/2" data-html2canvas-ignore>
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
            shown ? 'pointer-events-auto opacity-100' : 'opacity-0',
          )}
        >
          <BarButton label="Back" tip="Back: the previous version of the list" shown={shown} disabled={step <= 1} onClick={stepBack}>
            <ChevronLeftIcon className="h-4 w-4"/>
          </BarButton>
          <span role="status" className="px-1 whitespace-nowrap tabular-nums text-muted-foreground">
            {step} / {total}
          </span>
          <BarButton label="Forward" tip="Forward: the next version of the list" shown={shown} disabled={step >= total} onClick={stepForward}>
            <ChevronRightIcon className="h-4 w-4"/>
          </BarButton>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border"/>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip open={shown ? undefined : false}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-1 px-2" aria-label={`Ranking order: ${orderName}`}>
                    <OrderIcon aria-hidden className="h-4 w-4"/>
                    <ChevronDownIcon aria-hidden className="h-3 w-3"/>
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
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border"/>
          <BarButton label="Exit Zen" tip="Exit Zen (Esc)" shown={shown} onClick={() => setZenMode(false)}>
            <Cross2Icon className="h-4 w-4"/>
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
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={label} disabled={disabled} onClick={onClick}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
