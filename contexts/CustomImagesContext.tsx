'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {toast} from 'sonner';
import Item from '@/models/Item';
import {useTierContext} from '@/contexts/TierContext';
import {PLACEHOLDER_IMAGE_URL} from '@/lib/packageItems';
import {createObjectUrlRegistry, type DeviceStore, openDeviceStore} from '@/lib/images/deviceStore';
import {checkImage, type ImageCheckFailure} from '@/lib/images/imageCheck';
import {createImageStatusStore, type ImageStatusStore} from '@/lib/images/imageStatusStore';
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
import {snapshotImageId} from '@/lib/snapshot/imageId';

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

/** An image from a snapshot file, with its id in the file. */
export interface SnapshotDeviceImage {
  id: string;
  blob: Blob;
  label: string;
}

export interface ImportDeviceImagesResult {
  /** Each stored image's id in the file → its id in this browser's store. */
  ids: Map<string, string>;
  /** One message per image that could not be stored. */
  errors: string[];
}

interface CustomImagesContextValue {
  deviceStates: ImageStatusStore<DeviceImageState>;
  linkStates: ImageStatusStore<LinkImageState>;
  isPackageItem: (id: string) => boolean;
  /** Keeps images in the device store and returns them as items (not yet in the list). */
  addDeviceImages: (images: NewDeviceImage[]) => Promise<AddDeviceImagesResult>;
  /**
   * Keeps the images of a snapshot file in the device store, one call at a time with
   * addDeviceImages and with the same protection: no image the list shows or that was handed
   * out is removed to make room. An image the store already holds under the file's own id is
   * used as it is, whatever the file holds: the file was made in this browser, so its link stays
   * the same (a file that reuses such an id on purpose can only show the visitor's own picture).
   * Every other image is drawn again first (AVIF and HEIC get the refusal of "From your device"),
   * at most 512 pixels on its longest side (A10), and stored under a content-addressed id
   * (`snap-` and a hash of the drawn bytes, lib/snapshot/imageId.ts): opening the same file
   * again stores nothing new and gives the same ids. An image the store already holds under
   * that id is reused; a different picture under the same id (a hash collision) gets a random
   * id.
   */
  importDeviceImages: (images: SnapshotDeviceImage[]) => Promise<ImportDeviceImagesResult>;
  /** The stored images with these ids (for a snapshot file). Missing images are left out. */
  readDeviceImages: (ids: string[]) => Promise<Map<string, Blob>>;
  /** Lets this page load images from these sites (a link image the visitor adds, or [Load]). */
  allowHosts: (hosts: string[], options?: {remember?: boolean}) => void;
  /**
   * True when images from this host may load now: a trusted site, or one this visitor allowed.
   * Before the allowed sites are read, only trusted sites.
   */
  isHostAllowed: (host: string) => boolean;
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

/** Longest side of a snapshot file's images in the store: the app writes them at most this size. */
const SNAPSHOT_IMAGE_SIDE = 512;

const NOT_PERSISTENT_MESSAGE = 'This browser does not let the site keep images. Images you add stay until you close this tab.';

type LinkCheck = {ok: true; src: string} | {ok: false; reason: ImageCheckFailure};

/** True when two files hold the same bytes. */
async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [left, right] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

export function CustomImagesProvider({children}: {children: React.ReactNode}) {
  const {tiers, tierCortex} = useTierContext();
  const isPackageItem = useCallback((id: string) => !tierCortex.isCustomItem(id), [tierCortex]);

  const [registry] = useState(() => createObjectUrlRegistry());
  const [deviceStates] = useState(() => createImageStatusStore<DeviceImageState>());
  const [linkStates] = useState(() => createImageStatusStore<LinkImageState>());
  const [store, setStore] = useState<DeviceStore | null>(null);
  const storePromise = useRef<Promise<DeviceStore> | null>(null);
  const requestedKeys = useRef(new Set<string>());
  const evicted = useRef(new Set<string>());
  const warnedNotPersistent = useRef(false);
  const alive = useRef(true);
  // addDeviceImages runs one call at a time, so each call sees what the calls before it added.
  const addQueue = useRef<Promise<unknown>>(Promise.resolve());
  // Images handed to callers that the list may not show yet. Like the list's own images, they
  // are never removed to make room; they leave this set once the list shows them.
  const handedOut = useRef(new Set<string>());

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
    keys.forEach((key) => handedOut.current.delete(key));
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

  const addDeviceImages = useCallback((images: NewDeviceImage[]): Promise<AddDeviceImagesResult> => {
    // The result never rejects: anything unexpected becomes the usual message for each file.
    const failed = (): AddDeviceImagesResult => ({items: [], errors: images.map((image) => `${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`)});
    const run = addQueue.current.then(() => addNow(images)).catch(failed);
    addQueue.current = run;
    return run;

    async function addNow(images: NewDeviceImage[]): Promise<AddDeviceImagesResult> {
      const items: Item[] = [];
      const errors: string[] = [];
      const opened = store ?? await storePromise.current;
      if (!opened) return failed();
      const states: [string, DeviceImageState][] = [];
      for (const image of images) {
        // Whatever throws for one image (a browser that cannot make an object URL) becomes the
        // usual message for that file, so callers always get a result.
        try {
          await addOne(opened, image);
        } catch {
          errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`);
        }
      }
      deviceStates.setMany(states);
      if (items.length > 0 && !opened.persistent && !warnedNotPersistent.current) {
        warnedNotPersistent.current = true;
        toast('Images are kept only for this tab', {description: NOT_PERSISTENT_MESSAGE});
      }
      return {items, errors};

      async function addOne(opened: DeviceStore, image: NewDeviceImage) {
        const prepared = await prepareImageForStore(image.blob, {maxBytes: opened.limits.maxImageBytes});
        if (!prepared.ok) {
          errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[prepared.reason]}`);
          return;
        }
        // Never remove an image the list shows, or one handed out that it may not show yet.
        const result = await opened.put(prepared.blob, {keep: [...latestKeys.current, ...handedOut.current]});
        // Images removed to make room, also when the write failed after making room.
        const removed = result.evicted ?? [];
        if (result.ok || removed.length > 0) {
          evicted.current = new Set(updateEvictedDeviceImages({evicted: removed, stored: result.ok ? [result.id] : []}));
        }
        removed.forEach((key) => {
          registry.revoke(key);
          if (deviceStates.get(key)) states.push([key, {status: 'evicted'}]);
        });
        if (!result.ok) {
          errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[result.reason]}`);
          return;
        }
        // The URL first: when it cannot be made, the image is not handed out at all.
        const url = registry.urlFor(result.id, prepared.blob, result.type);
        handedOut.current.add(result.id);
        requestedKeys.current.add(result.id);
        states.push([result.id, {status: 'ready', url}]);
        items.push({id: result.id, content: image.label, imageUrl: PLACEHOLDER_IMAGE_URL, source: 'device'});
      }
    }
  }, [store, registry, deviceStates]);

  const importDeviceImages = useCallback((images: SnapshotDeviceImage[]): Promise<ImportDeviceImagesResult> => {
    // The same queue as addDeviceImages: one call at a time, so each sees what the others stored.
    // Like it, the result never rejects: anything unexpected becomes the usual message for each image.
    const failed = (): ImportDeviceImagesResult => ({ids: new Map(), errors: images.map((image) => `${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`)});
    const run = addQueue.current.then(() => importNow(images)).catch(failed);
    addQueue.current = run;
    return run;

    async function importNow(images: SnapshotDeviceImage[]): Promise<ImportDeviceImagesResult> {
      const ids = new Map<string, string>();
      const errors: string[] = [];
      const opened = store ?? await storePromise.current;
      if (!opened) return failed();
      const states: [string, DeviceImageState][] = [];
      for (const image of images) {
        // Whatever throws for one image becomes the usual message for that image.
        try {
          await importOne(opened, image);
        } catch {
          errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`);
        }
      }
      deviceStates.setMany(states);
      if (ids.size > 0 && !opened.persistent && !warnedNotPersistent.current) {
        warnedNotPersistent.current = true;
        toast('Images are kept only for this tab', {description: NOT_PERSISTENT_MESSAGE});
      }
      return {ids, errors};

      /**
       * Hands out a stored image: the list will show it, so nothing may remove it. The URL comes
       * first: when it cannot be made, the image is not handed out at all.
       */
      function handOut(fileId: string, id: string, blob: Blob, type: Parameters<typeof registry.urlFor>[2]) {
        const url = registry.urlFor(id, blob, type);
        ids.set(fileId, id);
        handedOut.current.add(id);
        requestedKeys.current.add(id);
        states.push([id, {status: 'ready', url}]);
      }

      async function importOne(opened: DeviceStore, image: SnapshotDeviceImage) {
        // The file's own id names an image this browser already holds: the file was made here.
        // That copy shows, quietly; the file's bytes are not read (an AVIF there is not refused).
        const own = await opened.get(image.id);
        if (own) {
          handOut(image.id, image.id, own.blob, own.type);
          return;
        }
        const prepared = await prepareImageForStore(image.blob, {maxBytes: opened.limits.maxImageBytes, maxSide: SNAPSHOT_IMAGE_SIDE, alwaysReencode: true});
        if (!prepared.ok) {
          errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[prepared.reason]}`);
          return;
        }
        const id = await snapshotImageId(new Uint8Array(await prepared.blob.arrayBuffer()));
        const existing = await opened.get(id);
        if (existing && await sameBytes(existing.blob, prepared.blob)) {
          handOut(image.id, id, existing.blob, existing.type);
          return;
        }
        // A different picture under the same id (a hash collision): store it under a random id.
        // Never remove an image the list shows, or one handed out that it may not show yet.
        const result = await opened.put(prepared.blob, {id: existing ? undefined : id, keep: [...latestKeys.current, ...handedOut.current]});
        // Images removed to make room, also when the write failed after making room.
        const removed = result.evicted ?? [];
        if (result.ok || removed.length > 0) {
          evicted.current = new Set(updateEvictedDeviceImages({evicted: removed, stored: result.ok ? [result.id] : []}));
        }
        removed.forEach((key) => {
          registry.revoke(key);
          if (deviceStates.get(key)) states.push([key, {status: 'evicted'}]);
        });
        if (!result.ok) {
          errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[result.reason]}`);
          return;
        }
        handOut(image.id, result.id, prepared.blob, result.type);
      }
    }
  }, [store, registry, deviceStates]);

  const readDeviceImages = useCallback(async (ids: string[]): Promise<Map<string, Blob>> => {
    const opened = store ?? await storePromise.current;
    if (!opened) return new Map();
    const images = await opened.getMany(ids);
    return new Map(Array.from(images, ([id, image]) => [id, image.blob]));
  }, [store]);

  const allowHosts = useCallback((hosts: string[], {remember = false}: {remember?: boolean} = {}) => {
    if (remember) rememberAllowedImageSites(hosts);
    setAllowedHosts((previous) => new Set([...(previous ?? readAllowedImageSites()), ...hosts]));
  }, []);

  const allowedHostsRef = useRef(allowedHosts);
  useEffect(() => {
    allowedHostsRef.current = allowedHosts;
  }, [allowedHosts]);
  const isHostAllowed = useCallback((host: string) => isImageHostAllowed(host, allowedHostsRef.current ?? new Set()), []);

  const waitingList = allowedHosts ? hostsAwaitingConsent(tiers, allowedHosts) : [];
  const waitingKey = waitingList.join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same sites give the same array, so the notice does not re-render
  const waiting = useMemo(() => waitingList, [waitingKey]);

  const value = useMemo<CustomImagesContextValue>(() => ({
    deviceStates,
    linkStates,
    isPackageItem,
    addDeviceImages,
    importDeviceImages,
    readDeviceImages,
    allowHosts,
    isHostAllowed,
  }), [deviceStates, linkStates, isPackageItem, addDeviceImages, importDeviceImages, readDeviceImages, allowHosts, isHostAllowed]);

  return (
    <CustomImagesContext.Provider value={value}>
      <HostsAwaitingConsentContext.Provider value={waiting}>{children}</HostsAwaitingConsentContext.Provider>
    </CustomImagesContext.Provider>
  );
}
