import {describe, expect, it} from 'vitest';
import {
  addressesFromDrop,
  addressesInText,
  addressesInUriList,
  checkAddresses,
  foundNothing,
  linkImagesFromDrop,
  linkImagesFromPaste,
  MAX_DROPPED_TEXT_LENGTH,
  MAX_LINKS_PER_ADD,
  shownAddress,
} from '@/lib/images/droppedLinks';

describe('addressesInText', () => {
  it('returns the address when the text is one copied image address', () => {
    expect(addressesInText('https://i.imgur.com/red.png')).toEqual(['https://i.imgur.com/red.png']);
  });

  it('returns only the words with a scheme and // or data: when the text is a sentence', () => {
    expect(addressesInText('Look: https://i.imgur.com/a.png and http://x.org/b.png, data:image/png;base64,AA note: hi')).toEqual([
      'https://i.imgur.com/a.png',
      'http://x.org/b.png',
      'data:image/png;base64,AA',
    ]);
  });

  it('returns no address when the text has none', () => {
    expect(addressesInText('Mauga is S tier. Note: really')).toEqual([]);
    expect(addressesInText('i.imgur.com/a.png')).toEqual([]);
    expect(addressesInText('')).toEqual([]);
  });

  it('returns addresses without surrounding brackets, quotes and punctuation when the text has them', () => {
    expect(addressesInText('<https://a.org/x.png> "https://b.org/y.png", (https://c.org/z.png).')).toEqual([
      'https://a.org/x.png',
      'https://b.org/y.png',
      'https://c.org/z.png',
    ]);
  });

  it('returns the closing bracket of the address when the address has its own brackets', () => {
    expect(addressesInText('https://en.wikipedia.org/wiki/File:Ana_(Overwatch).png')).toEqual([
      'https://en.wikipedia.org/wiki/File:Ana_(Overwatch).png',
    ]);
  });

  it('returns addresses from the first MAX_DROPPED_TEXT_LENGTH characters only when the text is longer', () => {
    const filler = 'x'.repeat(MAX_DROPPED_TEXT_LENGTH - 30);
    const text = `https://a.org/1.png ${filler} https://b.org/cut-in-two.png https://c.org/3.png`;
    expect(addressesInText(text)).toEqual(['https://a.org/1.png']);
  });

  it('returns no address when the value is not a string', () => {
    expect(addressesInText(42 as unknown as string)).toEqual([]);
  });
});

describe('addressesInUriList', () => {
  it('returns each line without comment lines and empty lines when the list has them', () => {
    expect(addressesInUriList('# from a page\r\nhttps://a.org/1.png\r\n\r\nhttps://b.org/2.png\n')).toEqual([
      'https://a.org/1.png',
      'https://b.org/2.png',
    ]);
  });

  it('returns no address when the list is empty or not a string', () => {
    expect(addressesInUriList('')).toEqual([]);
    expect(addressesInUriList(undefined as unknown as string)).toEqual([]);
  });
});

describe('addressesFromDrop', () => {
  it('returns the image sources when the drop has images in its HTML', () => {
    expect(addressesFromDrop({
      imageSources: ['https://a.org/img.png', '/relative.png', ''],
      uriList: 'https://a.org/page',
      plain: 'https://a.org/page',
    })).toEqual(['https://a.org/img.png']);
  });

  it('returns the URI list when the drop has no image with an absolute address', () => {
    expect(addressesFromDrop({imageSources: ['/relative.png'], uriList: 'https://a.org/link.png', plain: 'ignored https://b.org/b.png'}))
      .toEqual(['https://a.org/link.png']);
  });

  it('returns the addresses in the text when the drop has only text', () => {
    expect(addressesFromDrop({plain: 'see https://a.org/a.png'})).toEqual(['https://a.org/a.png']);
    expect(addressesFromDrop({})).toEqual([]);
  });
});

describe('checkAddresses', () => {
  it('returns accepted addresses normalised and refused ones with their reason when checkLinkImageUrl decides', () => {
    const found = checkAddresses(['HTTPS://I.IMGUR.COM/a.png', 'http://i.imgur.com/b.png', 'https://localhost/c.png', 'javascript:alert(1)']);
    expect(found.accepted.map((link) => link.url)).toEqual(['https://i.imgur.com/a.png']);
    expect(found.refused).toEqual([
      {address: 'http://i.imgur.com/b.png', reason: 'not-https'},
      {address: 'https://localhost/c.png', reason: 'localhost'},
      {address: 'javascript:alert(1)', reason: 'unsupported-scheme'},
    ]);
    expect(found.leftOut).toBe(0);
  });

  it('returns each image once when the addresses repeat, also in another spelling', () => {
    const found = checkAddresses(['https://a.org/x.png', 'https://a.org/x.png', 'https://A.org:443/x.png']);
    expect(found.accepted.map((link) => link.url)).toEqual(['https://a.org/x.png']);
  });

  it(`returns ${MAX_LINKS_PER_ADD} addresses and the number left out when there are more`, () => {
    const addresses = Array.from({length: MAX_LINKS_PER_ADD + 5}, (_, index) => `https://a.org/${index}.png`);
    const found = checkAddresses(addresses);
    expect(found.accepted).toHaveLength(MAX_LINKS_PER_ADD);
    expect(found.accepted[0].url).toBe('https://a.org/0.png');
    expect(found.leftOut).toBe(5);
  });

  it('returns a shortened address when a refused address is long', () => {
    const long = `http://a.org/${'x'.repeat(200)}`;
    const [refused] = checkAddresses([long]).refused;
    expect(refused.address).toBe(shownAddress(long));
    expect(Array.from(refused.address)).toHaveLength(80);
    expect(refused.address.endsWith('…')).toBe(true);
  });
});

describe('linkImagesFromPaste', () => {
  it('returns the accepted address when the text is a copied https image address', () => {
    const found = linkImagesFromPaste('https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg');
    expect(found.accepted).toEqual([{
      ok: true,
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg',
      host: 'upload.wikimedia.org',
      displayDomain: 'upload.wikimedia.org',
    }]);
  });

  it('returns nothing found when the text has no address', () => {
    expect(foundNothing(linkImagesFromPaste('just some words'))).toBe(true);
  });

  it('returns a refused data address when the text is a data: image', () => {
    expect(linkImagesFromPaste('data:image/png;base64,iVBORw0KGgo=').refused).toEqual([
      {address: 'data:image/png;base64,iVBORw0KGgo=', reason: 'unsupported-scheme'},
    ]);
  });
});

describe('linkImagesFromDrop', () => {
  it('returns the image of the HTML when the drop is an image inside a link', () => {
    const found = linkImagesFromDrop({imageSources: ['https://i.imgur.com/a.png'], uriList: 'https://imgur.com/gallery/a'});
    expect(found.accepted.map((link) => link.host)).toEqual(['i.imgur.com']);
    expect(foundNothing(found)).toBe(false);
  });
});
