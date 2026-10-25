/**
 * Checks the address of an image "from a link": one a person pastes into the editor, or one
 * that a shared link carries. The visitor's browser loads these images. The server never
 * fetches them (amendment A8).
 *
 * Rules (the safety table in the revamp plan):
 * - https only. Every other scheme is refused: http, data, javascript, blob, file and so on.
 * - No IP addresses in any form: IPv4 (also decimal, octal, hex and short forms such as
 *   `127.1`), IPv6 (also IPv4-mapped forms such as `[::ffff:127.0.0.1]`). This also covers
 *   every private, reserved and link-local range, because no IP literal is accepted.
 * - No `localhost` or `*.localhost`, no single-label names (`router`), no reserved or
 *   private-use top-level names (`.local`, `.internal`, `.lan`, `.home.arpa` and others),
 *   no well-known services that turn a name back into an IP (`127.0.0.1.nip.io`).
 * - No user name or password in the address, no port other than the default (443).
 * - At most 2,000 characters.
 *
 * Internationalised names are converted to punycode (`bücher.de` → `xn--bcher-kva.de`) by
 * the standard URL parser. The domain shown to people stays in punycode, so look-alike
 * letters from other alphabets cannot imitate a familiar site.
 *
 * Limits of a check in the browser: a public name can still point at a private address in
 * DNS. This is acceptable: the visitor's browser loads the image (our server never does),
 * and images from sites outside trusted-image-sites.json only load after the visitor agrees.
 *
 * Pure code: it uses only the standard `URL` class, at call time. It runs in the browser,
 * on the server and in the edge runtime.
 */

export const MAX_LINK_IMAGE_URL_LENGTH = 2000;

/** Why an address was refused. */
export type LinkImageRefusal =
  /** The value is not a string. */
  | 'not-a-string'
  /** The value is empty or only spaces. */
  | 'empty'
  /** Longer than MAX_LINK_IMAGE_URL_LENGTH, before or after normalising. */
  | 'too-long'
  /** Not an absolute URL, or it holds control characters. */
  | 'invalid-url'
  /** An http address. The image must be on https. */
  | 'not-https'
  /** Any other scheme: data, javascript, blob, file, ftp... */
  | 'unsupported-scheme'
  /** A user name or password in the address. */
  | 'credentials'
  /** A port other than 443. */
  | 'port'
  /** An IPv4 or IPv6 address in any notation. */
  | 'ip-address'
  /** localhost or a name under .localhost. */
  | 'localhost'
  /** A single-label name, a reserved or private-use top-level name, or an IP echo service. */
  | 'private-name'
  /** A host name with characters or lengths that DNS does not allow. */
  | 'invalid-host';

export const LINK_IMAGE_REFUSALS: readonly LinkImageRefusal[] = [
  'not-a-string',
  'empty',
  'too-long',
  'invalid-url',
  'not-https',
  'unsupported-scheme',
  'credentials',
  'port',
  'ip-address',
  'localhost',
  'private-name',
  'invalid-host',
];

export interface LinkImageAccepted {
  ok: true;
  /** The normalised address (punycode host, no trailing dot, no default port). Store this one. */
  url: string;
  /** The host name in lowercase punycode, for example `i.imgur.com`. */
  host: string;
  /** What to show people as the image's source: the host without a leading `www.`. */
  displayDomain: string;
}

export interface LinkImageRefused {
  ok: false;
  reason: LinkImageRefusal;
}

export type LinkImageCheck = LinkImageAccepted | LinkImageRefused;

/**
 * Top-level names that never reach a public site: special-use names (RFC 6761, 6762, 7686,
 * 9476), names reserved for private networks (.internal, home.arpa under .arpa) and names
 * that home and office routers commonly use.
 */
const RESERVED_TOP_LEVEL_NAMES = new Set([
  'alt',
  'arpa',
  'corp',
  'example',
  'home',
  'internal',
  'intranet',
  'invalid',
  'lan',
  'local',
  'localdomain',
  'localhost',
  'mail',
  'onion',
  'private',
  'test',
]);

/**
 * Public services that answer any name with an IP address written inside the name, for
 * example `127.0.0.1.nip.io` or `10-0-0-1.sslip.io`, and DNS rebinding test services. This
 * list is a safety net and is incomplete: see the comment at the top of this file.
 */
const IP_ECHO_DOMAINS = [
  '1u.ms',
  'localhost.direct',
  'localtest.me',
  'lvh.me',
  'nip.io',
  'rbndr.us',
  'sslip.io',
  'traefik.me',
  'vcap.me',
  'xip.io',
];

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const HOST_LABEL = /^[a-z0-9_-]{1,63}$/;
const MAX_HOST_LENGTH = 253;

const refuse = (reason: LinkImageRefusal): LinkImageRefused => ({ok: false, reason});

/**
 * True when the URL standard would read this host as an IPv4 address: its last label is a
 * decimal number or a hex number (`0x...`). The URL parser already turns such hosts into
 * dotted decimal; this check repeats the rule in case a parser does not.
 */
function endsInNumber(host: string): boolean {
  const labels = host.split('.');
  const last = labels[labels.length - 1];
  return /^[0-9]+$/.test(last) || /^0x[0-9a-f]*$/i.test(last);
}

function isUnder(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Checks an image address. Never throws. */
export function checkLinkImageUrl(input: unknown): LinkImageCheck {
  if (typeof input !== 'string') return refuse('not-a-string');
  const raw = input.trim();
  if (raw === '') return refuse('empty');
  if (raw.length > MAX_LINK_IMAGE_URL_LENGTH) return refuse('too-long');
  // The URL parser silently drops tabs and line breaks ("java\tscript:"). Refuse them instead.
  if (CONTROL_CHARACTERS.test(raw)) return refuse('invalid-url');

  const scheme = SCHEME.exec(raw)?.[1]?.toLowerCase();
  if (scheme === undefined) return refuse('invalid-url');
  if (scheme === 'http') return refuse('not-https');
  if (scheme !== 'https') return refuse('unsupported-scheme');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuse('invalid-url');
  }
  if (url.protocol !== 'https:') return refuse('unsupported-scheme');
  if (url.username !== '' || url.password !== '') return refuse('credentials');
  if (url.port !== '') return refuse('port');

  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') || host.includes(':')) return refuse('ip-address');
  // A fully qualified name may end with a dot (`i.imgur.com.`). Drop one dot so the name
  // compares equal to the usual form.
  const hadTrailingDot = host.endsWith('.');
  if (hadTrailingDot) host = host.slice(0, -1);
  if (host === '' || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return refuse('invalid-host');
  if (endsInNumber(host)) return refuse('ip-address');
  if (isUnder(host, 'localhost')) return refuse('localhost');
  if (!host.includes('.')) return refuse('private-name');
  if (host.length > MAX_HOST_LENGTH || !host.split('.').every((label) => HOST_LABEL.test(label))) {
    return refuse('invalid-host');
  }
  const topLevel = host.slice(host.lastIndexOf('.') + 1);
  if (RESERVED_TOP_LEVEL_NAMES.has(topLevel)) return refuse('private-name');
  if (IP_ECHO_DOMAINS.some((domain) => isUnder(host, domain))) return refuse('private-name');

  if (hadTrailingDot) url.hostname = host;
  const normalised = url.href;
  if (normalised.length > MAX_LINK_IMAGE_URL_LENGTH) return refuse('too-long');

  const withoutWww = host.startsWith('www.') ? host.slice(4) : host;
  return {
    ok: true,
    url: normalised,
    host,
    displayDomain: withoutWww.includes('.') ? withoutWww : host,
  };
}
