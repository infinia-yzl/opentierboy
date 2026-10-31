/*
 * Decodes the v3 link format: `?state=3.<payload>`, where the payload is lz-string
 * compressToEncodedURIComponent of compact JSON. docs/reference/link-format.md describes the format.
 *
 *   {
 *     "t":  title                        (left out when empty)
 *     "tp": 3 | 5 | 7                    row template (left out for 'custom')
 *     "lp": "left" | "right" | "top"     label position (left out for "left")
 *     "sl": false                        labels hidden (left out when shown)
 *     "r":  [row, ...]                   rows, top to bottom, at least one
 *   }
 *   row:  [id, name, [item, ...]], or [name, [item, ...]] when the id is the row template's
 *         id at that position (templates.ts: defaultTierId)
 *   item: "image-overwatch-ana.webp"     an image-set item id
 *         {"i": id, "c": label}          an id with a stored label: the app writes it only for
 *                                        an id that names no image-set item, such as a removed one
 *         {"u": url, "c": label}         an image from a link ("c" left out when empty)
 *         {"d": localId, "c": label}     an image from a device ("c" left out when empty)
 *
 * Validation is strict about types and sizes (limits.ts: the JSON, rows and items; strings
 * have no length cap, A43) and ignores keys it does not know, so a later version can add keys
 * that this decoder skips. Tier ids, item ids and image addresses must not be empty, and a
 * device image id must follow the device id rule (deviceId.ts). It checks nothing else: an image address is not checked here (the app must
 * check it before use, and the server must never fetch it), and duplicate ids are kept.
 * Anything invalid gives null, never an exception.
 */
import {isDeviceImageId} from '../deviceId';
import {V3_LIMITS} from '../limits';
import {decompressFromEncodedURIComponentCapped} from '../lz';
import {defaultTierId, rowTemplateFromTp} from '../templates';
import type {CanonicalItem, CanonicalState, CanonicalTier, LabelPosition, RowTemplate} from '../types';

/** Why a v3 payload did not decode. Codes only, never link content, so logs stay clean. */
export type V3DecodeReason =
  | 'payload-too-long'
  | 'not-lz-string-or-too-long'
  | 'not-json'
  | 'not-an-object'
  | 'bad-title'
  | 'bad-row-template'
  | 'bad-label-position'
  | 'bad-show-labels'
  | 'bad-rows'
  | 'bad-row-count'
  | 'bad-row'
  | 'missing-tier-id'
  | 'bad-tier-id'
  | 'bad-tier-name'
  | 'bad-items'
  | 'too-many-items'
  | 'bad-item'
  | 'bad-device-id'
  | 'unexpected';

export type V3DecodeResult =
  | {ok: true; state: CanonicalState}
  | {ok: false; reason: V3DecodeReason};

type JsonObject = Record<string, unknown>;

const LABEL_POSITIONS: readonly LabelPosition[] = ['left', 'right', 'top'];

