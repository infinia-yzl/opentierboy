export const INK_PARAM = 'ink';

function keyOf(pair: string): string {
  const key = pair.split('=', 1)[0].replace(/\+/g, ' ');
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

const pairsOf = (search: string): string[] => search.replace(/^\?/, '').split('&').filter((pair) => pair !== '');

export function inkParam(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value.replace(/ /g, '+');
}

export function inkInSearch(search: string): string | null {
  return inkParam(new URLSearchParams(search).get(INK_PARAM));
}

export function searchWithInk(search: string, ink: string | null): string {
  const kept = pairsOf(search).filter((pair) => keyOf(pair) !== INK_PARAM);
  const pairs = ink === null ? kept : [...kept, `${INK_PARAM}=${ink}`];
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

export function addressWithoutInk(address: string): string {
  const hashAt = address.indexOf('#');
  const hash = hashAt === -1 ? '' : address.slice(hashAt);
  const rest = hashAt === -1 ? address : address.slice(0, hashAt);
  const queryAt = rest.indexOf('?');
  return queryAt === -1 ? address : rest.slice(0, queryAt) + searchWithInk(rest.slice(queryAt), null) + hash;
}

export function inkAddressLength(ink: string | null): number {
  return ink === null ? 0 : INK_PARAM.length + 2 + ink.length;
}
