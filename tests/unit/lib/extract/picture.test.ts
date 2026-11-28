import {describe, expect, it} from 'vitest';
import {checkPicture, greyValues, roundHalfEven, workingPicture} from '@/lib/extract/picture';
import {blankPicture, fillBox} from '../../support/drawn-pictures';

describe('roundHalfEven', () => {
  it('returns the even neighbour when the value is halfway between two whole numbers', () => {
    expect([0.5, 1.5, 2.5, -0.5, 2.4, 2.6].map(roundHalfEven)).toEqual([0, 2, 2, 0, 2, 3]);
  });
});

describe('checkPicture', () => {
  it('throws RangeError when the bytes do not match the size', () => {
    expect(() => checkPicture({width: 2, height: 2, data: new Uint8Array(15)})).toThrow(RangeError);
  });

  it('throws RangeError when the width is not a whole number', () => {
    expect(() => checkPicture({width: 1.5, height: 2, data: new Uint8Array(12)})).toThrow(RangeError);
  });
});

describe('workingPicture', () => {
  it('returns the mean of each 2 by 2 block when the picture is 4 pixels wide and the target 2', () => {
    const picture = blankPicture(4, 2, [0, 0, 0]);
    fillBox(picture, {x: 0, y: 0, width: 1, height: 1}, [255, 10, 2]);
    const working = workingPicture(picture, 2);
    expect(working.height).toBe(1);
    expect(working.scale).toBe(0.5);
    expect(Array.from(working.rgb)).toEqual([64, 3, 1, 0, 0, 0]);
  });

  it('returns area weights over partly covered pixels when the factor is not whole', () => {
    const picture = blankPicture(3, 3, [0, 0, 0]);
    fillBox(picture, {x: 1, y: 0, width: 1, height: 3}, [90, 90, 90]);
    const working = workingPicture(picture, 2);
    expect(working.height).toBe(2);
    expect(Array.from(working.rgb.slice(0, 3))).toEqual([30, 30, 30]);
    expect(Array.from(working.rgb.slice(3, 6))).toEqual([30, 30, 30]);
  });

  it('returns a picture 20 pixels wide when the picture is 10 pixels wide', () => {
    const working = workingPicture(blankPicture(10, 5, [9, 9, 9]), 20);
    expect([working.width, working.height]).toEqual([20, 10]);
    expect(working.rgb.every((value) => value === 9)).toBe(true);
  });
});

describe('greyValues', () => {
  it('returns the grey value of each pixel when the picture has colours', () => {
    const picture = blankPicture(3, 1, [255, 0, 0]);
    fillBox(picture, {x: 1, y: 0, width: 1, height: 1}, [0, 255, 0]);
    fillBox(picture, {x: 2, y: 0, width: 1, height: 1}, [255, 255, 255]);
    expect(Array.from(greyValues(workingPicture(picture, 3)))).toEqual([76, 150, 255]);
  });
});
