/**
 * Limits of the v3 link decoder (A29). A v3 link beyond any of them does not decode.
 *
 * They are generous: the largest list the app ships (all 430 items of every image set in 7
 * rows) has 16,000 characters of JSON and a 6,400-character link, under 2% of the JSON cap
 * and under a tenth of the item cap. They exist so a hand-made link cannot hang or crash what
 * comes after decoding: the editor, the page metadata and the OG preview route.
 *
 * Lengths count UTF-16 code units (JavaScript's `string.length`).
 * Raising a limit is safe: links that decoded before still decode. Lowering one can break
 * links people already shared, so never lower a limit.
 */
export const V3_LIMITS = Object.freeze({
  /** Characters after the `3.` prefix. */
  maxPayloadLength: 1_000_000,
  /** Characters of JSON after decompression. Checked before decompressing and before JSON.parse. */
  maxJsonLength: 1_000_000,
  /** Rows, including the Unranked row. A list needs at least one row. */
  maxRows: 100,
  /** Items in all rows together. */
  maxItems: 5_000,
  /** The list title. */
  maxTitleLength: 1_000,
  /** A tier name (the label of a row). */
  maxTierNameLength: 500,
  /** An item label (`c`). */
  maxLabelLength: 500,
  /** A tier id, a package item id or a device image id. */
  maxIdLength: 500,
  /** A link image address (`u`). The same cap as the app's link image check. */
  maxUrlLength: 2_000,
});

export type V3Limits = typeof V3_LIMITS;
