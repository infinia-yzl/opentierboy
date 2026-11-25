/**
 * CRC-32 as PNG uses it (ISO 3309 / ITU-T V.42, polynomial 0xEDB88320). Every PNG chunk
 * ends with the CRC of its type and data.
 */

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

/** The CRC-32 of `bytes[start..end)`, as an unsigned 32-bit number. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
