import {useCallback} from 'react';
import {useTierContext} from '@/contexts/TierContext';
import {useCustomImages} from '@/contexts/CustomImagesContext';
import {deviceImageKey, itemDisplayLabel, linkImageOf} from '@/lib/images/listImages';
import {getOgTierGradient} from '@/lib/linkPreview';
import {MAX_TITLE_LENGTH, shorten} from '@/lib/text';
import {listCardData, type ListCardData, type ListCardTile} from '@/lib/listCard/model';
import type Item from '@/models/Item';

/**
 * The list card that Freeze Frame draws (components/ListCard.tsx), from the list on screen. It
 * shows what the tiles on screen show: the app's own images, device images that are loaded (blob:
 * URLs) and link images that passed their check. Other items are label tiles.
 *
 * Freeze Frame grows the card with the list ('auto' height, lib/listCard/fit.ts), so every item
 * shows; only a list taller than the height cap gets smaller tiles.
 */
export function useListCardData(): () => ListCardData {
  const {tiers, title, tierCortex} = useTierContext();
  const {deviceStates, linkStates, isPackageItem} = useCustomImages();

  const tileFor = useCallback((item: Item): ListCardTile => {
    const label = itemDisplayLabel(item);
    if (item.source === 'link') {
      const link = linkImageOf(item);
      const state = link ? linkStates.get(link.url) : undefined;
      return state?.status === 'ready' ? {key: item.id, label, src: state.src, linkImage: state.src} : {key: item.id, label};
    }
    const key = deviceImageKey(item, isPackageItem);
    if (key !== null) {
      const state = deviceStates.get(key);
      if (state?.status === 'evicted') return {key: item.id, label};
      if (state?.status === 'ready') return {key: item.id, label, src: state.url};
    }
    return {key: item.id, label, src: item.imageUrl};
  }, [deviceStates, linkStates, isPackageItem]);

  return useCallback(() => {
    const ranked = tiers.slice(0, -1); // Without the Unranked row
    return listCardData({
      title: shorten(title || 'OpenTierBoy', MAX_TITLE_LENGTH),
      setName: tierCortex.listSetName(ranked),
      rows: ranked,
      height: 'auto',
      background: getOgTierGradient,
      rowName: (row) => row.name,
      tile: tileFor,
    });
  }, [tiers, title, tierCortex, tileFor]);
}
