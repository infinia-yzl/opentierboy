'use client';

import React, {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {usePathname, useSearchParams} from "next/navigation";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
import {ItemSet} from "@/models/ItemSet";
import {createTierCortex, type TierCortex} from "@/lib/TierCortex";
import type {ListLayout} from "@/lib/listLink";
import {recordRecentLink} from "@/components/useRecentLinks";
import {listAddressWritten} from "@/components/useListSteps";
import {writeHistory} from "@/components/historyWrite";
import {rankPageTitle} from "@/lib/rankRoute";
import type {ItemPosition} from "@/lib/dnd/model";
import {
  createListStore,
  DEFAULT_LAYOUT,
  listChanges,
  loadList,
  stateParam,
  type ListChange,
  type ListWrite,
} from "@/lib/tierList";

export interface TierContext {
  tierCortex: TierCortex;
  tiers: Tier[];
  title: string;
  labelPosition: LabelPosition;
  showLabels: boolean;
  urlLength: number;
  shareLink: string;
  linkWrites: number;

  setTitle: (title: string) => boolean;
  moveItem: (from: ItemPosition, to: ItemPosition) => boolean;
  moveTier: (from: number, to: number) => boolean;
  moveRow: (from: number, to: number) => boolean;
  addTier: () => boolean;
  removeTier: (tierId: string) => boolean;
  renameTier: (index: number, name: string) => boolean;
  deleteItem: (itemId: string) => boolean;
  restoreItem: (item: Item, tierId: string, index: number) => boolean;
  addItems: (items: Item[]) => boolean;
  removeItems: (itemIds: string[]) => boolean;
  resetRankings: () => boolean;
  removeAllItems: () => boolean;
  restoreTiers: (tiers: Tier[]) => boolean;
  onTemplateChange: (template: readonly Tier[]) => boolean;
  setLabelPosition: (position: LabelPosition) => boolean;
  toggleLabels: () => boolean;
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
  initialItemSet?: ItemSet;
  pageTitle: string;
  children: React.ReactNode;
}

const addressInWindow = () => stateParam(new URLSearchParams(window.location.search).get('state'));

const pathInWindow = () => decodeURI(window.location.pathname);

const subscribeToHistory = (onChange: () => void) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};

export function TierListProvider({initialItemSet, pageTitle, children}: TierListProviderProps) {
  const pathname = usePathname();
  const routerAddress = stateParam(useSearchParams().get('state'));
  const addressNow = useCallback(
    () => (pathInWindow() === pathname ? addressInWindow() : routerAddress),
    [pathname, routerAddress],
  );
  const address = useSyncExternalStore(subscribeToHistory, addressNow, () => routerAddress);

  const [{tierCortex, lists}] = useState(() => {
    const cortex = createTierCortex();
    return {
      tierCortex: cortex,
      lists: createListStore(
        (at) => loadList(cortex, at, initialItemSet, pageTitle),
        (title, tiers, at) => cortex.encodeListForURL(title, tiers, at),
      ),
    };
  });
  const list = lists.read(address);

  const [layout, setLayout] = useState<ListLayout>(() => list.layout ?? DEFAULT_LAYOUT);
  const [linkWrites, setLinkWrites] = useState(0);

  const [openedLink] = useState(() => (address && list.decoded ? {path: pathname, state: address, title: list.title} : null));
  useEffect(() => {
    if (openedLink) recordRecentLink(openedLink);
  }, [openedLink]);

  const write = useCallback((written: ListWrite | null): boolean => {
    if (!written) return true;
    const href = `${pathname}?state=${written.link}`;
    if (!writeHistory(written.mode, href, () => addressInWindow() === written.link)) return false;
    listAddressWritten(written.mode);
    setLinkWrites((count) => count + 1);
    return true;
  }, [pathname]);

  const change = useCallback((apply: ListChange): boolean => {
    return write(lists.edit(addressNow(), apply, layout));
  }, [lists, write, layout, addressNow]);

  const changeLayout = useCallback((changes: Partial<ListLayout>): boolean => {
    const next = {...layout, ...changes};
    if (next.labelPosition === layout.labelPosition && next.showLabels === layout.showLabels) return true;
    if (!write(lists.relayout(addressNow(), next))) return false;
    setLayout(next);
    return true;
  }, [layout, lists, write, addressNow]);

  const actions = useMemo(() => ({
    setTitle: (title: string) => change(listChanges.setTitle(title)),
    moveItem: (from: ItemPosition, to: ItemPosition) => change(listChanges.moveItem(from, to)),
    moveTier: (from: number, to: number) => change(listChanges.moveTier(from, to)),
    moveRow: (from: number, to: number) => change(listChanges.moveRow(from, to)),
    addTier: () => change(listChanges.addTier()),
    removeTier: (tierId: string) => change(listChanges.removeTier(tierId)),
    renameTier: (index: number, name: string) => change(listChanges.renameTier(index, name)),
    deleteItem: (itemId: string) => change(listChanges.deleteItem(itemId)),
    restoreItem: (item: Item, tierId: string, index: number) => change(listChanges.restoreItem(item, tierId, index)),
    addItems: (items: Item[]) => change(listChanges.addItems(items)),
    removeItems: (itemIds: string[]) => change(listChanges.removeItems(itemIds)),
    resetRankings: () => change(listChanges.resetRankings()),
    removeAllItems: () => change(listChanges.removeAllItems()),
    restoreTiers: (tiers: Tier[]) => change(listChanges.restoreTiers(tiers)),
    onTemplateChange: (template: readonly Tier[]) => change(listChanges.changeRowTemplate(template)),
    setLabelPosition: (labelPosition: LabelPosition) => changeLayout({labelPosition}),
    toggleLabels: () => changeLayout({showLabels: !layout.showLabels}),
  }), [change, changeLayout, layout.showLabels]);

  const urlLength = address && list.decoded ? pathname.length + address.length + 7 : 0;

  const shareLink = useMemo(() => lists.link(list, layout), [lists, list, layout]);

  const value = useMemo<TierContext>(() => ({
    tierCortex,
    tiers: list.tiers,
    title: list.title,
    labelPosition: layout.labelPosition,
    showLabels: layout.showLabels,
    urlLength,
    shareLink,
    linkWrites,
    ...actions,
  }), [tierCortex, list.tiers, list.title, layout, urlLength, shareLink, linkWrites, actions]);

  return (
    <TierContext.Provider value={value}>
      <ListTabTitle title={rankPageTitle(pageTitle, list.title)}/>
      {children}
    </TierContext.Provider>
  );
}

const subscribeToNothing = () => () => {};

function ListTabTitle({title}: {title: string}) {
  const inBrowser = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  return inBrowser ? <title>{title}</title> : null;
}
