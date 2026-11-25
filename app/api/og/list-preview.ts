import {getOgTierGradient} from '@/lib/linkPreview';
import {MAX_LABEL_LENGTH, MAX_TITLE_LENGTH, shorten} from '@/lib/text';
import {itemDisplayLabel} from '@/lib/images/listImages';
import {LIST_CARD, listCardData, type ListCardData, type ListCardTile} from '@/lib/listCard/model';
import type {TierCortex} from '@/lib/TierCortex';
import type Item from '@/models/Item';
import type Tier from '@/models/Tier';

/**
 * The image loader the preview uses: inlineLocal (inlineLocalImages in local-images.ts) for the
 * app's own assets. The route passes the real one; unit tests pass a recording one.
 */
export interface PreviewImageLoaders {
  inlineLocal: (urls: string[]) => Promise<(url: string) => string>;
}

/**
 * The list card of a shared list's preview, with the source of every image it draws.
 *
 * Link previews draw only the app's own pictures (owner decision, 2026-11-01): image-set
 * pictures, and the placeholder for an id that no image set knows. Link images (from any site,
 * trusted or not) and device images have no image URL (getOgSafeItem), so they are label tiles,
 * and the server never fetches a user's address (A8, A36). Only image URLs that TierCortex
 * builds for the app's own assets go to `inlineLocal`.
 */
export async function listPreviewCard(
  list: {title?: string; tiers: Tier[]},
  tierCortex: TierCortex,
  {logoUrl, maxTiles}: {logoUrl: string; maxTiles: number},
  loaders: PreviewImageLoaders,
): Promise<{card: ListCardData; logoSrc: string}> {
  const ranked: Tier[] = list.tiers.slice(0, -1); // Without the Unranked row

  // Fit first, so only the tiles that show load their images.
  const tileFor = (item: Item): ListCardTile => {
    const safeItem = tierCortex.getOgSafeItem(item);
    return {key: safeItem.id, label: shorten(itemDisplayLabel(item), MAX_LABEL_LENGTH), src: safeItem.imageUrl};
  };
  const draft = listCardData({
    title: list.title ? shorten(list.title, MAX_TITLE_LENGTH) : 'OpenTierBoy',
    setName: tierCortex.listSetName(ranked),
    rows: ranked,
    height: LIST_CARD.previewHeight,
    maxTiles,
    background: getOgTierGradient,
    rowName: (row) => shorten(row.name, MAX_LABEL_LENGTH),
    tile: tileFor,
  });
  const drawnItems = ranked.flatMap((row, index) => row.items.slice(0, draft.rows[index]?.tiles.length ?? 0));

  const itemImageUrls = drawnItems
    .map((item) => tierCortex.getOgSafeItem(item).imageUrl)
    .filter((url): url is string => url !== undefined);
  const imageSrc = await loaders.inlineLocal([logoUrl, ...itemImageUrls]);

  const card = {
    ...draft,
    rows: draft.rows.map((row) => ({
      ...row,
      tiles: row.tiles.map((tile) => ({...tile, src: tile.src ? imageSrc(tile.src) : undefined})),
    })),
  };
  return {card, logoSrc: imageSrc(logoUrl)};
}
