import {describe, expect, it} from 'vitest';
import {checkTemplateAddress} from '@/lib/templates/address';

const RAW = 'https://raw.githubusercontent.com/alice/otb-templates/main';
const GIST = 'https://gist.githubusercontent.com/alice/0123456789abcdef0123456789abcdef/raw';

describe('checkTemplateAddress', () => {
  it('returns the address and the source github.com/owner/repository when the address is a raw file of a repository', () => {
    expect(checkTemplateAddress(`${RAW}/index.json`, 'index')).toEqual({
      ok: true,
      url: `${RAW}/index.json`,
      host: 'raw.githubusercontent.com',
      source: 'github.com/alice/otb-templates',
    });
    expect(checkTemplateAddress(`${RAW}/files/Overwatch%20heroes.PNG`, 'file')).toMatchObject({ok: true, source: 'github.com/alice/otb-templates'});
    expect(checkTemplateAddress('https://raw.githubusercontent.com/alice/otb-templates/0f5b08c380c8d8833fea8b8fe25173fdfdd2cf7a/a.png', 'file')).toMatchObject({ok: true});
  });

  it('returns the source gist.github.com/owner/id when the address is a raw file of a gist', () => {
    expect(checkTemplateAddress(`${GIST}/index.json`, 'index')).toMatchObject({ok: true, source: 'gist.github.com/0123456789abcdef0123456789abcdef'});
    expect(checkTemplateAddress(`${GIST.replace('alice', 'somebody-else')}/index.json`, 'index')).toMatchObject({ok: true, source: 'gist.github.com/0123456789abcdef0123456789abcdef'});
    expect(checkTemplateAddress(`${GIST}/0f5b08c380c8d8833fea8b8fe25173fdfdd2cf7a/index.json`, 'index')).toMatchObject({ok: true});
  });

  it('returns the source in lowercase when the owner or the repository has upper case letters', () => {
    expect(checkTemplateAddress('https://raw.githubusercontent.com/Alice/OTB-Templates/main/index.json', 'index')).toMatchObject({
      ok: true,
      url: 'https://raw.githubusercontent.com/Alice/OTB-Templates/main/index.json',
      source: 'github.com/alice/otb-templates',
    });
  });

  it('returns the address in its normal form when the host has upper case, a final dot, the default port or backslashes', () => {
    const expected = {ok: true, url: `${RAW}/index.json`, host: 'raw.githubusercontent.com', source: 'github.com/alice/otb-templates'};
    for (const address of [
      'https://RAW.GitHubUserContent.com/alice/otb-templates/main/index.json',
      'https://raw.githubusercontent.com./alice/otb-templates/main/index.json',
      'https://raw.githubusercontent.com:443/alice/otb-templates/main/index.json',
      'https:\\\\raw.githubusercontent.com\\alice\\otb-templates\\main\\index.json',
      `  ${RAW}/index.json  `,
    ]) expect(checkTemplateAddress(address, 'index'), address).toEqual(expected);
  });

  it('returns the host as the source when a listed host has no rule of its own', () => {
    const hosts = [{host: 'templates.example.org', reason: 'test'}];
    expect(checkTemplateAddress('https://templates.example.org/a/index.json', 'index', hosts)).toEqual({
      ok: true,
      url: 'https://templates.example.org/a/index.json',
      host: 'templates.example.org',
      source: 'templates.example.org',
    });
  });

  it('returns the refusal "invalid" when the address breaks a rule of every web address the app takes', () => {
    const cases: unknown[] = [
      undefined, null, 42, '', '   ', 'index.json', '/alice/repo/main/index.json',
      'http://raw.githubusercontent.com/alice/repo/main/index.json',
      'javascript:alert(1)//raw.githubusercontent.com/alice/repo/main/index.json',
      'data:application/json,{}', 'blob:https://raw.githubusercontent.com/x', 'file:///etc/passwd',
      'https://user:pass@raw.githubusercontent.com/alice/repo/main/index.json',
      'https://raw.githubusercontent.com:8443/alice/repo/main/index.json',
      'https://127.0.0.1/alice/repo/main/index.json', 'https://[::1]/alice/repo/main/index.json',
      'https://localhost/alice/repo/main/index.json',
      `${RAW}/${'a'.repeat(2000)}.json`,
    ];
    for (const address of cases) expect(checkTemplateAddress(address, 'index'), String(address)).toEqual({ok: false, reason: 'invalid'});
  });

  it('returns the refusal "host" when the host is not on the list', () => {
    const cases = [
      'https://example.org/alice/repo/main/index.json',
      'https://github.com/alice/repo/raw/main/index.json',
      'https://evil.raw.githubusercontent.com/alice/repo/main/index.json',
      'https://raw.githubusercontent.com.evil.org/alice/repo/main/index.json',
      'https://objects.githubusercontent.com/alice/repo/main/index.json',
      'https://cdn.discordapp.com/attachments/1/2/index.json',
    ];
    for (const address of cases) expect(checkTemplateAddress(address, 'index'), address).toEqual({ok: false, reason: 'host'});
  });

  it('returns the refusal "shape" when the path, the query or the file type does not fit', () => {
    const cases: [string, 'index' | 'file'][] = [
      [`${RAW}/index.json?token=abc`, 'index'],
      [`${RAW}/index.json?`, 'index'],
      [`${RAW}/index.json#part`, 'index'],
      [`${RAW}/index.png`, 'index'],
      [`${RAW}/index.json`, 'file'],
      [`${RAW}/index.json.html`, 'index'],
      [`${RAW}/`, 'index'],
      ['https://raw.githubusercontent.com/alice/index.json', 'index'],
      ['https://raw.githubusercontent.com/alice/repo/index.json', 'index'],
      ['https://raw.githubusercontent.com/-alice/repo/main/index.json', 'index'],
      [`${RAW}/a//index.json`, 'index'],
      [`${RAW}/%2e%2e/index.json`, 'index'],
      [`${RAW}/a%2Fb/index.json`, 'index'],
      [`${RAW}/a%5cb/index.json`, 'index'],
      [`${RAW}/%69ndex.json`, 'index'],
      [`${RAW}/inde%78.json`, 'index'],
      [`${RAW}/a%2Db/index.json`, 'index'],
      [`${RAW}/a%00b/index.json`, 'index'],
      [`${RAW}/a%0Ab/index.json`, 'index'],
      [`${RAW}/a%zzb/index.json`, 'index'],
      [`${RAW}/a%2/index.json`, 'index'],
      [`${RAW}/.%2e/.%2e/.%2e/index.json`, 'index'],
      [`${RAW}/a(b)/index.json`, 'index'],
      [`${RAW}/a'b/index.json`, 'index'],
      ['https://gist.githubusercontent.com/alice/not-an-id/raw/index.json', 'index'],
      ['https://gist.githubusercontent.com/alice/0123456789abcdef0123456789abcdef/index.json', 'index'],
      ['https://gist.githubusercontent.com/alice/0123456789abcdef0123456789abcdef/raw/a/b/index.json', 'index'],
    ];
    for (const [address, kind] of cases) expect(checkTemplateAddress(address, kind), address).toEqual({ok: false, reason: 'shape'});
  });

  it('returns an address without a parent step when the address has one', () => {
    expect(checkTemplateAddress(`${RAW}/a/../index.json`, 'index')).toMatchObject({ok: true, url: `${RAW}/index.json`});
    expect(checkTemplateAddress('https://raw.githubusercontent.com/alice/repo/main/../../../index.json', 'index')).toEqual({ok: false, reason: 'shape'});
  });
});
