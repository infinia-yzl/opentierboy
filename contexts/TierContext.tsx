'use client';

import React, {useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore} from 'react';
import {usePathname, useSearchParams} from "next/navigation";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
import {ItemSet} from "@/models/ItemSet";
import {createTierCortex, type TierCortex} from "@/lib/TierCortex";
import {recordRecentLink} from "@/components/useRecentLinks";
import {listAddressWritten} from "@/components/useListSteps";
import {rankPageTitle} from "@/lib/rankRoute";
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
 * title and the layout settings, connected to the address. The address is the one source of
 * truth: the list on screen is always the list of the browser's address.
 *
 * - Store to address: every change to the list records a write, and the commit of the render
 *   that made the change puts it into the browser history with history.pushState: one new
 *   entry per change, in order, never merged (product rule 2: history is the undo). A change to
 *   the layout settings uses history.replaceState (A3, LAYOUT_LINK_WRITE in
 *   lib/tierListReducer.ts). An edit asks nothing of the server: Next.js follows both calls, so
 *   usePathname and useSearchParams show the new address a moment later, without a request.
 * - Address to store: Back and Forward (popstate) load the list of the browser's address at
 *   once. An address the router shows (useSearchParams) is checked during render: the router
 *   catching up with a write or with Back is nothing new; a navigation of the router itself
 *   to another list of this page loads that list. Loading never writes the address (A1).
 * - The tab title follows the list (rankPageTitle, the same title the server writes for the
 *   address): the server's copy of the title only knows the address the page was loaded with.
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
   * format: what Share hands out (A46). It never comes from the address, which can hold an
   * older link format, or older settings (after Back, the layout stays as it is on screen).
   */
  shareLink: string;
  /**
   * How many links this editor has written into the address: it grows with each change made
   * here, never with Back, Forward or an opened link.
   */
  linkWrites: number;

  setTitle: (title: string) => void;
  moveItem: (from: ItemPosition, to: ItemPosition) => void;
  /** Moves the items of a row (its stack); the tier names stay in place (product rule 6). */
  moveTier: (from: number, to: number) => void;
  /** Moves a whole row, its name included (its grip; owner decision, 2026-11-14). */
  moveRow: (from: number, to: number) => void;
  /** Adds an empty row above Unranked (#182), without a name ("Row <n>"), up to MAX_TIER_ROWS (lib/dnd/moves.ts). */
  addTier: () => void;
  /** Removes a ranked row (#182); its items go to the end of Unranked. */
  removeTier: (tierId: string) => void;
  renameTier: (index: number, name: string) => void;
  deleteItem: (itemId: string) => void;
  /** Puts a deleted item back at its place in the tier it came from, or at the end when the tier is shorter now (toast Undo). */
  restoreItem: (item: Item, tierId: string, index: number) => void;
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
  /** The page title: the title of a list whose link has none. */
  pageTitle: string;
  children: React.ReactNode;
}

export function TierListProvider({initialItemSet, pageTitle, children}: TierListProviderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The `state` parameter of the address the router shows. The editor starts with it: the
  // server's copy of the page reads the same address (app/rank/layout.tsx), so the first render
  // in the browser matches it.
  const routerAddress = stateParam(searchParams.get('state'));

  const [{tierCortex, encode, reducer}] = useState(() => {
    const cortex = createTierCortex();
    const encodeList: ListEncoder = (title, tiers, layout) => cortex.encodeListForURL(title, tiers, layout);
    return {tierCortex: cortex, encode: encodeList, reducer: createTierListReducer(encodeList)};
  });
  const [state, dispatch] = useReducer(reducer, null, () =>
    initialTierListState(loadList(tierCortex, routerAddress, initialItemSet, pageTitle), routerAddress, encode));

  // Recently viewed: a list opened fresh (this editor started with a link that holds a list) is
  // recorded once. Edits, Back and Forward are not.
  const [openedLink] = useState(() =>
    state.address && state.addressHoldsList ? {path: pathname, state: state.address, title: state.title} : null);
  useEffect(() => {
    if (openedLink) recordRecentLink(openedLink);
  }, [openedLink]);

  // The router shows a new address: checked during render, so the screen never shows a list
  // from another address. Most often it is the router catching up with a write or with Back.
  if (routerAddress !== state.routerAddress) {
    const loaded = addressNeedsLoading(state, routerAddress) ? loadList(tierCortex, routerAddress, initialItemSet, pageTitle) : null;
    dispatch({type: 'routerAddressChanged', address: routerAddress, loaded});
  }

  // Store to address: each write goes into the browser history in the commit of the render
  // that recorded it, before the browser paints and before the next event: a Back pressed
  // right after a change steps back from it. Writes are made once each, by id.
  const lastWritten = useRef(-1);
  useLayoutEffect(() => {
    for (const write of state.writes) {
      if (write.id <= lastWritten.current) continue;
      lastWritten.current = write.id;
      const href = `${pathname}?state=${write.link}`;
      // Next.js follows both calls (its router shows the address, without a request), and
      // copies its own history state into the entry, so Back and Forward restore it.
      if (write.mode === 'replace') window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
      listAddressWritten(write.mode);
    }
  }, [state.writes, pathname]);

  // Address to store: Back and Forward inside the editor load the list of the browser's address
  // at once, also when the router skips the address (Back right after a change, before the router
  // showed it). Back or Forward to another page leaves the editor: nothing to load.
  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname !== pathname) return;
      const address = stateParam(new URLSearchParams(window.location.search).get('state'));
      dispatch({
        type: 'browserMoved',
        address,
        writtenThrough: lastWritten.current,
        loaded: loadList(tierCortex, address, initialItemSet, pageTitle),
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [pathname, tierCortex, initialItemSet, pageTitle]);

  const actions = useMemo(() => ({
    setTitle: (title: string) => dispatch({type: 'titleChanged', title}),
    moveItem: (from: ItemPosition, to: ItemPosition) => dispatch({type: 'itemMoved', from, to}),
    moveTier: (from: number, to: number) => dispatch({type: 'tierMoved', from, to}),
    moveRow: (from: number, to: number) => dispatch({type: 'rowMoved', from, to}),
    addTier: () => dispatch({type: 'tierAdded'}),
    removeTier: (tierId: string) => dispatch({type: 'tierRemoved', tierId}),
    renameTier: (index: number, name: string) => dispatch({type: 'tierRenamed', index, name}),
    deleteItem: (itemId: string) => dispatch({type: 'itemDeleted', itemId}),
    restoreItem: (item: Item, tierId: string, index: number) => dispatch({type: 'itemRestored', item, tierId, index}),
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
    linkWrites: state.nextWriteId,
    ...actions,
  }), [tierCortex, state.tiers, state.title, state.labelPosition, state.showLabels, urlLength, shareLink, state.nextWriteId, actions]);

  return (
    <TierContext.Provider value={value}>
      <ListTabTitle title={rankPageTitle(pageTitle, state.title)}/>
      {children}
    </TierContext.Provider>
  );
}

const noSubscription = () => () => {};

/**
 * The tab title of the list on screen, as a <title> that React puts at the top of <head>, before
 * the one of the page's metadata, so it wins. Rendered only once the page runs in the browser:
 * the server's HTML keeps the one title of the metadata, for link previews and search engines.
 */
function ListTabTitle({title}: {title: string}) {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  return inBrowser ? <title>{title}</title> : null;
}
