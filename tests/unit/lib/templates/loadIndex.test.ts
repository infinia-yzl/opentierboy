import {describe, expect, it} from 'vitest';
import {parseBlockList} from '@/lib/templates/blockList';
import {loadTemplateIndex} from '@/lib/templates/loadIndex';

const INDEX = 'https://raw.githubusercontent.com/alice/otb-templates/main/index.json';
const SHA_A = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHA_B = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const template = (id: string, sha256: string) => ({id, title: id, file: `https://raw.githubusercontent.com/alice/otb-templates/main/${id}.png`, bytes: 10, sha256});
const body = JSON.stringify({format: 1, name: 'Test index', templates: [template('a', SHA_A), template('b', SHA_B), {id: 'broken'}]});

function serving(text: string, init: ResponseInit = {}) {
  const requested: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    requested.push(String(input));
    return new Response(text, init);
  };
  return {requested, fetchFn};
}

describe('loadTemplateIndex', () => {
  it('returns the index, its source and the count of skipped entries when the host serves a valid index', async () => {
    const {requested, fetchFn} = serving(body);
    const result = await loadTemplateIndex(`${INDEX}`, {fetchFn});
    expect(result).toMatchObject({ok: true, url: INDEX, source: 'github.com/alice/otb-templates', skipped: 1});
    expect(result.ok && result.index.templates.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(requested).toEqual([INDEX]);
  });

  it('returns an address refusal and writes no request when the address is not allowed', async () => {
    const cases: [string, string][] = [
      ['http://raw.githubusercontent.com/alice/otb-templates/main/index.json', 'address-invalid'],
      ['https://example.org/alice/otb-templates/main/index.json', 'address-host'],
      [`${INDEX}?token=1`, 'address-shape'],
    ];
    for (const [address, reason] of cases) {
      const {requested, fetchFn} = serving(body);
      expect(await loadTemplateIndex(address, {fetchFn}), address).toEqual({ok: false, url: address, reason});
      expect(requested, address).toEqual([]);
    }
  });

  it('returns the failure "blocked" and writes no request when the source of the index is on the block list', async () => {
    const blockList = parseBlockList({sources: ['github.com/alice/otb-templates']});
    const variants = [
      INDEX,
      'https://raw.githubusercontent.com/Alice/OTB-Templates/main/index.json',
      'https://raw.githubusercontent.com/alice/otb-templates/refs/heads/main/index.json',
      'https://raw.githubusercontent.com/alice/otb-templates/0f5b08c380c8d8833fea8b8fe25173fdfdd2cf7a/other.json',
    ];
    for (const address of variants) {
      const {requested, fetchFn} = serving(body);
      expect(await loadTemplateIndex(address, {fetchFn, blockList}), address).toMatchObject({ok: false, reason: 'blocked'});
      expect(requested, address).toEqual([]);
    }
    const escaped = 'https://raw.githubusercontent.com/alice/otb-templates/main/%69ndex.json';
    expect(await loadTemplateIndex(escaped, {fetchFn: serving(body).fetchFn, blockList})).toEqual({ok: false, url: escaped, reason: 'address-shape'});
  });

  it('returns the index without the templates whose files are at a blocked source when another index lists them', async () => {
    const other = 'https://raw.githubusercontent.com/bob/list/main/index.json';
    const {fetchFn} = serving(body);
    const result = await loadTemplateIndex(other, {fetchFn, blockList: parseBlockList({sources: ['github.com/alice/otb-templates']})});
    expect(result).toMatchObject({ok: true, source: 'github.com/bob/list'});
    expect(result.ok && result.index.templates).toEqual([]);
  });

  it('returns the index without a template when the checksum of that template is on the block list', async () => {
    const {fetchFn} = serving(body);
    const result = await loadTemplateIndex(INDEX, {fetchFn, blockList: parseBlockList({files: [SHA_B]})});
    expect(result.ok && result.index.templates.map((entry) => entry.id)).toEqual(['a']);
  });

  it('returns the failure of the request or of the parser when the host fails or serves another document', async () => {
    expect(await loadTemplateIndex(INDEX, {fetchFn: serving('Not Found', {status: 404}).fetchFn})).toEqual({ok: false, url: INDEX, reason: 'not-found'});
    expect(await loadTemplateIndex(INDEX, {fetchFn: serving('Too many requests', {status: 429}).fetchFn})).toEqual({ok: false, url: INDEX, reason: 'limited'});
    expect(await loadTemplateIndex(INDEX, {fetchFn: serving('<html></html>').fetchFn})).toEqual({ok: false, url: INDEX, reason: 'bad-json'});
    expect(await loadTemplateIndex(INDEX, {fetchFn: serving(' '.repeat(300_000)).fetchFn})).toEqual({ok: false, url: INDEX, reason: 'too-large'});
    expect(await loadTemplateIndex(INDEX, {fetchFn: serving('{"format":2}').fetchFn})).toEqual({ok: false, url: INDEX, reason: 'unsupported-format'});
  });
});
