import {ImageResponse} from 'next/og';
import {createTierCortex} from '@/lib/TierCortex';
import {getOgTierGradient} from '@/lib/linkPreview';
import {inlineLocalImages} from './local-images';
import {inlineTrustedLinkImages} from './link-images';
import {MAX_TITLE_LENGTH, shorten} from '@/lib/text';
import {itemDisplayLabel} from '@/lib/images/listImages';
import {LIST_CARD, listCardData, type ListCardTile} from '@/lib/listCard/model';
import {ListCard, LIST_CARD_COLORS} from '@/components/ListCard';
import type Item from '@/models/Item';
import type Tier from '@/models/Tier';

export const runtime = 'edge';

const LOGO = 'brand/otb-logo-wide.png';

// Limits for what the preview draws (A43). Drawing cost grows with every row, tile and
// character, and a link may hold 100 rows and text of any length, which kept the route busy for
// minutes. No real list reaches the text limits: the golden links have 49-character titles and
// 33-character tier names at most.
//
// Rows and tiles: the fit rules (lib/listCard/fit.ts) draw only what fits in 1200×630: at most
// 9 rows, or 8 rows and a "+N more rows" bar, and long rows end in a "+N" tile. MAX_TILES caps
// the tiles drawn in all, so a preview loads at most that many images. Images come at preview
// size (scripts/prepareImages.js), which keeps each tile cheap to draw.
const MAX_TILES = 96;
/** Tier names and item labels. */
const MAX_TEXT_LENGTH = 40;

// Previews use static instances of Geologica (the revamp's font), cut to Latin characters:
// 900 with Sharpness at full for titles and tier names, 600 and 400 for the rest. Satori cannot
// read the variable font or WOFF2 files. next/og loads missing characters (for example
// Japanese) from Google Fonts at render time. fonts/OFL.txt holds the font's licence.
const FONT_FAMILY = 'Geologica';
const fontFile = (name: string) => fetch(new URL(`./fonts/${name}`, import.meta.url)).then((response) => response.arrayBuffer());
const fonts = Promise.all([
  fontFile('Geologica-Regular.ttf'),
  fontFile('Geologica-SemiBold.ttf'),
  fontFile('Geologica-Black-Sharp.ttf'),
]);

async function imageOptions() {
  const [regular, semiBold, black] = await fonts;
  return {
    width: LIST_CARD.width,
    height: LIST_CARD.previewHeight,
    fonts: [
      {name: FONT_FAMILY, data: regular, weight: 400 as const, style: 'normal' as const},
      {name: FONT_FAMILY, data: semiBold, weight: 600 as const, style: 'normal' as const},
      {name: FONT_FAMILY, data: black, weight: 900 as const, style: 'normal' as const},
    ],
  };
}

// The default preview (the canvas board "OGDefault"): the wordmark, the landing page headline and
// tagline, and a sample list that runs off the right and bottom edges.
const SAMPLE_ROWS: {name: string; files: string[]}[] = [
  {name: 'S', files: ['rei.webp', 'zar.webp', 'win.webp']},
  {name: 'A', files: ['sig.webp', 'dva.webp']},
  {name: 'B', files: ['ori.webp', 'ram.webp', 'mau.webp']},
  {name: 'C', files: ['hog.webp']},
  {name: 'D', files: []},
];
const SAMPLE_TILE = 104;

function DefaultOGImage({logoSrc, rows}: {logoSrc: string; rows: {name: string; images: string[]}[]}) {
  return (
    <div style={{
      display: 'flex', position: 'relative', width: '100%', height: '100%', background: LIST_CARD_COLORS.background,
      color: LIST_CARD_COLORS.text, fontFamily: FONT_FAMILY, overflow: 'hidden',
    }}>
      <div style={{display: 'flex', flexDirection: 'column', position: 'absolute', left: 690, top: 64, width: 640}}>
        {rows.map((row, index) => (
          <div key={row.name} style={{
            display: 'flex', height: SAMPLE_TILE, backgroundImage: getOgTierGradient(index, rows.length + 1),
            borderBottom: `1px solid ${LIST_CARD_COLORS.rowLine}`,
          }}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: SAMPLE_TILE, fontSize: 52, fontWeight: 900}}>
              {row.name}
            </div>
            {row.images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element -- satori draws plain <img> elements
              <img key={src} src={src} alt="" width={SAMPLE_TILE} height={SAMPLE_TILE}
                   style={{width: SAMPLE_TILE, height: SAMPLE_TILE, objectFit: 'contain'}}/>
            ))}
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'absolute', left: 56, top: 0,
        bottom: 0, width: 590,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- satori draws plain <img> elements */}
        <img src={logoSrc} alt="OpenTierBoy" width={520} height={Math.round(520 * LIST_CARD.logoHeight / LIST_CARD.logoWidth)}/>
        <div style={{display: 'flex', flexDirection: 'column', marginTop: 22, fontSize: 50, fontWeight: 900, lineHeight: 1.04, letterSpacing: '-0.03em'}}>
          <div style={{display: 'flex'}}>Free and Open-Source</div>
          <div style={{display: 'flex'}}>Tier Lists</div>
        </div>
        <div style={{display: 'flex', marginTop: 22, fontSize: 28, color: '#9aa6c2'}}>
          Craft, rank and share your passion.
        </div>
      </div>
    </div>
  );
}

