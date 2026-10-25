'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {toast} from 'sonner';
import Item from '@/models/Item';
import {useTierContext} from '@/contexts/TierContext';
import {PLACEHOLDER_IMAGE_URL} from '@/lib/TierCortex';
import {createObjectUrlRegistry, type DeviceStore, openDeviceStore} from '@/lib/images/deviceStore';
import {checkImage, type ImageCheckFailure} from '@/lib/images/imageCheck';
import {ImageStatusStore} from '@/lib/images/imageStatusStore';
import {migrateLegacyUploads} from '@/lib/images/legacyUploads';
import {
  browserLocalStorage,
  readAllowedImageSites,
  readEvictedDeviceImages,
  rememberAllowedImageSites,
  updateEvictedDeviceImages,
} from '@/lib/images/localLists';
import {deviceImageKey, deviceImageKeys, hostsAwaitingConsent, isImageHostAllowed, linkImageOf} from '@/lib/images/listImages';
import {DEVICE_IMAGE_REFUSAL_MESSAGES} from '@/lib/images/messages';
import {prepareImageForStore} from '@/lib/images/prepareImage';

/**
 * Images from the device and from links, for the tier list editor (#86, #67, #107).
 *
 * Device images live in the device image store (IndexedDB, lib/images/deviceStore.ts). The list
 * holds only their ids. The store opens in an effect, after the page has started, so the server
 * and the browser render the same list; tiles show the placeholder image until their image is
 * loaded. Uploads that older versions kept in localStorage move into the store first (A42).
 * The images of a list are read in one transaction. Each image gets one object URL (one
 * registry per editor), revoked when the image leaves the list and when the editor closes.
 *
 * Link images load only from trusted sites (trusted-image-sites.json) and from sites this
 * visitor allowed: [Load] for this page, [Always allow these sites] in localStorage. Nothing
 * requests an image from any other site. Each address is checked once (lib/images/imageCheck.ts):
 * a failure shows the item's name in place of the picture.
 *
 * Tiles read their image state through useDeviceImage and useLinkImage, which subscribe to that
 * one image (lib/images/imageStatusStore.ts), so a tile re-renders only when its image changes.
 */

export type DeviceImageState =
  | {status: 'loading'}
  | {status: 'ready'; url: string}
  /** Not in this browser: the tile keeps the placeholder image. */
  | {status: 'missing'}
  /** Removed by the store to make room: the tile shows the item's name. */
  | {status: 'evicted'};

export type LinkImageState =
  /** The site waits for the visitor's consent. */
  | {status: 'blocked'; domain: string}
  | {status: 'checking'; domain: string}
  | {status: 'ready'; domain: string; src: string}
  | {status: 'failed'; domain: string; reason: ImageCheckFailure}
  /** The address breaks the link image rules: it never loads. */
  | {status: 'invalid'; domain: string};

export interface NewDeviceImage {
  blob: Blob;
  label: string;
}

export interface AddDeviceImagesResult {
  items: Item[];
  /** One message per image that could not be added. */
  errors: string[];
}

interface CustomImagesContextValue {
  deviceStates: ImageStatusStore<DeviceImageState>;
  linkStates: ImageStatusStore<LinkImageState>;
  isPackageItem: (id: string) => boolean;
  /** Keeps images in the device store and returns them as items (not yet in the list). */
  addDeviceImages: (images: NewDeviceImage[]) => Promise<AddDeviceImagesResult>;
  /** Lets this page load images from these sites (a link image the visitor adds, or [Load]). */
  allowHosts: (hosts: string[], options?: {remember?: boolean}) => void;
}

const CustomImagesContext = React.createContext<CustomImagesContextValue | undefined>(undefined);
/** Sites of the list's link images that wait for consent. Empty until the allowed sites are read. */
const HostsAwaitingConsentContext = React.createContext<string[]>([]);

export const useCustomImages = () => {
  const context = React.useContext(CustomImagesContext);
  if (context === undefined) throw new Error('useCustomImages must be used within a CustomImagesProvider');
  return context;
};

/** The sites of the list's link images that wait for the visitor's consent. */
export const useHostsAwaitingConsent = () => React.useContext(HostsAwaitingConsentContext);

const LOADING: DeviceImageState = Object.freeze({status: 'loading'});
const noSubscription = () => () => undefined;

