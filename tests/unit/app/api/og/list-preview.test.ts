import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {listPreviewCard, type PreviewImageLoaders} from '@/app/api/og/list-preview';
import {createTierCortex} from '@/lib/TierCortex';

const BASE_URL = 'https://opentierboy.com';
const LOGO = `${BASE_URL}/brand/otb-logo-wide.png`;
const v3 = (json: unknown) => `3.${LZString.compressToEncodedURIComponent(JSON.stringify(json))}`;

/** A loader that records every address it is given and answers with a marked data URL. */
function recordingLoaders() {
  const local: string[] = [];
  const loaders: PreviewImageLoaders = {
    inlineLocal: async (urls) => {
      local.push(...urls);
      return (url) => `data:local,${url}`;
    },
  };
  return {local, loaders};
}

/** A list that mixes every kind of item, and link addresses a server must never fetch. */
const MIXED_LIST = v3({
  t: 'Mixed',
  r: [
    ['tier-s', 'S', [
      'image-overwatch-mau.webp',
      {u: 'https://i.imgur.com/trusted.png', c: 'Trusted'},
      {u: 'https://images.example.org/untrusted.png', c: 'Untrusted'},
    ]],
    ['tier-a', 'A', [
      {d: 'abcdef0123456789', c: 'From a device'},
      {u: 'https://localhost/secret.png', c: 'Local address'},
      {i: 'image-unknown-gone.webp', c: 'Unknown id'},
    ]],
    ['uncategorized', '', []],
  ],
});

describe('listPreviewCard', () => {
  it('writes only app assets to inlineLocal and returns label tiles for link and device images when the list mixes item kinds', async () => {
    const tierCortex = createTierCortex({baseUrl: BASE_URL});
    const list = tierCortex.decodeTierStateFromURL(MIXED_LIST);
    expect(list?.tiers.flatMap((tier) => tier.items.map((item) => item.content)))
      .toEqual(['Mauga', 'Trusted', 'Untrusted', 'From a device', 'Local address', 'Unknown id']);

    const {local, loaders} = recordingLoaders();
    const {card, logoSrc} = await listPreviewCard(list!, tierCortex, {logoUrl: LOGO, maxTiles: 96}, loaders);

    // The server loads only its own assets: the logo, the image-set picture, and the
    // placeholder for an id no image set knows.
    expect(local).toEqual([
      LOGO,
      `${BASE_URL}/images/image-overwatch/mau.png`,
      `${BASE_URL}/placeholder-image.preview.png`,
    ]);

    // Every image the card draws came from the loader. Link images, also from a trusted site
    // such as Imgur, and device images are label tiles (owner decision, 2026-11-01).
    expect(logoSrc).toBe(`data:local,${LOGO}`);
    const tiles = card.rows.flatMap((row) => row.tiles);
    expect(tiles.map((tile) => tile.label)).toEqual(['Mauga', 'Trusted', 'Untrusted', 'From a device', 'Local address', 'Unknown id']);
    for (const tile of tiles) {
      if (tile.src !== undefined) expect(tile.src, tile.label).toMatch(/^data:local,/);
    }
    expect(tiles.filter((tile) => tile.src !== undefined).map((tile) => tile.label)).toEqual(['Mauga', 'Unknown id']);
  });

  it('returns at most maxTiles tiles, with 1 inlineLocal URL per tile, when the list has more items than maxTiles', async () => {
    const tierCortex = createTierCortex({baseUrl: BASE_URL});
    const files = ['ana.webp', 'ash.webp', 'bap.webp', 'bri.webp', 'dva.webp', 'gen.webp'];
    const list = tierCortex.decodeTierStateFromURL(v3({r: [['tier-s', 'S', files.map((file) => `image-overwatch-${file}`)], ['uncategorized', '', []]]}));
    const {local, loaders} = recordingLoaders();
    const {card} = await listPreviewCard(list!, tierCortex, {logoUrl: LOGO, maxTiles: 2}, loaders);
    const drawn = card.rows.flatMap((row) => row.tiles);
    expect(drawn.length).toBeLessThanOrEqual(2);
    // The logo, plus one image for each drawn tile.
    expect(local).toHaveLength(1 + drawn.length);
  });
});
