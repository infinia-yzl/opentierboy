import LZString from 'lz-string';
import {defaultTierId, knownRowTemplate, ROW_TEMPLATE_TP} from '../templates';
import type {CanonicalItem, EncodableState} from '../types';

/** The prefix of a v3 link value: `?state=3.<payload>`. */
export const V3_PREFIX = '3.';

/** A v3 item: an image-set item id, a link image or a device image. */
type V3Item = string | {u: string; c?: string} | {d: string; c?: string};

/** A v3 row: `[id, name, items]`, or `[name, items]` when the id may be left out. */
type V3Row = [string, string, V3Item[]] | [string, V3Item[]];

/** The JSON of a v3 link, in the key order the encoder writes. */
interface V3Json {
  t?: string;
  tp?: number;
  lp?: string;
  sl?: false;
  r: V3Row[];
}

/**
 * Writes the v3 link value `3.<payload>` for a list (docs/link-format-v3.md).
 *
 * Deterministic: the same list always gives the same text. Every field that holds its default
 * is left out: an empty title, the 'custom' row template, labels on the left, labels shown,
 * an empty item label, and a tier id that equals the row template's id at that row's
 * position (templates.ts: defaultTierId). So decoding a value it wrote and encoding the
 * result gives back the same text.
 *
 * Items without `kind` are written as image-set item ids, and their `content` is dropped
 * (the image set holds their label). Mark custom items as `{kind: 'device'}` before encoding.
 * A link image is written from its `url`; its `id` is ignored.
 *
 * It writes whatever it is given. A list beyond V3_LIMITS (limits.ts: JSON size, rows,
 * items), with no rows, with an empty tier id, item id or image address, or with a device
 * image id that breaks the device id rule (deviceId.ts), gives a value that decodeState refuses:
 * `decodeState(encodeV3(list)) !== null` checks a list.
 */
export function encodeV3(state: EncodableState): string {
  const template = knownRowTemplate(state.rowTemplate);
  const head: Omit<V3Json, 'r'> = {};
  if (state.title) head.t = state.title;
  if (template !== undefined) head.tp = ROW_TEMPLATE_TP[template];
  if (state.labelPosition !== undefined && state.labelPosition !== 'left') head.lp = state.labelPosition;
  if (state.showLabels === false) head.sl = false;
  const rows = state.tiers.map((tier, index): V3Row => {
    const items = tier.items.map(encodeItem);
    return tier.id === defaultTierId(template ?? 'custom', index) ? [tier.name, items] : [tier.id, tier.name, items];
  });
  // Key order: t, tp, lp, sl, r.
  const json: V3Json = {...head, r: rows};
  return V3_PREFIX + LZString.compressToEncodedURIComponent(JSON.stringify(json));
}

function encodeItem(item: CanonicalItem): V3Item {
  if (item.kind === 'link') return item.content ? {u: item.url, c: item.content} : {u: item.url};
  if (item.kind === 'device') return item.content ? {d: item.id, c: item.content} : {d: item.id};
  return item.id;
}
