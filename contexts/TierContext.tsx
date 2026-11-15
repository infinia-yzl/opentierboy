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

export interface TierContext {
  tierCortex: TierCortex;
  tiers: Tier[];
  title: string;
  labelPosition: LabelPosition;
  showLabels: boolean;
  /** Length of the address when it holds the list on screen, else 0 (for the long-link warning). */
  urlLength: number;
  shareLink: string;
  linkWrites: number;

  setTitle: (title: string) => void;
  moveItem: (from: ItemPosition, to: ItemPosition) => void;
  moveTier: (from: number, to: number) => void;
  moveRow: (from: number, to: number) => void;
  addTier: () => void;
  /** Removes a ranked row (#182); its items go to the end of Unranked. */
  removeTier: (tierId: string) => void;
  renameTier: (index: number, name: string) => void;
  deleteItem: (itemId: string) => void;
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

  if (routerAddress !== state.routerAddress) {
    const loaded = addressNeedsLoading(state, routerAddress) ? loadList(tierCortex, routerAddress, initialItemSet, pageTitle) : null;
    dispatch({type: 'routerAddressChanged', address: routerAddress, loaded});
  }

  const lastWritten = useRef(-1);
  useLayoutEffect(() => {
    for (const write of state.writes) {
      if (write.id <= lastWritten.current) continue;
      lastWritten.current = write.id;
      const href = `${pathname}?state=${write.link}`;
      if (write.mode === 'replace') window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
      listAddressWritten(write.mode);
    }
  }, [state.writes, pathname]);

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

function ListTabTitle({title}: {title: string}) {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  return inBrowser ? <title>{title}</title> : null;
}