// The default preview is the same for every request, so each server instance draws it once and
// keeps the PNG. Drawing it costs as much as a list preview (ten images), and lists that cannot
// be read also get it.
let defaultPng: Promise<{body: ArrayBuffer; headers: Headers}> | null = null;

async function defaultImageResponse() {
  if (!defaultPng) {
    defaultPng = drawDefaultImage().then(async (response) => ({body: await response.arrayBuffer(), headers: response.headers}));
    defaultPng.catch(() => {
      defaultPng = null;
    });
  }
  const {body, headers} = await defaultPng;
  return new Response(body.slice(0), {headers});
}

async function drawDefaultImage() {
  const tierCortex = createTierCortex();
  const logoUrl = tierCortex.getAssetUrl(LOGO);
  const sample = SAMPLE_ROWS.map((row) => ({
    name: row.name,
    images: tierCortex.resolveItemsFromPackage('image-overwatch', row.files)
      .map((item) => tierCortex.getOgSafeItem(item).imageUrl)
      .filter((url): url is string => url !== undefined),
  }));
  const imageSrc = await inlineLocalImages([logoUrl, ...sample.flatMap((row) => row.images)]);
  const rows = sample.map((row) => ({name: row.name, images: row.images.map(imageSrc)}));
  return new ImageResponse(<DefaultOGImage logoSrc={imageSrc(logoUrl)} rows={rows}/>, await imageOptions());
}

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const state = searchParams.get('state');
  if (!state) {
    return defaultImageResponse();
  }

  const tierCortex = createTierCortex();
  const decodedState = tierCortex.decodeTierStateFromURL(state);
  if (!decodedState) {
    return defaultImageResponse();
  }

  const {title, tiers} = decodedState;
  const ranked: Tier[] = tiers.slice(0, -1); // Without the Unranked row
  const logoUrl = tierCortex.getAssetUrl(LOGO);

  // Fit first, so only the tiles that show load their images.
  const tileFor = (item: Item): ListCardTile => {
    const safeItem = tierCortex.getOgSafeItem(item);
    return {key: safeItem.id, label: shorten(itemDisplayLabel(item), MAX_TEXT_LENGTH), src: safeItem.imageUrl};
  };
  const draft = listCardData({
    title: title ? shorten(title, MAX_TITLE_LENGTH) : 'OpenTierBoy',
    setName: tierCortex.listSetName(ranked),
    rows: ranked,
    height: LIST_CARD.previewHeight,
    maxTiles: MAX_TILES,
    background: getOgTierGradient,
    rowName: (row) => shorten(row.name, MAX_TEXT_LENGTH),
    tile: tileFor,
  });
  const drawnItems = ranked.flatMap((row, index) => row.items.slice(0, draft.rows[index]?.tiles.length ?? 0));

  // Only image URLs that TierCortex builds for the app's own assets. Link images and device
  // images have none (getOgSafeItem): link image addresses never reach this (A8, A36).
  const itemImageUrls = drawnItems
    .map((item) => tierCortex.getOgSafeItem(item).imageUrl)
    .filter((url): url is string => url !== undefined);
  // Link images on trusted sites, loaded with caps (link-images.ts). Any other link image, and
  // every device image, is a label tile.
  const linkImageUrls = drawnItems
    .filter((item) => item.source === 'link' && item.url !== undefined)
    .map((item) => item.url as string);
  const [imageSrc, linkImageSrc] = await Promise.all([
    inlineLocalImages([logoUrl, ...itemImageUrls]),
    inlineTrustedLinkImages(linkImageUrls),
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

  return new ImageResponse(
    <ListCard card={card} logoSrc={imageSrc(logoUrl)} fontFamily={FONT_FAMILY}/>,
    await imageOptions(),
  );
}
