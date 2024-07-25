import {ImageResponse} from 'next/og';
import {TierCortex} from '@/lib/TierCortex';

export const runtime = 'edge';

const DefaultOGImage = () => (
  <div tw="flex flex-col w-full h-full bg-black justify-between p-32">
    <div tw="flex flex-col justify-between items-center w-full">
      <img
        src={new TierCortex().getAssetUrl('brand/otb-logo-wide.png')}
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

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const state = searchParams.get('state');

  if (!state) {
    return new ImageResponse(<DefaultOGImage/>, {
      width: 1200,
      height: 630,
    });
  }

  const tierCortex = new TierCortex();
  const decodedState = tierCortex.decodeTierStateFromURL(state);

  if (!decodedState) {
    return new ImageResponse(<DefaultOGImage/>, {
      width: 1200,
      height: 630,
    });
  }

  const {title, tiers} = decodedState;
  tiers.pop(); // Remove uncategorized tier

  const titleText = title ? `${title}` : 'OpenTierBoy';

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
          {tiers.map((tier, index) => (
            <div
              key={tier.id}
              style={{
                background: tierCortex.getOgTierGradient(index, tiers.length + 1),
              }}
              tw="flex items-center rounded-md min-h-[80px] overflow-hidden"
            >
              <div tw="w-40 h-full flex items-center justify-center">
                <div tw="text-2xl font-semibold text-white text-center">
                  {tier.name}
                </div>
              </div>
              <div tw="flex-1 flex flex-wrap">
                {tier.items.slice(0, 10).map((item) => {
                  const safeItem = tierCortex.getOgSafeItem(item);
                  return (
                    <div
                      key={safeItem.id}
                      tw="w-16 h-16 m-1 rounded-md overflow-hidden bg-gray-200 flex items-center justify-center"
                    >
                      {safeItem.imageUrl ? (
                        <img
                          src={safeItem.imageUrl}
                          alt={safeItem.content}
                          tw="w-full h-full object-cover"
                        />
                      ) : (
                        <div tw="text-xs text-gray-600 text-center p-1">
                          {safeItem.content}
                        </div>
                      )}
                    </div>
                  );
                })}
                {tier.items.length > 10 && (
                  <div tw="w-16 h-16 m-1 rounded-md bg-gray-700 flex items-center justify-center text-white font-bold">
                    +{tier.items.length - 10}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <img
          src={tierCortex.getAssetUrl('brand/otb-logo-wide.png')}
          alt="OpenTierBoy"
          width={300}
          height={80}
          tw="absolute bottom-10 right-10"
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
