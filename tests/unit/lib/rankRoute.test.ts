import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import type ImageSetConfig from '@/models/ImageSet';
import {findRankSet, findRankTag, rankRoute} from '@/lib/rankRoute';

const config = imagesetConfig as ImageSetConfig;
/** The answer for a path such as /rank/overwatch/tank (rankRoute takes the segments after /rank). */
const route = (path: string, hasState = false) => rankRoute(config, path.split('/').filter(Boolean).slice(1), hasState);

describe('findRankSet', () => {
  it('finds a set by its package name and by its display name slug', () => {
    expect(findRankSet(config, 'image-overwatch')?.packageName).toBe('image-overwatch');
    expect(findRankSet(config, 'overwatch')?.packageName).toBe('image-overwatch');
    expect(findRankSet(config, 'the-finals')?.packageName).toBe('image-reachthefinals');
  });

  it('finds legacy sets too', () => {
    expect(findRankSet(config, 'wuthering-waves')?.packageData.legacy).toBe(true);
  });

  it('never finds the properties every object has', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(findRankSet(config, name), name).toBeNull();
    }
  });
});

describe('findRankTag', () => {
  const overwatch = config.packages['image-overwatch'];

  it('finds all, a tag, and the URL form of a tag', () => {
    expect(findRankTag(overwatch, 'all')).toBe('all');
    expect(findRankTag(overwatch, 'tank')).toBe('tank');
    expect(findRankTag(overwatch, 'h-all')).toBe('h_all');
    expect(findRankTag(overwatch, 'nope')).toBeNull();
    expect(findRankTag(overwatch, 'constructor')).toBeNull();
  });
});

describe('rankRoute', () => {
  it('opens /rank and every existing template', () => {
    expect(route('/rank')).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/overwatch/tank')).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/image-overwatch/all')).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/overwatch/h-all')).toEqual({kind: 'page', legacy: false});
  });

  it('marks the pages of legacy sets', () => {
    expect(route('/rank/image-wutheringwaves/all')).toEqual({kind: 'page', legacy: true});
    expect(route('/rank/wuthering-waves/c-rarity-5')).toEqual({kind: 'page', legacy: true});
    expect(route('/rank/wuthering-waves/c-rarity-5', true)).toEqual({kind: 'page', legacy: true});
  });

  it('moves old tag paths to their URL form, like the page did', () => {
    expect(route('/rank/overwatch/h_all')).toEqual({kind: 'redirect', pathname: '/rank/overwatch/h-all'});
    expect(route('/rank/overwatch/h_all', true)).toEqual({kind: 'redirect', pathname: '/rank/overwatch/h-all'});
    expect(route('/rank/helldivers-2/Stratagems')).toEqual({kind: 'redirect', pathname: '/rank/helldivers-2/stratagems'});
  });

  it('finds no template for an unknown set or tag, or a set without a tag', () => {
    expect(route('/rank/nope/nope')).toEqual({kind: 'notFound'});
    expect(route('/rank/nope')).toEqual({kind: 'notFound'});
    expect(route('/rank/overwatch')).toEqual({kind: 'notFound'});
    expect(route('/rank/overwatch/nope')).toEqual({kind: 'notFound'});
    expect(route('/rank/constructor/all')).toEqual({kind: 'notFound'});
  });

  it('opens every link with a list in it, whatever its path names (product rule 3)', () => {
    expect(route('/rank/nope/nope', true)).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/overwatch/nope', true)).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/nope', true)).toEqual({kind: 'page', legacy: false});
  });
});
