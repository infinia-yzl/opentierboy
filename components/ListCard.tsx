import React from 'react';
import {LIST_CARD, type ListCardData, type ListCardTile} from '@/lib/listCard/model';

/**
 * The list card: one layout that two renderers draw. The link preview route (app/api/og) draws
 * it with next/og (satori), and Freeze Frame draws it in the browser with html2canvas
 * (components/ShareButton.tsx).
 *
 * Satori reads only a subset of CSS, so this component keeps to it: inline styles, flexbox
 * (every element with children is `display: flex`), absolute positioning, no grid, no calc()
 * and no z-index (later elements paint on top). No hooks: the edge route renders it without
 * React state. The fit rules (lib/listCard/fit.ts) decide the sizes before it renders.
 */

export const LIST_CARD_COLORS = Object.freeze({
  background: '#070a1f',
  text: '#ffffff',
  accent: '#fb923c',
  bar: '#0e1330',
  barText: '#eef2fa',
  more: '#1e2547',
  rowLine: 'rgba(0, 0, 0, 0.35)',
  labelTile: '#e5e7eb',
  labelTileText: '#374151',
  nameStrip: 'rgba(0, 0, 0, 0.55)',
});

export interface ListCardProps {
  card: ListCardData;
  /** The wordmark (public/brand/otb-logo-wide.png) as a URL the renderer can load. */
  logoSrc: string;
  /** The font family of the static Geologica faces (400, 600 and 900 Sharp). */
  fontFamily: string;
}

const contentWidth = LIST_CARD.width - LIST_CARD.padding.x * 2 - LIST_CARD.labelWidth;

/** Tier names: large for a letter or two, smaller for words. */
function rowNameSize(name: string, tile: number): number {
  const size = name.length <= 3 ? tile * 0.5 : tile * 0.26;
  return Math.round(Math.max(12, Math.min(46, size)));
}

function Tile({tile, size, showName}: {tile: ListCardTile; size: number; showName: boolean}) {
  if (!tile.src) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, flexShrink: 0,
        boxSizing: 'border-box', padding: 4, overflow: 'hidden', background: LIST_CARD_COLORS.labelTile,
        color: LIST_CARD_COLORS.labelTileText, fontSize: Math.max(9, Math.round(size * 0.14)), fontWeight: 600,
        lineHeight: 1.15, textAlign: 'center', wordBreak: 'break-word',
      }}>
        {tile.label}
      </div>
    );
  }
  return (
    <div style={{display: 'flex', position: 'relative', width: size, height: size, flexShrink: 0, overflow: 'hidden'}}>
      {/* eslint-disable-next-line @next/next/no-img-element -- both renderers need a plain <img> (satori has no next/image) */}
      <img
        src={tile.src}
        alt={tile.label}
        width={size}
        height={size}
        data-link-image={tile.linkImage}
        referrerPolicy={tile.linkImage ? 'no-referrer' : undefined}
        crossOrigin={tile.linkImage ? 'anonymous' : undefined}
        style={{width: size, height: size, objectFit: 'contain'}}
      />
      {showName && (
        <div style={{
          display: 'block', position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center',
          padding: '2px 3px', background: LIST_CARD_COLORS.nameStrip, color: LIST_CARD_COLORS.text,
          fontSize: Math.round(size * 0.13), fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {tile.label}
        </div>
      )}
    </div>
  );
}

export function ListCard({card, logoSrc, fontFamily}: ListCardProps) {
  const {tile} = card;
  const showNames = tile >= LIST_CARD.labelTileMin;
  const logoWidth = Math.round(LIST_CARD.logoDrawnHeight * LIST_CARD.logoWidth / LIST_CARD.logoHeight);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: card.width, height: card.height, boxSizing: 'border-box',
      padding: `0 ${LIST_CARD.padding.x}px ${LIST_CARD.padding.bottom}px`, background: LIST_CARD_COLORS.background,
      color: LIST_CARD_COLORS.text, fontFamily, overflow: 'hidden',
    }}>
      <div style={{display: 'flex', alignItems: 'center', height: LIST_CARD.headerHeight, flexShrink: 0}}>
        <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1, minWidth: 0, width: 0, marginRight: 32}}>
          {card.setName && (
            <div style={{display: 'flex', fontSize: 22, fontWeight: 600, letterSpacing: '0.08em', color: LIST_CARD_COLORS.accent, textTransform: 'uppercase'}}>
              {card.setName}
            </div>
          )}
          <div style={{
            display: 'block', fontSize: 58, fontWeight: 900, lineHeight: 1.25, letterSpacing: '-0.03em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {card.title}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- both renderers need a plain <img> (satori has no next/image) */}
        <img src={logoSrc} alt="OpenTierBoy" width={logoWidth} height={LIST_CARD.logoDrawnHeight}
             style={{width: logoWidth, height: LIST_CARD.logoDrawnHeight, flexShrink: 0}}/>
      </div>
      <div style={{display: 'flex', flexDirection: 'column'}}>
        {card.rows.map((row) => (
          <div key={row.key} style={{
            display: 'flex', width: '100%', backgroundImage: row.background,
            borderBottom: `${LIST_CARD.rowBorder}px solid ${LIST_CARD_COLORS.rowLine}`,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: LIST_CARD.labelWidth, minHeight: tile,
              flexShrink: 0, boxSizing: 'border-box', padding: '0 6px', overflow: 'hidden', color: LIST_CARD_COLORS.text,
              fontSize: rowNameSize(row.name, tile), fontWeight: 900, lineHeight: 1.05, textAlign: 'center', wordBreak: 'break-word',
            }}>
              {row.name}
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', width: contentWidth}}>
              {row.tiles.map((item) => <Tile key={item.key} tile={item} size={tile} showName={showNames}/>)}
              {row.more > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: tile, height: tile, flexShrink: 0,
                  background: LIST_CARD_COLORS.more, color: LIST_CARD_COLORS.text, fontSize: Math.round(tile * 0.3), fontWeight: 900,
                }}>
                  {`+${row.more}`}
                </div>
              )}
            </div>
          </div>
        ))}
        {card.extraRows > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', height: LIST_CARD.extraBarHeight,
            background: LIST_CARD_COLORS.bar, color: LIST_CARD_COLORS.barText, fontSize: 22, fontWeight: 600,
          }}>
            {`+${card.extraRows} more ${card.extraRows === 1 ? 'row' : 'rows'}`}
          </div>
        )}
      </div>
    </div>
  );
}
