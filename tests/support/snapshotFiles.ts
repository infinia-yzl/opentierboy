import zlib from 'node:zlib';

/**
 * Snapshot files for the tests, built and read here with node:zlib, independently of
 * lib/snapshot: a PNG with an `iTXt` chunk, keyword `opentierboy`, just before IEND.
 */

const KEYWORD = 'opentierboy';

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** The chunks of a PNG as [type, data] pairs. */
function chunks(png: Buffer): [string, Buffer][] {
  const found: [string, Buffer][] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    found.push([png.toString('latin1', at + 4, at + 8), png.subarray(at + 8, at + 8 + length)]);
    at += 12 + length;
  }
  return found;
}

/**
 * A copy of `png` with a snapshot chunk holding `text`, or `compressedText` exactly as given
 * (for broken or hostile files).
 */
export function pngWithSnapshotText(png: Buffer, text: string, {compressedText}: {compressedText?: Buffer} = {}): Buffer {
  const header = Buffer.from(`${KEYWORD}\0\x01\0\0\0`, 'latin1');
  const body = compressedText ?? zlib.deflateSync(Buffer.from(text, 'utf8'));
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), chunk('iTXt', Buffer.concat([header, body])), png.subarray(iend)]);
}

/** The snapshot text of a PNG, or null when it has none. */
export function snapshotTextOf(png: Buffer): string | null {
  for (const [type, data] of chunks(png)) {
    if (type !== 'iTXt' || !data.subarray(0, KEYWORD.length + 1).equals(Buffer.from(`${KEYWORD}\0`, 'latin1'))) continue;
    let at = KEYWORD.length + 3;
    at = data.indexOf(0, at) + 1; // language tag
    at = data.indexOf(0, at) + 1; // translated keyword
    const body = data.subarray(at);
    return (data[KEYWORD.length + 1] === 1 ? zlib.inflateSync(body) : body).toString('utf8');
  }
  return null;
}

/** A file to open, drop or paste, made from bytes. */
export function pngFile(name: string, buffer: Buffer) {
  return {name, mimeType: 'image/png', buffer};
}
