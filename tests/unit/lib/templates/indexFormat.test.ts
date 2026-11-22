import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {parseTemplateIndex, TEMPLATE_INDEX_LIMITS} from '@/lib/templates/indexFormat';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../fixtures/templates', name)));
const encoded = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

const FILE = 'https://raw.githubusercontent.com/alice/otb-templates/main/a.png';
const SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const entry = (overrides: Record<string, unknown> = {}) => ({id: 'a', title: 'A', file: FILE, bytes: 10, sha256: SHA, ...overrides});
const index = (templates: unknown, overrides: Record<string, unknown> = {}) => ({format: 1, name: 'Test index', templates, ...overrides});
const parsed = (value: unknown) => parseTemplateIndex(encoded(value));
const ids = (value: unknown) => {
  const result = parsed(value);
  return result.ok ? {ids: result.index.templates.map((template) => template.id), skipped: result.skipped} : result;
};

describe('parseTemplateIndex', () => {
  it('returns both templates of the golden index of format 1 when it reads the fixture', () => {
    expect(parseTemplateIndex(fixture('index-format-1.json'))).toEqual({
      ok: true,
      skipped: 0,
      index: {
        name: 'OpenTierBoy community templates',
        maintainer: 'example-maintainer',
        contact: 'Open an issue at github.com/example/otb-templates',
        updated: '2026-11-22',
        templates: [
          {
            id: 'overwatch-heroes',
            title: 'Overwatch heroes',
            game: 'Overwatch',
            author: 'example-maker',
            file: 'https://raw.githubusercontent.com/example/otb-templates/main/overwatch-heroes.png',
            bytes: 1482113,
            sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            images: 45,
            updated: '2026-11-22',
          },
          {
            id: 'the-finals-weapons',
            title: 'THE FINALS weapons',
            game: null,
            author: null,
            file: 'https://gist.githubusercontent.com/example/0123456789abcdef0123456789abcdef/raw/the-finals-weapons.png',
            bytes: 20480,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            images: null,
            updated: null,
          },
        ],
      },
    });
  });

  it('returns an index without templates when the list of templates is empty', () => {
    expect(parsed(index([]))).toEqual({ok: true, skipped: 0, index: {name: 'Test index', maintainer: null, contact: null, updated: null, templates: []}});
  });

  it('returns the refusal "too-large" when the index has more bytes than the limit', () => {
    const padded = JSON.stringify(index([])) + ' '.repeat(TEMPLATE_INDEX_LIMITS.maxIndexBytes);
    expect(parsed(padded)).toEqual({ok: false, reason: 'too-large'});
  });

  it('returns the refusal "bad-text" when the bytes are not UTF-8', () => {
    expect(parseTemplateIndex(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]))).toEqual({ok: false, reason: 'bad-text'});
  });

  it('returns the refusal "too-many-values" when the text nests or lists more values than the limit', () => {
    expect(parsed('['.repeat(TEMPLATE_INDEX_LIMITS.maxJsonValues + 1))).toEqual({ok: false, reason: 'too-many-values'});
    expect(parsed(`{"format":1,"name":"x","templates":[],"x":[${'0,'.repeat(TEMPLATE_INDEX_LIMITS.maxJsonValues)}0]}`)).toEqual({ok: false, reason: 'too-many-values'});
  });

  it('returns the refusal "bad-json" when the text is not JSON', () => {
    for (const text of ['', '{', '<!DOCTYPE html><html></html>', "{'format': 1}"]) expect(parsed(text), text).toEqual({ok: false, reason: 'bad-json'});
  });

  it('returns the refusal "unsupported-format" when the format is a later whole number', () => {
    expect(parsed(index([], {format: 2}))).toEqual({ok: false, reason: 'unsupported-format'});
    expect(parsed({format: 99})).toEqual({ok: false, reason: 'unsupported-format'});
  });

  it('returns the refusal "invalid" when the structure of the index breaks a rule', () => {
    const cases: unknown[] = [
      null, [], 7,
      {name: 'x', templates: []},
      index([], {format: 0}), index([], {format: '1'}), index([], {format: 1.5}),
      {format: 1, templates: []},
      index([], {name: ''}), index([], {name: 'a'.repeat(81)}), index([], {name: 7}),
      index([], {name: `a${String.fromCodePoint(0x202e)}b`}),
      {format: 1, name: 'x'},
      index({}), index('a'),
      index(Array.from({length: TEMPLATE_INDEX_LIMITS.maxTemplates + 1}, (_, number) => entry({id: `a${number}`}))),
      index([], {updated: '22 November 2026'}), index([], {updated: '2026-13-45'}), index([], {updated: '2026-02-31'}), index([], {updated: 20261122}),
      index([], {contact: 'a\nb'}),
    ];
    for (const value of cases) expect(parsed(value), JSON.stringify(value)?.slice(0, 80)).toEqual({ok: false, reason: 'invalid'});
  });

  it('returns the other templates and a count when single entries break a rule', () => {
    const bad: unknown[] = [
      null, 'a', [],
      entry({id: 'B'}), entry({id: '-b'}), entry({id: 'b_c'}), entry({id: 'b'.repeat(65)}), entry({id: '__proto__'}), entry({id: 7}),
      entry({id: 'b', title: ''}), entry({id: 'b', title: 'a'.repeat(101)}), entry({id: 'b', title: `a${String.fromCodePoint(0x200f)}`}),
      entry({id: 'b', game: 7}), entry({id: 'b', author: 'a'.repeat(61)}),
      entry({id: 'b', file: 'https://example.org/a/b/c/a.png'}), entry({id: 'b', file: 'javascript:alert(1)'}),
      entry({id: 'b', file: FILE.replace('.png', '.html')}), entry({id: 'b', file: `${FILE}?x=1`}), entry({id: 'b', file: undefined}),
      entry({id: 'b', bytes: 0}), entry({id: 'b', bytes: 1.5}), entry({id: 'b', bytes: '10'}), entry({id: 'b', bytes: TEMPLATE_INDEX_LIMITS.maxFileBytes + 1}), entry({id: 'b', bytes: undefined}),
      entry({id: 'b', sha256: SHA.slice(1)}), entry({id: 'b', sha256: `${SHA.slice(1)}g`}), entry({id: 'b', sha256: undefined}),
      entry({id: 'b', images: 0}), entry({id: 'b', images: TEMPLATE_INDEX_LIMITS.maxImages + 1}), entry({id: 'b', images: '5'}),
      entry({id: 'b', updated: 'yesterday'}), entry({id: 'b', updated: '2026-02-30'}),
    ];
    for (const candidate of bad) expect(ids(index([entry(), candidate])), JSON.stringify(candidate)?.slice(0, 80)).toEqual({ids: ['a'], skipped: 1});
    expect(ids(index([entry(), ...bad, entry({id: 'c'})]))).toEqual({ids: ['a', 'c'], skipped: bad.length});
  });

  it('returns the first template and counts the second when two templates have the same id', () => {
    const result = parsed(index([entry({title: 'First'}), entry({title: 'Second'})]));
    expect(result).toMatchObject({ok: true, skipped: 1, index: {templates: [{id: 'a', title: 'First'}]}});
  });

  it('returns markup in a title as plain text when a title has markup', () => {
    const markup = '<script>alert(1)</script>';
    expect(parsed(index([entry({title: markup})]))).toMatchObject({ok: true, index: {templates: [{title: markup}]}});
  });

  it('returns templates without the unknown fields when an index or an entry has them', () => {
    const result = parsed(JSON.parse(`{"format":1,"name":"x","__proto__":{"polluted":true},"templates":[{"id":"a","title":"A","file":"${FILE}","bytes":10,"sha256":"${SHA}","__proto__":{"polluted":true},"constructor":1,"href":"javascript:alert(1)"}]}`));
    expect(result.ok && Object.keys(result.index.templates[0]).sort()).toEqual(['author', 'bytes', 'file', 'game', 'id', 'images', 'sha256', 'title', 'updated']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