/** The image state of an upload, or null when the item is not one. Re-renders only when it changes. */
export function useDeviceImage(item: Pick<Item, 'id' | 'source'>): DeviceImageState | null {
  const {deviceStates, isPackageItem} = useCustomImages();
  const key = deviceImageKey(item, isPackageItem);
  const subscribe = useCallback(
    (listener: () => void) => (key === null ? noSubscription() : deviceStates.subscribe(key, listener)),
    [deviceStates, key],
  );
  const read = () => (key === null ? null : deviceStates.get(key) ?? LOADING);
  return useSyncExternalStore(subscribe, read, () => (key === null ? null : LOADING));
}

/** The image state of a link image, or null when the item is not one. Re-renders only when it changes. */
export function useLinkImage(item: Pick<Item, 'source' | 'url'>): LinkImageState | null {
  const {linkStates} = useCustomImages();
  const link = useMemo(() => linkImageOf({source: item.source, url: item.url}), [item.source, item.url]);
  // Before the allowed sites are read (also on the server), a link image waits for consent.
  const initial = useMemo<LinkImageState | null>(() => {
    if (item.source !== 'link') return null;
    return link ? {status: 'blocked', domain: link.domain} : {status: 'invalid', domain: ''};
  }, [item.source, link]);
  const subscribe = useCallback(
    (listener: () => void) => (link === null ? noSubscription() : linkStates.subscribe(link.url, listener)),
    [linkStates, link],
  );
  const read = () => (link === null ? initial : linkStates.get(link.url) ?? initial);
  return useSyncExternalStore(subscribe, read, () => initial);
}

const NOT_PERSISTENT_MESSAGE = 'This browser does not let the site keep images. Images you add stay until you close this tab.';

type LinkCheck = {ok: true; src: string} | {ok: false; reason: ImageCheckFailure};

