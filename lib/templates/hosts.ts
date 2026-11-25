import hostsFile from '../../trusted-template-hosts.json';

export interface TemplateHost {
  host: string;
  reason: string;
}

export interface TemplateHostsParseResult {
  hosts: TemplateHost[];
  errors: string[];
}

const HOST_NAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ENTRY_KEYS = new Set(['host', 'reason']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseTemplateHosts(data: unknown): TemplateHostsParseResult {
  const hosts: TemplateHost[] = [];
  const errors: string[] = [];
  if (!isPlainObject(data) || !Array.isArray(data.hosts)) {
    return {hosts, errors: ['The file must be an object with a "hosts" array.']};
  }
  for (const key of Object.keys(data)) {
    if (key !== 'hosts' && key !== '$comment') errors.push(`Unknown top-level key "${key}".`);
  }
  const seen = new Set<string>();
  data.hosts.forEach((entry: unknown, index: number) => {
    const where = `Entry ${index + 1}`;
    if (!isPlainObject(entry)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    const unknownKeys = Object.keys(entry).filter((key) => !ENTRY_KEYS.has(key));
    if (unknownKeys.length > 0) {
      errors.push(`${where} has unknown keys: ${unknownKeys.join(', ')}.`);
      return;
    }
    const {host, reason} = entry;
    if (typeof host !== 'string' || !HOST_NAME.test(host)) {
      errors.push(`${where} needs a "host" in lowercase, such as raw.githubusercontent.com.`);
      return;
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      errors.push(`${where} (${host}) needs a "reason".`);
      return;
    }
    if (seen.has(host)) {
      errors.push(`${where} (${host}) is listed twice.`);
      return;
    }
    seen.add(host);
    hosts.push({host, reason});
  });
  return {hosts, errors};
}

export const TEMPLATE_HOSTS: readonly TemplateHost[] = Object.freeze(parseTemplateHosts(hostsFile).hosts);

export function isTemplateHost(host: string, hosts: readonly TemplateHost[] = TEMPLATE_HOSTS): boolean {
  return hosts.some((entry) => entry.host === host);
}

export function templateConnectSources(hosts: readonly TemplateHost[] = TEMPLATE_HOSTS): string[] {
  return ["'self'", ...hosts.map((entry) => `https://${entry.host}`)];
}
