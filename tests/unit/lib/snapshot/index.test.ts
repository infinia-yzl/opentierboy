import {describe, expect, it} from 'vitest';
import {embedSnapshotText, readSnapshotFile, writeSnapshotFile} from '@/lib/snapshot';
import {decodePng, makePng} from '../../support/pngHelpers';

const STATE = '3.N4IgLgFgpgTg4mAdgVw';

describe('readSnapshotFile and writeSnapshotFile', () => {
  it('returns the list and device images from readSnapshotFile when the PNG came from writeSnapshotFile', async () => {
    const screenshot = makePng(32, 20, 3);
    const deviceImage = `data:image/png;base64,${Buffer.from(makePng(8, 8, 9)).toString('base64')}`;
    const images = [{id: 'h3Kx9_Tq2LmZ-a8B', label: 'My cat 🐈', dataUrl: deviceImage}];

    const written = await writeSnapshotFile(screenshot, {state: STATE, images});
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    expect(decodePng(written.png).width).toBe(32);
    expect(await readSnapshotFile(written.png)).toEqual({ok: true, payload: {version: 1, state: STATE, images}});
  });

  it('returns reason \'no-snapshot\' when the PNG has no opentierboy chunk', async () => {
    expect(await readSnapshotFile(makePng())).toEqual({ok: false, reason: 'no-snapshot'});
  });

  it('returns reason \'not-png\', \'bad-json\', \'unsupported-version\' or \'invalid-payload\' when the file or payload is bad', async () => {
    expect(await readSnapshotFile(new TextEncoder().encode('not a png'))).toEqual({ok: false, reason: 'not-png'});

    const notJson = await embedSnapshotText(makePng(), 'not json');
    expect(notJson.ok && (await readSnapshotFile(notJson.png))).toEqual({ok: false, reason: 'bad-json'});

    const newer = await embedSnapshotText(makePng(), JSON.stringify({version: 2, state: STATE}));
    expect(newer.ok && (await readSnapshotFile(newer.png))).toEqual({ok: false, reason: 'unsupported-version'});

    const legacy = await embedSnapshotText(makePng(), JSON.stringify({version: 1, state: 'N4IgLgFgpgTg'}));
    expect(legacy.ok && (await readSnapshotFile(legacy.png))).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('returns reason \'invalid-payload\' or \'not-png\' when writeSnapshotFile gets an invalid payload or a broken PNG', async () => {
    expect(await writeSnapshotFile(makePng(), {state: 'N4Ig'})).toMatchObject({ok: false, reason: 'invalid-payload'});
    expect(await writeSnapshotFile(new Uint8Array(10), {state: STATE})).toEqual({ok: false, reason: 'not-png'});
  });
});
