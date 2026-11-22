import {checkLinkImageUrl} from '@/lib/images/linkImage';
import {isTemplateHost, TEMPLATE_HOSTS, type TemplateHost} from './hosts';

export type TemplateAddressKind = 'index' | 'file';

export type TemplateAddressRefusal = 'invalid' | 'host' | 'shape';

export interface TemplateAddressAccepted {
  ok: true;
  url: string;
  host: string;
  source: string;
}

export interface TemplateAddressRefused {
  ok: false;
  reason: TemplateAddressRefusal;
}

export type TemplateAddressCheck = TemplateAddressAccepted | TemplateAddressRefused;

const EXTENSIONS: Record<TemplateAddressKind, RegExp> = {index: /\.json$/i, file: /\.png$/i};
const SEGMENT = /^[A-Za-z0-9._~+@%-]{1,200}$/;
const ESCAPE = /%([0-9A-Fa-f]{2})/g;
const PLAIN_OR_SEPARATOR = /^[A-Za-z0-9._~\-/\\]$/;
const MALFORMED_ESCAPE = /%(?![0-9A-Fa-f]{2})/;

function hasNeedlessEscape(segment: string): boolean {
  if (MALFORMED_ESCAPE.test(segment)) return true;
  for (const match of segment.matchAll(ESCAPE)) {
    const code = Number.parseInt(match[1], 16);
    if (code < 0x20 || code === 0x7f || PLAIN_OR_SEPARATOR.test(String.fromCharCode(code))) return true;
  }
  return false;
}
const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;
const GIST_ID = /^[0-9a-f]{20,40}$/;

type SourceRule = (segments: readonly string[]) => string | null;

const SOURCE_RULES: Readonly<Record<string, SourceRule>> = {
  'raw.githubusercontent.com': (segments) => {
    const [owner, repository] = segments;
    if (segments.length < 4 || !GITHUB_OWNER.test(owner) || !GITHUB_REPOSITORY.test(repository)) return null;
    return `github.com/${owner}/${repository}`.toLowerCase();
  },
  'gist.githubusercontent.com': (segments) => {
    const [owner, id, raw] = segments;
    if (segments.length < 4 || segments.length > 5 || !GITHUB_OWNER.test(owner) || !GIST_ID.test(id) || raw !== 'raw') return null;
    return `gist.github.com/${id}`;
  },
};

const refused = (reason: TemplateAddressRefusal): TemplateAddressRefused => ({ok: false, reason});

export function checkTemplateAddress(
  address: unknown,
  kind: TemplateAddressKind,
  hosts: readonly TemplateHost[] = TEMPLATE_HOSTS,
): TemplateAddressCheck {
  const base = checkLinkImageUrl(address);
  if (!base.ok) return refused('invalid');
  if (!isTemplateHost(base.host, hosts)) return refused('host');
  const parsed = new URL(base.url);
  if (parsed.search !== '' || parsed.hash !== '' || base.url.includes('?') || base.url.includes('#')) return refused('shape');
  const segments = parsed.pathname.split('/').slice(1);
  if (segments.length === 0 || segments.some((segment) => !SEGMENT.test(segment) || hasNeedlessEscape(segment))) return refused('shape');
  if (!EXTENSIONS[kind].test(segments[segments.length - 1])) return refused('shape');
  const rule = Object.prototype.hasOwnProperty.call(SOURCE_RULES, base.host) ? SOURCE_RULES[base.host] : null;
  const source = rule ? rule(segments) : base.host;
  if (source === null) return refused('shape');
  return {ok: true, url: `https://${base.host}${parsed.pathname}`, host: base.host, source};
}
