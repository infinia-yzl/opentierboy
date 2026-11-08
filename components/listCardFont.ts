import localFont from 'next/font/local';

/**
 * Geologica for the list card that Freeze Frame draws (components/ListCard.tsx): the same static
 * faces the link preview route uses (app/api/og/fonts), as WOFF2. Only the card uses it; the
 * site keeps its own font. Not preloaded: it loads when Freeze Frame draws a card.
 * components/fonts/OFL.txt holds the font's licence.
 */
export const listCardFont = localFont({
  src: [
    {path: './fonts/Geologica-Regular.woff2', weight: '400', style: 'normal'},
    {path: './fonts/Geologica-SemiBold.woff2', weight: '600', style: 'normal'},
    {path: './fonts/Geologica-Black-Sharp.woff2', weight: '900', style: 'normal'},
  ],
  display: 'block',
  preload: false,
  fallback: ['system-ui', 'sans-serif'],
});
