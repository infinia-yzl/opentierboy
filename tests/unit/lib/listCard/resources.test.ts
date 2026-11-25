import {describe, expect, it} from 'vitest';
import {
  firstFontFamily,
  fontFacesSettled,
  imageSettled,
  styleSheetSettled,
  type FontFaceResource,
  type ImageResource,
  type StyleSheetResource,
} from '@/lib/listCard/resources';

class FakeLoader {
  private listeners: {type: 'load' | 'error'; listener: () => void}[] = [];

  addEventListener(type: 'load' | 'error', listener: () => void) {
    this.listeners.push({type, listener});
  }

  removeEventListener(type: 'load' | 'error', listener: () => void) {
    this.listeners = this.listeners.filter((entry) => entry.type !== type || entry.listener !== listener);
  }

  dispatch(type: 'load' | 'error') {
    this.listeners.filter((entry) => entry.type === type).forEach((entry) => entry.listener());
  }

  get listenerCount() {
    return this.listeners.length;
  }
}

class FakeImage extends FakeLoader implements ImageResource {
  complete = false;
  naturalWidth = 0;
}

class FakeStyleSheet extends FakeLoader implements StyleSheetResource {
  sheet: unknown = null;
  copy: FakeStyleSheet | null = null;
  replacement: FakeStyleSheet | null = null;
  onInserted: (link: FakeStyleSheet) => void = () => {};

  cloneNode(): FakeStyleSheet {
    this.copy = new FakeStyleSheet();
    return this.copy;
  }

  replaceWith(fresh: FakeStyleSheet) {
    this.replacement = fresh;
    this.onInserted(fresh);
  }
}

const UNSETTLED = 'unsettled';
async function stateNow(settled: Promise<string>): Promise<string> {
  let state = UNSETTLED;
  void settled.then((value) => {
    state = value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  return state;
}

function fontFace(family: string): FontFaceResource & {loads: number; succeed: () => void; fail: () => void} {
  let succeed = () => {};
  let fail = () => {};
  const loaded = new Promise<void>((resolve, reject) => {
    succeed = resolve;
    fail = () => reject(new Error('The font did not load'));
  });
  loaded.catch(() => {});
  const face = {
    family,
    loads: 0,
    succeed: () => succeed(),
    fail: () => fail(),
    load() {
      face.loads += 1;
      return loaded;
    },
  };
  return face;
}

describe('imageSettled', () => {
  it('returns "loaded" when the image is complete and has a width', async () => {
    const image = new FakeImage();
    image.complete = true;
    image.naturalWidth = 12;

    expect(await imageSettled(image)).toBe('loaded');
    expect(image.listenerCount).toBe(0);
  });

  it('returns "failed" when the image is complete and has no width', async () => {
    const image = new FakeImage();
    image.complete = true;

    expect(await imageSettled(image)).toBe('failed');
  });

  it('returns no state when the image has sent neither a load event nor an error event', async () => {
    const image = new FakeImage();

    expect(await stateNow(imageSettled(image))).toBe(UNSETTLED);
  });

  it('returns "loaded" when the image sends a load event', async () => {
    const image = new FakeImage();
    const settled = imageSettled(image);

    image.dispatch('load');

    expect(await settled).toBe('loaded');
    expect(image.listenerCount).toBe(0);
  });

  it('returns "failed" when the image sends an error event', async () => {
    const image = new FakeImage();
    const settled = imageSettled(image);

    image.dispatch('error');

    expect(await settled).toBe('failed');
    expect(image.listenerCount).toBe(0);
  });
});

describe('styleSheetSettled', () => {
  it('returns "loaded" when the link has its style sheet', async () => {
    const link = new FakeStyleSheet();
    link.sheet = {};

    expect(await styleSheetSettled(link)).toBe('loaded');
    expect(link.replacement).toBeNull();
  });

  it('returns no state when the link has no style sheet and its copy has sent no event', async () => {
    const link = new FakeStyleSheet();

    expect(await stateNow(styleSheetSettled(link))).toBe(UNSETTLED);
    expect(link.replacement).toBe(link.copy);
  });

  it('returns "loaded" when the copy of a link without a style sheet sends a load event', async () => {
    const link = new FakeStyleSheet();
    const settled = styleSheetSettled(link);

    link.dispatch('load');
    expect(await stateNow(settled)).toBe(UNSETTLED);
    link.replacement?.dispatch('load');

    expect(await settled).toBe('loaded');
  });

  it('returns "failed" when the copy of a link without a style sheet sends an error event', async () => {
    const link = new FakeStyleSheet();
    const settled = styleSheetSettled(link);

    link.replacement?.dispatch('error');

    expect(await settled).toBe('failed');
  });

  it('returns "loaded" when the copy sends its load event at once on entering the document', async () => {
    const link = new FakeStyleSheet();
    link.onInserted = (fresh) => fresh.dispatch('load');

    expect(await styleSheetSettled(link)).toBe('loaded');
  });
});

describe('firstFontFamily', () => {
  it('returns the first family without quotes when the list has several families', () => {
    expect(firstFontFamily("'listCardFont', 'listCardFont Fallback', system-ui, sans-serif")).toBe('listCardFont');
    expect(firstFontFamily('"Card Font", sans-serif')).toBe('Card Font');
    expect(firstFontFamily('listCardFont')).toBe('listCardFont');
  });
});

describe('fontFacesSettled', () => {
  const FAMILY = "'listCardFont', 'listCardFont Fallback', system-ui, sans-serif";

  it('returns the state of each face of the first family when one loads and one fails', async () => {
    const regular = fontFace('listCardFont');
    const black = fontFace('"listCardFont"');
    const settled = fontFacesSettled([regular, black], FAMILY);

    regular.succeed();
    black.fail();

    expect(await settled).toEqual(['loaded', 'failed']);
  });

  it('returns no state when one face of the first family is still loading', async () => {
    const regular = fontFace('listCardFont');
    const black = fontFace('listCardFont');
    const settled = fontFacesSettled([regular, black], FAMILY);

    regular.succeed();

    expect(await stateNow(settled.then(() => 'settled'))).toBe(UNSETTLED);
  });

  it('returns the states of the first family only when a face of the fallback family fails', async () => {
    const regular = fontFace('listCardFont');
    const fallback = fontFace('listCardFont Fallback');
    const other = fontFace('Geologica');
    fallback.fail();
    const settled = fontFacesSettled([regular, fallback, other], FAMILY);

    regular.succeed();

    expect(await settled).toEqual(['loaded']);
    expect(fallback.loads).toBe(0);
    expect(other.loads).toBe(0);
  });

  it('returns an empty list when the set has no face of the first family', async () => {
    expect(await fontFacesSettled([fontFace('Geologica')], FAMILY)).toEqual([]);
  });
});
