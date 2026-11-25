/**
 * Limits of the v3 link decoder (A29, A43). A v3 link beyond any of them does not decode.
 *
 * They protect what comes after decoding (the editor, the page metadata and the OG preview
 * route) from hand-made links. They never refuse a real list: the largest list the app ships
 * (all 430 items of every image set in 7 rows) has 16,000 characters of JSON and a
 * 6,400-character link, under 2% of the JSON cap and under a tenth of the item cap.
 *
 * There is no cap on the length of a title, name, label, id or address (A43). The editor lets
 * people type text of any length, so such a cap would make the app write links it then
 * refused to open. The JSON cap bounds every string, and /api/og shortens long text before it
 * draws it. The same policy holds for legacy links (lib/legacyLinkLimits.ts).
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
});

export type V3Limits = typeof V3_LIMITS;
