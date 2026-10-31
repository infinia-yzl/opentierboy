import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import type ImageSetConfig from '@/models/ImageSet';
import {findRankSet, findRankTag, rankRoute} from '@/lib/rankRoute';

const config = imagesetConfig as ImageSetConfig;
/** The answer for a path such as /rank/overwatch/tank (rankRoute takes the segments after /rank). */
const route = (path: string, hasState = false) => rankRoute(config, path.split('/').filter(Boolean).slice(1), hasState);

describe('findRankSet', () => {
  it('returns the set when the name is its package name or its display-name slug', () => {
    expect(findRankSet(config, 'image-overwatch')?.packageName).toBe('image-overwatch');
    expect(findRankSet(config, 'overwatch')?.packageName).toBe('image-overwatch');
    expect(findRankSet(config, 'the-finals')?.packageName).toBe('image-reachthefinals');
  });

  it('returns the set with legacy true when the name is a legacy set slug', () => {
    expect(findRankSet(config, 'wuthering-waves')?.packageData.legacy).toBe(true);
  });

  it('returns null when the name is an Object.prototype member', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(findRankSet(config, name), name).toBeNull();
    }
  });
});

describe('findRankTag', () => {
  const overwatch = config.packages['image-overwatch'];

  it('returns all, the tag or h_all for all, tank or h-all, and null when the tag is unknown', () => {
    expect(findRankTag(overwatch, 'all')).toBe('all');
    expect(findRankTag(overwatch, 'tank')).toBe('tank');
    expect(findRankTag(overwatch, 'h-all')).toBe('h_all');
    expect(findRankTag(overwatch, 'nope')).toBeNull();
    expect(findRankTag(overwatch, 'constructor')).toBeNull();
  });
});

describe('rankRoute', () => {
  it('returns kind page with legacy false when the path is /rank or an existing template', () => {
    expect(route('/rank')).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/overwatch/tank')).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/image-overwatch/all')).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/overwatch/h-all')).toEqual({kind: 'page', legacy: false});
  });

  it('returns kind page with legacy true when the path names a legacy set', () => {
    expect(route('/rank/image-wutheringwaves/all')).toEqual({kind: 'page', legacy: true});
    expect(route('/rank/wuthering-waves/c-rarity-5')).toEqual({kind: 'page', legacy: true});
    expect(route('/rank/wuthering-waves/c-rarity-5', true)).toEqual({kind: 'page', legacy: true});
  });

  it('returns kind redirect to the URL form when the tag in the path has underscores or capitals', () => {
    expect(route('/rank/overwatch/h_all')).toEqual({kind: 'redirect', pathname: '/rank/overwatch/h-all'});
    expect(route('/rank/overwatch/h_all', true)).toEqual({kind: 'redirect', pathname: '/rank/overwatch/h-all'});
    expect(route('/rank/helldivers-2/Stratagems')).toEqual({kind: 'redirect', pathname: '/rank/helldivers-2/stratagems'});
  });

  it('returns kind notFound when the set or tag is unknown or the path has no tag', () => {
    expect(route('/rank/nope/nope')).toEqual({kind: 'notFound'});
    expect(route('/rank/nope')).toEqual({kind: 'notFound'});
    expect(route('/rank/overwatch')).toEqual({kind: 'notFound'});
    expect(route('/rank/overwatch/nope')).toEqual({kind: 'notFound'});
    expect(route('/rank/constructor/all')).toEqual({kind: 'notFound'});
  });

  it('returns kind page when the link has a state parameter and an unknown set or tag (product rule 3)', () => {
    expect(route('/rank/nope/nope', true)).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/overwatch/nope', true)).toEqual({kind: 'page', legacy: false});
    expect(route('/rank/nope', true)).toEqual({kind: 'page', legacy: false});
  });
});
