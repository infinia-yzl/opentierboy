import {ImageResponse} from 'next/og';
import {TierCortex} from '@/lib/TierCortex';

export const runtime = 'edge';

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const state = searchParams.get('state');

  if (!state) {
    return new ImageResponse(<>Visit with "?state=..." query parameter</>, {
      width: 1200,
      height: 630,
    });
  }

  const tierCortex = new TierCortex();
  const tiers = tierCortex.decodeTierStateFromURL(state);

  if (!tiers) {
    return new ImageResponse(<>Failed to decode tier state</>, {
      width: 1200,
      height: 630,
    });
  }

  // Fetch Nunito Sans font
  const nunitoSansRegular = fetch(
    new URL('https://fonts.gstatic.com/s/nunitosans/v12/pe0qMImSLYBIv1o4X1M8cce9I9s.woff2', import.meta.url)
  ).then((res) => res.arrayBuffer());

  const nunitoSansBold = fetch(
    new URL('https://fonts.gstatic.com/s/nunitosans/v12/pe03MImSLYBIv1o4X1M8cc8GBs5tU1E.woff2', import.meta.url)
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
          fontFamily: 'Nunito Sans',
        }}
      >
        {/* Branding Text (replace with image later) */}
        <div style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#ffffff',
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          padding: '10px',
        }}>
          OpenTierBoy
        </div>

        {/* Uncomment when the branding image is ready */}
        {/* <img
          src="/path-to-your-branding-image.png"
          alt="OpenTierBoy"
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            width: '150px',  // Adjust
            height: 'auto',
          }}
        /> */}

        {tiers.map((tier, index) => (
          <div
            key={tier.id}
            style={{
              display: 'flex',
              background: tierCortex.getOgTierGradient(index, tiers.length),
              marginTop: '5px',
              paddingLeft: '20px',
              alignItems: 'center',
            }}
          >
            <div style={{
              fontSize: '36px',
              fontWeight: 'bold',
              color: '#ffffff',
              marginRight: '10px',
              width: '50px',
              textAlign: 'center',
            }}>
              {tier.name}
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px', flex: 1}}>
              {tier.items.slice(0, 10).map((item) => {
                const safeItem = tierCortex.getOgSafeItem(item);
                return (
                  <div
                    key={safeItem.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '64px',
                      height: '64px',
                      overflow: 'hidden',
                    }}
                  >
                    {safeItem.imageUrl && (
                      <img
                        src={safeItem.imageUrl}
                        alt={safeItem.content}
                        width="64"
                        height="64"
                        style={{objectFit: 'cover'}}
                      />
                    )}
                  </div>
                );
              })}
              {tier.items.length > 10 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  width: '40px',
                  height: '40px',
                }}>
                  +{tier.items.length - 10}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Nunito Sans',
          data: await nunitoSansRegular,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Nunito Sans',
          data: await nunitoSansBold,
          style: 'normal',
          weight: 700,
        },
      ]
    }
  );
}
