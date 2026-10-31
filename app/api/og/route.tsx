import {ImageResponse} from 'next/og';
import {TierCortex} from '@/lib/TierCortex';
import {inlineLocalImages} from './local-images';
import {MAX_TITLE_LENGTH, shorten} from '@/lib/text';

export const runtime = 'edge';

const LOGO = 'brand/otb-logo-wide.png';

// Limits for what the preview draws (A43). Drawing cost grows with every row, tile and
// character, and a link may hold 100 rows and text of any length, which kept the route busy for
// minutes. No real list reaches the text limits: the golden links have 49-character titles and
// 33-character tier names at most.
//
// Rows: only the rows that can show. The header takes at least 72 px and each row at least 80 px
// (satori drops the spacing between rows, and shrinks the padding above them when they overflow),
// so 7 rows reach the bottom of the 630 px image and an 8th row starts below it. The golden
// previews draw 7 rows at most. Drawing an 8th row also made satori take about 9 s instead of
// 2 s on the test machine.
const MAX_ROWS = 7;
/** Tier names and item labels. */
const MAX_TEXT_LENGTH = 40;
// Tiles drawn per row (plus a "+N" tile for the rest). A row has 1,008 px for tiles (1,200 px,
// less the 16 px padding on each side and the 160 px label) and a tile takes 72 px (64 px and a
// 4 px margin on each side), so 14 fit: all 11 are visible, none is clipped. Images come at
// preview size (scripts/prepareImages.js), which keeps each tile cheap to draw.
const ITEMS_PER_ROW = 10;


// Previews use Noto Sans, the default font of next/og up to Next.js 15. Next.js 16 changed
// the default to Geist, so the route passes the same font file itself to keep previews
// unchanged. fonts/OFL.txt holds the font's licence.
const notoSans = fetch(new URL('./fonts/noto-sans-v27-latin-regular.ttf', import.meta.url))
  .then((response) => response.arrayBuffer());

async function imageOptions() {
  return {
    width: 1200,
    height: 630,
    // The name and weight that next/og 15 gave its default font.
    fonts: [{name: 'sans serif', data: await notoSans, weight: 700 as const, style: 'normal' as const}],
  };
}

const DefaultOGImage = ({logoSrc}: {logoSrc: string}) => (
  <div tw="flex flex-col w-full h-full bg-black justify-between p-32">
    <div tw="flex flex-col justify-between items-center w-full">
      <img
        src={logoSrc}
        alt="OpenTierBoy"
        width={600}
        height={160}
        tw="mx-auto"
      />
      <h1 tw="text-4xl text-white">
        https://www.opentierboy.com
      </h1>
    </div>
    <h2 tw="flex text-4xl text-white text-center justify-center">
      No ads, no logins, no sign ups. Create tier lists for free.
    </h2>
  </div>
);

async function defaultImageResponse() {
  const logoUrl = new TierCortex().getAssetUrl(LOGO);
  const imageSrc = await inlineLocalImages([logoUrl]);
  return new ImageResponse(<DefaultOGImage logoSrc={imageSrc(logoUrl)}/>, await imageOptions());
}

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const state = searchParams.get('state');

  if (!state) {
    return defaultImageResponse();
  }

  const tierCortex = new TierCortex();
  const decodedState = tierCortex.decodeTierStateFromURL(state);

  if (!decodedState) {
    return defaultImageResponse();
  }

  const {title, tiers} = decodedState;
  tiers.pop(); // Remove uncategorized tier
  const rows = tiers.slice(0, MAX_ROWS);

  const logoUrl = tierCortex.getAssetUrl(LOGO);
  const imageSrc = await inlineLocalImages([
    logoUrl,
    ...rows.flatMap((tier) => tier.items.slice(0, ITEMS_PER_ROW).map((item) => tierCortex.getOgSafeItem(item).imageUrl ?? '')),
  ]);

  const titleText = title ? shorten(title, MAX_TITLE_LENGTH) : 'OpenTierBoy';

  return new ImageResponse(
    (
      <div tw="flex flex-col w-full h-full bg-black">
        <div tw="flex justify-between items-center pl-2 pr-4">
          <div tw="text-2xl text-white">
            {titleText}
          </div>
          <div tw="text-2xl text-white">
            opentierboy.com
          </div>
        </div>
        <div tw="text-md text-white pl-2 pb-4">
          No ads, no logins, no sign ups. Create yours today.
        </div>

        <div tw="flex flex-col space-y-4 px-4 pt-6">
          {rows.map((tier, index) => (
            <div
              key={tier.id}
              style={{
                background: tierCortex.getOgTierGradient(index, tiers.length + 1),
              }}
              tw="flex items-center rounded-md min-h-[80px] overflow-hidden"
            >
              <div tw="w-40 h-full flex items-center justify-center">
                <div tw="text-2xl font-semibold text-white text-center">
                  {shorten(tier.name, MAX_TEXT_LENGTH)}
                </div>
              </div>
              <div tw="flex-1 flex flex-wrap">
                {tier.items.slice(0, ITEMS_PER_ROW).map((item) => {
                  const safeItem = tierCortex.getOgSafeItem(item);
                  const label = shorten(safeItem.content, MAX_TEXT_LENGTH);
                  return (
                    <div
                      key={safeItem.id}
                      tw="w-16 h-16 m-1 rounded-md overflow-hidden bg-gray-200 flex items-center justify-center"
                    >
                      {safeItem.imageUrl ? (
                        <img
                          src={imageSrc(safeItem.imageUrl)}
                          alt={label}
                          tw="w-full h-full object-cover"
                        />
                      ) : (
                        <div tw="text-xs text-gray-600 text-center p-1">
                          {label}
                        </div>
                      )}
                    </div>
                  );
                })}
                {tier.items.length > ITEMS_PER_ROW && (
                  <div tw="w-16 h-16 m-1 rounded-md bg-gray-700 flex items-center justify-center text-white font-bold">
                    +{tier.items.length - ITEMS_PER_ROW}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <img
          src={imageSrc(logoUrl)}
          alt="OpenTierBoy"
          width={300}
          height={80}
          tw="absolute bottom-10 right-10"
        />
      </div>
    ),
    await imageOptions()
  );
}
