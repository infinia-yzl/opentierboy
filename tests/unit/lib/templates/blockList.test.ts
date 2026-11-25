import {describe, expect, it} from 'vitest';
import blockedFile from '@/blocked-templates.json';
import {isBlockedFile, isBlockedSource, parseBlockList} from '@/lib/templates/blockList';

const SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('parseBlockList', () => {
  it('returns every entry of blocked-templates.json when the file is read', () => {
    const list = parseBlockList(blockedFile);
    const file = blockedFile as {files: unknown[]; sources: unknown[]};
    expect(list.files.size).toBe(file.files.length);
    expect(list.sources.size).toBe(file.sources.length);
  });

  it('returns empty lists when the data has another shape', () => {
    for (const data of [null, 7, 'x', [], {files: 'x', sources: 7}]) {
      const list = parseBlockList(data);
      expect([list.files.size, list.sources.size], JSON.stringify(data)).toEqual([0, 0]);
    }
  });

  it('returns only checksums of 64 lowercase hex characters when the files list has other values', () => {
    expect([...parseBlockList({files: [SHA, SHA.toUpperCase(), 'abc', 7, null]}).files]).toEqual([SHA]);
  });

  it('returns only sources in their lowercase form when the sources list has addresses or upper case', () => {
    const sources = ['github.com/alice/otb-templates', 'gist.github.com/0123456789abcdef0123456789abcdef', 'templates.example.org', 'github.com/Alice/Repo', 'https://raw.githubusercontent.com/alice/repo/main/index.json', 'github.com/a/b/c/d', '', 7];
    expect([...parseBlockList({sources}).sources]).toEqual(['github.com/alice/otb-templates', 'gist.github.com/0123456789abcdef0123456789abcdef', 'templates.example.org']);
  });
});

describe('isBlockedFile and isBlockedSource', () => {
  const list = parseBlockList({files: [SHA], sources: ['github.com/alice/otb-templates']});

  it('returns true when the checksum is listed, in either letter case', () => {
    expect(isBlockedFile(SHA, list)).toBe(true);
    expect(isBlockedFile(SHA.toUpperCase(), list)).toBe(true);
    expect(isBlockedFile(SHA.replace('e', 'f'), list)).toBe(false);
  });

  it('returns true when the source is listed, in either letter case', () => {
    expect(isBlockedSource('github.com/alice/otb-templates', list)).toBe(true);
    expect(isBlockedSource('github.com/Alice/OTB-Templates', list)).toBe(true);
    expect(isBlockedSource('github.com/bob/otb-templates', list)).toBe(false);
  });
});