function fail(reason: V3DecodeReason): V3DecodeResult {
  return {ok: false, reason};
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own keys only: a key such as "constructor" never reads Object.prototype. */
function has(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** For ids and addresses: an empty one names nothing. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/**
 * Decodes the payload of a v3 link (the text after `3.`) and says why when it fails.
 * Never throws.
 */
export function readV3Payload(payload: string): V3DecodeResult {
  try {
    return read(payload);
  } catch {
    return fail('unexpected');
  }
}

/** Decodes the payload of a v3 link (the text after `3.`). Null when invalid; never throws. */
export function decodeV3Payload(payload: string): CanonicalState | null {
  const result = readV3Payload(payload);
  return result.ok ? result.state : null;
}

function read(payload: string): V3DecodeResult {
  if (typeof payload !== 'string') return fail('unexpected');
  if (payload.length > V3_LIMITS.maxPayloadLength) return fail('payload-too-long');

  // Caps the output before decompressing. A space reads as '+', as URLSearchParams turns '+'
  // into a space; characters after the end of the data are ignored.
  const json = decompressFromEncodedURIComponentCapped(payload, V3_LIMITS.maxJsonLength);
  if (json === null) return fail('not-lz-string-or-too-long');

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail('not-json');
  }
  if (!isObject(parsed)) return fail('not-an-object');

  let title: string | undefined;
  if (has(parsed, 't')) {
    const value = parsed.t;
    if (!isString(value)) return fail('bad-title');
    if (value !== '') title = value;
  }

  let rowTemplate: RowTemplate = 'custom';
  if (has(parsed, 'tp')) {
    const template = rowTemplateFromTp(parsed.tp);
    if (template === undefined) return fail('bad-row-template');
    rowTemplate = template;
  }

  let labelPosition: LabelPosition = 'left';
  if (has(parsed, 'lp')) {
    const value = parsed.lp;
    const position = LABEL_POSITIONS.find(known => known === value);
    if (position === undefined) return fail('bad-label-position');
    labelPosition = position;
  }

  let showLabels = true;
  if (has(parsed, 'sl')) {
    const value = parsed.sl;
    if (typeof value !== 'boolean') return fail('bad-show-labels');
    showLabels = value;
  }

  const rows = has(parsed, 'r') ? parsed.r : undefined;
  if (!Array.isArray(rows)) return fail('bad-rows');
  if (rows.length === 0 || rows.length > V3_LIMITS.maxRows) return fail('bad-row-count');

  const tiers: CanonicalTier[] = [];
  let itemCount = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!Array.isArray(row) || (row.length !== 2 && row.length !== 3)) return fail('bad-row');

    // [id, name, items], or [name, items] when the id is the template's id at this position.
    const idOmitted = row.length === 2;
    const id: unknown = idOmitted ? defaultTierId(rowTemplate, index) : row[0];
    const name: unknown = idOmitted ? row[0] : row[1];
    const items: unknown = idOmitted ? row[1] : row[2];
    if (idOmitted && id === undefined) return fail('missing-tier-id');
    if (!isNonEmptyString(id)) return fail('bad-tier-id');
    if (!isString(name)) return fail('bad-tier-name');
    if (!Array.isArray(items)) return fail('bad-items');

    // Count before reading, so a huge row is refused without walking it.
    itemCount += items.length;
    if (itemCount > V3_LIMITS.maxItems) return fail('too-many-items');

    const tierItems: CanonicalItem[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = readItem(items[itemIndex]);
      if (typeof item === 'string') return fail(item);
      tierItems.push(item);
    }
    tiers.push({id, name, items: tierItems});
  }

  const layout = {rowTemplate, labelPosition, showLabels};
  const state: CanonicalState = title === undefined
    ? {version: 3, ...layout, tiers}
    : {version: 3, title, ...layout, tiers};
  return {ok: true, state};
}

/** The item, or the reason it is invalid. */
function readItem(item: unknown): CanonicalItem | 'bad-item' | 'bad-device-id' {
  if (typeof item === 'string') {
    return item !== '' ? {id: item} : 'bad-item';
  }
  if (!isObject(item)) return 'bad-item';

  const isLink = has(item, 'u');
  const isDevice = has(item, 'd');
  const isId = has(item, 'i');
  if (Number(isLink) + Number(isDevice) + Number(isId) !== 1) return 'bad-item'; // exactly one of "i", "u" and "d"

  let content = '';
  if (has(item, 'c')) {
    const label = item.c;
    if (!isString(label)) return 'bad-item';
    content = label;
  }

  if (isId) {
    // Any non-empty id: the device id rule does not apply. Without a label it is a plain id.
    const id = item.i;
    if (!isNonEmptyString(id)) return 'bad-item';
    return content === '' ? {id} : {id, content};
  }
  if (isLink) {
    const url = item.u;
    if (!isNonEmptyString(url)) return 'bad-item';
    return {kind: 'link', id: url, url, content};
  }
  const localId = item.d;
  if (!isDeviceImageId(localId)) return 'bad-device-id';
  return {kind: 'device', id: localId, content};
}