export function CustomImagesProvider({children}: {children: React.ReactNode}) {
  const {tiers, tierCortex} = useTierContext();
  const isPackageItem = useCallback((id: string) => !tierCortex.isCustomItem(id), [tierCortex]);

  const [registry] = useState(() => createObjectUrlRegistry());
  const [deviceStates] = useState(() => new ImageStatusStore<DeviceImageState>());
  const [linkStates] = useState(() => new ImageStatusStore<LinkImageState>());
  const [store, setStore] = useState<DeviceStore | null>(null);
  const storePromise = useRef<Promise<DeviceStore> | null>(null);
  const requestedKeys = useRef(new Set<string>());
  const evicted = useRef(new Set<string>());
  const warnedNotPersistent = useRef(false);
  const alive = useRef(true);

  const [allowedHosts, setAllowedHosts] = useState<ReadonlySet<string> | null>(null);
  const linkChecks = useRef(new Map<string, LinkCheck>());
  const requestedLinks = useRef(new Set<string>());
  const [checkedCount, setCheckedCount] = useState(0);

  // Open the device store and read the local lists, after the page has started.
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const requested = requestedKeys.current;
    const opening = (async () => {
      const opened = await openDeviceStore();
      const storage = browserLocalStorage();
      evicted.current = new Set(readEvictedDeviceImages(storage));
      await migrateLegacyUploads(storage, opened, (blob) => prepareImageForStore(blob, {maxBytes: opened.limits.maxImageBytes}));
      return opened;
    })();
    storePromise.current = opening;
    void (async () => {
      const storage = browserLocalStorage();
      await Promise.resolve();
      if (!cancelled) setAllowedHosts(new Set(readAllowedImageSites(storage)));
      const opened = await opening;
      if (cancelled) {
        opened.close();
        return;
      }
      setStore(opened);
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      void opening.then((opened) => opened.close());
      registry.revokeAll();
      requested.clear();
    };
  }, [registry]);

  // Load the images of the uploads in the list, in one transaction and one update; revoke the
  // URLs of images that left the list.
  const keys = useMemo(() => deviceImageKeys(tiers, isPackageItem), [tiers, isPackageItem]);
  const latestKeys = useRef(keys);
  useEffect(() => {
    latestKeys.current = keys;
    if (!store) return;
    void (async () => {
      await Promise.resolve();
      const inList = new Set(keys);
      const left = Array.from(requestedKeys.current).filter((key) => !inList.has(key));
      left.forEach((key) => {
        requestedKeys.current.delete(key);
        registry.revoke(key);
      });
      deviceStates.setMany(left.map((key) => [key, undefined] as const));
      const toLoad = keys.filter((key) => !requestedKeys.current.has(key));
      if (toLoad.length === 0) return;
      toLoad.forEach((key) => requestedKeys.current.add(key));
      const images = await store.getMany(toLoad);
      if (!alive.current) return;
      deviceStates.setMany(toLoad.filter((key) => requestedKeys.current.has(key)).map((key) => {
        const image = images.get(key);
        const state: DeviceImageState = image
          ? {status: 'ready', url: registry.urlFor(key, image.blob, image.type)}
          : {status: evicted.current.has(key) ? 'evicted' : 'missing'};
        return [key, state] as const;
      }));
    })();
  }, [store, keys, registry, deviceStates]);

  // Check each allowed link image once, and keep every link image's state up to date.
  const links = useMemo(() => {
    const found = new Map<string, {label: string; host: string; domain: string}>();
    tiers.forEach((tier) => tier.items.forEach((item) => {
      const link = linkImageOf(item);
      if (link && !found.has(link.url)) found.set(link.url, {label: item.content, host: link.host, domain: link.domain});
    }));
    return found;
  }, [tiers]);
  useEffect(() => {
    if (!allowedHosts) return;
    const states: [string, LinkImageState][] = [];
    links.forEach(({label, host, domain}, url) => {
      if (!isImageHostAllowed(host, allowedHosts)) {
        states.push([url, {status: 'blocked', domain}]);
        return;
      }
      const checked = linkChecks.current.get(url);
      if (checked) {
        states.push([url, checked.ok ? {status: 'ready', domain, src: checked.src} : {status: 'failed', domain, reason: checked.reason}]);
        return;
      }
      states.push([url, {status: 'checking', domain}]);
      if (requestedLinks.current.has(url)) return;
      requestedLinks.current.add(url);
      void checkImage(url, {label}).then((result) => {
        if (!alive.current) return;
        linkChecks.current.set(url, result.ok ? {ok: true, src: result.src} : {ok: false, reason: result.reason});
        setCheckedCount((count) => count + 1);
      });
    });
    linkStates.setMany(states);
  }, [links, allowedHosts, checkedCount, linkStates]);

  const addDeviceImages = useCallback(async (images: NewDeviceImage[]): Promise<AddDeviceImagesResult> => {
    const items: Item[] = [];
    const errors: string[] = [];
    const opened = store ?? await storePromise.current;
    if (!opened) return {items, errors: images.map((image) => `${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`)};
    const added: string[] = [];
    const states: [string, DeviceImageState][] = [];
    for (const image of images) {
      const prepared = await prepareImageForStore(image.blob, {maxBytes: opened.limits.maxImageBytes});
      if (!prepared.ok) {
        errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[prepared.reason]}`);
        continue;
      }
      const result = await opened.put(prepared.blob, {keep: [...latestKeys.current, ...added]});
      if (!result.ok) {
        errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[result.reason]}`);
        continue;
      }
      added.push(result.id);
      evicted.current = new Set(updateEvictedDeviceImages({evicted: result.evicted, stored: [result.id]}));
      requestedKeys.current.add(result.id);
      result.evicted.forEach((key) => {
        registry.revoke(key);
        if (deviceStates.get(key)) states.push([key, {status: 'evicted'}]);
      });
      states.push([result.id, {status: 'ready', url: registry.urlFor(result.id, prepared.blob, result.type)}]);
      items.push({id: result.id, content: image.label, imageUrl: PLACEHOLDER_IMAGE_URL, source: 'device'});
    }
    deviceStates.setMany(states);
    if (items.length > 0 && !opened.persistent && !warnedNotPersistent.current) {
      warnedNotPersistent.current = true;
      toast('Images are kept only for this tab', {description: NOT_PERSISTENT_MESSAGE});
    }
    return {items, errors};
  }, [store, registry, deviceStates]);

  const allowHosts = useCallback((hosts: string[], {remember = false}: {remember?: boolean} = {}) => {
    if (remember) rememberAllowedImageSites(hosts);
    setAllowedHosts((previous) => new Set([...(previous ?? readAllowedImageSites()), ...hosts]));
  }, []);

  const waitingList = allowedHosts ? hostsAwaitingConsent(tiers, allowedHosts) : [];
  const waitingKey = waitingList.join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same sites give the same array, so the notice does not re-render
  const waiting = useMemo(() => waitingList, [waitingKey]);

  const value = useMemo<CustomImagesContextValue>(() => ({
    deviceStates,
    linkStates,
    isPackageItem,
    addDeviceImages,
    allowHosts,
  }), [deviceStates, linkStates, isPackageItem, addDeviceImages, allowHosts]);

  return (
    <CustomImagesContext.Provider value={value}>
      <HostsAwaitingConsentContext.Provider value={waiting}>{children}</HostsAwaitingConsentContext.Provider>
    </CustomImagesContext.Provider>
  );
}
