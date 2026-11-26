import {describe, expect, it} from 'vitest';
import {generateMetadata} from '@/app/rank/~list/[[...slug]]/page';
import {rankMetadata} from '@/app/rank/rankMetadata';
import {rankingState} from '../../../support/links';

const STATE = rankingState('image-overwatch', {S: ['Mauga']}, 'Tanks with notes');
const INK = '1.H4SwggIghgdlB0AnGMBuriLAYXgIwH0BzMIkseAYwDNUDqBaUsMYAFyWuuGv2IFEA7iQCaQA';

describe('rankMetadata', () => {
  it('returns the preview image address with the state value alone when the link has a list', () => {
    const metadata = rankMetadata(['overwatch', 'tank'], STATE);
    expect(metadata.openGraph?.images).toEqual([`/api/og?state=${encodeURIComponent(STATE)}`]);
    expect(metadata.title).toBe('Tanks with notes');
  });
});

describe('generateMetadata of /rank/~list', () => {
  it('returns metadata without the ink value when the address has state and ink values', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({slug: ['overwatch', 'tank']}),
      searchParams: Promise.resolve({state: STATE, ink: INK}),
    });
    const text = JSON.stringify(metadata);
    expect(text).toContain(encodeURIComponent(STATE));
    expect(text).not.toContain('ink');
    expect(text).not.toContain(INK.slice(2, 20));
  });
});
