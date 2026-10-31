import {getOgTierGradient} from '@/lib/linkPreview';
import {MAX_LABEL_LENGTH, MAX_TITLE_LENGTH, shorten} from '@/lib/text';
import {itemDisplayLabel} from '@/lib/images/listImages';
import {LIST_CARD, listCardData, type ListCardData, type ListCardTile} from '@/lib/listCard/model';
import type {TierCortex} from '@/lib/TierCortex';
import type Item from '@/models/Item';
import type Tier from '@/models/Tier';

/**
 * The image loaders the preview uses: inlineLocalImages (local-images.ts) for the app's own
 * assets, and inlineTrustedLinkImages (link-images.ts) for link images on trusted sites. The
 * route passes the real ones; unit tests pass recording ones.
 */
export interface PreviewImageLoaders {
  inlineLocal: (urls: string[]) => Promise<(url: string) => string>;
  inlineTrustedLinks: (urls: readonly string[]) => Promise<(url: string | undefined) => string | undefined>;
}

/**
 * The list card of a shared list's preview, with the source of every image it draws.
 *
 * Only image URLs that TierCortex builds for the app's own assets go to `inlineLocal`. Link
 * images and device images have none (getOgSafeItem): link image addresses never reach it (A8,
 * A36). Link image addresses go to `inlineTrustedLinks`, which loads only trusted sites, with
 * caps. Any other link image, and every device image, is a label tile.
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
  const linkImageUrls = drawnItems
    .filter((item) => item.source === 'link' && item.url !== undefined)
    .map((item) => item.url as string);
  const [imageSrc, linkImageSrc] = await Promise.all([
    loaders.inlineLocal([logoUrl, ...itemImageUrls]),
    loaders.inlineTrustedLinks(linkImageUrls),
  ]);

  const card = {
    ...draft,
    rows: draft.rows.map((row, rowIndex) => ({
      ...row,
      tiles: row.tiles.map((tile, tileIndex) => {
        const item = ranked[rowIndex].items[tileIndex];
        const linkSrc = item.source === 'link' ? linkImageSrc(item.url) : undefined;
        const src = linkSrc ?? (tile.src ? imageSrc(tile.src) : undefined);
        return {...tile, src};
      }),
    })),
  };
  return {card, logoSrc: imageSrc(logoUrl)};
}
