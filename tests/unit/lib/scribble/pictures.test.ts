import {describe, expect, it} from 'vitest';
import {outsidePicturesClip, picturesClip} from '@/lib/scribble/pictures';

const A = {x: 10, y: 20, width: 30, height: 40};
const B = {x: 100.5, y: 20, width: 30, height: 40.25};

describe('picturesClip', () => {
  it('returns a shape without area when the list shows no picture', () => {
    expect(picturesClip([])).toBe('inset(50%)');
  });

  it('returns the rectangle of the picture, reached from the corner of the layer and left the same way, when the list shows one picture', () => {
    expect(picturesClip([A])).toBe('polygon(0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0)');
  });

  it('returns each rectangle in turn, with a return to the corner of the layer between them, when the list shows two pictures', () => {
    expect(picturesClip([A, B])).toBe(
      'polygon(0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0, 100.5px 20px, 130.5px 20px, 130.5px 60.25px, 100.5px 60.25px, 100.5px 20px, 0 0)',
    );
  });
});

describe('outsidePicturesClip', () => {
  it('returns no clip when the list shows no picture', () => {
    expect(outsidePicturesClip([])).toBe('none');
  });

  it('returns the whole layer with the rectangle of the picture as a hole when the list shows one picture', () => {
    expect(outsidePicturesClip([A])).toBe(
      'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0)',
    );
  });

  it('returns one hole for each picture when the list shows two pictures', () => {
    expect(outsidePicturesClip([A, B])).toBe(
      'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0, 100.5px 20px, 130.5px 20px, 130.5px 60.25px, 100.5px 60.25px, 100.5px 20px, 0 0)',
    );
  });
});
