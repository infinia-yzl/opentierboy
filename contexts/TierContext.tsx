'use client';

import React, {useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
import {ItemSet} from "@/models/ItemSet";
import {createTierCortex, type TierCortex} from "@/lib/TierCortex";
import {recordRecentLink} from "@/components/useRecentLinks";
import {
  addressNeedsLoading,
  createTierListReducer,
  initialTierListState,
  ItemPosition,
  ListEncoder,
  loadList,
  stateParam,
} from "@/lib/tierListReducer";

/**
 * The tier list editor's store: one useReducer (lib/tierListReducer.ts) for the list, the
 * title and the layout settings, connected to the address.
 *
 * - Address to store: when the `state` parameter changes (opening a link, Back, Forward, an
 *   own write arriving), the store loads the list from it, or the template's starting list
 *   when there is none. Loading never writes the address (A1).
 * - Store to address: every change to the list records a write, and an effect pushes the
 *   writes one at a time with router.push, each as a new history entry (product rule 2: history
 *   is the undo). The next write is pushed only once the previous one has reached the address:
 *   Next.js drops a navigation that is still loading when a new one starts, so pushing them
 *   together lost entries on a slow connection (A44). A change to the layout settings is
 *   written with router.replace (A3, LAYOUT_LINK_WRITE in lib/tierListReducer.ts), in the
 *   same queue.
 *
 * The link format comes through TierCortex: encodeListForURL writes a v3 link with the layout
 * settings, and decodeTierStateFromURL reads every format (loadList in lib/tierListReducer.ts).
 * A link's layout settings apply only when the editor starts with it (see lib/tierListReducer.ts).
 */
export interface TierContext {
  tierCortex: TierCortex;
  tiers: Tier[];
  title: string;
  labelPosition: LabelPosition;
  showLabels: boolean;
  /** Length of the address when it holds the list on screen, else 0 (for the long-link warning). */
  urlLength: number;
  /**
   * The link of the list on screen with the layout on screen, written by the current link
   * format: what Share hands out (A46). It never comes from the address, which can lag behind
   * the screen (writes reach it one at a time) or hold older settings (after Back, the layout
   * stays as it is on screen).
   */
  shareLink: string;
  /**
   * True while changes to the list are still on their way to the address (each becomes its own
   * history entry, one at a time). Code that makes a series of changes, such as queued pastes,
   * waits for false between them, so each change stays its own Back step.
   */
  writing: boolean;

  setTitle: (title: string) => void;
  moveItem: (from: ItemPosition, to: ItemPosition) => void;
  /** Moves a row; the tier names stay in place (product rule 6). */
  moveTier: (from: number, to: number) => void;
  renameTier: (index: number, name: string) => void;
  deleteItem: (itemId: string) => void;
  /** Puts a deleted item back at the end of the tier it came from (toast Undo). */
  restoreItem: (item: Item, tierId: string) => void;
  /** Adds items to Unranked, leaving out items the list already holds. */
  addItems: (items: Item[]) => void;
  removeItems: (itemIds: string[]) => void;
  /** Puts every item back in Unranked. */
  resetRankings: () => void;
  removeAllItems: () => void;
  /** Shows these tiers again (toast Undo of Reset and Remove All). */
  restoreTiers: (tiers: Tier[]) => void;
  /** Switches to another row template (3, 5 or 7 rows). */
  onTemplateChange: (template: readonly Tier[]) => void;
  /** Layout settings: they replace the current history entry (A3, LAYOUT_LINK_WRITE). */
  setLabelPosition: (position: LabelPosition) => void;
  toggleLabels: () => void;
}

export const TierContext = React.createContext<TierContext | undefined>(undefined);

export const useTierContext = () => {
  const context = React.useContext(TierContext);
  if (context === undefined) {
    throw new Error('useTierContext must be used within a TierListProvider');
  }
  return context;
};

interface TierListProviderProps {
  /** The template of this page (/rank/<set>/<tag>), if any. */
  initialItemSet?: ItemSet;
  /** The `state` parameter the page was opened with. */
  initialState?: string;
  /** The page title: the title of a list whose link has none. */
  pageTitle: string;
  children: React.ReactNode;
}

export function TierListProvider({initialItemSet, initialState, pageTitle, children}: TierListProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{tierCortex, encode, reducer}] = useState(() => {
    const cortex = createTierCortex();
    const encodeList: ListEncoder = (title, tiers, layout) => cortex.encodeListForURL(title, tiers, layout);
    return {tierCortex: cortex, encode: encodeList, reducer: createTierListReducer(encodeList)};
  });
  const [state, dispatch] = useReducer(reducer, null, () => {
    const address = stateParam(initialState);
    return initialTierListState(loadList(tierCortex, address, initialItemSet, pageTitle), address, encode);
  });

  // Recently viewed: a list opened fresh (this editor started with a link that holds a list) is
  // recorded once. Edits, Back and Forward are not.
  const [openedLink] = useState(() =>
    state.address && state.addressHoldsList ? {path: pathname, state: state.address, title: state.title} : null);
  useEffect(() => {
    if (openedLink) recordRecentLink(openedLink);
  }, [openedLink]);

  // Address to store, during render, so the screen never shows a list from another address.
  const address = stateParam(searchParams.get('state'));
  if (address !== state.address) {
    const loaded = addressNeedsLoading(state, address) ? loadList(tierCortex, address, initialItemSet, pageTitle) : null;
    dispatch({type: 'addressChanged', address, loaded});
  }

  // Store to address: push the oldest write once. When it reaches the address, the reducer
  // drops it from the queue, and this pushes the next one.
  // Known limit, kept by the owner (2026-10-25): router.push adds the history entry only when
  // the server answers, so Back pressed before that loses the change (known-bug test in
  // tests/e2e/history.spec.ts). A fix would replace this call with history.pushState and a
  // metadata refresh.
  const lastPushedWrite = useRef(-1);
  useEffect(() => {
    const next = state.writes[0];
    if (!next || next.id <= lastPushedWrite.current) return;
    lastPushedWrite.current = next.id;
    const href = `${pathname}?state=${next.link}`;
    if (next.mode === 'replace') router.replace(href, {scroll: false});
    else router.push(href, {scroll: false});
  }, [state.writes, router, pathname]);

  const actions = useMemo(() => ({
    setTitle: (title: string) => dispatch({type: 'titleChanged', title}),
    moveItem: (from: ItemPosition, to: ItemPosition) => dispatch({type: 'itemMoved', from, to}),
    moveTier: (from: number, to: number) => dispatch({type: 'tierMoved', from, to}),
    renameTier: (index: number, name: string) => dispatch({type: 'tierRenamed', index, name}),
    deleteItem: (itemId: string) => dispatch({type: 'itemDeleted', itemId}),
    restoreItem: (item: Item, tierId: string) => dispatch({type: 'itemRestored', item, tierId}),
    addItems: (items: Item[]) => dispatch({type: 'itemsAdded', items}),
    removeItems: (itemIds: string[]) => dispatch({type: 'itemsRemoved', itemIds}),
    resetRankings: () => dispatch({type: 'rankingsReset'}),
    removeAllItems: () => dispatch({type: 'allItemsRemoved'}),
    restoreTiers: (tiers: Tier[]) => dispatch({type: 'tiersRestored', tiers}),
    onTemplateChange: (template: readonly Tier[]) => dispatch({type: 'rowTemplateChanged', template}),
    setLabelPosition: (labelPosition: LabelPosition) => dispatch({type: 'labelPositionChanged', labelPosition}),
    toggleLabels: () => dispatch({type: 'labelsToggled'}),
  }), []);

  const urlLength = state.address && state.addressHoldsList
    ? pathname.length + state.address.length + 7 // 7 is the length of "?state="
    : 0;

  const shareLink = useMemo(
    () => encode(state.title, state.tiers, {labelPosition: state.labelPosition, showLabels: state.showLabels}),
    [encode, state.title, state.tiers, state.labelPosition, state.showLabels],
  );

  const value = useMemo<TierContext>(() => ({
    tierCortex,
    tiers: state.tiers,
    title: state.title,
    labelPosition: state.labelPosition,
    showLabels: state.showLabels,
    urlLength,
    shareLink,
    writing: state.writes.length > 0,
    ...actions,
  }), [tierCortex, state.tiers, state.title, state.labelPosition, state.showLabels, urlLength, shareLink, state.writes.length, actions]);

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}
