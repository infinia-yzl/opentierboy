import {describe, expect, it} from 'vitest';
import {parseBlockList} from '@/lib/templates/blockList';
import {sha256Hex} from '@/lib/templates/checksum';
import {fetchTemplateFile} from '@/lib/templates/templateFile';

const FILE = 'https://raw.githubusercontent.com/alice/otb-templates/main/a.png';
const CONTENT = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

function serving(content: Uint8Array) {
  const requested: [string, RequestInit | undefined][] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    requested.push([String(input), init]);
    return new Response(content as Uint8Array<ArrayBuffer>);
  };
  return {requested, fetchFn};
}

const entryFor = async (content: Uint8Array) => ({file: FILE, bytes: content.byteLength, sha256: await sha256Hex(content)});

describe('fetchTemplateFile', () => {
  it('returns the bytes when their size and checksum match the entry', async () => {
    const {requested, fetchFn} = serving(CONTENT);
    expect(await fetchTemplateFile(await entryFor(CONTENT), {fetchFn})).toEqual({ok: true, bytes: CONTENT});
    expect(requested.map(([url, init]) => [url, init?.cache])).toEqual([[FILE, 'no-store']]);
  });

  it('returns the bytes when the entry states the checksum in upper case', async () => {
    const entry = await entryFor(CONTENT);
    expect(await fetchTemplateFile({...entry, sha256: entry.sha256.toUpperCase()}, {fetchFn: serving(CONTENT).fetchFn})).toMatchObject({ok: true});
  });

  it('returns the failure "checksum" when one byte differs from the listed file', async () => {
    const changed = Uint8Array.from(CONTENT);
    changed[changed.length - 1] ^= 1;
    expect(await fetchTemplateFile(await entryFor(CONTENT), {fetchFn: serving(changed).fetchFn})).toEqual({ok: false, reason: 'checksum'});
  });

  it('returns the failure "size" when the file is longer or shorter than the entry states', async () => {
    const entry = await entryFor(CONTENT);
    const longer = new Uint8Array([...CONTENT, 0]);
    const shorter = CONTENT.slice(0, -1);
    expect(await fetchTemplateFile(entry, {fetchFn: serving(longer).fetchFn})).toEqual({ok: false, reason: 'size'});
    expect(await fetchTemplateFile(entry, {fetchFn: serving(shorter).fetchFn})).toEqual({ok: false, reason: 'size'});
  });

  it('returns the failure "size" and writes no request when the stated size is outside the limits', async () => {
    const entry = await entryFor(CONTENT);
    for (const bytes of [0, -1, 1.5, 25 * 1024 * 1024 + 1, Number.NaN]) {
      const {requested, fetchFn} = serving(CONTENT);
      expect(await fetchTemplateFile({...entry, bytes}, {fetchFn}), String(bytes)).toEqual({ok: false, reason: 'size'});
      expect(requested).toEqual([]);
    }
  });

  it('returns the failure "address" and writes no request when the file address is not allowed', async () => {
    const entry = await entryFor(CONTENT);
    for (const file of ['https://example.org/a/b/c/a.png', 'javascript:alert(1)', FILE.replace('.png', '.html'), `${FILE}?x=1`]) {
      const {requested, fetchFn} = serving(CONTENT);
      expect(await fetchTemplateFile({...entry, file}, {fetchFn}), file).toEqual({ok: false, reason: 'address'});
      expect(requested).toEqual([]);
    }
  });

  it('returns the failure "blocked" and writes no request when the checksum is on the block list', async () => {
    const entry = await entryFor(CONTENT);
    const {requested, fetchFn} = serving(CONTENT);
    expect(await fetchTemplateFile(entry, {fetchFn, blockList: parseBlockList({files: [entry.sha256]})})).toEqual({ok: false, reason: 'blocked'});
    expect(requested).toEqual([]);
  });

  it('returns the failure "blocked" and writes no request when the source of the file is on the block list', async () => {
    const entry = await entryFor(CONTENT);
    const blockList = parseBlockList({sources: ['github.com/alice/otb-templates']});
    for (const file of [FILE, FILE.replace('alice', 'ALICE'), FILE.replace('/main/', '/refs/heads/main/')]) {
      const {requested, fetchFn} = serving(CONTENT);
      expect(await fetchTemplateFile({...entry, file}, {fetchFn, blockList}), file).toEqual({ok: false, reason: 'blocked'});
      expect(requested).toEqual([]);
    }
  });

  it('returns "not-found" when the host answers 404, and "limited" when it answers 429', async () => {
    const answering = (status: number): typeof fetch => async () => new Response('x', {status});
    expect(await fetchTemplateFile(await entryFor(CONTENT), {fetchFn: answering(404)})).toEqual({ok: false, reason: 'not-found'});
    expect(await fetchTemplateFile(await entryFor(CONTENT), {fetchFn: answering(429)})).toEqual({ok: false, reason: 'limited'});
  });
});
