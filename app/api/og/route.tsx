import {ImageResponse} from 'next/og';
import {TierCortex} from '@/lib/TierCortex';

export const runtime = 'edge';

const DefaultOGImage = () => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
    }}
  >
    {/* Logo Placeholder */}
    {/*<div*/}
    {/*  style={{*/}
    {/*    width: '200px',*/}
    {/*    height: '200px',*/}
    {/*    backgroundColor: '#333',*/}
    {/*    borderRadius: '50%',*/}
    {/*    display: 'flex',*/}
    {/*    justifyContent: 'center',*/}
    {/*    alignItems: 'center',*/}
    {/*    marginBottom: '40px',*/}
    {/*  }}*/}
    {/*>*/}
    {/*  <span style={{color: '#fff', fontSize: '24px', fontWeight: 'bold'}}>Logo</span>*/}
    {/*</div>*/}

    {/* Title */}
    <h1
      style={{
        fontSize: '64px',
        fontWeight: 'bold',
        color: '#ffffff',
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
        marginBottom: '20px',
        textAlign: 'center',
      }}
    >
      OpenTierBoy
    </h1>

    {/* Subtitle */}
    <h2
      style={{
        fontSize: '36px',
        color: '#ffffff',
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
        marginBottom: '40px',
        textAlign: 'center',
      }}
    >
      No ads, no logins, no sign ups. Create tier lists for free.
    </h2>

    {/* Website URL */}
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        fontSize: '24px',
        color: '#ffffff',
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
      }}
    >
      opentierboy.com
    </div>
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
  const tiers = tierCortex.decodeTierStateFromURL(state);

  if (!tiers) {
    return new ImageResponse(<DefaultOGImage/>, {
      width: 1200,
      height: 630,
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#000',
        }}
      >
        {/* Branding Text (replace with image later) */}
        <div style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#ffffff',
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          padding: '10px',
          paddingBottom: '0',
        }}>
          OpenTierBoy ~ opentierboy.com
        </div>
        <div style={{
          fontSize: '22px',
          color: '#ffffff',
          textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
          padding: '10px',
          paddingTop: '0',
        }}>
          No ads, no logins, no sign ups. Create yours today.
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
              fontSize: '28px',
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
    }
  );
}
