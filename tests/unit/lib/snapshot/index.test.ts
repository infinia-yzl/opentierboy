import {describe, expect, it} from 'vitest';
import {embedSnapshotText, readSnapshotFile, writeSnapshotFile} from '@/lib/snapshot';
import {decodePng, makePng} from '../../support/pngHelpers';

const STATE = '3.N4IgLgFgpgTg4mAdgVw';

describe('readSnapshotFile and writeSnapshotFile', () => {
  it('stores a list with device images in a screenshot and reads it back', async () => {
    const screenshot = makePng(32, 20, 3);
    const deviceImage = `data:image/png;base64,${Buffer.from(makePng(8, 8, 9)).toString('base64')}`;
    const images = [{id: 'h3Kx9_Tq2LmZ-a8B', label: 'My cat 🐈', dataUrl: deviceImage}];

    const written = await writeSnapshotFile(screenshot, {state: STATE, images});
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    expect(decodePng(written.png).width).toBe(32);
    expect(await readSnapshotFile(written.png)).toEqual({ok: true, payload: {version: 1, state: STATE, images}});
  });

  it('reports no-snapshot for an ordinary picture, so the caller can add it as an item', async () => {
    expect(await readSnapshotFile(makePng())).toEqual({ok: false, reason: 'no-snapshot'});
  });

  it('passes on the reason when the file or the payload is bad', async () => {
    expect(await readSnapshotFile(new TextEncoder().encode('not a png'))).toEqual({ok: false, reason: 'not-png'});

    const notJson = await embedSnapshotText(makePng(), 'not json');
    expect(notJson.ok && (await readSnapshotFile(notJson.png))).toEqual({ok: false, reason: 'bad-json'});

    const newer = await embedSnapshotText(makePng(), JSON.stringify({version: 2, state: STATE}));
    expect(newer.ok && (await readSnapshotFile(newer.png))).toEqual({ok: false, reason: 'unsupported-version'});

    const legacy = await embedSnapshotText(makePng(), JSON.stringify({version: 1, state: 'N4IgLgFgpgTg'}));
    expect(legacy.ok && (await readSnapshotFile(legacy.png))).toMatchObject({ok: false, reason: 'invalid-payload'});
  });

  it('refuses to write an invalid payload or into a broken PNG', async () => {
    expect(await writeSnapshotFile(makePng(), {state: 'N4Ig'})).toMatchObject({ok: false, reason: 'invalid-payload'});
    expect(await writeSnapshotFile(new Uint8Array(10), {state: STATE})).toEqual({ok: false, reason: 'not-png'});
  });
});
